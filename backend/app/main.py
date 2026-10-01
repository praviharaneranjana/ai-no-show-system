import logging
import time
import uuid
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload
from datetime import date, datetime, timedelta
from typing import List, Optional
import os

import pandas as pd

from contextlib import asynccontextmanager

from app import auth, geo, insights, models, outreach_drafter, schemas, shai_model
from app.services import capacity_service, geo_service
from app.services.uhid import LK_TZ
from app.database import get_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("noshow_api")

# ======================
# Load Model Bundle
# ======================
# XGBoost (native JSON) + isotonic calibration + capacity-based tiers, exported
# from the Colab notebook. Raises FileNotFoundError if the bundle is missing.
shai = shai_model.ShaiModel()

# ======================
# FastAPI App
# ======================
@asynccontextmanager
async def lifespan(_: FastAPI):
    auth.bootstrap_admin()
    yield


app = FastAPI(
    title="AI Patient No-Show Prediction System",
    description="Predicts patient no-show risk with SHAP explanations",
    version="1.0.0",
    lifespan=lifespan,
    # Every route needs a valid session token except the public ones (see app/auth.py).
    dependencies=[Depends(auth.require_user)],
)

# Allow frontend (Next.js) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================
# Auth + request logging
# ======================
API_KEY = os.getenv("API_KEY")
if not API_KEY:
    logger.warning(
        "API_KEY is not set — the shared service key (X-API-Key) is not enforced; staff login still is. "
        "Set API_KEY in the environment before deploying anywhere non-local."
    )

PUBLIC_PATHS = auth.PUBLIC_PATHS


@app.middleware("http")
async def auth_and_logging(request: Request, call_next):
    start = time.monotonic()

    if API_KEY and request.url.path not in PUBLIC_PATHS:
        if request.headers.get("x-api-key") != API_KEY:
            duration_ms = (time.monotonic() - start) * 1000
            logger.info("%s %s -> 401 (%.1fms)", request.method, request.url.path, duration_ms)
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})

    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    logger.info(
        "%s %s -> %d (%.1fms)", request.method, request.url.path, response.status_code, duration_ms
    )
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server error processing %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {str(exc)}"},
    )

# ======================
# Request & Response Models
# ======================
class AppointmentRequest(BaseModel):
    """Only ``appointment_id`` (and optionally ``heavy_rain``) drive the prediction.

    Model features are derived server-side from the stored patient, appointment and
    visit history. The legacy Kaggle-style fields below are still accepted (and
    validated) so older clients keep working, but they are ignored.
    """
    appointment_id: uuid.UUID = Field(..., description="ID of an existing appointment to predict")
    heavy_rain: int = Field(0, ge=0, le=1, description="1 if heavy rain is forecast for the appointment day")
    Age: Optional[int] = Field(None, ge=0, le=120)
    Scholarship: Optional[int] = Field(None, ge=0, le=1)
    Hipertension: Optional[int] = Field(None, ge=0, le=1)
    Diabetes: Optional[int] = Field(None, ge=0, le=1)
    Alcoholism: Optional[int] = Field(None, ge=0, le=1)
    Handcap: Optional[int] = Field(None, ge=0, le=4)
    SMS_received: Optional[int] = Field(None, ge=0, le=1)
    DaysAhead: Optional[int] = Field(None, ge=0)
    DayOfWeek: Optional[int] = Field(None, ge=0, le=6)
    IsWeekend: Optional[int] = Field(None, ge=0, le=1)
    Month: Optional[int] = Field(None, ge=1, le=12)

class FeatureContribution(BaseModel):
    feature: str
    contribution: float
    value: float

class PredictionResponse(BaseModel):
    risk_score: float
    risk_category: str
    explanation: List[FeatureContribution]
    contextual_adjustment: Optional[schemas.ContextualAdjustment] = None
    recommendation: str

# ======================
# Helper Functions
# ======================
def get_risk_category(score: float) -> str:
    return shai.category(score)

def get_recommendation(score: float) -> str:
    return shai.recommendation(shai.category(score))

def _patient_history(db: Session, appointment: models.Appointment) -> tuple[int, int]:
    """(prior attended-or-no-show visits, prior no-shows) before this appointment's date."""
    prior = (
        db.query(models.Appointment.no_show)
        .filter(
            models.Appointment.patient_id == appointment.patient_id,
            models.Appointment.id != appointment.id,
            models.Appointment.appointment_day < appointment.appointment_day,
            models.Appointment.no_show.isnot(None),
        )
        .all()
    )
    return len(prior), sum(1 for (ns,) in prior if ns)

# ======================
# API Endpoints
# ======================
app.include_router(auth.router)
# Registered before the CRUD routes so /appointments/register isn't captured by /appointments/{id}
app.include_router(insights.router)


@app.get("/")
def home():
    return {
        "message": "AI Patient No-Show Prediction System is running",
        "docs": "/docs"
    }


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unavailable"
    return {"status": "ok", "database": db_status}


@app.get("/model/info")
def get_model_info():
    """Active model metadata, version, capacity thresholds, and benchmark test metrics."""
    return shai.info()
 
@app.post("/predict", response_model=PredictionResponse)
def predict_no_show(data: AppointmentRequest, db: Session = Depends(get_db)):
    appointment = db.get(models.Appointment, data.appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")

    try:
        patient = appointment.patient
        prior_appts, prior_no_shows = _patient_history(db, appointment)
        features = shai_model.engineer(
            model=shai,
            age=max(appointment.appointment_day.year - patient.date_of_birth.year
                    - ((appointment.appointment_day.month, appointment.appointment_day.day)
                       < (patient.date_of_birth.month, patient.date_of_birth.day)), 0),
            gender=patient.gender,
            distance_km=float(patient.distance_km) if patient.distance_km is not None else None,
            scheduled_day=appointment.scheduled_day,
            appointment_day=appointment.appointment_day,
            scheduled_time=appointment.scheduled_time,
            department=appointment.department,
            booking_channel=appointment.booking_channel,
            payment_mode=appointment.payment_mode,
            sms_sent=appointment.sms_received,
            hypertension=patient.hypertension,
            diabetes=patient.diabetes,
            prior_appts=prior_appts,
            prior_no_shows=prior_no_shows,
            heavy_rain=data.heavy_rain,
        )
        df = shai.frame([features])
        _, calibrated = shai.score(df)
        risk_score = round(float(calibrated[0]), 4)
        category = shai.category(risk_score)
        top_contributions = shai.explain(df)[0]

        result = {
            "risk_score": risk_score,
            "risk_category": category,
            "explanation": top_contributions,
            "contextual_adjustment": None,
            "recommendation": shai.recommendation(category),
        }
        explanation_payload = {"contributions": top_contributions, "model_version": shai.version}

        # Persist (or update) the prediction for this appointment
        existing = (
            db.query(models.Prediction)
            .filter(models.Prediction.appointment_id == data.appointment_id)
            .first()
        )
        if existing:
            existing.risk_score = result["risk_score"]
            existing.risk_category = result["risk_category"]
            existing.explanation = explanation_payload
            existing.recommendation = result["recommendation"]
        else:
            db.add(models.Prediction(
                appointment_id=data.appointment_id,
                risk_score=result["risk_score"],
                risk_category=result["risk_category"],
                explanation=explanation_payload,
                recommendation=result["recommendation"],
            ))
        db.commit()

        return result

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ======================
# Patient CRUD
# ======================
@app.post("/patients", response_model=schemas.PatientOut, status_code=201)
def create_patient(data: schemas.PatientCreate, db: Session = Depends(get_db)):
    from app.services.uhid import generate_uhid
    fields = data.model_dump()
    patient = models.Patient(**fields)
    patient.id = uuid.uuid4()
    if not patient.uhid:
        patient.uhid = generate_uhid(db)
    # Resolve the city to real coordinates and derive the distance from them, so the
    # model input and the map always agree. An explicit lat/lng wins over the city lookup.
    if patient.latitude is None or patient.longitude is None:
        coords = geo.geocode_city(patient.city, seed=patient.id)
        if coords:
            patient.latitude, patient.longitude = coords
    if patient.latitude is not None and patient.longitude is not None:
        patient.distance_km = geo.distance_to_hospital_km(patient.latitude, patient.longitude)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@app.get("/patients", response_model=List[schemas.PatientOut])
def list_patients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Patient).offset(skip).limit(limit).all()


@app.get("/patients/{patient_id}", response_model=schemas.PatientOut)
def get_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    patient = db.get(models.Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


# ======================
# Appointment CRUD
# ======================
@app.post("/appointments", response_model=schemas.AppointmentOut, status_code=201)
def create_appointment(data: schemas.AppointmentCreate, db: Session = Depends(get_db)):
    if db.get(models.Patient, data.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    appointment = models.Appointment(**data.model_dump())
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@app.get("/appointments", response_model=List[schemas.AppointmentOut])
def list_appointments(
    skip: int = 0,
    limit: int = 100,
    patient_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Appointment)
    if patient_id is not None:
        query = query.filter(models.Appointment.patient_id == patient_id)
    return query.offset(skip).limit(limit).all()


@app.get("/appointments/overview", response_model=List[schemas.AppointmentOverviewRow])
def appointments_overview(
    days_back: int = Query(45, ge=0, le=3650, description="Include appointments from this many days ago onward (and all future ones)"),
    limit: int = Query(1500, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    """Appointments + patient + prediction in one query, newest first.

    The plain list endpoints are paginated and unordered, so joining them client-side
    silently drops patients/predictions once there are more than a page of rows.
    """
    since = date.today() - timedelta(days=days_back)
    rows = (
        db.query(models.Appointment)
        .options(joinedload(models.Appointment.patient), joinedload(models.Appointment.prediction))
        .filter(models.Appointment.appointment_day >= since)
        .order_by(models.Appointment.appointment_day.desc(), models.Appointment.id)
        .limit(limit)
        .all()
    )
    return [
        schemas.AppointmentOverviewRow(
            appointment=schemas.AppointmentOut.model_validate(a),
            patient=schemas.PatientOut.model_validate(a.patient) if a.patient else None,
            prediction=_prediction_out(a.prediction) if a.prediction else None,
        )
        for a in rows
    ]


@app.get("/appointments/{appointment_id}", response_model=schemas.AppointmentOut)
def get_appointment(appointment_id: uuid.UUID, db: Session = Depends(get_db)):
    appointment = db.get(models.Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment


@app.patch("/appointments/{appointment_id}/outcome", response_model=schemas.AppointmentOut)
def record_appointment_outcome(
    appointment_id: uuid.UUID,
    data: schemas.AppointmentOutcomeUpdate,
    db: Session = Depends(get_db),
):
    appointment = db.get(models.Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    appointment.no_show = data.no_show
    appointment.status = "no_show" if data.no_show else "completed"
    db.commit()
    db.refresh(appointment)
    return appointment


def _prediction_out(prediction: models.Prediction) -> schemas.PredictionOut:
    explanation_raw = prediction.explanation or {}
    if isinstance(explanation_raw, dict):
        contributions = explanation_raw.get("contributions", [])
        contextual_adj = explanation_raw.get("contextual_adjustment")
    elif isinstance(explanation_raw, list):
        contributions = explanation_raw
        contextual_adj = None
    else:
        contributions = []
        contextual_adj = None

    return schemas.PredictionOut(
        id=prediction.id,
        appointment_id=prediction.appointment_id,
        risk_score=float(prediction.risk_score),
        risk_category=prediction.risk_category,
        explanation=contributions,
        contextual_adjustment=contextual_adj,
        recommendation=prediction.recommendation,
        created_at=prediction.created_at,
    )


@app.get("/appointments/{appointment_id}/interventions", response_model=List[schemas.InterventionOut])
def list_appointment_interventions(appointment_id: uuid.UUID, db: Session = Depends(get_db)):
    """Outreach conversations logged for one appointment, newest first."""
    if db.get(models.Appointment, appointment_id) is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return (
        db.query(models.Intervention)
        .filter(models.Intervention.appointment_id == appointment_id)
        .order_by(models.Intervention.created_at.desc())
        .all()
    )


@app.get("/appointments/{appointment_id}/prediction", response_model=schemas.PredictionOut)
def get_appointment_prediction(appointment_id: uuid.UUID, db: Session = Depends(get_db)):
    prediction = (
        db.query(models.Prediction)
        .filter(models.Prediction.appointment_id == appointment_id)
        .first()
    )
    if prediction is None:
        raise HTTPException(status_code=404, detail="No prediction found for this appointment")
    return _prediction_out(prediction)


# ===================================
# Reference Data & Discovery Endpoints
# ===================================

@app.get("/departments", response_model=List[schemas.DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    depts = (
        db.query(
            models.Department,
            func.count(models.Doctor.id).label("doc_count"),
        )
        .outerjoin(
            models.Doctor,
            (models.Doctor.department_id == models.Department.id)
            & (models.Doctor.active == True),
        )
        .filter(models.Department.active == True)
        .group_by(models.Department.id)
        .order_by(models.Department.name.asc())
        .all()
    )
    result = []
    for dept, doc_count in depts:
        result.append(
            schemas.DepartmentOut(
                id=dept.id,
                name=dept.name,
                model_category=dept.model_category,
                icon=dept.icon,
                telehealth_ok=dept.telehealth_ok,
                active=dept.active,
                doctor_count=doc_count,
            )
        )
    return result


@app.get("/doctors", response_model=List[schemas.DoctorOut])
def list_doctors(
    department_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    active: bool = Query(True),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Doctor)
        .options(
            joinedload(models.Doctor.department),
            joinedload(models.Doctor.sessions),
        )
        .filter(models.Doctor.active == active)
    )
    if department_id is not None:
        query = query.filter(models.Doctor.department_id == department_id)
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(models.Doctor.full_name).like(term))

    doctors = query.order_by(models.Doctor.full_name.asc()).all()

    now_lk = datetime.now(LK_TZ)
    today_lk = now_lk.date()
    current_time = now_lk.time()

    out = []
    for doc in doctors:
        disp_name = f"{doc.title} {doc.full_name}".strip()
        active_sessions = [s for s in doc.sessions if s.active]
        active_weekdays = {s.weekday for s in active_sessions}

        next_date = None
        if active_weekdays:
            for d in range(8):
                cand_date = today_lk + timedelta(days=d)
                cand_weekday = cand_date.weekday()
                if cand_weekday in active_weekdays:
                    if d == 0:
                        today_sessions = [s for s in active_sessions if s.weekday == cand_weekday]
                        if any(s.end_time > current_time for s in today_sessions):
                            next_date = cand_date
                            break
                    else:
                        next_date = cand_date
                        break

        sessions_out = [
            schemas.ClinicSessionOut(
                id=s.id,
                doctor_id=s.doctor_id,
                weekday=s.weekday,
                label=s.label,
                start_time=s.start_time,
                end_time=s.end_time,
                room=s.room,
                max_patients=s.max_patients,
                slot_minutes=s.slot_minutes,
                active=s.active,
            )
            for s in active_sessions
        ]

        dept_out = None
        if doc.department:
            dept_out = schemas.DepartmentOut(
                id=doc.department.id,
                name=doc.department.name,
                model_category=doc.department.model_category,
                icon=doc.department.icon,
                telehealth_ok=doc.department.telehealth_ok,
                active=doc.department.active,
                doctor_count=0,
            )

        out.append(
            schemas.DoctorOut(
                id=doc.id,
                title=doc.title,
                full_name=doc.full_name,
                display_name=disp_name,
                department_id=doc.department_id,
                department=dept_out,
                default_room=doc.default_room,
                active=doc.active,
                needs_review=doc.needs_review,
                sessions=sessions_out,
                next_clinic_date=next_date,
            )
        )
    return out


@app.get("/doctors/{doctor_id}/availability", response_model=schemas.AvailabilityResponse)
def get_doctor_availability(
    doctor_id: uuid.UUID,
    from_date: Optional[date] = Query(None, alias="from"),
    days: int = Query(21, ge=1, le=60),
    db: Session = Depends(get_db),
):
    doc = db.get(models.Doctor, doctor_id)
    if not doc or not doc.active:
        raise HTTPException(status_code=404, detail="Doctor not found or inactive")

    start_date = from_date or datetime.now(LK_TZ).date()

    active_sessions = (
        db.query(models.DoctorClinicSession)
        .filter(
            models.DoctorClinicSession.doctor_id == doctor_id,
            models.DoctorClinicSession.active == True,
        )
        .order_by(models.DoctorClinicSession.start_time.asc())
        .all()
    )

    day_list = []
    for day_offset in range(days):
        target_date = start_date + timedelta(days=day_offset)
        target_weekday = target_date.weekday()
        matching_sessions = [s for s in active_sessions if s.weekday == target_weekday]
        if not matching_sessions:
            continue

        session_items = []
        for s in matching_sessions:
            booked = (
                db.query(models.Appointment)
                .filter(
                    models.Appointment.doctor_id == doctor_id,
                    models.Appointment.appointment_day == target_date,
                    models.Appointment.clinic_session_id == s.id,
                    models.Appointment.status != "cancelled",
                )
                .count()
            )
            remaining = max(0, s.max_patients - booked)
            next_token = booked + 1
            session_items.append(
                schemas.AvailabilitySession(
                    session_id=s.id,
                    label=s.label,
                    start_time=s.start_time.strftime("%H:%M"),
                    end_time=s.end_time.strftime("%H:%M"),
                    room=s.room,
                    max_patients=s.max_patients,
                    booked=booked,
                    remaining=remaining,
                    next_token=next_token,
                )
            )

        day_list.append(
            schemas.AvailabilityDay(
                date=target_date,
                sessions=session_items,
            )
        )

    return schemas.AvailabilityResponse(days=day_list)


@app.get("/locations", response_model=List[schemas.LocationOut])
def get_locations(
    q: str = Query("", min_length=0),
    limit: int = Query(8, ge=1, le=50),
    db: Session = Depends(get_db),
):
    results = geo_service.search_locations(db, q, limit)
    return [schemas.LocationOut(**r) for r in results]


@app.get("/locations/geocode")
def geocode_location(
    q: str = Query("", min_length=0),
):
    return geo_service.geocode_photon(q)


@app.post("/distance", response_model=schemas.DistanceResponse)
def calculate_distance_endpoint(
    req: schemas.DistanceRequest,
):
    dist_km, source = geo_service.calculate_distance(req.latitude, req.longitude)
    return schemas.DistanceResponse(distance_km=dist_km, source=source)


# ===================================
# 1. Doctor Sessions & Queue Tracking
# ===================================
@app.get("/doctors/sessions", response_model=List[schemas.DoctorSessionOut])
def list_doctor_sessions(db: Session = Depends(get_db)):
    sessions = db.query(models.DoctorSession).order_by(models.DoctorSession.session_date.desc()).all()
    if not sessions:
        # Auto-seed default clinical sessions if empty
        defaults = [
            models.DoctorSession(
                doctor_name="Dr. Rohan Perera",
                specialty="Cardiology",
                room_number="Room 204 (Asiri Central)",
                session_date=pd.to_datetime("today").date(),
                scheduled_start_time="17:00",
                status="delayed",
                delay_minutes=25,
                avg_consultation_mins=12,
                max_capacity=25,
            ),
            models.DoctorSession(
                doctor_name="Dr. Neluka Fernando",
                specialty="Neurology",
                room_number="Room 108 (Hemas Wattala)",
                session_date=pd.to_datetime("today").date(),
                scheduled_start_time="18:00",
                status="on_time",
                delay_minutes=0,
                avg_consultation_mins=15,
                max_capacity=20,
            ),
            models.DoctorSession(
                doctor_name="Dr. Anura Jayasinghe",
                specialty="Orthopedics",
                room_number="Room 312 (Asiri Surgical)",
                session_date=pd.to_datetime("today").date(),
                scheduled_start_time="16:30",
                status="on_time",
                delay_minutes=0,
                avg_consultation_mins=10,
                max_capacity=30,
            ),
        ]
        for s in defaults:
            db.add(s)
        db.commit()
        sessions = db.query(models.DoctorSession).all()
    return sessions


@app.patch("/doctors/sessions/{session_id}/delay", response_model=schemas.DoctorSessionOut, dependencies=[Depends(auth.require_role("manager"))])
def update_doctor_delay(
    session_id: uuid.UUID,
    data: schemas.DoctorSessionDelayUpdate,
    db: Session = Depends(get_db),
):
    session = db.get(models.DoctorSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Doctor session not found")
    session.delay_minutes = data.delay_minutes
    session.status = data.status
    db.commit()
    db.refresh(session)
    return session


# ===================================
# 2. Prescriptive Capacity & Overbooking v2
# ===================================

@app.post("/capacity/optimize", response_model=schemas.CapacityOptimizeResponse, dependencies=[Depends(auth.require_role("manager"))])
def optimize_capacity(req: schemas.CapacityOptimizeRequest, db: Session = Depends(get_db)):
    """Optimizes session capacity using calibrated probabilities, Poisson-binomial bounds, and queue simulation."""
    return capacity_service.get_capacity_overview(
        db=db,
        session_date=req.session_date,
        max_wait_tolerance=req.max_wait_time_tolerance_mins,
        persist_run=True,
    )


@app.get("/capacity/overview", response_model=schemas.CapacityOptimizeResponse, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_overview_endpoint(
    date: Optional[date] = None,
    doctor_id: Optional[uuid.UUID] = None,
    max_wait_tolerance: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Retrieve full capacity overview, session recommendations, and department mix."""
    return capacity_service.get_capacity_overview(
        db=db,
        session_date=date,
        target_doctor_id=doctor_id,
        max_wait_tolerance=max_wait_tolerance,
        persist_run=False,
    )


@app.get("/capacity/slots", response_model=schemas.CapacitySlotsResponse, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_slots_endpoint(
    date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Feature A: Slot-level overbooking heatmap grid with booked patient details."""
    target_date = date or pd.to_datetime("today").date()
    return capacity_service.get_capacity_slots(db=db, target_date=target_date)


@app.post("/capacity/what-if", response_model=schemas.WhatIfResponse, dependencies=[Depends(auth.require_role("manager"))])
def evaluate_what_if_endpoint(
    req: schemas.WhatIfRequest,
    db: Session = Depends(get_db),
):
    """Feature B: Non-persisting live debounced simulation comparing baseline vs what-if policy."""
    return capacity_service.evaluate_what_if_scenario(db=db, req=req)


@app.get("/capacity/scenarios", response_model=List[schemas.CapacityScenarioOut], dependencies=[Depends(auth.require_role("manager"))])
def list_capacity_scenarios(db: Session = Depends(get_db)):
    """Feature B: List stored manager what-if scenarios."""
    return db.query(models.CapacityScenario).order_by(models.CapacityScenario.created_at.desc()).limit(10).all()


@app.post("/capacity/scenarios", response_model=schemas.CapacityScenarioOut, dependencies=[Depends(auth.require_role("manager"))])
def create_capacity_scenario(
    req: schemas.CapacityScenarioCreate,
    current_user: models.User = Depends(auth.require_user),
    db: Session = Depends(get_db),
):
    """Feature B: Save a what-if experiment scenario."""
    scen = models.CapacityScenario(
        name=req.name,
        params=req.params,
        results=req.results,
        created_by=current_user.full_name,
    )
    db.add(scen)
    db.commit()
    db.refresh(scen)
    return scen


@app.delete("/capacity/scenarios/{scenario_id}", dependencies=[Depends(auth.require_role("manager"))])
def delete_capacity_scenario(scenario_id: uuid.UUID, db: Session = Depends(get_db)):
    """Feature B: Delete a saved scenario."""
    scen = db.get(models.CapacityScenario, scenario_id)
    if not scen:
        raise HTTPException(status_code=404, detail="Scenario not found")
    db.delete(scen)
    db.commit()
    return {"message": "Scenario deleted"}


@app.get("/capacity/settings", response_model=schemas.CapacitySettingOut, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_settings_endpoint(
    department_id: Optional[int] = None,
    doctor_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    """Retrieve active capacity settings for hospital, department, or doctor scope."""
    return capacity_service.get_effective_settings(db, department_id, doctor_id)


@app.put("/capacity/settings", response_model=schemas.CapacitySettingOut, dependencies=[Depends(auth.require_role("manager"))])
def update_capacity_settings_endpoint(
    req: schemas.CapacitySettingUpdate,
    department_id: Optional[int] = None,
    doctor_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    """Update capacity settings."""
    setting = capacity_service.get_effective_settings(db, department_id, doctor_id)
    update_data = req.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(setting, field, val)
    db.commit()
    db.refresh(setting)
    return setting


@app.get("/capacity/forecast", response_model=schemas.ForecastResponse, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_forecast_endpoint(
    horizon: int = Query(7, ge=7, le=30),
    db: Session = Depends(get_db),
):
    """Feature D: Next 7 / 14 / 30 day forward projections with Poisson-binomial confidence intervals."""
    return capacity_service.get_capacity_forecast(db=db, horizon_days=horizon)


@app.get("/capacity/accuracy", response_model=schemas.AccuracyResponse, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_accuracy_endpoint(db: Session = Depends(get_db)):
    """Feature E: Calibration curve, Brier score, and overbooking regret analysis."""
    return capacity_service.get_capacity_accuracy(db=db)


@app.get("/capacity/slot-offers", response_model=List[schemas.SlotOfferOut], dependencies=[Depends(auth.require_role("front_desk"))])
def get_slot_offers_endpoint(db: Session = Depends(get_db)):
    """Feature C: List open freed slot offers with ranked candidate recommendations."""
    return capacity_service.get_freed_slot_offers(db=db)


@app.post("/capacity/slot-offers/{offer_id}/act", response_model=schemas.SlotOfferOut, dependencies=[Depends(auth.require_role("front_desk"))])
def act_on_slot_offer_endpoint(
    offer_id: uuid.UUID,
    req: schemas.SlotOfferActionRequest,
    current_user: models.User = Depends(auth.require_user),
    db: Session = Depends(get_db),
):
    """Feature C: Approve, decline, or undo a freed slot candidate offer."""
    try:
        return capacity_service.act_on_slot_offer(
            db=db,
            offer_id=offer_id,
            action=req.action,
            acted_by=current_user.full_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/capacity/nav-counts", response_model=schemas.NavCountsOut)
def get_capacity_nav_counts(db: Session = Depends(get_db)):
    """G10: Drive sidebar badges with real live counts."""
    return capacity_service.get_nav_live_counts(db=db)


# ===================================
# 3. Dynamic Waitlist Management
# ===================================
@app.get("/capacity/waitlist", response_model=List[schemas.WaitlistOut])
def get_waitlist(db: Session = Depends(get_db)):
    items = db.query(models.WaitlistEntry).order_by(models.WaitlistEntry.created_at.desc()).all()
    if not items:
        # Default seed waitlist
        defaults = [
            models.WaitlistEntry(
                patient_name="Sunil Jayawardena",
                patient_phone="+94774567890",
                specialty="Cardiology",
                doctor_name="Dr. Rohan Perera",
                urgency_level="High",
                preferred_days="Weekday evenings",
                status="waiting",
            ),
            models.WaitlistEntry(
                patient_name="Malini Dias",
                patient_phone="+94775678901",
                specialty="Neurology",
                doctor_name="Dr. Neluka Fernando",
                urgency_level="Normal",
                preferred_days="Any evening",
                status="waiting",
            ),
            models.WaitlistEntry(
                patient_name="Chaminda Vaas",
                patient_phone="+94776789012",
                specialty="Orthopedics",
                doctor_name="Dr. Anura Jayasinghe",
                urgency_level="Routine",
                preferred_days="Saturdays",
                status="waiting",
            ),
        ]
        for w in defaults:
            db.add(w)
        db.commit()
        items = db.query(models.WaitlistEntry).all()
    return items


@app.post("/capacity/waitlist/{waitlist_id}/assign", response_model=schemas.WaitlistOut)
def assign_waitlist_slot(waitlist_id: uuid.UUID, db: Session = Depends(get_db)):
    entry = db.get(models.WaitlistEntry, waitlist_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    entry.status = "offered"
    db.commit()
    db.refresh(entry)
    return entry


# ===================================
# 4. Trilingual Autonomous Agent Hub
# ===================================
@app.get("/outreach/conversations", response_model=List[schemas.InterventionOut])
def list_conversations(db: Session = Depends(get_db)):
    interventions = db.query(models.Intervention).order_by(models.Intervention.created_at.desc()).all()
    if not interventions:
        # Seed realistic trilingual conversations
        appts = db.query(models.Appointment).limit(3).all()
        if appts:
            examples = [
                models.Intervention(
                    appointment_id=appts[0].id,
                    channel="WhatsApp",
                    language="si",
                    status="rescheduled",
                    patient_reply="Mata heta enna bahe, wadata yanna thiyenawa. Saturday puluwanda?",
                    intent_detected="Reschedule Request (Sinhala)",
                    offered_slot="Saturday 10:00 AM (Token #8)",
                ),
                models.Intervention(
                    appointment_id=appts[1].id if len(appts) > 1 else appts[0].id,
                    channel="WhatsApp",
                    language="en",
                    status="confirmed",
                    patient_reply="Yes, I will be attending tomorrow at 5:30 PM. Thank you.",
                    intent_detected="Confirmation (English)",
                    offered_slot="Slot Confirmed",
                ),
                models.Intervention(
                    appointment_id=appts[2].id if len(appts) > 2 else appts[0].id,
                    channel="WhatsApp",
                    language="ta",
                    status="telehealth_requested",
                    patient_reply="Vara mudiyadhu. Video call moolam doctor paarkka mudiyuma?",
                    intent_detected="Telehealth Switch (Tamil)",
                    offered_slot="Teleconsultation Link Generated",
                ),
            ]
            for ex in examples:
                db.add(ex)
            db.commit()
            interventions = db.query(models.Intervention).all()
    return interventions


@app.post("/outreach/draft", response_model=schemas.OutreachDraftResponse)
def draft_outreach_message(req: schemas.OutreachDraftRequest, db: Session = Depends(get_db)):
    """AI-drafted reminder for staff to review (not sent). Falls back to a template."""
    appt = db.get(models.Appointment, req.appointment_id)
    if appt is None:
        raise HTTPException(status_code=404, detail="Appointment not found")

    prediction = (
        db.query(models.Prediction).filter(models.Prediction.appointment_id == appt.id).first()
    )
    explanation = prediction.explanation if prediction and isinstance(prediction.explanation, dict) else {}
    language = req.language if req.language in outreach_drafter.LANGUAGES else "en"
    when = f"{appt.appointment_day:%d %b %Y}" + (f" at {appt.scheduled_time}" if appt.scheduled_time else "")

    draft = outreach_drafter.draft_reminder(
        language=language,
        first_name=appt.patient.full_name.split()[0],
        department=appt.department or "clinic",
        when=when,
        tier=prediction.risk_category if prediction else "Medium",
        contributions=explanation.get("contributions", []),
    )
    return schemas.OutreachDraftResponse(
        appointment_id=appt.id, language=language, message=draft.message,
        source=draft.source, reasons=draft.reasons, model=draft.model,
    )


@app.post("/outreach/simulate-agent", response_model=schemas.AgentSimulateResponse)
def simulate_patient_agent(req: schemas.AgentSimulateRequest, db: Session = Depends(get_db)):
    appt = db.get(models.Appointment, req.appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    msg = req.patient_message.lower()
    
    # Intent extraction across English, Sinhala (Singlish/script), and Tamil
    is_reschedule = any(w in msg for w in ["reschedule", "bahe", "enna bahe", "change", "wena dawasak", "mudiyadhu", "vera naal", "next week", "saturday"])
    is_telehealth = any(w in msg for w in ["video", "online", "telehealth", "call", "remote", "gedara indan", "zoom", "paarkka"])
    is_cancel = any(w in msg for w in ["cancel", "epaa", "vendaam", "don't want", "ain karanna"])
    is_prep = any(w in msg for w in ["fasting", "food", "kanna", "test", "prep", "sapadu", "badaginne"])
    is_confirm = any(w in msg for w in ["confirm", "yes", "hari", "ennam", "varuven", "ok", "coming"])

    if is_reschedule:
        intent = "reschedule"
        if req.language == "si":
            response_text = (
                f"කමක් නැහැ! {appt.doctor_name} මහතාගේ ලබන සෙනසුරාදා උදෑසන 10:00 ට නව Slot එකක් තිබේ. "
                "ඔබට එම වේලාව වෙන්කර දීමට කැමතිද? (✅ ඔව් ලෙස පිළිතුරු දෙන්න)"
            )
        elif req.language == "ta":
            response_text = (
                f"பிரச்சனை இல்லை! {appt.doctor_name} அவர்களுக்கு வரும் சனிக்கிழமை காலை 10:00 மணிக்கு நேரம் உள்ளது. "
                "உங்களுக்கு இந்த நேரம் வசதியாக இருக்குமா? (✅ ஆம் என பதிலளிக்கவும்)"
            )
        else:
            response_text = (
                f"No problem! We have an opening with {appt.doctor_name} this Saturday at 10:00 AM. "
                "Shall I confirm this reschedule for you? (Reply 'Yes' to proceed)"
            )
        action_text = "Slot Rescheduled autonomously to Saturday 10:00 AM"
        appt.ai_action_status = "Rescheduled via AI"
        new_status = "rescheduled"

    elif is_telehealth:
        intent = "telehealth"
        dept_name = appt.department or "General Medicine"
        raw_doc = appt.doctor_name or "the specialist"
        doc_display = raw_doc if raw_doc.startswith("Dr") else f"Dr. {raw_doc}"
        eligible = outreach_drafter.is_telehealth_eligible(dept_name)

        if not eligible:
            # Clinical guardrail: Specialty requires physical exam / procedures
            if req.language == "si":
                response_text = (
                    f"{doc_display} මහතාගේ ({dept_name}) පරීක්ෂාව සඳහා රෝගියා පෞද්ගලිකව පැමිණ "
                    "ශාරීරික පරීක්ෂාවක් (Physical Examination) හෝ X-Ray/පරීක්ෂණ සිදුකිරීම අත්‍යවශ්‍ය බැවින් "
                    "Video Call මගින් සිදුකළ නොහැක. ලබන සෙනසුරාදා උදෑසන 10:00 ට රෝහලේදී හමුවීමට නව Slot එකක් වෙන්කර දිය හැක. "
                    "ඔබ ඊට කැමතිද? (✅ ඔව් ලෙස පිළිතුරු දෙන්න)"
                )
            elif req.language == "ta":
                response_text = (
                    f"{doc_display} அவர்களின் ({dept_name}) ஆலோசனைக்கு நேரடி உடல் பரிசோதனை "
                    "அல்லது ஸ்கேன்/எக்ஸ்-ரே அவசியம் என்பதால் Video Call மூலம் செய்ய முடியாது. "
                    "வரும் சனிக்கிழமை காலை 10:00 மணிக்கு மருத்துவமனையில் புதிய நேரம் ஒதுக்க முடியும். "
                    "உறுதிப்படுத்தவா? (✅ ஆம் என பதிலளிக்கவும்)"
                )
            else:
                response_text = (
                    f"{doc_display}'s consultation ({dept_name}) requires an in-person physical examination "
                    "or imaging and cannot be conducted virtually. "
                    "We have an in-person slot available this Saturday at 10:00 AM. Would you like to reserve this instead? (Reply 'Yes' to confirm)"
                )
            action_text = f"Telehealth Ineligible ({dept_name}): Physical Exam Required. In-Person Reschedule Offered."
            appt.ai_action_status = "In-Person Required (Reschedule Offered)"
            new_status = "rescheduled"
        else:
            if req.language == "si":
                response_text = (
                    f"නියමයි! {doc_display} මහතා සමඟ Video Teleconsultation එකක් සූදානම් කළ හැක. "
                    "අපගේ Asiri MyHealth සබැඳිය ඔස්සේ එක්වන්න: https://telehealth.asirihealth.com/room/4892"
                )
            elif req.language == "ta":
                response_text = (
                    f"சிறப்பு! {doc_display} அவர்களுடன் Video Teleconsultation செய்ய முடியும். "
                    "இணைப்பு: https://telehealth.asirihealth.com/room/4892"
                )
            else:
                response_text = (
                    f"Great! We can switch your consultation with {doc_display} to a Video Telehealth call. "
                    "Your secure consultation room link: https://telehealth.asirihealth.com/room/4892"
                )
            action_text = "Converted to Virtual Video Consultation"
            appt.ai_action_status = "Telehealth Converted"
            new_status = "telehealth_requested"

    elif is_prep:
        intent = "prep_inquiry"
        response_text = (
            "Clinical Preparation Guide: For Fasting Blood Sugar / Lipid Profiles, please observe 10-12 hours of overnight fasting. "
            "Water is permitted. Please report to the 2nd Floor Phlebotomy Desk 30 mins prior."
        )
        action_text = "Pre-visit Fasting Protocol Dispatched"
        appt.ai_action_status = "Prep Protocol Sent"
        new_status = "prep_sent"

    elif is_cancel:
        intent = "cancel"
        response_text = (
            "Your appointment has been safely cancelled. If you opted for No-Show Refund (NSR) on Doc990/eChannelling, "
            "your refund of hospital & doctor charges will be credited within 2-4 business days."
        )
        action_text = "Appointment Cancelled & Slot Returned to Waitlist Pool"
        appt.ai_action_status = "Cancelled by Patient"
        appt.status = "cancelled"
        new_status = "cancelled"

    else:
        intent = "confirm"
        response_text = (
            f"Thank you! Your appointment with {appt.doctor_name} (Token #{appt.queue_number or 1}) is successfully confirmed. "
            f"Estimated arrival recommendation: {appt.scheduled_time or '17:30'} at Room 204."
        )
        action_text = "Appointment Attendance Confirmed on WhatsApp"
        appt.ai_action_status = "Confirmed via WhatsApp"
        new_status = "confirmed"

    # Save intervention record
    intervention = models.Intervention(
        appointment_id=appt.id,
        channel="WhatsApp",
        language=req.language,
        status=new_status,
        patient_reply=req.patient_message,
        intent_detected=f"{intent.capitalize()} ({req.language.upper()})",
        offered_slot=action_text,
    )
    db.add(intervention)
    db.commit()

    return schemas.AgentSimulateResponse(
        appointment_id=appt.id,
        intent=intent,
        agent_response=response_text,
        language=req.language,
        suggested_action=action_text,
        action_executed=action_text,
        status_updated=new_status,
    )


# ===================================
# 5. Executive ROI & Value Simulator + Hospital CapEx/OpEx
# ===================================

DEFAULT_EXPENSE_CATEGORIES = [
    {
        "key": "patient_incentives",
        "name": "Patient Incentives & Giveaways",
        "icon": "gift",
        "description": "Transport vouchers, medication discounts, and free diagnostic checkups given to patients to boost clinic attendance",
        "display_order": 1,
    },
    {
        "key": "telco_outreach",
        "name": "Telco & Messaging Gateways",
        "icon": "message-square",
        "description": "SMS bundles (Dialog/Mobitel) and Meta WhatsApp Business API conversation costs",
        "display_order": 2,
    },
    {
        "key": "tech_infrastructure",
        "name": "Technology & IT Licensing",
        "icon": "cpu",
        "description": "SHAI AI core platform licensing, HIS/EMR vendor API integration, and cloud hosting",
        "display_order": 3,
    },
    {
        "key": "staff_overtime",
        "name": "Staff Allowances & Overtime",
        "icon": "users",
        "description": "Nursing and front-desk phone outreach allowances, overtime, and shift coordination",
        "display_order": 4,
    },
    {
        "key": "admin_overhead",
        "name": "Administrative & Facility Overhead",
        "icon": "building-2",
        "description": "Clinic stationery, triage paperwork, and executive operational coordination",
        "display_order": 5,
    },
]


def _ensure_expense_categories(db: Session) -> list[models.ExpenseCategory]:
    cats = db.query(models.ExpenseCategory).order_by(models.ExpenseCategory.display_order.asc()).all()
    if not cats:
        cats = [models.ExpenseCategory(**item) for item in DEFAULT_EXPENSE_CATEGORIES]
        db.add_all(cats)
        db.commit()
        for cat in cats:
            db.refresh(cat)
    return cats


def _ensure_default_expenses(db: Session, categories: list[models.ExpenseCategory]) -> list[models.HospitalExpense]:
    expenses = db.query(models.HospitalExpense).all()
    if not expenses:
        cat_map = {c.key: c.id for c in categories}
        initial_items = [
            models.HospitalExpense(
                hospital_name="Default Hospital",
                category_id=cat_map.get("patient_incentives", categories[0].id),
                title="PickMe & Transport Vouchers for Chronic Patients",
                amount_lkr=450000.0,
                recurrence="annual",
                is_active=True,
                notes="Subsidized transport for elderly diabetic/cardiac patients travelling > 15 km",
            ),
            models.HospitalExpense(
                hospital_name="Default Hospital",
                category_id=cat_map.get("telco_outreach", categories[1].id),
                title="Dialog SMS & WhatsApp Gateway Package",
                amount_lkr=380000.0,
                recurrence="annual",
                is_active=True,
                notes="Monthly bulk SMS quota and WhatsApp session messages",
            ),
            models.HospitalExpense(
                hospital_name="Default Hospital",
                category_id=cat_map.get("tech_infrastructure", categories[2].id),
                title="SHAI Core Platform & HIS Integration Run-rate",
                amount_lkr=1800000.0,
                recurrence="annual",
                is_active=True,
                notes="Fixed annual infrastructure, server run-rate, and model maintenance",
            ),
        ]
        db.add_all(initial_items)
        db.commit()
        expenses = db.query(models.HospitalExpense).all()
    return expenses


@app.get("/expenses/categories", response_model=List[schemas.ExpenseCategoryResponse], dependencies=[Depends(auth.require_role("manager"))])
def list_expense_categories(db: Session = Depends(get_db)):
    return _ensure_expense_categories(db)


@app.get("/expenses", response_model=List[schemas.HospitalExpenseResponse], dependencies=[Depends(auth.require_role("manager"))])
def list_hospital_expenses(db: Session = Depends(get_db)):
    cats = _ensure_expense_categories(db)
    _ensure_default_expenses(db, cats)
    return db.query(models.HospitalExpense).join(models.ExpenseCategory).order_by(models.HospitalExpense.created_at.desc()).all()


@app.post("/expenses", response_model=schemas.HospitalExpenseResponse, dependencies=[Depends(auth.require_role("manager"))])
def create_hospital_expense(expense: schemas.HospitalExpenseCreate, db: Session = Depends(get_db)):
    cat = db.get(models.ExpenseCategory, expense.category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Expense category not found")
    record = models.HospitalExpense(
        hospital_name=expense.hospital_name,
        category_id=expense.category_id,
        title=expense.title.strip(),
        amount_lkr=expense.amount_lkr,
        recurrence=expense.recurrence,
        is_active=expense.is_active,
        notes=expense.notes.strip() if expense.notes else None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.patch("/expenses/{expense_id}", response_model=schemas.HospitalExpenseResponse, dependencies=[Depends(auth.require_role("manager"))])
def update_hospital_expense(expense_id: uuid.UUID, updates: schemas.HospitalExpenseUpdate, db: Session = Depends(get_db)):
    record = db.get(models.HospitalExpense, expense_id)
    if not record:
        raise HTTPException(status_code=404, detail="Hospital expense not found")
    
    if updates.category_id is not None:
        cat = db.get(models.ExpenseCategory, updates.category_id)
        if not cat:
            raise HTTPException(status_code=404, detail="Expense category not found")
        record.category_id = updates.category_id
    if updates.hospital_name is not None:
        record.hospital_name = updates.hospital_name.strip()
    if updates.title is not None:
        record.title = updates.title.strip()
    if updates.amount_lkr is not None:
        record.amount_lkr = updates.amount_lkr
    if updates.recurrence is not None:
        record.recurrence = updates.recurrence
    if updates.is_active is not None:
        record.is_active = updates.is_active
    if updates.notes is not None:
        record.notes = updates.notes.strip() if updates.notes else None
    
    db.commit()
    db.refresh(record)
    return record


@app.delete("/expenses/{expense_id}", dependencies=[Depends(auth.require_role("manager"))])
def delete_hospital_expense(expense_id: uuid.UUID, db: Session = Depends(get_db)):
    record = db.get(models.HospitalExpense, expense_id)
    if not record:
        raise HTTPException(status_code=404, detail="Hospital expense not found")
    db.delete(record)
    db.commit()
    return {"ok": True, "id": str(expense_id)}


@app.post("/simulator/evaluate", response_model=schemas.SimulatorEvaluateResponse, dependencies=[Depends(auth.require_role("manager"))])
def evaluate_roi_simulation(params: schemas.SimulatorEvaluateRequest):
    # Calculations based on Sri Lankan Private Hospital Outpatient Metrics
    daily_consultations = params.daily_clinics_count * 20  # ~20 patients per consultant clinic
    daily_at_risk_slots = daily_consultations * params.baseline_no_show_rate
    
    annual_operational_days = params.operational_days_year
    total_annual_lost_slots = daily_at_risk_slots * annual_operational_days
    
    # Financial Leakage (Direct Doctor + Hospital Facility Fee + Ancillary Lab/Pharmacy estimate)
    ancillary_multiplier = 1.6  # Lab tests, pharmacy, follow-up revenue per attended patient
    effective_slot_value = params.avg_consultation_fee_lkr * ancillary_multiplier
    annual_revenue_leakage = total_annual_lost_slots * effective_slot_value

    # AI Recovered Capacity
    intervened_slots = daily_at_risk_slots * params.ai_intervention_coverage
    reached_patients = intervened_slots * params.patient_reachability_rate
    
    # Reclaimed through autonomous rescheduling + dynamic overbooking
    rescheduled_slots_daily = reached_patients * params.reschedule_success_rate
    overbooked_filled_daily = (daily_at_risk_slots - rescheduled_slots_daily) * params.overbooking_fill_rate * 0.6
    total_recovered_daily = rescheduled_slots_daily + overbooked_filled_daily
    
    annual_revenue_recovered = total_recovered_daily * annual_operational_days * effective_slot_value
    
    # Doctor clinical hours reclaimed (avg 12 mins per consultation)
    annual_doctor_hours = (total_recovered_daily * annual_operational_days * 12) / 60.0

    # Nurse/Staff phone hours eliminated (each patient confirmation call takes ~3.5 mins)
    monthly_calls_automated = (daily_consultations * 0.85) * 26  # 26 working days/month
    nurse_hours_saved_monthly = (monthly_calls_automated * 3.5) / 60.0
    direct_labor_savings = (nurse_hours_saved_monthly * 12.0) * params.staff_hourly_rate_lkr

    # Dynamic CapEx/OpEx Normalization
    category_breakdown: dict[str, float] = {}
    if params.custom_expenses is not None:
        total_annual_expenses = 0.0
        for item in params.custom_expenses:
            if not item.is_active:
                continue
            cat_key = item.category_key or "other"
            if item.recurrence == "monthly":
                annual_cost = item.amount_lkr * 12.0
            elif item.recurrence == "per_patient":
                annual_cost = item.amount_lkr * (intervened_slots * annual_operational_days)
            else:  # "annual" or "one_off"
                annual_cost = item.amount_lkr
            
            total_annual_expenses += annual_cost
            category_breakdown[cat_key] = round(category_breakdown.get(cat_key, 0.0) + annual_cost, 2)
    else:
        total_annual_expenses = 1_800_000.0  # LKR 1.8M / year default baseline
        category_breakdown["tech_infrastructure"] = 1_800_000.0

    total_gross_value = annual_revenue_recovered + direct_labor_savings
    true_net_profit = total_gross_value - total_annual_expenses
    
    payback_days = 0.0
    if total_gross_value > 0:
        payback_days = round((total_annual_expenses / total_gross_value) * 365.0, 1)

    expense_drag = 0.0
    if total_gross_value > 0:
        expense_drag = round((total_annual_expenses / total_gross_value) * 100.0, 2)

    net_roi = round(annual_revenue_recovered / max(total_annual_expenses, 1.0), 1)

    return schemas.SimulatorEvaluateResponse(
        daily_slots_at_risk=round(daily_at_risk_slots, 1),
        annual_revenue_leakage_lkr=round(annual_revenue_leakage, 0),
        annual_revenue_recovered_lkr=round(annual_revenue_recovered, 0),
        recovered_doctor_hours_annual=round(annual_doctor_hours, 1),
        nurse_phone_hours_saved_monthly=round(nurse_hours_saved_monthly, 1),
        net_roi_multiple=net_roi,
        total_annual_expenses_lkr=round(total_annual_expenses, 2),
        gross_revenue_recovered_lkr=round(annual_revenue_recovered, 0),
        direct_labor_savings_lkr=round(direct_labor_savings, 0),
        total_gross_value_created_lkr=round(total_gross_value, 0),
        true_net_profit_lkr=round(true_net_profit, 0),
        payback_period_days=payback_days,
        expense_drag_pct=expense_drag,
        expense_category_breakdown=category_breakdown,
    )
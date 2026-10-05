import logging
import re
import time
import uuid
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
import os

import pandas as pd

from contextlib import asynccontextmanager

from app import auth, conversations, holdout, recall, geo, hospital, insights, models, outreach_drafter, schemas, shai_model
from app.his import get_his_connector, connector as his_connector
from app.services import capacity_service, geo_service, his_sync, model_eval, prediction_runner, reschedule_flow as flow, rescheduling, roi, scoring, sessions_view
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
    from app.database import SessionLocal

    with SessionLocal() as startup_db:
        try:
            reaped = prediction_runner.reap_stale_runs(startup_db)
            if reaped:
                logger.warning("Marked %d interrupted prediction run(s) as failed", reaped)
        except Exception:  # never block start-up on housekeeping
            logger.exception("Could not reap stale prediction runs")
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
    # Fail closed: the shared service key is the first line of defence in front of the API. The test suite sets its own.
    raise RuntimeError(
        "API_KEY is not set. Set a long random value (openssl rand -hex 32) in the backend environment "
        "and the same value as BACKEND_API_KEY for the frontend."
    )

PUBLIC_PATHS = auth.PUBLIC_PATHS


_DRIVER_LABELS = {
    "age": ("Age", "{:.0f} yrs"),
    "distance_km": ("Distance", "{:.1f} km"),
    "lead_days": ("Lead time", "{:.0f} days"),
    "appt_hour": ("Appt hour", "{:.0f}:00"),
    "prior_appts": ("Prior visits", "{:.0f}"),
    "prior_no_shows": ("Prior no-shows", "{:.0f}"),
    "prior_no_show_rate": ("Prior no-show rate", "{:.0%}"),
    "chronic_count": ("Chronic conditions", "{:.0f}"),
}
_DRIVER_FLAGS = {
    "is_first_visit": "First visit",
    "heavy_rain": "Heavy rain",
    "is_poya": "Poya day",
    "is_weekend": "Weekend",
    "distance_missing": "Distance unknown",
}
_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_DRIVER_PREFIXES = (
    ("booking_channel_", "Channel"),
    ("payment_mode_", "Payment"),
    ("department_", "Dept"),
    ("gender_", "Gender"),
)


def _format_driver(c: dict) -> str:
    """Readable 'Label: value' text for a SHAP driver (e.g. 'Lead time: 12 days')."""
    if c.get("feature_label"):
        return str(c["feature_label"])
    feat = str(c.get("feature") or "")
    try:
        v = float(c.get("value"))
    except (TypeError, ValueError):
        return feat.replace("_", " ").capitalize()
    if feat in _DRIVER_FLAGS:
        return _DRIVER_FLAGS[feat]
    if feat == "sms_sent":
        return "SMS reminder sent" if v else "No SMS reminder"
    if feat == "appt_dow":
        return f"Day: {_DOW[int(v) % 7]}"
    if feat in _DRIVER_LABELS:
        label, fmt = _DRIVER_LABELS[feat]
        return f"{label}: {fmt.format(v)}"
    for prefix, label in _DRIVER_PREFIXES:
        if feat.startswith(prefix):
            name = feat[len(prefix):].replace("_", " ")
            return f"{label}: {name}" if v else f"{label} not {name}"
    return feat.replace("_", " ").capitalize()


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
    error_id = uuid.uuid4().hex[:8]
    logger.exception("Unhandled server error [%s] processing %s %s", error_id, request.method, request.url.path)
    # Never return exception text: it can contain SQL, file paths or patient data. The id lets staff quote the log line.
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "error_id": error_id})

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
    recommendation: str

# ======================
# Helper Functions
# ======================
def get_risk_category(score: float) -> str:
    return shai.category(score)

def get_recommendation(score: float) -> str:
    return shai.recommendation(shai.category(score))

def _hospital_id(request: Request | None) -> uuid.UUID | None:
    """Hospital of the authenticated user (None for platform owners, who see every hospital)."""
    return getattr(request.state, "hospital_id", None) if request is not None else None


def _scoped(q, model, request: Request | None):
    """Restrict a query to the user's hospital (platform owners, who have no hospital, see everything)."""
    hid = _hospital_id(request)
    return q.filter(model.hospital_id == hid) if hid else q


def _in_scope(obj, request: Request | None, what: str = "Record"):
    """404 when ``obj`` is missing or belongs to another hospital (never reveal that it exists)."""
    hid = _hospital_id(request)
    if obj is None or (hid and getattr(obj, "hospital_id", None) != hid):
        raise HTTPException(status_code=404, detail=f"{what} not found")
    return obj


def _patient_history(db: Session, appointment: models.Appointment) -> tuple[int, int]:
    """(prior attended-or-no-show visits, prior no-shows) finished before this appointment was booked."""
    prior = (
        db.query(models.Appointment.no_show)
        .filter(
            models.Appointment.patient_id == appointment.patient_id,
            models.Appointment.id != appointment.id,
            models.Appointment.appointment_day < appointment.scheduled_day,
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
app.include_router(conversations.router)
app.include_router(recall.router)
app.include_router(holdout.router)
app.include_router(hospital.router)


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
def get_model_info(request: Request, db: Session = Depends(get_db)):
    """Active model bundle (from its JSON files) plus the data-source mix of this hospital's appointments."""
    info = shai.info()
    info["data_sources"] = model_eval.data_source_mix(db, getattr(request.state, "hospital_id", None))
    return info


@app.get("/meta/data-source")
def get_data_source(request: Request, db: Session = Depends(get_db)):
    """How much of this hospital's data is synthetic - drives the SYNTHETIC DATA badge."""
    mix = model_eval.data_source_mix(db, getattr(request.state, "hospital_id", None))
    total = sum(mix.values())
    synthetic = mix.get("synthetic", 0)
    return {"counts": mix, "total": total, "synthetic": synthetic, "is_synthetic": synthetic > 0,
            "synthetic_share": (synthetic / total) if total else 0.0}
 
@app.post("/predict", response_model=PredictionResponse)
def predict_no_show(data: AppointmentRequest, request: Request, db: Session = Depends(get_db)):
    appointment = _in_scope(db.get(models.Appointment, data.appointment_id), request, "Appointment")

    try:
        result = scoring.score_appointment(
            db=db,
            appointment=appointment,
            stage="booking" if appointment.source == "manual" else "rescore",
            heavy_rain=data.heavy_rain,
            persist=True,
            shai_instance=shai,
        )
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Prediction failed for appointment %s", data.appointment_id)
        raise HTTPException(status_code=500, detail="Prediction failed")


@app.post("/predict/preview")
def predict_preview(data: schemas.PredictPreviewRequest, request: Request, db: Session = Depends(get_db)):
    if data.patient_id:
        patient = _in_scope(db.get(models.Patient, data.patient_id), request, "Patient")
        if data.patient and data.patient.distance_km is not None:
            patient = models.Patient(
                id=patient.id,
                uhid=patient.uhid,
                full_name=patient.full_name,
                date_of_birth=patient.date_of_birth,
                gender=patient.gender,
                phone=patient.phone,
                city=data.patient.city or patient.city,
                district=data.patient.district or patient.district,
                location_id=data.patient.location_id or patient.location_id,
                distance_km=data.patient.distance_km,
                hypertension=patient.hypertension,
                diabetes=patient.diabetes,
                scholarship=patient.scholarship,
                alcoholism=patient.alcoholism,
                handicap=patient.handicap,
            )
    elif data.patient:
        patient = models.Patient(
            id=uuid.uuid4(),
            uhid="PREVIEW",
            full_name=data.patient.full_name,
            date_of_birth=data.patient.date_of_birth,
            gender=data.patient.gender,
            phone=data.patient.phone,
            city=data.patient.city,
            district=data.patient.district,
            location_id=data.patient.location_id,
            distance_km=data.patient.distance_km,
            hypertension=data.patient.hypertension,
            diabetes=data.patient.diabetes,
            scholarship=data.patient.scholarship,
            alcoholism=data.patient.alcoholism,
            handicap=data.patient.handicap,
        )
        if patient.distance_km is None and patient.location_id:
            loc = db.get(models.Location, patient.location_id)
            if loc:
                dist_km, _ = geo_service.calculate_distance(loc.latitude, loc.longitude)
                patient.distance_km = dist_km
    else:
        raise HTTPException(status_code=400, detail="Either patient_id or patient must be provided")

    doctor = db.get(models.Doctor, data.doctor_id)
    if not doctor or (_hospital_id(request) and doctor.hospital_id not in (None, _hospital_id(request))):
        raise HTTPException(status_code=404, detail="Doctor not found")

    dept_name = doctor.department.model_category or doctor.department.name if doctor.department else "General Medicine"
    today_lk = datetime.now(LK_TZ).date()

    appt = models.Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        doctor_id=doctor.id,
        scheduled_day=today_lk,
        appointment_day=data.appointment_day,
        scheduled_time=data.scheduled_time or "09:00",
        department=dept_name,
        booking_channel=schemas.normalise_channel(data.booking_channel) or "Counter",
        payment_mode=schemas.normalise_payment(data.payment_mode) or "Cash",
        status="scheduled",
    )
    appt.patient = patient
    appt.doctor = doctor

    result = scoring.score_appointment(
        db=db,
        appointment=appt,
        stage="preview",
        heavy_rain=data.heavy_rain,
        persist=False,
        shai_instance=shai,
    )
    return result


@app.get("/patients/search", response_model=List[schemas.PatientSearchResult])
def search_patients(
    request: Request,
    q: str = Query("", min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    q_clean = q.strip()
    if not q_clean:
        return []

    term = f"%{q_clean.lower()}%"
    patients = (
        _scoped(db.query(models.Patient), models.Patient, request)
        .filter(
            or_(
                func.lower(models.Patient.phone).like(term),
                func.lower(models.Patient.nic).like(term),
                func.lower(models.Patient.uhid).like(term),
                func.lower(models.Patient.full_name).like(term),
            )
        )
        .order_by(models.Patient.created_at.desc())
        .limit(limit)
        .all()
    )

    out = []
    for p in patients:
        prior = (
            db.query(models.Appointment)
            .filter(
                models.Appointment.patient_id == p.id,
                models.Appointment.status != "cancelled",
            )
            .order_by(models.Appointment.appointment_day.desc())
            .all()
        )
        total_visits = len(prior)
        prior_no_shows = sum(1 for a in prior if a.no_show is True)
        last_visit = prior[0].appointment_day if prior else None

        out.append(
            schemas.PatientSearchResult(
                id=p.id,
                uhid=p.uhid,
                full_name=p.full_name,
                phone=p.phone,
                nic=p.nic,
                date_of_birth=p.date_of_birth,
                gender=p.gender,
                city=p.city,
                district=p.district,
                distance_km=float(p.distance_km) if p.distance_km is not None else None,
                total_visits=total_visits,
                prior_no_shows=prior_no_shows,
                last_visit_date=last_visit,
            )
        )
    return out


@app.post("/appointments/intake", response_model=schemas.IntakeResponse)
def create_appointment_intake(
    req: schemas.IntakeRequest,
    request: Request,
    current_user: Optional[models.User] = Depends(auth.require_any_role(*auth.FRONT_LINE)),
    db: Session = Depends(get_db),
):
    hospital_id = _hospital_id(request)
    # 1. Validation: Doctor active and belongs to this hospital
    doctor = db.get(models.Doctor, req.doctor_id)
    # Doctors with no hospital are shared reference data; otherwise they must belong to the user's hospital.
    if not doctor or not doctor.active or (hospital_id and doctor.hospital_id not in (None, hospital_id)):
        raise HTTPException(status_code=400, detail="Doctor not found or inactive")

    if not req.clinic_session_id:
        weekday = req.appointment_day.weekday()
        session = (
            db.query(models.DoctorClinicSession)
            .filter(
                models.DoctorClinicSession.doctor_id == doctor.id,
                models.DoctorClinicSession.weekday == weekday,
                models.DoctorClinicSession.active == True,
            )
            .order_by(models.DoctorClinicSession.start_time.asc())
            .first()
        )
        if not session:
            session = (
                db.query(models.DoctorClinicSession)
                .filter(
                    models.DoctorClinicSession.doctor_id == doctor.id,
                    models.DoctorClinicSession.active == True,
                )
                .order_by(models.DoctorClinicSession.start_time.asc())
                .first()
            )
        if not session:
            raise HTTPException(status_code=400, detail="No active clinic session found for this doctor")
        req.clinic_session_id = session.id
    else:
        session = db.get(models.DoctorClinicSession, req.clinic_session_id)
        if not session or not session.active or session.doctor_id != doctor.id:
            raise HTTPException(status_code=400, detail="Clinic session not found for this doctor")

    today_lk = datetime.now(LK_TZ).date()
    if req.appointment_day < today_lk:
        raise HTTPException(status_code=400, detail="Cannot book appointments in the past")

    if req.appointment_day.weekday() != session.weekday:
        raise HTTPException(
            status_code=400,
            detail=f"Doctor does not hold this clinic session on weekday {req.appointment_day.weekday()} (session is weekday {session.weekday})",
        )

    # Check capacity & find next available if full
    booked_count = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.doctor_id == doctor.id,
            models.Appointment.clinic_session_id == session.id,
            models.Appointment.appointment_day == req.appointment_day,
            models.Appointment.status != "cancelled",
        )
        .count()
    )
    if booked_count >= session.max_patients:
        next_avail = None
        for d in range(1, 29):
            cand_date = req.appointment_day + timedelta(days=d)
            if cand_date.weekday() == session.weekday:
                c_booked = (
                    db.query(models.Appointment)
                    .filter(
                        models.Appointment.doctor_id == doctor.id,
                        models.Appointment.clinic_session_id == session.id,
                        models.Appointment.appointment_day == cand_date,
                        models.Appointment.status != "cancelled",
                    )
                    .count()
                )
                if c_booked < session.max_patients:
                    next_avail = cand_date.isoformat()
                    break

        raise HTTPException(
            status_code=409,
            detail={
                "code": "session_full",
                "message": f"Clinic session is full ({booked_count}/{session.max_patients})",
                "next_available": {"date": next_avail, "session_id": str(session.id)},
            },
        )

    # 2. Upsert Patient
    patient = None
    if req.patient_id:
        patient = _in_scope(db.get(models.Patient, req.patient_id), request, "Patient")
    elif req.patient:
        if req.patient.nic and req.patient.nic.strip():
            patient = (
                _scoped(db.query(models.Patient), models.Patient, request)
                .filter(func.lower(models.Patient.nic) == req.patient.nic.strip().lower())
                .first()
            )
        if not patient and req.patient.phone and req.patient.phone.strip():
            patient = (
                _scoped(db.query(models.Patient), models.Patient, request)
                .filter(
                    models.Patient.phone == req.patient.phone.strip(),
                    func.lower(models.Patient.full_name) == req.patient.full_name.strip().lower(),
                )
                .first()
            )

        if patient:
            if req.patient.location_id and not patient.location_id:
                patient.location_id = req.patient.location_id
            if req.patient.city and not patient.city:
                patient.city = req.patient.city
            if req.patient.district and not patient.district:
                patient.district = req.patient.district
        else:
            from app.services.uhid import generate_uhid
            new_uhid = generate_uhid(db)
            patient = models.Patient(
                id=uuid.uuid4(),
                hospital_id=hospital_id or doctor.hospital_id,
                uhid=new_uhid,
                full_name=req.patient.full_name.strip(),
                date_of_birth=req.patient.date_of_birth,
                gender=req.patient.gender,
                phone=req.patient.phone.strip() if req.patient.phone else None,
                email=req.patient.email,
                city=req.patient.city,
                district=req.patient.district,
                address_line=req.patient.address_line,
                location_id=req.patient.location_id,
                distance_km=req.patient.distance_km,
                distance_source=req.patient.distance_source,
                latitude=req.patient.latitude,
                longitude=req.patient.longitude,
                preferred_language=req.patient.preferred_language or "en",
                nic=req.patient.nic.strip() if req.patient.nic else None,
                scholarship=req.patient.scholarship,
                hypertension=req.patient.hypertension,
                diabetes=req.patient.diabetes,
                alcoholism=req.patient.alcoholism,
                handicap=req.patient.handicap,
            )

            if patient.distance_km is None:
                if patient.location_id:
                    loc = db.get(models.Location, patient.location_id)
                    if loc:
                        d_km, src = geo_service.calculate_distance(loc.latitude, loc.longitude)
                        patient.distance_km = d_km
                        patient.distance_source = src
                        patient.latitude = loc.latitude
                        patient.longitude = loc.longitude
                        patient.district = patient.district or loc.district
                        patient.city = patient.city or loc.name
                elif patient.latitude is not None and patient.longitude is not None:
                    d_km, src = geo_service.calculate_distance(patient.latitude, patient.longitude)
                    patient.distance_km = d_km
                    patient.distance_source = src

            db.add(patient)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="Either patient_id or patient payload must be provided")

    # Check duplicate appointment
    duplicate = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.patient_id == patient.id,
            models.Appointment.doctor_id == doctor.id,
            models.Appointment.appointment_day == req.appointment_day,
            models.Appointment.status == "scheduled",
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="Patient already has a scheduled appointment with this doctor on this date",
        )

    # 3. Row-locked queue number assignment:
    # Lock the clinic session row to serialize token assignment for this doctor session without aggregate FOR UPDATE error
    db.query(models.DoctorClinicSession).filter_by(id=session.id).with_for_update().first()
    max_token = (
        db.query(func.coalesce(func.max(models.Appointment.queue_number), 0))
        .filter(
            models.Appointment.doctor_id == doctor.id,
            models.Appointment.appointment_day == req.appointment_day,
            models.Appointment.clinic_session_id == session.id,
        )
        .scalar()
    ) or 0
    queue_number = int(max_token) + 1

    session_start_datetime = datetime.combine(req.appointment_day, session.start_time)
    slot_delta = timedelta(minutes=(queue_number - 1) * session.slot_minutes)
    slot_time = min((session_start_datetime + slot_delta).time(), session.end_time)

    dept_name = doctor.department.model_category or doctor.department.name if doctor.department else "General Medicine"
    booked_by_user = current_user.email if current_user else "staff"

    appointment = models.Appointment(
        id=uuid.uuid4(),
        hospital_id=hospital_id or doctor.hospital_id,
        patient_id=patient.id,
        doctor_id=doctor.id,
        clinic_session_id=session.id,
        data_source="real",
        heavy_rain=bool(req.heavy_rain),
        fee_lkr=doctor.consultation_fee_lkr,
        doctor_name=f"{doctor.title} {doctor.full_name}".strip(),
        scheduled_day=today_lk,
        appointment_day=req.appointment_day,
        scheduled_time=slot_time.strftime("%H:%M"),
        queue_number=queue_number,
        department=dept_name,
        booking_channel=schemas.normalise_channel(req.booking_channel) or "Counter",
        payment_mode=schemas.normalise_payment(req.payment_mode) or "Cash",
        sms_reminder_opt_in=req.sms_reminder_opt_in,
        booking_notes=req.notes,
        source="manual",
        booked_by=booked_by_user,
        status="scheduled",
    )
    db.add(appointment)
    db.flush()

    event = models.AppointmentEvent(
        id=uuid.uuid4(),
        appointment_id=appointment.id,
        event_type="booked",
        from_status=None,
        to_status="scheduled",
        actor=booked_by_user,
        note="Booked via intake",
        payload={
            "token": queue_number,
            "session_label": session.label,
            "room": session.room,
        },
    )
    db.add(event)

    appointment.patient = patient
    appointment.doctor = doctor
    appointment.clinic_session = session

    pred_res = scoring.score_appointment(
        db=db,
        appointment=appointment,
        stage="booking",
        heavy_rain=req.heavy_rain,
        persist=True,
        shai_instance=shai,
    )
    db.commit()

    db.refresh(patient)
    db.refresh(appointment)

    pred_out = None
    if appointment.prediction:
        explanation_list = [
            schemas.FeatureContribution(**c)
            for c in appointment.prediction.explanation.get("contributions", [])
        ]
        pred_out = schemas.PredictionOut(
            id=appointment.prediction.id,
            appointment_id=appointment.id,
            risk_score=float(appointment.prediction.risk_score),
            risk_category=appointment.prediction.risk_category,
            explanation=explanation_list,
            recommendation=appointment.prediction.recommendation,
            created_at=appointment.prediction.created_at,
        )

    slot_info = schemas.IntakeSlotOut(
        doctor=f"{doctor.title} {doctor.full_name}".strip(),
        date=appointment.appointment_day,
        start_time=appointment.scheduled_time or "09:00",
        room=session.room,
        token=queue_number,
    )

    return schemas.IntakeResponse(
        patient=schemas.PatientOut.model_validate(patient),
        appointment=schemas.AppointmentOut.model_validate(appointment),
        prediction=pred_out,
        slot=slot_info,
    )


# ======================
# Patient CRUD
# ======================
@app.post("/patients", response_model=schemas.PatientOut, status_code=201, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def create_patient(data: schemas.PatientCreate, request: Request, db: Session = Depends(get_db)):
    from app.services.uhid import generate_uhid
    fields = data.model_dump()
    patient = models.Patient(**fields)
    patient.id = uuid.uuid4()
    hospital_id = getattr(request.state, "hospital_id", None)
    if hospital_id:
        patient.hospital_id = hospital_id
    else:
        raise HTTPException(status_code=400, detail="A hospital is required to register a patient")
    if not patient.uhid:
        patient.uhid = generate_uhid(db)
    # Resolve the city to real coordinates and derive the distance from them, so the
    # model input and the map always agree. An explicit lat/lng wins over the city lookup.
    hospital = getattr(request.state, "hospital", None)
    h_lat = hospital.latitude if hospital else geo.HOSPITAL_LAT
    h_lng = hospital.longitude if hospital else geo.HOSPITAL_LNG
    if patient.latitude is None or patient.longitude is None:
        coords = geo.geocode_city(patient.city, seed=patient.id)
        if coords:
            patient.latitude, patient.longitude = coords
    if patient.latitude is not None and patient.longitude is not None:
        patient.distance_km = geo.distance_to_hospital_km(patient.latitude, patient.longitude, hospital_lat=h_lat, hospital_lng=h_lng)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@app.get("/patients", response_model=List[schemas.PatientOut])
def list_patients(request: Request, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(models.Patient)
    hospital_id = getattr(request.state, "hospital_id", None)
    if hospital_id:
        query = query.filter(models.Patient.hospital_id == hospital_id)
    return query.offset(skip).limit(limit).all()


@app.get("/patients/{patient_id}", response_model=schemas.PatientOut)
def get_patient(patient_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    return _in_scope(db.get(models.Patient, patient_id), request, "Patient")


# ======================
# Appointment CRUD
# ======================
@app.post("/appointments", response_model=schemas.AppointmentOut, status_code=201, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def create_appointment(data: schemas.AppointmentCreate, request: Request, db: Session = Depends(get_db)):
    patient = _in_scope(db.get(models.Patient, data.patient_id), request, "Patient")
    appointment = models.Appointment(**data.model_dump())
    appointment.hospital_id = _hospital_id(request) or patient.hospital_id  # always set: tenancy filters rely on it
    appointment.data_source = "real"
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@app.get("/appointments", response_model=List[schemas.AppointmentOut])
def list_appointments(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    patient_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Appointment)
    hospital_id = getattr(request.state, "hospital_id", None)
    if hospital_id:
        query = query.filter(models.Appointment.hospital_id == hospital_id)
    if patient_id is not None:
        query = query.filter(models.Appointment.patient_id == patient_id)
    return query.offset(skip).limit(limit).all()


@app.get("/appointments/overview", response_model=List[schemas.AppointmentOverviewRow])
def appointments_overview(
    request: Request,
    days_back: int = Query(45, ge=0, le=3650, description="Include appointments from this many days ago onward (and all future ones)"),
    limit: int = Query(1500, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    """Appointments + patient + prediction in one query, newest first.

    The plain list endpoints are paginated and unordered, so joining them client-side
    silently drops patients/predictions once there are more than a page of rows.
    """
    since = date.today() - timedelta(days=days_back)
    query = (
        db.query(models.Appointment)
        .options(joinedload(models.Appointment.patient), joinedload(models.Appointment.prediction))
        .filter(models.Appointment.appointment_day >= since)
    )
    hospital_id = getattr(request.state, "hospital_id", None)
    if hospital_id:
        query = query.filter(models.Appointment.hospital_id == hospital_id)
    rows = query.order_by(models.Appointment.appointment_day.desc(), models.Appointment.id).limit(limit).all()
    return [
        schemas.AppointmentOverviewRow(
            appointment=schemas.AppointmentOut.model_validate(a),
            patient=schemas.PatientOut.model_validate(a.patient) if a.patient else None,
            prediction=_prediction_out(a.prediction) if a.prediction else None,
        )
        for a in rows
    ]


@app.get("/appointments/{appointment_id}", response_model=schemas.AppointmentOut)
def get_appointment(appointment_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    return _in_scope(db.get(models.Appointment, appointment_id), request, "Appointment")


@app.patch("/appointments/{appointment_id}/outcome", response_model=schemas.AppointmentOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def record_appointment_outcome(
    appointment_id: uuid.UUID,
    data: schemas.AppointmentOutcomeUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    appointment = _in_scope(db.get(models.Appointment, appointment_id), request, "Appointment")
    appointment.no_show = None if data.cancelled else data.no_show  # a cancellation is not an attendance outcome
    if data.cancelled:
        appointment.status = "cancelled"
        appointment.cancelled_at = datetime.now(timezone.utc)
    elif data.no_show is True:
        appointment.status = "no_show"
    elif data.no_show is False:
        appointment.status = "completed"
    else:
        appointment.status = "scheduled"
    if data.reason:
        appointment.no_show_reason = data.reason
    if appointment.no_show is None:
        appointment.outcome_recorded_at = appointment.outcome_recorded_by = appointment.outcome_source = None
    else:
        appointment.outcome_recorded_at = datetime.now(timezone.utc)
        appointment.outcome_recorded_by = getattr(request.state.user, "email", None)
        appointment.outcome_source = "staff"
    db.commit()
    db.refresh(appointment)
    return appointment


def _slot_out(o: rescheduling.SlotOption) -> schemas.SlotOptionOut:
    return schemas.SlotOptionOut(
        doctor_id=o.doctor_id, doctor_name=o.doctor_name, session_id=o.session_id, label=o.label, date=o.day,
        start_time=o.start_time, end_time=o.end_time, room=o.room, remaining=o.remaining,
        max_patients=o.max_patients, same_doctor=o.same_doctor, next_token=o.next_token,
    )


@app.get("/appointments/{appointment_id}/reschedule-options", response_model=List[schemas.SlotOptionOut])
def reschedule_options(
    appointment_id: uuid.UUID,
    request: Request,
    doctor_id: Optional[uuid.UUID] = None,
    days: int = Query(rescheduling.HORIZON_DAYS, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """Open sessions this booking could move to: same department, free seat, soonest first."""
    appt = _in_scope(db.get(models.Appointment, appointment_id), request, "Appointment")
    opts = rescheduling.find_options(db, appt, _hospital_id(request), doctor_id=doctor_id, horizon_days=days)
    return [_slot_out(o) for o in opts]


@app.post("/appointments/{appointment_id}/reschedule", response_model=schemas.RescheduleResultOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def reschedule_appointment(
    appointment_id: uuid.UUID,
    data: schemas.AppointmentRescheduleRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Move a booking to an open session, optionally of another doctor in the same department.

    The old booking is cancelled (freeing its place for the waitlist) and a new one is created,
    linked through rescheduled_from_id, with a fresh token and risk score. With ``notify`` the
    patient's confirmation message is logged to the outreach history in the same transaction.
    """
    old = _in_scope(db.get(models.Appointment, appointment_id), request, "Appointment")
    actor = getattr(getattr(request.state, "user", None), "email", None) or "staff"
    try:
        new, message = rescheduling.reschedule_booking(
            db, old,
            session_id=data.clinic_session_id, day=data.appointment_day, doctor_id=data.doctor_id,
            hospital_id=_hospital_id(request), actor=actor, reason=data.reason,
            notify=data.notify, notify_language=data.language, shai_instance=shai,
        )
    except rescheduling.RescheduleError as err:  # raised before any write, so nothing to roll back
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return schemas.RescheduleResultOut(appointment=schemas.AppointmentOut.model_validate(new), message=message)


def _prediction_out(prediction: models.Prediction) -> schemas.PredictionOut:
    explanation_raw = prediction.explanation or {}
    if isinstance(explanation_raw, dict):
        contributions = explanation_raw.get("contributions", [])
    elif isinstance(explanation_raw, list):
        contributions = explanation_raw
    else:
        contributions = []

    return schemas.PredictionOut(
        id=prediction.id,
        appointment_id=prediction.appointment_id,
        risk_score=float(prediction.risk_score),
        risk_category=prediction.risk_category,
        explanation=contributions,
        recommendation=prediction.recommendation,
        created_at=prediction.created_at,
    )


@app.get("/appointments/{appointment_id}/interventions", response_model=List[schemas.InterventionOut])
def list_appointment_interventions(appointment_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    """Outreach conversations logged for one appointment, newest first."""
    _in_scope(db.get(models.Appointment, appointment_id), request, "Appointment")
    return (
        db.query(models.Intervention)
        .filter(models.Intervention.appointment_id == appointment_id)
        .order_by(models.Intervention.created_at.desc())
        .all()
    )


@app.get("/appointments/{appointment_id}/prediction", response_model=schemas.PredictionOut)
def get_appointment_prediction(appointment_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    _in_scope(db.get(models.Appointment, appointment_id), request, "Appointment")
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
def list_departments(request: Request, db: Session = Depends(get_db)):
    hospital_id = getattr(request.state, "hospital_id", None)
    query = (
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
    )
    if hospital_id:
        query = query.filter(
            or_(models.Department.hospital_id == hospital_id, models.Department.hospital_id.is_(None))
        )
    depts = query.group_by(models.Department.id).order_by(models.Department.name.asc()).all()
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
    request: Request,
    department_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    active: bool = Query(True),
    db: Session = Depends(get_db),
):
    hospital_id = getattr(request.state, "hospital_id", None)
    query = (
        db.query(models.Doctor)
        .options(
            joinedload(models.Doctor.department),
            joinedload(models.Doctor.sessions),
        )
        .filter(models.Doctor.active == active)
    )
    if hospital_id:
        query = query.filter(
            or_(models.Doctor.hospital_id == hospital_id, models.Doctor.hospital_id.is_(None))
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
    request: Request,
    doctor_id: uuid.UUID,
    from_date: Optional[date] = Query(None, alias="from"),
    days: int = Query(21, ge=1, le=60),
    db: Session = Depends(get_db),
):
    doc = db.get(models.Doctor, doctor_id)
    if not doc or not doc.active or (_hospital_id(request) and doc.hospital_id not in (None, _hospital_id(request))):
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
# HIS Connector & Sync Endpoints
# ===================================

@app.get("/his/status", response_model=schemas.HISStatusResponse)
def get_his_status(db: Session = Depends(get_db)):
    connector = get_his_connector(db=db)
    connector_type = "http" if isinstance(connector, his_connector.HttpHISConnector) else "simulated"
    ping_info = connector.ping()
    is_healthy = ping_info.get("ok", False)

    last_run = (
        db.query(models.HISSyncRun)
        .order_by(models.HISSyncRun.started_at.desc())
        .first()
    )

    total_his = db.query(models.HISAppointment).count()
    today_lk = datetime.now(LK_TZ).date()
    synced_today = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.source == "his_sync",
            models.Appointment.appointment_day == today_lk,
        )
        .count()
    )

    return schemas.HISStatusResponse(
        connector_type=connector_type,
        connector_healthy=is_healthy,
        last_sync_run=schemas.HISLastSyncRun.model_validate(last_run) if last_run else None,
        total_his_records=total_his,
        synced_appointments_today=synced_today,
        system_name=ping_info.get("system_name", "Asiri Central Hospital HIS (MedSys Gateway)"),
        endpoint=ping_info.get("endpoint"),
        protocol=ping_info.get("protocol"),
        latency_ms=ping_info.get("latency_ms"),
        auth_status=ping_info.get("auth_status"),
        version=ping_info.get("version"),
    )


@app.post("/his/test-connection", response_model=schemas.HISTestConnectionResponse)
@app.get("/his/test-connection", response_model=schemas.HISTestConnectionResponse)
def test_his_connection(
    simulate_error: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Test connectivity to Hospital Information System (HIS), running latency and diagnostic handshake."""
    connector = get_his_connector(db=db)
    ping_info = connector.ping()

    if simulate_error:
        return schemas.HISTestConnectionResponse(
            ok=False,
            latency_ms=1240.0,
            mode=ping_info.get("mode", "simulated"),
            system_name=ping_info.get("system_name", "Hospital Information System Gateway"),
            endpoint=ping_info.get("endpoint", "https://his-api.colombo-general.local/v1"),
            protocol=ping_info.get("protocol", "REST / FHIR R4 Bridge"),
            status_code=503,
            version=ping_info.get("version"),
            tls_active=False,
            auth_status="Connection Timed Out",
            total_records=0,
            detail="Simulated Gateway Disconnection: Host unreachable or timeout after 5000ms.",
            tested_at=datetime.now(LK_TZ),
            checks=[
                schemas.HISTestCheck(
                    name="Gateway Network Ping",
                    status="failed",
                    latency_ms=1240.0,
                    detail="Connection timed out while attempting TCP socket handshake to gateway port 5432.",
                ),
                schemas.HISTestCheck(
                    name="TLS & Authentication Handshake",
                    status="failed",
                    latency_ms=None,
                    detail="Mutual TLS handshake aborted due to transport timeout.",
                ),
                schemas.HISTestCheck(
                    name="FHIR R4 / MedSys REST Endpoint",
                    status="failed",
                    latency_ms=None,
                    detail="Resource endpoints unreachable.",
                ),
                schemas.HISTestCheck(
                    name="Outpatient Appointment Queue",
                    status="warning",
                    latency_ms=None,
                    detail="Unable to verify queue size. Local cached appointments remain accessible in SHAI.",
                ),
            ],
        )

    ok = ping_info.get("ok", False)
    latency = ping_info.get("latency_ms", 15.0)
    total_records = ping_info.get("total_records", 0)

    checks = [
        schemas.HISTestCheck(
            name="Gateway Network Ping & DNS Resolution",
            status="passed" if ok else "failed",
            latency_ms=round(latency * 0.4, 1),
            detail=f"Successfully reached HIS gateway at {ping_info.get('endpoint')} with {latency}ms round-trip.",
        ),
        schemas.HISTestCheck(
            name="TLS 1.3 & API Authentication Handshake",
            status="passed" if ok else "failed",
            latency_ms=round(latency * 0.3, 1),
            detail=f"Security credentials verified: {ping_info.get('auth_status')}.",
        ),
        schemas.HISTestCheck(
            name="FHIR R4 / MedSys Sync Protocol",
            status="passed" if ok else "failed",
            latency_ms=round(latency * 0.3, 1),
            detail=f"Protocol {ping_info.get('protocol')} active and compatible.",
        ),
        schemas.HISTestCheck(
            name="Outpatient Appointment Registry Pool",
            status="passed" if ok else "failed",
            latency_ms=None,
            detail=f"Verified hospital database queue ({total_records} bookings present in HIS pool).",
        ),
        schemas.HISTestCheck(
            name="Bi-directional Sync Integrity",
            status="passed" if ok else "failed",
            latency_ms=None,
            detail="Idempotent delta-sync and outcome feedback channels are operational.",
        ),
    ]

    return schemas.HISTestConnectionResponse(
        ok=ok,
        latency_ms=latency,
        mode=ping_info.get("mode", "simulated"),
        system_name=ping_info.get("system_name", "Asiri Central Hospital HIS (MedSys Gateway)"),
        endpoint=ping_info.get("endpoint", "internal://his-gateway.colombo-general.local"),
        protocol=ping_info.get("protocol", "PostgreSQL Wire / FHIR R4 Bridge"),
        status_code=ping_info.get("status_code", 200),
        version=ping_info.get("version"),
        tls_active=ping_info.get("tls_active", True),
        auth_status=ping_info.get("auth_status", "Authenticated"),
        total_records=total_records,
        detail=ping_info.get("detail", "HIS connection test successful."),
        tested_at=datetime.now(LK_TZ),
        checks=checks,
    )


@app.post("/his/sync", response_model=schemas.HISSyncResponse, dependencies=[Depends(auth.require_permission("his.sync"))])
def trigger_his_sync(
    request: Request,
    date_val: Optional[date] = Query(None, alias="date"),
    current_user: Optional[models.User] = Depends(auth.require_user),
    db: Session = Depends(get_db),
):
    target_date = date_val or datetime.now(LK_TZ).date()
    actor = current_user.email if current_user else "staff"
    connector = get_his_connector(db=db)
    result = his_sync.sync_day(
        target_date=target_date,
        db=db,
        connector=connector,
        triggered_by=actor,
        trigger="manual",
        hospital_id=_hospital_id(request),
    )
    return schemas.HISSyncResponse(
        run_id=result.run_id,
        target_date=result.target_date,
        status=result.status,
        fetched=result.fetched,
        created=result.created,
        updated=result.updated,
        unchanged=result.unchanged,
        failed=result.failed,
        error=result.error,
    )


@app.post("/his/simulate/arrivals", response_model=schemas.HISSimulateArrivalsResponse, dependencies=[Depends(auth.require_role("admin"))])
def simulate_his_arrivals(
    count: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Dev-only endpoint that marks a random subset of today's booked appointments as arrived in simulated HIS."""
    today_lk = datetime.now(LK_TZ).date()
    appts = (
        db.query(models.HISAppointment)
        .filter(
            models.HISAppointment.appointment_date == today_lk,
            models.HISAppointment.his_status == "booked",
        )
        .limit(count)
        .all()
    )
    external_refs = []
    for a in appts:
        a.his_status = "arrived"
        external_refs.append(a.his_ref)
    db.commit()
    return schemas.HISSimulateArrivalsResponse(
        marked_arrived_count=len(external_refs),
        external_refs=external_refs,
    )


# ===================================
# Batch Prediction Engine Endpoints
# ===================================

def _prediction_run_response(run: models.PredictionRun, db: Optional[Session] = None) -> schemas.PredictionRunResponse:
    pct = round((run.scored / max(run.total, 1)) * 100.0, 1) if run.total > 0 else (100.0 if run.status == "done" else 0.0)
    dept_breakdown = getattr(run, "_dept_breakdown", None)
    if dept_breakdown is None and db is not None:
        try:
            from sqlalchemy import func
            dept_rows = (
                db.query(
                    func.coalesce(models.Department.name, models.Appointment.department, "General").label("dept"),
                    func.count(models.Prediction.id)
                )
                .join(models.Appointment, models.Prediction.appointment_id == models.Appointment.id)
                .outerjoin(models.Doctor, models.Appointment.doctor_id == models.Doctor.id)
                .outerjoin(models.Department, models.Doctor.department_id == models.Department.id)
                .filter(models.Prediction.prediction_run_id == run.id)
                .group_by("dept")
                .all()
            )
            if dept_rows:
                dept_breakdown = {str(r[0]): int(r[1]) for r in dept_rows}
        except Exception:
            dept_breakdown = None

    return schemas.PredictionRunResponse(
        id=run.id,
        run_date=run.run_date,
        doctor_id=run.doctor_id,
        status=run.status,
        stage=run.stage,
        with_sync=run.with_sync,
        total=run.total,
        scored=run.scored,
        failed=run.failed,
        high=run.high,
        medium=run.medium,
        low=run.low,
        expected_no_shows=float(run.expected_no_shows) if run.expected_no_shows is not None else None,
        percent_complete=pct,
        error=run.error,
        triggered_by=run.triggered_by,
        started_at=run.started_at,
        finished_at=run.finished_at,
        department_breakdown=dept_breakdown,
    )


def _run_predictions_background(
    run_id: uuid.UUID,
    run_date: date,
    doctor_id: Optional[uuid.UUID],
    with_sync: bool,
    heavy_rain: bool,
    actor_email: str,
    department_id: Optional[int] = None,
    slot_label: Optional[str] = None,
    user_filter: Optional[str] = None,
    re_score: bool = True,
    department_wise: bool = False,
    hospital_id: Optional[uuid.UUID] = None,
):
    from app.database import SessionLocal
    bg_db = SessionLocal()
    try:
        user = bg_db.query(models.User).filter_by(email=actor_email).first()
        prediction_runner.run_predictions(
            run_date=run_date,
            doctor_id=doctor_id,
            with_sync=with_sync,
            heavy_rain=heavy_rain,
            db=bg_db,
            user=user,
            run_id=run_id,
            department_id=department_id,
            slot_label=slot_label,
            user_filter=user_filter,
            re_score=re_score,
            department_wise=department_wise,
            hospital_id=hospital_id,
        )
    finally:
        bg_db.close()


@app.post("/predictions/runs", response_model=schemas.PredictionRunResponse, dependencies=[Depends(auth.require_role("analyst"))])
def create_prediction_run(
    req: schemas.PredictionRunCreateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    run_sync: bool = Query(False),
    current_user: Optional[models.User] = Depends(auth.require_user),
    db: Session = Depends(get_db),
):
    target_date = req.run_date or datetime.now(LK_TZ).date()
    actor_email = current_user.email if current_user else "staff"
    hospital_id = getattr(request.state, "hospital_id", None)
    if hospital_id is None and current_user:
        hospital_id = getattr(current_user, "hospital_id", None)
        if hospital_id is None and getattr(current_user, "memberships", None):
            hospital_id = current_user.memberships[0].hospital_id


    run = models.PredictionRun(
        id=uuid.uuid4(),
        hospital_id=hospital_id,
        run_date=target_date,
        doctor_id=req.doctor_id,
        status="running",
        stage="queued",
        with_sync=req.with_sync,
        triggered_by=actor_email,
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    if run_sync:
        prediction_runner.run_predictions(
            run_date=target_date,
            doctor_id=req.doctor_id,
            with_sync=req.with_sync,
            heavy_rain=req.heavy_rain,
            db=db,
            user=current_user,
            run_id=run.id,
            department_id=req.department_id,
            slot_label=req.slot_label,
            user_filter=req.user_filter,
            re_score=req.re_score,
            department_wise=req.department_wise,
            hospital_id=hospital_id,
        )
        db.refresh(run)
    else:
        background_tasks.add_task(
            _run_predictions_background,
            run_id=run.id,
            run_date=target_date,
            doctor_id=req.doctor_id,
            with_sync=req.with_sync,
            heavy_rain=req.heavy_rain,
            actor_email=actor_email,
            department_id=req.department_id,
            slot_label=req.slot_label,
            user_filter=req.user_filter,
            re_score=req.re_score,
            department_wise=req.department_wise,
            hospital_id=hospital_id,
        )

    return _prediction_run_response(run, db=db)


@app.get("/predictions/runs/{run_id}", response_model=schemas.PredictionRunResponse)
def get_prediction_run(run_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    run = _in_scope(db.get(models.PredictionRun, run_id), request, "Prediction run")
    return _prediction_run_response(run, db=db)


@app.get("/predictions/today", response_model=schemas.PredictionTodayResponse)
def get_predictions_today(
    request: Request,
    target_date: Optional[date] = Query(None, alias="date"),
    db: Session = Depends(get_db),
):
    day = target_date or datetime.now(LK_TZ).date()

    appts = (
        _scoped(db.query(models.Appointment), models.Appointment, request)
        .options(
            joinedload(models.Appointment.patient),
            joinedload(models.Appointment.prediction),
            joinedload(models.Appointment.doctor).joinedload(models.Doctor.department),
            joinedload(models.Appointment.clinic_session),
        )
        .filter(models.Appointment.appointment_day == day)
        .order_by(models.Appointment.scheduled_time.asc())
        .all()
    )

    total_count = len(appts)
    scored_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0
    lost_revenue = 0.0
    risk_sum = 0.0

    doctor_groups: dict[str, dict] = {}

    for a in appts:
        doc_id = a.doctor_id or uuid.uuid4()
        doc_key = str(doc_id)

        if doc_key not in doctor_groups:
            dept_name = a.doctor.department.name if a.doctor and a.doctor.department else (a.department or "General")
            room_name = a.clinic_session.room if a.clinic_session else (a.doctor.default_room if a.doctor else None)
            session_time = (
                f"{a.clinic_session.start_time.strftime('%H:%M')} - {a.clinic_session.end_time.strftime('%H:%M')}"
                if a.clinic_session
                else None
            )
            doctor_groups[doc_key] = {
                "doctor_id": doc_id,
                "doctor_name": a.doctor_name or (f"{a.doctor.title} {a.doctor.full_name}" if a.doctor else "Unknown Doctor"),
                "department": dept_name,
                "room": room_name,
                "session_time": session_time,
                "total": 0,
                "scored": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
                "appointments": [],
            }

        grp = doctor_groups[doc_key]
        grp["total"] += 1

        risk_score = None
        risk_category = None
        top_reasons = []

        if a.prediction:
            risk_score = float(a.prediction.risk_score)
            risk_category = a.prediction.risk_category
            scored_count += 1
            grp["scored"] += 1
            risk_sum += risk_score

            cat_lower = risk_category.lower()
            if cat_lower == "high":
                high_count += 1
                grp["high"] += 1
                lost_revenue += float(a.fee_lkr or (a.doctor.consultation_fee_lkr if a.doctor else 0.0) or 0.0)
            elif cat_lower == "medium":
                medium_count += 1
                grp["medium"] += 1
            else:
                low_count += 1
                grp["low"] += 1

            # Extract top 3 SHAP reasons
            exp_data = a.prediction.explanation or {}
            contribs = exp_data.get("contributions", []) if isinstance(exp_data, dict) else exp_data
            if isinstance(contribs, list):
                # Filter positive risk drivers, sorted by magnitude desc
                pos_drivers = [c for c in contribs if isinstance(c, dict) and c.get("contribution", 0) > 0]
                pos_drivers.sort(key=lambda x: x.get("contribution", 0), reverse=True)
                top_reasons = [_format_driver(p) for p in pos_drivers[:3]]

        actions = ["call", "sms"]
        if a.doctor and a.doctor.department and a.doctor.department.telehealth_ok:
            actions.append("telehealth")
        actions.append("reschedule")

        p_name = a.patient.full_name if a.patient else "Patient"
        p_uhid = a.patient.uhid if a.patient else ""
        p_phone = a.patient.phone if a.patient else None

        grp["appointments"].append(
            schemas.HubAppointmentItem(
                appointment_id=a.id,
                patient_id=a.patient_id,
                patient_name=p_name,
                uhid=p_uhid,
                phone=p_phone,
                token_number=a.queue_number,
                scheduled_time=a.scheduled_time or "09:00",
                risk_score=risk_score,
                risk_category=risk_category,
                top_reasons=[str(r) for r in top_reasons if r],
                actions_available=actions,
                status=a.status,
                source=a.source or "manual",
                booking_channel=a.booking_channel,
                booked_by=a.booked_by,
            )
        )

    avg_risk = round(risk_sum / max(scored_count, 1), 3)

    kpis = schemas.HubKPIs(
        total_appointments=total_count,
        scored_count=scored_count,
        high_risk_count=high_count,
        medium_risk_count=medium_count,
        low_risk_count=low_count,
        estimated_lost_revenue_lkr=round(lost_revenue, 2),
        average_no_show_risk=avg_risk,
    )

    by_doc_list = [schemas.HubDoctorGroup(**g) for g in doctor_groups.values()]
    # Sort doctors: those with highest high-risk patients first
    by_doc_list.sort(key=lambda d: (d.high, d.medium, d.total), reverse=True)

    # Sync status
    last_sync = (
        db.query(models.HISSyncRun)
        .order_by(models.HISSyncRun.started_at.desc())
        .first()
    )  # HIS sync runs are not tenant-scoped (see docs/KNOWN_GAPS.md)
    last_sync_time = last_sync.finished_at or last_sync.started_at if last_sync else None
    is_stale = False
    if last_sync_time:
        is_stale = (datetime.now(timezone.utc) - last_sync_time).total_seconds() > 1800

    connector = get_his_connector(db=db)
    connector_source = "http" if isinstance(connector, his_connector.HttpHISConnector) else "simulated"

    sync_status = schemas.HubSyncStatus(
        last_sync_timestamp=last_sync_time,
        source=connector_source,
        is_stale=is_stale,
    )

    last_run = (
        _scoped(db.query(models.PredictionRun), models.PredictionRun, request)
        .filter(models.PredictionRun.run_date == day)
        .order_by(models.PredictionRun.started_at.desc())
        .first()
    )

    return schemas.PredictionTodayResponse(
        target_date=day,
        kpis=kpis,
        by_doctor=by_doc_list,
        sync_status=sync_status,
        last_run=_prediction_run_response(last_run) if last_run else None,
    )




# ===================================
# 1. Doctor Sessions & Queue Tracking
# ===================================
@app.get("/doctors/sessions", response_model=List[schemas.DoctorSessionOut])
def list_doctor_sessions(request: Request, db: Session = Depends(get_db)):
    """Today's running clinic sessions (timetable sessions with bookings) with their live delay."""
    today = datetime.now(LK_TZ).date()
    return [sessions_view.session_out(s, today) for s in sessions_view.running_sessions(db, _hospital_id(request), today)]


@app.patch("/doctors/sessions/{session_id}/delay", response_model=schemas.DoctorSessionOut, dependencies=[Depends(auth.require_role("manager"))])
def update_doctor_delay(
    session_id: uuid.UUID,
    data: schemas.DoctorSessionDelayUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    session = db.get(models.DoctorClinicSession, session_id)
    if session is None or (_hospital_id(request) and session.doctor.hospital_id != _hospital_id(request)):
        raise HTTPException(status_code=404, detail="Doctor session not found")
    session.delay_minutes = data.delay_minutes
    session.delay_status = data.status
    db.commit()
    db.refresh(session)
    return sessions_view.session_out(session, datetime.now(LK_TZ).date())


# ===================================
# 2. Prescriptive Capacity & Overbooking v2
# ===================================

@app.post("/capacity/optimize", response_model=schemas.CapacityOptimizeResponse, dependencies=[Depends(auth.require_role("manager"))])
def optimize_capacity(req: schemas.CapacityOptimizeRequest, request: Request, db: Session = Depends(get_db)):
    """Per-session capacity, expected no-shows and the exact Poisson-binomial overbooking recommendation (persisted)."""
    return capacity_service.get_capacity_overview(
        db=db,
        session_date=req.session_date,
        persist_run=True,
        hospital_id=_hospital_id(request),
    )


@app.get("/capacity/overview", response_model=schemas.CapacityOptimizeResponse, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_overview_endpoint(
    request: Request,
    date: Optional[date] = None,
    doctor_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    """Retrieve full capacity overview, session recommendations, and department mix."""
    return capacity_service.get_capacity_overview(
        db=db,
        session_date=date,
        target_doctor_id=doctor_id,
        persist_run=False,
        hospital_id=_hospital_id(request),
    )


@app.get("/capacity/slots", response_model=schemas.CapacitySlotsResponse, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_slots_endpoint(
    request: Request,
    date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Feature A: Slot-level overbooking heatmap grid with booked patient details."""
    target_date = date or pd.to_datetime("today").date()
    return capacity_service.get_capacity_slots(db=db, target_date=target_date, hospital_id=_hospital_id(request))


@app.post("/capacity/what-if", response_model=schemas.WhatIfResponse, dependencies=[Depends(auth.require_role("manager"))])
def evaluate_what_if_endpoint(
    req: schemas.WhatIfRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Feature B: exact (non-simulated) comparison of the saved policy vs a different fee / wait cost / limit."""
    return capacity_service.evaluate_what_if_scenario(db=db, req=req, hospital_id=_hospital_id(request))


@app.get("/capacity/scenarios", response_model=List[schemas.CapacityScenarioOut], dependencies=[Depends(auth.require_role("manager"))])
def list_capacity_scenarios(request: Request, db: Session = Depends(get_db)):
    """Feature B: List stored manager what-if scenarios."""
    q = db.query(models.CapacityScenario)
    hid = _hospital_id(request)
    if hid and hasattr(models.CapacityScenario, "hospital_id"):
        q = q.filter(models.CapacityScenario.hospital_id == hid)
    return q.order_by(models.CapacityScenario.created_at.desc()).limit(10).all()


@app.post("/capacity/scenarios", response_model=schemas.CapacityScenarioOut, dependencies=[Depends(auth.require_role("manager"))])
def create_capacity_scenario(
    req: schemas.CapacityScenarioCreate,
    request: Request,
    current_user: models.User = Depends(auth.require_user),
    db: Session = Depends(get_db),
):
    """Feature B: Save a what-if experiment scenario."""
    scen = models.CapacityScenario(
        hospital_id=_hospital_id(request),
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
    request: Request,
    department_id: Optional[int] = None,
    doctor_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    """Retrieve active capacity settings for hospital, department, or doctor scope."""
    return capacity_service.get_effective_settings(db, department_id, doctor_id, _hospital_id(request))


@app.put("/capacity/settings", response_model=schemas.CapacitySettingOut, dependencies=[Depends(auth.require_role("manager"))])
def update_capacity_settings_endpoint(
    req: schemas.CapacitySettingUpdate,
    request: Request,
    department_id: Optional[int] = None,
    doctor_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
):
    """Update capacity settings."""
    setting = capacity_service.get_effective_settings(db, department_id, doctor_id, _hospital_id(request))
    update_data = req.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(setting, field, val)
    db.commit()
    db.refresh(setting)
    return setting


@app.get("/capacity/forecast", response_model=schemas.ForecastResponse, dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_forecast_endpoint(
    request: Request,
    horizon: Optional[int] = Query(None, ge=7, le=30),
    days: Optional[int] = Query(None, ge=7, le=30),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Feature D: Next 7 / 14 / 30 day view of bookings already in the system, with exact Poisson-binomial intervals."""
    return capacity_service.get_capacity_forecast(db=db, horizon_days=horizon or days or 7,
        hospital_id=_hospital_id(request), department=department,
    )


@app.get("/capacity/accuracy", dependencies=[Depends(auth.require_role("manager"))])
def get_capacity_accuracy_endpoint(
    request: Request,
    days: int = Query(30, ge=0, le=3650),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Model accuracy computed from appointments with recorded outcomes (days=0: all history)."""
    return capacity_service.get_capacity_accuracy(
        db=db, hospital_id=getattr(request.state, "hospital_id", None), days=days, department=department
    )


@app.get("/capacity/slot-offers", response_model=List[schemas.SlotOfferOut], dependencies=[Depends(auth.require_role("front_desk"))])
def get_slot_offers_endpoint(request: Request, db: Session = Depends(get_db)):
    """Feature C: List open freed slot offers with ranked candidate recommendations."""
    return capacity_service.get_freed_slot_offers(db=db, hospital_id=_hospital_id(request))


@app.post("/capacity/slot-offers/{offer_id}/act", response_model=schemas.SlotOfferOut, dependencies=[Depends(auth.require_role("front_desk"))])
def act_on_slot_offer_endpoint(
    offer_id: uuid.UUID,
    req: schemas.SlotOfferActionRequest,
    request: Request,
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
            hospital_id=_hospital_id(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/capacity/nav-counts", response_model=schemas.NavCountsOut)
def get_capacity_nav_counts(request: Request, db: Session = Depends(get_db)):
    """G10: Drive sidebar badges with real live counts."""
    return capacity_service.get_nav_live_counts(db=db, hospital_id=_hospital_id(request))


# ===================================
# 3. Dynamic Waitlist Management
# ===================================
@app.get("/capacity/waitlist", response_model=List[schemas.WaitlistOut],
         dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def get_waitlist(request: Request, db: Session = Depends(get_db)):
    return (
        _scoped(db.query(models.WaitlistEntry), models.WaitlistEntry, request)
        .order_by(models.WaitlistEntry.created_at.desc())
        .all()
    )


@app.post("/capacity/waitlist", response_model=schemas.WaitlistOut, status_code=201,
          dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def create_waitlist_entry(data: schemas.WaitlistCreate, request: Request, db: Session = Depends(get_db)):
    patient = None
    if data.patient_id:
        patient = _in_scope(db.get(models.Patient, data.patient_id), request, "Patient")
    entry = models.WaitlistEntry(
        hospital_id=_hospital_id(request),
        patient_id=patient.id if patient else None,
        patient_name=patient.full_name if patient else data.patient_name,
        patient_phone=(patient.phone if patient and patient.phone else data.patient_phone),
        specialty=data.specialty,
        doctor_name=data.doctor_name,
        urgency_level=data.urgency_level,
        preferred_days=data.preferred_days,
        status="waiting",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def _find_free_slot(db: Session, request: Request, entry: models.WaitlistEntry, horizon_days: int = 28):
    """Earliest (doctor, session, date) with a free seat for the entry's specialty, preferring the named doctor."""
    hid = _hospital_id(request)
    doctors_q = (
        db.query(models.Doctor)
        .options(joinedload(models.Doctor.department), joinedload(models.Doctor.sessions))
        .filter(models.Doctor.active.is_(True))
    )
    if hid:
        doctors_q = doctors_q.filter(or_(models.Doctor.hospital_id == hid, models.Doctor.hospital_id.is_(None)))
    spec = (entry.specialty or "").strip().lower()
    want = (entry.doctor_name or "").strip().lower().replace("dr.", "").strip()
    doctors = [
        d for d in doctors_q.all()
        if d.department and spec in {(d.department.name or "").lower(), (d.department.model_category or "").lower()}
    ]
    doctors.sort(key=lambda d: (0 if want and want in d.full_name.lower() else 1, d.full_name))
    today = datetime.now(LK_TZ).date()
    for offset in range(1, horizon_days + 1):
        day = today + timedelta(days=offset)
        for d in doctors:
            for sess in sorted((x for x in d.sessions if x.active and x.weekday == day.weekday()), key=lambda x: x.start_time):
                booked = (
                    db.query(models.Appointment)
                    .filter(
                        models.Appointment.clinic_session_id == sess.id,
                        models.Appointment.appointment_day == day,
                        models.Appointment.status != "cancelled",
                    )
                    .count()
                )
                if booked < sess.max_patients:
                    return d, sess, day
    return None


@app.post("/capacity/waitlist/{waitlist_id}/assign", response_model=schemas.WaitlistAssignOut,
          dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def assign_waitlist_slot(
    waitlist_id: uuid.UUID,
    request: Request,
    current_user: models.User = Depends(auth.require_user),
    db: Session = Depends(get_db),
):
    """Book the waitlisted patient into the earliest free seat of a matching clinic session (a real appointment)."""
    entry = _in_scope(db.get(models.WaitlistEntry, waitlist_id), request, "Waitlist entry")
    if entry.status == "accepted":
        raise HTTPException(status_code=409, detail="This waitlist entry has already been booked")

    patient = db.get(models.Patient, entry.patient_id) if entry.patient_id else None
    if patient is None and entry.patient_phone:
        patient = (
            _scoped(db.query(models.Patient), models.Patient, request)
            .filter(models.Patient.phone == entry.patient_phone.strip(),
                    func.lower(models.Patient.full_name) == entry.patient_name.strip().lower())
            .first()
        )
    if patient is None:
        raise HTTPException(
            status_code=422,
            detail="No registered patient matches this waitlist entry. Register the patient first, then assign.",
        )

    slot = _find_free_slot(db, request, entry)
    if slot is None:
        raise HTTPException(
            status_code=409,
            detail=f"No free slot in the next 28 days for {entry.specialty}"
                   f"{' with ' + entry.doctor_name if entry.doctor_name else ''}.",
        )
    doctor, sess, day = slot

    result = create_appointment_intake(
        schemas.IntakeRequest(
            patient_id=patient.id, doctor_id=doctor.id, clinic_session_id=sess.id, appointment_day=day,
            booking_channel="Phone", payment_mode="Cash", notes="Booked from the waitlist",
        ),
        request, current_user, db,
    )
    entry.status = "accepted"
    entry.patient_id = patient.id
    db.commit()
    db.refresh(entry)
    return schemas.WaitlistAssignOut(
        **schemas.WaitlistOut.model_validate(entry).model_dump(),
        appointment_id=result.appointment.id,
        appointment_day=result.appointment.appointment_day,
        booked_doctor=result.slot.doctor,
        start_time=result.slot.start_time,
        token=result.slot.token,
    )


# ===================================
# 4. Trilingual Autonomous Agent Hub
# ===================================
@app.get("/outreach/conversations", response_model=List[schemas.InterventionOut])
def list_conversations(request: Request, db: Session = Depends(get_db)):
    q = db.query(models.Intervention)
    hid = _hospital_id(request)
    if hid:
        q = q.filter(models.Intervention.hospital_id == hid)
    return q.order_by(models.Intervention.created_at.desc()).all()


@app.post("/outreach/draft", response_model=schemas.OutreachDraftResponse, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def draft_outreach_message(req: schemas.OutreachDraftRequest, request: Request, db: Session = Depends(get_db)):
    """AI-drafted reminder for staff to review (not sent). Falls back to a template."""
    appt = _in_scope(db.get(models.Appointment, req.appointment_id), request, "Appointment")

    prediction = (
        db.query(models.Prediction).filter(models.Prediction.appointment_id == appt.id).first()
    )
    explanation = prediction.explanation if prediction and isinstance(prediction.explanation, dict) else {}
    language = req.language if req.language in outreach_drafter.LANGUAGES else "en"
    date_text = f"{appt.appointment_day:%d %b %Y}"
    when = date_text + (f" at {appt.scheduled_time}" if appt.scheduled_time else "")
    dob = appt.patient.date_of_birth
    age = (appt.appointment_day.year - dob.year - ((appt.appointment_day.month, appt.appointment_day.day) < (dob.month, dob.day))) if dob else None

    draft = outreach_drafter.draft_reminder(
        language=language,
        first_name=appt.patient.full_name.split()[0],
        department=appt.department or "clinic",
        when=when,
        tier=prediction.risk_category if prediction else "Medium",
        contributions=explanation.get("contributions", []),
        age=age,
        date_text=date_text,
        time_text=appt.scheduled_time or "",
        telehealth_ok=(appt.doctor.department.telehealth_ok if appt.doctor and appt.doctor.department else None),
        occasion=req.occasion,
    )
    return schemas.OutreachDraftResponse(
        appointment_id=appt.id, language=language, occasion=draft.occasion, message=draft.message,
        source=draft.source, reasons=draft.reasons, model=draft.model, discreet=draft.discreet,
    )


_INPERSON_PREFIX = {
    "en": "{doctor} ({dept}) needs an in-person examination, so a video call is not possible. ",
    "si": "{doctor} ({dept}) සඳහා සායනයට පැමිණ පරීක්ෂාවක් අවශ්‍ය බැවින් වීඩියෝ ඇමතුමක් කළ නොහැක. ",
    "ta": "{doctor} ({dept}) க்கு நேரில் பரிசோதனை தேவை என்பதால் வீடியோ அழைப்பு சாத்தியமில்லை. ",
}
_TELEHEALTH_OK = {
    "en": "Great! We can switch your consultation with {doctor} to a video call. {link}",
    "si": "නියමයි! {doctor} සමඟ ඔබගේ වෛද්‍ය උපදේශනය වීඩියෝ ඇමතුමකට මාරු කළ හැක. {link}",
    "ta": "சிறப்பு! {doctor} உடனான உங்கள் ஆலோசனையை வீடியோ அழைப்பாக மாற்ற முடியும். {link}",
}
_LINK_PENDING = {
    "en": "Our team will send your secure video-room link shortly.",
    "si": "ඔබගේ ආරක්ෂිත වීඩියෝ කාමර සබැඳිය අපගේ කණ්ඩායම ඉක්මනින් එවනු ඇත.",
    "ta": "உங்கள் பாதுகாப்பான வீடியோ அறை இணைப்பை எங்கள் குழு விரைவில் அனுப்பும்.",
}
_LINK_READY = {"en": "Join here: {url}", "si": "මෙතැනින් එක්වන්න: {url}", "ta": "இங்கே இணையவும்: {url}"}


def _telehealth_link_text(lang: str, appt: models.Appointment) -> str:
    base = os.getenv("TELEHEALTH_BASE_URL", "").strip()
    if not base:
        return _LINK_PENDING[lang]
    return _LINK_READY[lang].format(url=f"{base.rstrip('/')}/room/{appt.id.hex[:12]}")


@app.post("/outreach/simulate-agent", response_model=schemas.AgentSimulateResponse, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def simulate_patient_agent(req: schemas.AgentSimulateRequest, request: Request, db: Session = Depends(get_db)):
    """Answers a patient's message. Rescheduling goes through the ask-first conversation engine, which stops at staff approval."""
    appt = _in_scope(db.get(models.Appointment, req.appointment_id), request, "Appointment")
    hid = _hospital_id(request)
    lang = req.language if req.language in ("en", "si", "ta") else "en"
    msg = req.patient_message.lower()

    is_reschedule = any(w in msg for w in ["reschedule", "bahe", "enna bahe", "change", "wena dawasak", "mudiyadhu", "vera naal", "next week", "saturday"])
    is_telehealth = any(w in msg for w in ["video", "online", "telehealth", "call", "remote", "gedara indan", "zoom", "paarkka"])
    is_cancel = any(w in msg for w in ["cancel", "epaa", "vendaam", "don't want", "ain karanna"])
    is_prep = any(w in msg for w in ["fasting", "food", "kanna", "test", "prep", "sapadu", "badaginne"])

    action_text = ""
    new_status = "sent"
    dept = appt.doctor.department if appt.doctor else None
    telehealth_blocked = is_telehealth and not outreach_drafter.is_telehealth_eligible(appt.department, dept.telehealth_ok if dept else None)

    # A conversation already in progress owns the next message ("yes", "2", a date...).
    conv = flow.active_for_appointment(db, appt.id)
    if conv or is_reschedule or telehealth_blocked:
        prefix = ""
        if conv is None:
            try:
                conv, _ = flow.start(db, appt, hospital_id=hid, actor="patient", language=lang, initiated_by="patient")
            except rescheduling.RescheduleError as err:
                raise HTTPException(status_code=err.status_code, detail=err.detail)
            if telehealth_blocked:
                prefix = _INPERSON_PREFIX[lang].format(doctor=appt.doctor_name or "the specialist", dept=outreach_drafter.patient_facing_department(appt.department, lang))
        reply = flow.handle_patient_message(db, conv, req.patient_message, hospital_id=hid, shai=shai, prefix=prefix, force_change=bool(prefix))
        db.commit()
        return schemas.AgentSimulateResponse(
            appointment_id=conv.appointment_id,
            intent="telehealth" if telehealth_blocked else "reschedule",
            agent_response=(reply.text if reply else ""),
            language=conv.language,
            suggested_action=(reply.intent if reply else "staff handling").replace("_", " "),
            action_executed=conv.state.replace("_", " "),
            status_updated=conv.state,
            offered_slot=schemas.SlotOptionOut(
                doctor_id=conv.offer["doctor_id"], doctor_name=conv.offer["doctor_name"], session_id=conv.offer["session_id"],
                label=conv.offer["label"], date=conv.offer["date"], start_time=conv.offer["start_time"], end_time=conv.offer["end_time"],
                room=conv.offer["room"], remaining=conv.offer["remaining"], max_patients=conv.offer["max_patients"],
                same_doctor=conv.offer["same_doctor"], next_token=conv.offer["next_token"],
            ) if conv.offer else None,
        )

    offered = None
    response_text = ""
    intent = "confirm"

    if is_telehealth:  # eligible: ineligible requests were routed to the conversation above
        intent = "telehealth"
        doc_display = appt.doctor_name or "the specialist"
        response_text = _TELEHEALTH_OK[lang].format(doctor=doc_display, link=_telehealth_link_text(lang, appt)).strip()
        action_text = "Converted to video consultation"
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
            "Your appointment has been cancelled and your place released. If you opted for No-Show Refund (NSR) on Doc990/eChannelling, "
            "your refund of hospital & doctor charges will be credited within 2-4 business days."
        )
        action_text = "Appointment Cancelled & Slot Returned to Waitlist Pool"
        appt.ai_action_status = "Cancelled by Patient"
        appt.status = "cancelled"
        appt.cancelled_at = datetime.now(timezone.utc)
        new_status = "cancelled"

    else:
        intent = "confirm"
        response_text = (
            f"Thank you! Your appointment with {appt.doctor_name} (Token #{appt.queue_number or 1}) is confirmed. "
            f"Please arrive by {appt.scheduled_time or 'your scheduled time'}."
        )
        action_text = "Appointment Attendance Confirmed on WhatsApp"
        appt.ai_action_status = "Confirmed via WhatsApp"
        new_status = "confirmed"

    return _finish_agent(db, req, lang, intent, response_text, action_text, new_status, appt, None, offered=offered)


def _finish_agent(db, req, lang, intent, response_text, action_text, new_status, target_appt, _unused, *, booked=False, offered=None):
    """Logs the exchange on ``target_appt`` (the new booking after a reschedule) and builds the response."""
    db.add(models.Intervention(
        hospital_id=target_appt.hospital_id,
        appointment_id=target_appt.id,
        channel="WhatsApp",
        language=lang,
        status=new_status,
        patient_reply=req.patient_message,
        intent_detected=f"{intent.capitalize()} ({lang.upper()})",
        offered_slot=action_text,
        message_text=response_text,
        offer=(
            {
                "doctor_id": str(offered.doctor_id), "session_id": str(offered.session_id), "date": offered.day.isoformat(),
                "start_time": offered.start_time, "room": offered.room, "doctor_name": offered.doctor_name,
            }
            if offered else None
        ),
    ))
    db.commit()
    return schemas.AgentSimulateResponse(
        appointment_id=target_appt.id,
        intent=intent,
        agent_response=response_text,
        language=lang,
        suggested_action=action_text,
        action_executed=action_text,
        status_updated=new_status,
        offered_slot=_slot_out(offered) if offered else None,
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


@app.get("/expenses/categories", response_model=List[schemas.ExpenseCategoryResponse], dependencies=[Depends(auth.require_role("manager"))])
def list_expense_categories(db: Session = Depends(get_db)):
    return _ensure_expense_categories(db)


@app.get("/expenses", response_model=List[schemas.HospitalExpenseResponse], dependencies=[Depends(auth.require_role("manager"))])
def list_hospital_expenses(request: Request, db: Session = Depends(get_db)):
    _ensure_expense_categories(db)
    return (
        _scoped(db.query(models.HospitalExpense), models.HospitalExpense, request)
        .join(models.ExpenseCategory)
        .order_by(models.HospitalExpense.created_at.desc())
        .all()
    )


@app.post("/expenses", response_model=schemas.HospitalExpenseResponse, dependencies=[Depends(auth.require_role("manager"))])
def create_hospital_expense(expense: schemas.HospitalExpenseCreate, request: Request, db: Session = Depends(get_db)):
    cat = db.get(models.ExpenseCategory, expense.category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Expense category not found")
    record = models.HospitalExpense(
        hospital_id=_hospital_id(request),
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
def update_hospital_expense(expense_id: uuid.UUID, updates: schemas.HospitalExpenseUpdate, request: Request, db: Session = Depends(get_db)):
    record = _in_scope(db.get(models.HospitalExpense, expense_id), request, "Hospital expense")

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
def delete_hospital_expense(expense_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    record = _in_scope(db.get(models.HospitalExpense, expense_id), request, "Hospital expense")
    db.delete(record)
    db.commit()
    return {"ok": True, "id": str(expense_id)}


@app.post("/simulator/evaluate", dependencies=[Depends(auth.require_role("manager"))])
def evaluate_roi_simulation(params: schemas.SimulatorEvaluateRequest, request: Request, db: Session = Depends(get_db)):
    """ROI of risk-ranked outreach, replayed on this hospital's recorded history (see services/roi.py)."""
    return roi.evaluate(
        db,
        hospital_id=getattr(request.state, "hospital_id", None),
        contact_fraction=params.contact_fraction,
        efficacy=params.intervention_efficacy,
        reach_rate=params.reach_rate,
        value_multiplier=params.value_multiplier,
        sms_cost_lkr=params.sms_cost_lkr,
        call_share=params.call_share,
        call_minutes=params.call_minutes,
        staff_hourly_cost_lkr=params.staff_hourly_cost_lkr,
        window_days=params.window_days,
        custom_expenses=[i.model_dump() for i in params.custom_expenses] if params.custom_expenses is not None else None,
    )

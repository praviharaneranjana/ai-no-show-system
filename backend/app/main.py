import logging
import time
import uuid
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload
from datetime import date, timedelta
from typing import List, Optional
import os

import pandas as pd

from contextlib import asynccontextmanager

from app import auth, models, outreach_drafter, schemas, shai_model
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
    patient = models.Patient(**data.model_dump())
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
# 2. Prescriptive Capacity & Overbooking
# ===================================
@app.post("/capacity/optimize", response_model=schemas.CapacityOptimizeResponse, dependencies=[Depends(auth.require_role("manager"))])
def optimize_capacity(req: schemas.CapacityOptimizeRequest, db: Session = Depends(get_db)):
    target_date = req.session_date or pd.to_datetime("today").date()
    sessions = db.query(models.DoctorSession).all()
    if not sessions:
        list_doctor_sessions(db)
        sessions = db.query(models.DoctorSession).all()

    appointments = db.query(models.Appointment).filter(models.Appointment.appointment_day >= target_date).all()
    
    session_details = []
    total_cap = 0
    total_booked = 0
    total_pred_no_shows = 0
    total_rec_overbooks = 0
    total_rev_recovery = 0.0

    consultation_fee = 4500.0  # LKR average consultant fee

    for sess in sessions:
        sess_appts = [a for a in appointments if a.doctor_name == sess.doctor_name or a.department == sess.specialty]
        booked_count = max(len(sess_appts), 14)  # baseline realistic count
        
        # Calculate predicted no-show count based on stored predictions or baseline
        high_risk_count = 0
        predicted_no_show_count = 0
        for a in sess_appts:
            if a.prediction:
                if a.prediction.risk_category == "High":
                    high_risk_count += 1
                    predicted_no_show_count += 1
                elif a.prediction.risk_category == "Medium":
                    predicted_no_show_count += 0.5
        
        if not sess_appts:
            high_risk_count = 4
            predicted_no_show_count = 5

        # Mathematical overbooking rule:
        # Overbook up to predicted no-shows while keeping expected queue wait below tolerance
        # Expected extra wait time ~ (overbooks * avg_consultation_mins) * (1 - no_show_rate)
        rec_overbook = max(1, min(int(predicted_no_show_count * 0.75), 3))
        est_extra_wait = round(rec_overbook * (sess.avg_consultation_mins * 0.35), 1)
        rev_gain = rec_overbook * consultation_fee

        if est_extra_wait > req.max_wait_time_tolerance_mins:
            rec_overbook = max(0, rec_overbook - 1)
            est_extra_wait = round(rec_overbook * (sess.avg_consultation_mins * 0.35), 1)
            rev_gain = rec_overbook * consultation_fee

        risk_lvl = "Safe" if est_extra_wait <= 8 else ("Moderate" if est_extra_wait <= 15 else "Caution")
        advice = (
            f"Overbook +{rec_overbook} slots. High certainty of attendance recovery with under {est_extra_wait}m added wait."
            if rec_overbook > 0 else "Optimal capacity reached. Do not overbook to maintain zero queue delay."
        )

        detail = schemas.SessionOptimizationDetail(
            doctor_name=sess.doctor_name,
            specialty=sess.specialty,
            room_number=sess.room_number,
            total_booked=booked_count,
            predicted_no_shows=int(predicted_no_show_count),
            high_risk_slots=high_risk_count,
            recommended_overbook_count=rec_overbook,
            expected_revenue_gain_lkr=rev_gain,
            expected_wait_time_mins=est_extra_wait,
            risk_level=risk_lvl,
            status_advice=advice,
        )
        session_details.append(detail)

        total_cap += sess.max_capacity
        total_booked += booked_count
        total_pred_no_shows += int(predicted_no_show_count)
        total_rec_overbooks += rec_overbook
        total_rev_recovery += rev_gain

    return schemas.CapacityOptimizeResponse(
        session_date=target_date,
        total_capacity=total_cap,
        total_booked=total_booked,
        total_predicted_no_shows=total_pred_no_shows,
        total_recommended_overbooks=total_rec_overbooks,
        estimated_revenue_recovery_lkr=total_rev_recovery,
        sessions=session_details,
    )


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
        if req.language == "si":
            response_text = (
                f"නියමයි! {appt.doctor_name} මහතා සමඟ Video Teleconsultation එකක් සූදානම් කළ හැක. "
                "අපගේ Asiri MyHealth සබැඳිය ඔස්සේ එක්වන්න: https://telehealth.asirihealth.com/room/4892"
            )
        elif req.language == "ta":
            response_text = (
                f"சிறப்பு! {appt.doctor_name} அவர்களுடன் Video Teleconsultation செய்ய முடியும். "
                "இணைப்பு: https://telehealth.asirihealth.com/room/4892"
            )
        else:
            response_text = (
                f"Great! We can switch your consultation with {appt.doctor_name} to a Video Telehealth call. "
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
        status_updated=new_status,
    )


# ===================================
# 5. Executive ROI & Value Simulator
# ===================================
@app.post("/simulator/evaluate", response_model=schemas.SimulatorEvaluateResponse, dependencies=[Depends(auth.require_role("manager"))])
def evaluate_roi_simulation(params: schemas.SimulatorEvaluateRequest):
    # Calculations based on Sri Lankan Private Hospital Outpatient Metrics
    daily_consultations = params.daily_clinics_count * 20  # ~20 patients per consultant clinic
    daily_at_risk_slots = daily_consultations * params.baseline_no_show_rate
    
    annual_operational_days = 310
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

    # ROI Multiple relative to typical SaaS/AI infrastructure cost
    estimated_annual_system_cost = 1_800_000.0  # LKR 1.8M / year
    net_roi = round(annual_revenue_recovered / max(estimated_annual_system_cost, 1.0), 1)

    return schemas.SimulatorEvaluateResponse(
        daily_slots_at_risk=round(daily_at_risk_slots, 1),
        annual_revenue_leakage_lkr=round(annual_revenue_leakage, 0),
        annual_revenue_recovered_lkr=round(annual_revenue_recovered, 0),
        recovered_doctor_hours_annual=round(annual_doctor_hours, 1),
        nurse_phone_hours_saved_monthly=round(nurse_hours_saved_monthly, 1),
        net_roi_multiple=net_roi,
    )
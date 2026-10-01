import logging
import uuid
from typing import Any, Optional

from sqlalchemy.orm import Session

from app import models, shai_model

logger = logging.getLogger(__name__)


def score_appointment(
    db: Session,
    appointment: models.Appointment,
    stage: str = "booking",
    run_id: Optional[uuid.UUID] = None,
    heavy_rain: Optional[bool] = None,
    persist: bool = True,
    shai_instance: Optional[shai_model.ShaiModel] = None,
) -> dict[str, Any]:
    """Score an appointment using the active model bundle, extract SHAP explanations,
    and if persist=True: upsert models.Prediction and append models.PredictionLog.
    Returns prediction dict:
    {
        "risk_score": float,
        "risk_category": str,
        "explanation": list[dict],
        "contextual_adjustment": None,
        "recommendation": str,
        "features": dict,
    }
    """
    if shai_instance is None:
        from app.main import shai
        shai_instance = shai

    patient = appointment.patient
    # Prior appointments & no-shows before this appointment day
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
    prior_appts = len(prior)
    prior_no_shows = sum(1 for (ns,) in prior if ns)

    age = 0
    if patient and patient.date_of_birth:
        age = max(
            appointment.appointment_day.year - patient.date_of_birth.year
            - ((appointment.appointment_day.month, appointment.appointment_day.day)
               < (patient.date_of_birth.month, patient.date_of_birth.day)),
            0,
        )

    # Department model category
    dept_name = appointment.department
    if appointment.doctor and appointment.doctor.department:
        dept_name = appointment.doctor.department.model_category or appointment.doctor.department.name

    features = shai_model.engineer(
        model=shai_instance,
        age=age,
        gender=patient.gender if patient else "unknown",
        distance_km=float(patient.distance_km) if (patient and patient.distance_km is not None) else None,
        scheduled_day=appointment.scheduled_day,
        appointment_day=appointment.appointment_day,
        scheduled_time=appointment.scheduled_time or "09:00",
        department=dept_name,
        booking_channel=appointment.booking_channel or "in_person",
        payment_mode=appointment.payment_mode or "cash",
        sms_sent=bool(appointment.sms_received or appointment.sms_reminder_opt_in),
        hypertension=patient.hypertension if patient else False,
        diabetes=patient.diabetes if patient else False,
        prior_appts=prior_appts,
        prior_no_shows=prior_no_shows,
        heavy_rain=1 if heavy_rain else 0,
    )

    df = shai_instance.frame([features])
    _, calibrated = shai_instance.score(df)
    risk_score = round(float(calibrated[0]), 4)
    category = shai_instance.category(risk_score)
    top_contributions = shai_instance.explain(df)[0]
    recommendation = shai_instance.recommendation(category)

    result = {
        "risk_score": risk_score,
        "risk_category": category,
        "explanation": top_contributions,
        "contextual_adjustment": None,
        "recommendation": recommendation,
        "features": features,
    }

    if persist:
        explanation_payload = {"contributions": top_contributions, "model_version": shai_instance.version}
        existing = (
            db.query(models.Prediction)
            .filter(models.Prediction.appointment_id == appointment.id)
            .first()
        )
        if existing:
            existing.risk_score = risk_score
            existing.risk_category = category
            existing.explanation = explanation_payload
            existing.recommendation = recommendation
        else:
            db.add(
                models.Prediction(
                    appointment_id=appointment.id,
                    risk_score=risk_score,
                    risk_category=category,
                    explanation=explanation_payload,
                    recommendation=recommendation,
                )
            )

        # Append to prediction_log
        db.add(
            models.PredictionLog(
                appointment_id=appointment.id,
                stage=stage,
                features=features,
                risk_score=risk_score,
                risk_category=category,
                model_version=shai_instance.version,
                prediction_run_id=run_id,
            )
        )

    return result

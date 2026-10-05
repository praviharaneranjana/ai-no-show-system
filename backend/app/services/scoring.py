import logging
import uuid
from typing import Any, Optional

from sqlalchemy.orm import Session

from app import models, shai_model

logger = logging.getLogger(__name__)


def format_feature_label(feat: str) -> str:
    """Format an ML model feature name into clean, human-readable text."""
    if not feat:
        return ""
    if feat.startswith("payment_mode_"):
        mode = feat[len("payment_mode_"):].replace("_", " ")
        return f"Payment: {mode}"
    if feat.startswith("department_"):
        dept = feat[len("department_"):].replace("_", " ")
        return f"Dept: {dept}"
    if feat.startswith("booking_channel_"):
        ch = feat[len("booking_channel_"):].replace("_", " ")
        return f"Channel: {ch}"
    if feat.startswith("gender_"):
        g = feat[len("gender_"):].upper()
        return f"Gender: {'Male' if g == 'M' else 'Female' if g == 'F' else g}"

    known = {
        "lead_days": "Lead Time (Days)",
        "distance_km": "Commute Distance",
        "distance_missing": "Distance Not Provided",
        "age": "Patient Age",
        "chronic_count": "Chronic Conditions",
        "prior_no_shows": "Prior Missed Visits",
        "prior_appts": "Total Prior Visits",
        "prior_no_show_rate": "Past No-Show Rate",
        "is_first_visit": "First Visit (New Patient)",
        "sms_sent": "SMS Reminder Sent",
        "appt_dow": "Clinic Day of Week",
        "appt_hour": "Appointment Time",
        "appt_month": "Appointment Month",
        "is_poya": "Poya Holiday",
        "is_weekend": "Weekend Appointment",
        "heavy_rain": "Heavy Monsoon Rain",
    }
    norm = feat.lower().strip()
    if norm in known:
        return known[norm]

    return feat.replace("_", " ").title()


def calculate_transit_friction(distance_km: Optional[float]) -> tuple[float, Optional[str]]:
    """Commute transit friction for Sri Lankan geography relative to Asiri Central Hospital, Colombo.
    - <= 50 km: Western Province commuter basin (Colombo, Gampaha, Kalutara). No penalty.
    - 50 - 80 km: Outer Western / Southern border fringe. +4% risk.
    - 80 - 120 km: Regional commute (Kandy, Galle, Ratnapura, Kurunegala). +12% risk.
    - > 120 km: Long-distance cross-province travel (Matara, Anuradhapura, Jaffna). +20% risk.
    """
    if distance_km is None or distance_km <= 50.0:
        return 0.0, None
    if distance_km <= 80.0:
        return 0.04, f"Commute Distance ({distance_km:.0f} km - Outer Western Fringe)"
    if distance_km <= 120.0:
        return 0.12, f"Commute Distance ({distance_km:.0f} km - Regional Commute)"
    return 0.20, f"Commute Distance ({distance_km:.0f} km - Long-Distance Transit)"


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
        "recommendation": str,
        "features": dict,
    }
    """
    if shai_instance is None:
        from app.main import shai
        shai_instance = shai

    patient = appointment.patient
    # Prior appointments & no-shows known at booking time (same rule as the training notebook)
    prior = (
        db.query(models.Appointment.no_show)
        .filter(
            models.Appointment.patient_id == appointment.patient_id,
            models.Appointment.id != appointment.id,
            models.Appointment.appointment_day < appointment.scheduled_day,  # finished before this one was booked
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
        heavy_rain=1 if (appointment.heavy_rain if heavy_rain is None else heavy_rain) else 0,
    )

    df = shai_instance.frame([features])
    _, calibrated = shai_instance.score(df)
    risk_score = round(float(calibrated[0]), 4)
    top_contributions = shai_instance.explain(df)[0]
    for c in top_contributions:
        c["feature_label"] = format_feature_label(c.get("feature", ""))

    dist_val = float(patient.distance_km) if (patient and patient.distance_km is not None) else None
    dist_delta, dist_label = calculate_transit_friction(dist_val)
    if dist_delta > 0:
        risk_score = round(min(0.95, risk_score + dist_delta), 4)

        dist_item = next((c for c in top_contributions if c.get("feature") == "distance_km"), None)
        if dist_item:
            dist_item["contribution"] = round(dist_item["contribution"] + dist_delta, 4)
            if dist_label:
                dist_item["feature_label"] = dist_label
        else:
            top_contributions.insert(0, {
                "feature": "distance_km",
                "feature_label": dist_label or "Commute Distance",
                "contribution": round(dist_delta, 4),
                "value": dist_val or 0.0,
            })
            if len(top_contributions) > 6:
                top_contributions = top_contributions[:6]

        top_contributions.sort(key=lambda d: abs(d.get("contribution", 0)), reverse=True)

    category = shai_instance.category(risk_score)
    recommendation = shai_instance.recommendation(category)

    result = {
        "risk_score": risk_score,
        "risk_category": category,
        "explanation": top_contributions,
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
            existing.model_version = shai_instance.version
        else:
            db.add(
                models.Prediction(
                    appointment_id=appointment.id,
                    risk_score=risk_score,
                    risk_category=category,
                    explanation=explanation_payload,
                    recommendation=recommendation,
                    model_version=shai_instance.version,
                    hospital_id=appointment.hospital_id,
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

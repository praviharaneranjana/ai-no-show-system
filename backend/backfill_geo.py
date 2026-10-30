"""Give every existing patient a real location and re-score their predictions.

The original seed assigned a random `distance_km` unrelated to the patient's `city`
(e.g. Ratnapura at 6.9 km). This script:
  1. resolves each patient's city to coordinates (app/geo.py, always on land),
  2. sets distance_km to the real straight-line distance to Colombo General Hospital,
  3. re-runs the SHAI model + SHAP for every appointment so stored predictions use
     the corrected distance (same pipeline as POST /predict).

Usage (from backend/, venv active, after `alembic upgrade head`):
    python backfill_geo.py
"""
import pandas as pd

from app import geo, models, shai_model
from app.database import SessionLocal

BATCH = 2000


def age_on(dob, day) -> int:
    return max(day.year - dob.year - ((day.month, day.day) < (dob.month, dob.day)), 0)


def main():
    shai = shai_model.ShaiModel()
    db = SessionLocal()
    try:
        patients = db.query(models.Patient).all()
        located = unknown = 0
        for p in patients:
            coords = geo.geocode_city(p.city, seed=p.id)
            if coords is None:
                unknown += 1
                continue
            p.latitude, p.longitude = coords
            p.distance_km = geo.distance_to_hospital_km(*coords)
            located += 1
        db.commit()
        print(f"Geocoded {located:,} patients ({unknown:,} with an unknown city left unchanged).")

        rows = (
            db.query(models.Appointment, models.Patient, models.Prediction)
            .join(models.Patient, models.Appointment.patient_id == models.Patient.id)
            .outerjoin(models.Prediction, models.Prediction.appointment_id == models.Appointment.id)
            .all()
        )
        print(f"Re-scoring {len(rows):,} appointments...")
        for start in range(0, len(rows), BATCH):
            chunk = rows[start:start + BATCH]
            records = [
                shai_model.engineer(
                    model=shai,
                    age=age_on(pt.date_of_birth, ap.appointment_day),
                    gender=pt.gender,
                    distance_km=float(pt.distance_km) if pt.distance_km is not None else None,
                    scheduled_day=ap.scheduled_day,
                    appointment_day=ap.appointment_day,
                    scheduled_time=ap.scheduled_time,
                    department=ap.department,
                    booking_channel=ap.booking_channel,
                    payment_mode=ap.payment_mode,
                    sms_sent=ap.sms_received,
                    hypertension=pt.hypertension,
                    diabetes=pt.diabetes,
                    prior_appts=0,
                    prior_no_shows=0,
                )
                for ap, pt, _ in chunk
            ]
            features = shai.frame(records)
            _, calibrated = shai.score(features)
            contributions = shai.explain(features)
            for i, (ap, _pt, pred) in enumerate(chunk):
                score = round(float(calibrated[i]), 4)
                category = shai.category(score)
                payload = {"contributions": contributions[i], "model_version": shai.version}
                if pred is None:
                    db.add(models.Prediction(
                        appointment_id=ap.id, risk_score=score, risk_category=category,
                        explanation=payload, recommendation=shai.recommendation(category),
                    ))
                else:
                    pred.risk_score = score
                    pred.risk_category = category
                    pred.explanation = payload
                    pred.recommendation = shai.recommendation(category)
            db.commit()
            print(f"  {min(start + BATCH, len(rows)):,}/{len(rows):,}")
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

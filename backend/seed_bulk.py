"""Bulk-seed the Postgres DB with a large synthetic Sri Lankan hospital
dataset: patients, appointments, real SHAI model+SHAP predictions (same
pipeline as POST /predict), doctor sessions, waitlist,
and a sample of outreach interventions.

Unlike seed.py (a handful of hand-written demo records), this is meant to
give the dashboard/analytics/capacity/outreach pages a realistic volume of
data to render against.

Usage (from backend/, with the venv active, model already trained):
    python seed_bulk.py --patients 50000
    python seed_bulk.py --patients 2000 --truncate   # wipe and reseed

Appends to existing data by default; pass --truncate to clear the tables
this script owns first (patients/appointments/predictions/interventions/
doctor_sessions/waitlist).
"""
import argparse
import uuid
from datetime import date, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import insert

from app import models, shai_model
from app.database import Base, SessionLocal, engine
from fake_data_lk import (
    AI_ACTION_STATUSES,
    DEPARTMENTS,
    DOCTORS_BY_DEPT,
    add_hospital_fields,
    generate_core_dataframe,
)

INTERVENTION_TEMPLATES = [
    dict(language="en", status="confirmed", patient_reply="Yes, I will be attending. Thank you.",
         intent_detected="Confirmation (English)", offered_slot="Slot Confirmed"),
    dict(language="si", status="rescheduled", patient_reply="Mata heta enna bahe, wadata yanna thiyenawa. Saturday puluwanda?",
         intent_detected="Reschedule Request (Sinhala)", offered_slot="Saturday 10:00 AM (Token #8)"),
    dict(language="ta", status="telehealth_requested", patient_reply="Vara mudiyadhu. Video call moolam doctor paarkka mudiyuma?",
         intent_detected="Telehealth Switch (Tamil)", offered_slot="Teleconsultation Link Generated"),
    dict(language="en", status="confirmed", patient_reply="Confirmed, see you then.",
         intent_detected="Confirmation (English)", offered_slot="Slot Confirmed"),
    dict(language="si", status="confirmed", patient_reply="Hari, enawa.",
         intent_detected="Confirmation (Sinhala)", offered_slot="Slot Confirmed"),
]


def chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def truncate_tables(db):
    print("Truncating existing data (predictions, interventions, appointments, waitlist, doctor_sessions, patients)...")
    db.query(models.Prediction).delete()
    db.query(models.Intervention).delete()
    db.query(models.Appointment).delete()
    db.query(models.WaitlistEntry).delete()
    db.query(models.DoctorSession).delete()
    db.query(models.Patient).delete()
    db.commit()


def build_patients_and_appointments(n: int, seed: int) -> tuple[list[dict], list[dict], pd.DataFrame]:
    core = generate_core_dataframe(n, seed=seed)
    full = add_hospital_fields(core, seed=seed + 1)

    today = date.today()
    patient_ids = [uuid.uuid4() for _ in range(n)]
    appointment_ids = [uuid.uuid4() for _ in range(n)]

    is_past = pd.to_datetime(full["appointment_day"]) <= pd.Timestamp(today)

    patient_rows = []
    appointment_rows = []
    for i in range(n):
        row = full.iloc[i]
        patient_rows.append(dict(
            id=patient_ids[i],
            uhid=row["uhid"],
            full_name=row["full_name"],
            date_of_birth=row["date_of_birth"],
            gender=row["gender"],
            phone=row["phone"],
            email=row["email"],
            city=row["city"],
            distance_km=float(row["distance_km"]),
            scholarship=bool(row["scholarship"]),
            hypertension=bool(row["hypertension"]),
            diabetes=bool(row["diabetes"]),
            alcoholism=bool(row["alcoholism"]),
            handicap=int(row["handicap"]),
        ))

        past = bool(is_past.iloc[i])
        no_show = bool(row["no_show"]) if past else None
        status = ("no_show" if no_show else "completed") if past else "scheduled"

        appointment_rows.append(dict(
            id=appointment_ids[i],
            patient_id=patient_ids[i],
            scheduled_day=row["scheduled_day"],
            appointment_day=row["appointment_day"],
            department=row["department"],
            doctor_name=row["doctor_name"],
            booking_channel=row["booking_channel"],
            payment_mode=row["payment_mode"],
            scheduled_time=row["scheduled_time"],
            queue_number=int(row["queue_number"]),
            ai_action_status=row["ai_action_status"],
            sms_received=bool(row["sms_received"]),
            status=status,
            no_show=no_show,
        ))

    return patient_rows, appointment_rows, full


def build_predictions(appointment_rows: list[dict], full: pd.DataFrame, shai: shai_model.ShaiModel) -> list[dict]:
    # Every seeded patient has exactly one appointment, so there is no visit history:
    # prior_appts = prior_no_shows = 0 (first visit) for all rows.
    records = [
        shai_model.engineer(
            model=shai,
            age=int(row["age"]),
            gender=row["gender"],
            distance_km=float(row["distance_km"]),
            scheduled_day=pd.Timestamp(row["scheduled_day"]).date(),
            appointment_day=pd.Timestamp(row["appointment_day"]).date(),
            scheduled_time=row["scheduled_time"],
            department=row["department"],
            booking_channel=row["booking_channel"],
            payment_mode=row["payment_mode"],
            sms_sent=bool(row["sms_received"]),
            hypertension=bool(row["hypertension"]),
            diabetes=bool(row["diabetes"]),
            prior_appts=0,
            prior_no_shows=0,
        )
        for _, row in full.iterrows()
    ]
    features = shai.frame(records)

    print(f"Scoring {len(features):,} rows with the SHAI model...")
    _, calibrated = shai.score(features)

    print("Running SHAP explainer (batched)...")
    contributions = shai.explain(features)

    prediction_rows = []
    for i, appt in enumerate(appointment_rows):
        score = round(float(calibrated[i]), 4)
        category = shai.category(score)
        prediction_rows.append(dict(
            id=uuid.uuid4(),
            appointment_id=appt["id"],
            risk_score=score,
            risk_category=category,
            explanation={"contributions": contributions[i], "model_version": shai.version},
            recommendation=shai.recommendation(category),
        ))

    return prediction_rows


def build_doctor_sessions() -> list[dict]:
    rng = np.random.default_rng(7)
    rows = []
    today = date.today()
    for dept in DEPARTMENTS:
        for doctor_name in DOCTORS_BY_DEPT[dept]:
            delayed = rng.random() < 0.3
            rows.append(dict(
                id=uuid.uuid4(),
                doctor_name=doctor_name,
                specialty=dept,
                room_number=f"Room {rng.integers(100, 320)}",
                session_date=today,
                scheduled_start_time=f"{rng.integers(16, 19)}:00",
                status="delayed" if delayed else "on_time",
                delay_minutes=int(rng.integers(10, 40)) if delayed else 0,
                avg_consultation_mins=int(rng.integers(8, 18)),
                max_capacity=int(rng.integers(18, 32)),
            ))
    return rows


def build_waitlist() -> list[dict]:
    rng = np.random.default_rng(11)
    names = ["Sunil Jayawardena", "Malini Dias", "Chaminda Vaas", "Fathima Rizana",
             "Kumaran Sivakumar", "Nirosha Fernando", "Ajith Bandara"]
    urgencies = ["High", "Normal", "Routine"]
    rows = []
    for name in names:
        dept = rng.choice(DEPARTMENTS)
        rows.append(dict(
            id=uuid.uuid4(),
            patient_name=name,
            patient_phone=f"+9477{rng.integers(0, 9_999_999):07d}",
            specialty=dept,
            doctor_name=rng.choice(DOCTORS_BY_DEPT[dept]),
            urgency_level=rng.choice(urgencies, p=[0.3, 0.5, 0.2]),
            preferred_days="Weekday evenings",
            status="waiting",
        ))
    return rows


def build_interventions(appointment_rows: list[dict], fraction: float, seed: int) -> list[dict]:
    rng = np.random.default_rng(seed)
    sample_size = max(1, int(len(appointment_rows) * fraction))
    sampled = rng.choice(appointment_rows, size=sample_size, replace=False)
    rows = []
    for appt in sampled:
        template = INTERVENTION_TEMPLATES[rng.integers(0, len(INTERVENTION_TEMPLATES))]
        rows.append(dict(
            id=uuid.uuid4(),
            appointment_id=appt["id"],
            channel="WhatsApp",
            language=template["language"],
            status=template["status"],
            patient_reply=template["patient_reply"],
            intent_detected=template["intent_detected"],
            offered_slot=template["offered_slot"],
        ))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--patients", type=int, default=2000, help="Number of patients/appointments to generate")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--chunk-size", type=int, default=5000)
    parser.add_argument("--intervention-fraction", type=float, default=0.05)
    parser.add_argument("--truncate", action="store_true", help="Clear existing data in owned tables first")
    args = parser.parse_args()

    shai = shai_model.ShaiModel()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if args.truncate:
            truncate_tables(db)

        print(f"Generating {args.patients:,} synthetic patients/appointments (seed={args.seed})...")
        patient_rows, appointment_rows, full = build_patients_and_appointments(args.patients, args.seed)

        print("Inserting patients...")
        for chunk in chunked(patient_rows, args.chunk_size):
            db.execute(insert(models.Patient), chunk)
        db.commit()

        print("Inserting appointments...")
        for chunk in chunked(appointment_rows, args.chunk_size):
            db.execute(insert(models.Appointment), chunk)
        db.commit()

        prediction_rows = build_predictions(appointment_rows, full, shai)
        print("Inserting predictions...")
        for chunk in chunked(prediction_rows, args.chunk_size):
            db.execute(insert(models.Prediction), chunk)
        db.commit()

        print("Inserting doctor sessions and waitlist...")
        db.execute(insert(models.DoctorSession), build_doctor_sessions())
        db.execute(insert(models.WaitlistEntry), build_waitlist())
        db.commit()

        print("Inserting sample outreach interventions...")
        intervention_rows = build_interventions(appointment_rows, args.intervention_fraction, args.seed + 2)
        for chunk in chunked(intervention_rows, args.chunk_size):
            db.execute(insert(models.Intervention), chunk)
        db.commit()

        no_show_rate = full["no_show"].mean()
        print(f"\nDone. Seeded {len(patient_rows):,} patients, {len(appointment_rows):,} appointments, "
              f"{len(prediction_rows):,} predictions, {len(intervention_rows):,} interventions.")
        print(f"Generated no-show rate (past appointments only meaningfully comparable): {no_show_rate:.2%}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

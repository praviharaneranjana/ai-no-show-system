"""Seed demo data for Waitlist Auto-Fill: a waitlist plus freed-slot offers (the Freed Slot Queue).

Synthetic data for demos/screenshots only. Idempotent: re-running replaces rows it created earlier
(waitlist phone numbers start 0770000, patient UHIDs start DEMO-WL-).

Usage (from backend/, venv active):
    python seed_slot_queue.py [--hospital-id <uuid>]
"""
import argparse
import uuid
from datetime import date, datetime, time, timedelta, timezone

from app import models
from app.database import SessionLocal

NHSL = "a0000000-0000-0000-0000-000000000002"

# name, urgency, days waiting, distance km, historical no-show risk
PEOPLE = [
    ("Kamala Perera", "High", 21, 4.0, 0.06),
    ("Nuwan Jayasuriya", "Normal", 30, 9.5, 0.12),
    ("Ishara Fernando", "High", 9, 22.0, 0.18),
    ("Dilshan Wickramasinghe", "Normal", 5, 3.0, 0.35),
    ("Sanduni Rajapaksa", "Routine", 14, 41.0, 0.22),
    ("Mohamed Rizwan", "Normal", 18, 7.0, 0.09),
    ("Tharindu Gunawardena", "Routine", 3, 12.0, 0.28),
    ("Priyanka Silva", "High", 12, 16.0, 0.14),
]
REASONS = ["Confirmed cancellation", "Unconfirmed high-risk (no reply)", "Patient rescheduled", "Confirmed cancellation"]
TIMES = [time(9, 30), time(10, 15), time(11, 0), time(14, 30)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hospital-id", default=NHSL)
    hid = uuid.UUID(ap.parse_args().hospital_id)
    db = SessionLocal()

    # clear earlier demo rows
    old_w = db.query(models.WaitlistEntry).filter(models.WaitlistEntry.patient_phone.like("0770000%")).all()
    ids = [w.id for w in old_w]
    if ids:
        db.query(models.SlotOffer).filter(models.SlotOffer.waitlist_entry_id.in_(ids)).delete(synchronize_session=False)
    for w in old_w:
        db.delete(w)
    for p in db.query(models.Patient).filter(models.Patient.uhid.like("DEMO-WL-%")).all():
        for a in db.query(models.Appointment).filter_by(patient_id=p.id).all():
            db.query(models.Prediction).filter_by(appointment_id=a.id).delete()
            db.delete(a)
        db.delete(p)
    db.flush()

    doctors = [d for d in db.query(models.Doctor).filter_by(hospital_id=hid, active=True).all() if d.department][:3]
    if not doctors:
        raise SystemExit("No doctors for this hospital; run the base seed first.")
    now = datetime.now(timezone.utc)
    today = date.today()

    # Waitlist for every doctor's specialty (each person waits for one of the doctors)
    entries = []
    for i, (name, urg, days, km, risk) in enumerate(PEOPLE):
        doc = doctors[i % len(doctors)]
        pat = models.Patient(
            hospital_id=hid, uhid=f"DEMO-WL-{i:03d}", full_name=name, date_of_birth=date(1975 + i * 3, 3, 14),
            phone=f"0770000{i:03d}", distance_km=km, distance_source="manual",
        )
        db.add(pat)
        db.flush()
        appt = models.Appointment(
            hospital_id=hid, patient_id=pat.id, scheduled_day=today - timedelta(days=40), appointment_day=today - timedelta(days=30),
            department=doc.department.name, doctor_id=doc.id, doctor_name=doc.full_name, status="completed", data_source="synthetic",
        )
        db.add(appt)
        db.flush()
        db.add(models.Prediction(
            hospital_id=hid, appointment_id=appt.id, risk_score=risk,
            risk_category="High" if risk > 0.3 else "Medium" if risk > 0.15 else "Low",
            explanation={}, recommendation="Demo data",
        ))
        w = models.WaitlistEntry(
            hospital_id=hid, patient_id=pat.id, patient_name=name, patient_phone=f"0770000{i:03d}",
            specialty=doc.department.name, doctor_name=doc.full_name, urgency_level=urg,
            preferred_days="Any weekday", status="waiting", created_at=now - timedelta(days=days),
        )
        db.add(w)
        entries.append(w)
    db.flush()

    # Freed slots, one per (doctor, time); the offer's lead candidate is the first waiting patient for that specialty
    for i, t in enumerate(TIMES):
        doc = doctors[i % len(doctors)]
        lead = next(w for w in entries if w.doctor_name == doc.full_name)
        db.add(models.SlotOffer(
            hospital_id=hid, doctor_id=doc.id, slot_time=t, slot_date=today, freed_reason=REASONS[i],
            waitlist_entry_id=lead.id, match_score=0.0, score_breakdown={}, status="proposed",
            expires_at=now + timedelta(hours=2),
        ))
    db.commit()
    print(f"Seeded {len(entries)} waitlist entries and {len(TIMES)} freed slots for {hid}")


if __name__ == "__main__":
    main()

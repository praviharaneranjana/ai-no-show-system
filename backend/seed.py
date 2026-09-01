"""Seed the local database with sample patients, appointments, sessions, waitlist, and interventions.

Run from backend/ with the venv active: python seed.py
"""
import uuid
from datetime import date, timedelta
from app.database import Base, SessionLocal, engine
from app.models import Appointment, DoctorSession, Intervention, Patient, Prediction, WaitlistEntry

SAMPLE_PATIENTS = [
    dict(
        uhid="UHID-ASIRI-9812",
        full_name="Kusumawathi Gunaratne",
        date_of_birth=date(1958, 4, 12),
        gender="F",
        phone="+94771234567",
        email="kusum@example.com",
        city="Colombo 07",
        distance_km=4.2,
        scholarship=False,
        hypertension=True,
        diabetes=True,
        alcoholism=False,
        handicap=0,
    ),
    dict(
        uhid="UHID-HEMAS-4431",
        full_name="Nimal Perera",
        date_of_birth=date(1975, 11, 2),
        gender="M",
        phone="+94772345678",
        email="nimal@example.com",
        city="Wattala",
        distance_km=18.5,
        scholarship=False,
        hypertension=True,
        diabetes=False,
        alcoholism=False,
        handicap=0,
    ),
    dict(
        uhid="UHID-ASIRI-1092",
        full_name="Ishara Silva",
        date_of_birth=date(2001, 7, 19),
        gender="F",
        phone="+94773456789",
        email="ishara@example.com",
        city="Nugegoda",
        distance_km=7.8,
        scholarship=False,
        hypertension=False,
        diabetes=False,
        alcoholism=False,
        handicap=0,
    ),
    dict(
        uhid="UHID-HEMAS-8812",
        full_name="Mohamed Rizwan",
        date_of_birth=date(1984, 2, 28),
        gender="M",
        phone="+94774567890",
        email="rizwan@example.com",
        city="Dehiwala",
        distance_km=11.0,
        scholarship=False,
        hypertension=False,
        diabetes=True,
        alcoholism=False,
        handicap=0,
    ),
    dict(
        uhid="UHID-ASIRI-5541",
        full_name="Priyani Weerasinghe",
        date_of_birth=date(1962, 9, 15),
        gender="F",
        phone="+94775678901",
        email="priyani@example.com",
        city="Negombo",
        distance_km=34.0,
        scholarship=False,
        hypertension=True,
        diabetes=True,
        alcoholism=False,
        handicap=1,
    ),
]


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Seed Doctor Sessions if missing
        if db.query(DoctorSession).count() == 0:
            today = date.today()
            sessions = [
                DoctorSession(
                    doctor_name="Dr. Rohan Perera",
                    specialty="Cardiology",
                    room_number="Room 204 (Asiri Central)",
                    session_date=today,
                    scheduled_start_time="17:00",
                    status="delayed",
                    delay_minutes=25,
                    avg_consultation_mins=12,
                    max_capacity=25,
                ),
                DoctorSession(
                    doctor_name="Dr. Neluka Fernando",
                    specialty="Neurology",
                    room_number="Room 108 (Hemas Wattala)",
                    session_date=today,
                    scheduled_start_time="18:00",
                    status="on_time",
                    delay_minutes=0,
                    avg_consultation_mins=15,
                    max_capacity=20,
                ),
                DoctorSession(
                    doctor_name="Dr. Anura Jayasinghe",
                    specialty="Orthopedics",
                    room_number="Room 312 (Asiri Surgical)",
                    session_date=today,
                    scheduled_start_time="16:30",
                    status="on_time",
                    delay_minutes=0,
                    avg_consultation_mins=10,
                    max_capacity=30,
                ),
            ]
            for s in sessions:
                db.add(s)
            db.commit()

        # Seed Waitlist if missing
        if db.query(WaitlistEntry).count() == 0:
            waitlist = [
                WaitlistEntry(
                    patient_name="Sunil Jayawardena",
                    patient_phone="+94774567890",
                    specialty="Cardiology",
                    doctor_name="Dr. Rohan Perera",
                    urgency_level="High",
                    preferred_days="Weekday evenings",
                    status="waiting",
                ),
                WaitlistEntry(
                    patient_name="Malini Dias",
                    patient_phone="+94775678901",
                    specialty="Neurology",
                    doctor_name="Dr. Neluka Fernando",
                    urgency_level="Normal",
                    preferred_days="Any evening",
                    status="waiting",
                ),
                WaitlistEntry(
                    patient_name="Chaminda Vaas",
                    patient_phone="+94776789012",
                    specialty="Orthopedics",
                    doctor_name="Dr. Anura Jayasinghe",
                    urgency_level="Routine",
                    preferred_days="Saturdays",
                    status="waiting",
                ),
            ]
            for w in waitlist:
                db.add(w)
            db.commit()

        if db.query(Patient).count() > 0:
            print("Database already has patients — checking complete.")
            return

        today = date.today()
        doctors = ["Dr. Rohan Perera", "Dr. Neluka Fernando", "Dr. Rohan Perera", "Dr. Anura Jayasinghe", "Dr. Rohan Perera"]
        departments = ["Cardiology", "Neurology", "Cardiology", "Orthopedics", "Cardiology"]
        channels = ["Doc990", "eChannelling", "Asiri MyHealth", "Doc990", "Hospital Counter"]
        payments = ["Credit Card (NSR Protected)", "Credit Card", "Corporate Insurance", "Credit Card (NSR Protected)", "Cash"]
        actions = ["Confirmed via WhatsApp", "Pending", "Rescheduled via AI", "Confirmed via WhatsApp", "Telehealth Converted"]

        for i, patient_data in enumerate(SAMPLE_PATIENTS):
            patient = Patient(**patient_data)
            db.add(patient)
            db.flush()

            appt = Appointment(
                patient_id=patient.id,
                scheduled_day=today - timedelta(days=5),
                appointment_day=today if i < 2 else today + timedelta(days=2 + i),
                department=departments[i],
                doctor_name=doctors[i],
                booking_channel=channels[i],
                payment_mode=payments[i],
                scheduled_time=f"{17 + (i % 3)}:{15 * (i % 4):02d}",
                queue_number=i + 1,
                ai_action_status=actions[i],
                sms_received=True,
                status="scheduled",
            )
            db.add(appt)
            db.flush()

            # Add sample predictions
            risk = 0.78 if i == 4 else (0.68 if i == 1 else (0.35 if i == 0 else 0.15))
            cat = "High" if risk >= 0.65 else ("Medium" if risk >= 0.40 else "Low")
            db.add(Prediction(
                appointment_id=appt.id,
                risk_score=risk,
                risk_category=cat,
                explanation={"contributions": [
                    {"feature": "DaysAhead", "contribution": 0.25, "value": 7.0},
                    {"feature": "Age", "contribution": -0.15, "value": float(patient_data["date_of_birth"].year)},
                    {"feature": "SMS_received", "contribution": -0.10, "value": 1.0},
                ]},
                recommendation="High risk: Engage via trilingual WhatsApp agent + propose dynamic overbooking slot." if cat == "High" else "Low risk: Routine WhatsApp reminder sent.",
            ))

            # Add sample intervention
            if i in [0, 2, 4]:
                db.add(Intervention(
                    appointment_id=appt.id,
                    channel="WhatsApp",
                    language="si" if i == 2 else "en",
                    status="confirmed" if i == 0 else ("rescheduled" if i == 2 else "telehealth_requested"),
                    patient_reply="Mata heta enna bahe" if i == 2 else "Confirmed, will attend.",
                    intent_detected="Reschedule Request (Sinhala)" if i == 2 else "Confirmation (English)",
                    offered_slot="Saturday 10:00 AM (Token #8)" if i == 2 else "Slot Confirmed",
                ))

        db.commit()
        print(f"Seeded {len(SAMPLE_PATIENTS)} patients with full SHAI context.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()


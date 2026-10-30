"""Seed simulated Hospital Information System (HIS) appointments table (his_appointments).

Generates 70–95 mock HIS appointments for today (Asia/Colombo timezone) across active
doctors, distributed across their clinic sessions, with realistic Sri Lankan patient
names, NICs, phone numbers, districts/cities, and channels.
Also adds 10 past appointments with known outcomes (attended/no-show) for immediate history.

Idempotent: can be run repeatedly without duplicating records.
"""
from __future__ import annotations

import logging
import random
import uuid
import zoneinfo
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_his")

LK_TZ = zoneinfo.ZoneInfo("Asia/Colombo")

SRI_LANKAN_FIRST_NAMES = [
    "Sunethra", "Rizwan", "Thushara", "Sivakumar", "Nilanthi",
    "Bandula", "Chamari", "Dinesh", "Fathima", "Gamini",
    "Harsha", "Inoka", "Jayampathi", "Kamal", "Lalitha",
    "Mahesh", "Nadeesha", "Oshada", "Priyantha", "Radhika",
    "Sampath", "Thilini", "Upul", "Vajira", "Wasantha",
    "Yashodha", "Zameer", "Anura", "Buddhika", "Chandana",
]

SRI_LANKAN_LAST_NAMES = [
    "Perera", "Silva", "Fernandez", "Senanayake", "Ramanathan",
    "Wickramasinghe", "Bandara", "Gunawardena", "Jayasinghe", "Karunaratne",
    "Liyanage", "Mendis", "Nanayakkara", "Pathirana", "Ranasinghe",
    "Samaraweera", "Tennakoon", "Weerasinghe", "Wijesekara", "Alwis",
    "Cooray", "Dissanayake", "Ekanayake", "Herath", "Illangakoon",
]

SL_CITIES = [
    ("Colombo 03", "Colombo"),
    ("Nugegoda", "Colombo"),
    ("Dehiwala", "Colombo"),
    ("Moratuwa", "Colombo"),
    ("Maharagama", "Colombo"),
    ("Kaduwela", "Colombo"),
    ("Homagama", "Colombo"),
    ("Wattala", "Gampaha"),
    ("Kelaniya", "Gampaha"),
    ("Negombo", "Gampaha"),
    ("Gampaha", "Gampaha"),
    ("Panadura", "Kalutara"),
    ("Kalutara", "Kalutara"),
    ("Horana", "Kalutara"),
]

BOOKING_CHANNELS = ["Doc990", "eChannelling", "Counter", "Phone", "MyHealth"]
PAYMENT_MODES = ["Cash", "Card", "Prepaid_Online", "Corporate"]


def generate_nic(birth_year: int, gender: str) -> str:
    rnd = random.randint(1000, 9999)
    if birth_year < 2000:
        day_offset = random.randint(1, 365) + (500 if gender == "female" else 0)
        return f"{str(birth_year)[2:]}{day_offset:03d}{rnd:04d}V"
    else:
        day_offset = random.randint(1, 365) + (500 if gender == "female" else 0)
        return f"{birth_year}{day_offset:03d}0{rnd:04d}"


def seed_his_appointments(db: Session, target_date: date | None = None) -> int:
    today_lk = target_date or datetime.now(LK_TZ).date()
    weekday = today_lk.weekday()

    logger.info("Seeding simulated HIS appointments for %s (weekday %d)...", today_lk, weekday)

    # 1. Fetch active doctors and their sessions for today's weekday
    sessions = (
        db.query(models.DoctorClinicSession)
        .join(models.Doctor)
        .filter(
            models.Doctor.active == True,
            models.DoctorClinicSession.active == True,
            models.DoctorClinicSession.weekday == weekday,
        )
        .all()
    )

    if not sessions:
        logger.warning("No scheduled clinic sessions found for weekday %d; falling back to all active sessions", weekday)
        sessions = (
            db.query(models.DoctorClinicSession)
            .join(models.Doctor)
            .filter(
                models.Doctor.active == True,
                models.DoctorClinicSession.active == True,
            )
            .all()
        )

    # Target: 75–90 appointments for today
    random.seed(42 + today_lk.toordinal())
    total_target = random.randint(75, 90)
    per_session = max(2, total_target // max(len(sessions), 1))

    created_count = 0
    patient_seq = 1000

    for s in sessions:
        doc = s.doctor
        dept_name = doc.department.name if doc.department else "General Medicine"
        num_appts = min(per_session + random.randint(0, 2), s.max_patients)

        start_dt = datetime.combine(today_lk, s.start_time)

        for token in range(1, num_appts + 1):
            his_ref = f"HIS-{today_lk.strftime('%y%m%d')}-{s.id.hex[:4]}-{token:03d}"

            # Check idempotency
            existing = db.query(models.HISAppointment).filter_by(his_ref=his_ref).first()
            if existing:
                continue

            patient_seq += 1
            his_patient_ref = f"HIS-PAT-{patient_seq:05d}"

            gender = "female" if random.random() < 0.52 else "male"
            first_name = random.choice(SRI_LANKAN_FIRST_NAMES)
            last_name = random.choice(SRI_LANKAN_LAST_NAMES)
            patient_name = f"{first_name} {last_name}"

            birth_year = random.randint(1948, 2012)
            birth_month = random.randint(1, 12)
            birth_day = random.randint(1, 28)
            dob = date(birth_year, birth_month, birth_day)

            city, _ = random.choice(SL_CITIES)
            phone = f"+947{random.choice(['7', '1', '2', '0', '8'])}{random.randint(1000000, 9999999)}"
            nic = generate_nic(birth_year, gender)

            lead_days = random.randint(1, 21)
            booked_on = today_lk - timedelta(days=lead_days)

            slot_delta = timedelta(minutes=(token - 1) * s.slot_minutes)
            appt_time = min((start_dt + slot_delta).time(), s.end_time)

            channel = random.choice(BOOKING_CHANNELS)
            payment = random.choice(PAYMENT_MODES)

            # Realistic clinical flags
            is_senior = (today_lk.year - birth_year) >= 55
            hypertension = is_senior and (random.random() < 0.40)
            diabetes = is_senior and (random.random() < 0.35)
            alcoholism = (gender == "male") and (random.random() < 0.08)

            appt = models.HISAppointment(
                id=uuid.uuid4(),
                his_ref=his_ref,
                his_patient_ref=his_patient_ref,
                patient_name=patient_name,
                date_of_birth=dob,
                gender=gender,
                phone=phone,
                nic=nic,
                city=city,
                doctor_code=doc.his_doctor_code or f"DOC-{doc.id.hex[:4]}",
                doctor_name=f"{doc.title} {doc.full_name}".strip(),
                department=dept_name,
                appointment_date=today_lk,
                appointment_time=appt_time,
                booked_on=booked_on,
                booking_channel=channel,
                payment_mode=payment,
                token_no=token,
                his_status="booked",
                hypertension=hypertension,
                diabetes=diabetes,
                alcoholism=alcoholism,
                handicap=0,
                scholarship=random.random() < 0.05,
                sms_sent=random.random() < 0.70,
            )
            db.add(appt)
            created_count += 1

    # 2. Add 10 past appointments with known outcomes (attended, no_show) for immediate history
    yesterday = today_lk - timedelta(days=1)
    past_sessions = (
        db.query(models.DoctorClinicSession)
        .join(models.Doctor)
        .filter(models.Doctor.active == True)
        .limit(10)
        .all()
    )

    for i, s in enumerate(past_sessions, 1):
        his_ref = f"HIS-PAST-{yesterday.strftime('%y%m%d')}-{i:03d}"
        if db.query(models.HISAppointment).filter_by(his_ref=his_ref).first():
            continue

        doc = s.doctor
        dept_name = doc.department.name if doc.department else "General Medicine"
        outcome = "completed" if i <= 7 else "no_show"  # 7 attended, 3 no-show

        gender = "female" if i % 2 == 0 else "male"
        p_name = f"{random.choice(SRI_LANKAN_FIRST_NAMES)} {random.choice(SRI_LANKAN_LAST_NAMES)}"
        city, _ = random.choice(SL_CITIES)

        past_appt = models.HISAppointment(
            id=uuid.uuid4(),
            his_ref=his_ref,
            his_patient_ref=f"HIS-PAT-PAST-{i:03d}",
            patient_name=p_name,
            date_of_birth=date(1980 + (i % 15), 3, 10),
            gender=gender,
            phone=f"+9477000{i:04d}",
            nic=f"1980{i:08d}",
            city=city,
            doctor_code=doc.his_doctor_code or f"DOC-{doc.id.hex[:4]}",
            doctor_name=f"{doc.title} {doc.full_name}".strip(),
            department=dept_name,
            appointment_date=yesterday,
            appointment_time=s.start_time,
            booked_on=yesterday - timedelta(days=5),
            booking_channel="Counter",
            payment_mode="Cash",
            token_no=i,
            his_status=outcome,
            hypertension=False,
            diabetes=False,
            alcoholism=False,
            handicap=0,
            scholarship=False,
            sms_sent=True,
        )
        db.add(past_appt)
        created_count += 1

    db.commit()
    logger.info("Successfully seeded %d simulated HIS appointments.", created_count)
    return created_count


if __name__ == "__main__":
    db = SessionLocal()
    try:
        count = seed_his_appointments(db)
        print(f"Seeded {count} HIS appointments.")
    finally:
        db.close()

"""Seed reference data (departments, doctors, clinic sessions, locations).

Idempotent: can be run repeatedly without duplicating records or corrupting references.
"""
import json
import logging
import os
import re
import uuid
from datetime import time
from sqlalchemy import text
from app.database import SessionLocal
from app import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_reference")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
LOCATIONS_FILE = os.path.join(DATA_DIR, "lk_locations.json")


DEPARTMENTS_CONFIG = [
    # Modelled categories (12)
    {"name": "Cardiology", "model_category": "Cardiology", "icon": "heart-pulse", "telehealth_ok": False},
    {"name": "Dermatology", "model_category": "Dermatology", "icon": "stethoscope", "telehealth_ok": True},
    {"name": "ENT", "model_category": "ENT", "icon": "ear", "telehealth_ok": False},
    {"name": "Endocrinology", "model_category": "Endocrinology", "icon": "activity", "telehealth_ok": True},
    {"name": "Gastroenterology", "model_category": "Gastroenterology", "icon": "apple", "telehealth_ok": False},
    {"name": "General Medicine", "model_category": "General Medicine", "icon": "stethoscope", "telehealth_ok": True},
    {"name": "Gynecology", "model_category": "Gynecology", "icon": "baby", "telehealth_ok": False},
    {"name": "Neurology", "model_category": "Neurology", "icon": "brain", "telehealth_ok": True},
    {"name": "Orthopedics", "model_category": "Orthopedics", "icon": "bone", "telehealth_ok": False},
    {"name": "Pediatrics", "model_category": "Pediatrics", "icon": "smile", "telehealth_ok": False},
    {"name": "Psychiatry", "model_category": "Psychiatry", "icon": "sparkles", "telehealth_ok": True},
    {"name": "Urology", "model_category": "Urology", "icon": "droplet", "telehealth_ok": False},
    # Unmodelled categories (model_category = None)
    {"name": "Oncology", "model_category": None, "icon": "ribbon", "telehealth_ok": False},
    {"name": "Ophthalmology", "model_category": None, "icon": "eye", "telehealth_ok": False},
    {"name": "Nephrology", "model_category": None, "icon": "activity", "telehealth_ok": False},
    {"name": "Pulmonology", "model_category": None, "icon": "wind", "telehealth_ok": False},
    {"name": "Radiology & X-ray", "model_category": None, "icon": "scan", "telehealth_ok": False},
]

# Doctors list: at least 3 per department (>= 2 for unmodelled)
DOCTORS_CONFIG = [
    # Cardiology
    {"name": "Rohan Perera", "dept": "Cardiology", "code": "D-001", "room": "Room 204", "days": [(0, "Morning"), (3, "Evening"), (5, "Morning")]},
    {"name": "Priyantha Jayakody", "dept": "Cardiology", "code": "D-002", "room": "Room 205", "days": [(1, "Afternoon"), (3, "Morning"), (4, "Evening")]},
    {"name": "Fathima Noor", "dept": "Cardiology", "code": "D-003", "room": "Room 206", "days": [(2, "Morning"), (3, "Afternoon"), (6, "Morning")]},

    # Dermatology
    {"name": "Chithra Ranasinghe", "dept": "Dermatology", "code": "D-004", "room": "Room 108", "days": [(1, "Morning"), (3, "Morning"), (4, "Evening")]},
    {"name": "Nirmal Mendis", "dept": "Dermatology", "code": "D-005", "room": "Room 109", "days": [(0, "Evening"), (3, "Evening"), (5, "Afternoon")]},
    {"name": "V. Radhakrishnan", "dept": "Dermatology", "code": "D-006", "room": "Room 110", "days": [(2, "Morning"), (4, "Morning")]},

    # ENT
    {"name": "Sanjeewa Bandara", "dept": "ENT", "code": "D-007", "room": "Room 212", "days": [(0, "Morning"), (2, "Evening"), (3, "Morning")]},
    {"name": "Ayesha Farook", "dept": "ENT", "code": "D-008", "room": "Room 214", "days": [(1, "Afternoon"), (3, "Evening"), (5, "Morning")]},
    {"name": "T. Sivaganeshan", "dept": "ENT", "code": "D-009", "room": "Room 215", "days": [(3, "Afternoon"), (4, "Morning")]},

    # Endocrinology
    {"name": "Kamani Dissanayake", "dept": "Endocrinology", "code": "D-010", "room": "Room 120", "days": [(0, "Afternoon"), (3, "Morning"), (4, "Morning")]},
    {"name": "Ruwan Hettiarachchi", "dept": "Endocrinology", "code": "D-011", "room": "Room 121", "days": [(1, "Evening"), (3, "Evening"), (5, "Evening")]},
    {"name": "M. S. M. Razik", "dept": "Endocrinology", "code": "D-012", "room": "Room 122", "days": [(2, "Morning"), (3, "Afternoon")]},

    # Gastroenterology
    {"name": "Asoka Jayawardena", "dept": "Gastroenterology", "code": "D-013", "room": "Room 304", "days": [(0, "Morning"), (3, "Morning"), (4, "Evening")]},
    {"name": "K. Balachandran", "dept": "Gastroenterology", "code": "D-014", "room": "Room 305", "days": [(1, "Morning"), (3, "Afternoon"), (5, "Morning")]},
    {"name": "Dilini Samarasinghe", "dept": "Gastroenterology", "code": "D-015", "room": "Room 306", "days": [(2, "Evening"), (3, "Evening")]},

    # General Medicine
    {"name": "Sunil Weerakkody", "dept": "General Medicine", "code": "D-016", "room": "Room 101", "days": [(0, "Morning"), (1, "Morning"), (3, "Morning"), (4, "Morning")]},
    {"name": "Shirani De Silva", "dept": "General Medicine", "code": "D-017", "room": "Room 102", "days": [(1, "Evening"), (2, "Evening"), (3, "Evening"), (5, "Evening")]},
    {"name": "Mohamed Shafi", "dept": "General Medicine", "code": "D-018", "room": "Room 103", "days": [(0, "Afternoon"), (3, "Afternoon"), (4, "Afternoon")]},

    # Gynecology
    {"name": "Damayanthi Pieris", "dept": "Gynecology", "code": "D-019", "room": "Room 218", "days": [(0, "Morning"), (2, "Morning"), (3, "Morning")]},
    {"name": "Indika Gunasekara", "dept": "Gynecology", "code": "D-020", "room": "Room 219", "days": [(1, "Afternoon"), (3, "Evening"), (4, "Morning")]},
    {"name": "R. Selvarajah", "dept": "Gynecology", "code": "D-021", "room": "Room 220", "days": [(2, "Evening"), (3, "Afternoon"), (5, "Evening")]},

    # Neurology
    {"name": "Neluka Fernando", "dept": "Neurology", "code": "D-022", "room": "Room 302", "days": [(0, "Morning"), (2, "Morning"), (3, "Morning")]},
    {"name": "Kanchana Gamage", "dept": "Neurology", "code": "D-023", "room": "Room 303", "days": [(1, "Evening"), (3, "Evening"), (5, "Morning")]},
    {"name": "M. Rizwan Cassim", "dept": "Neurology", "code": "D-024", "room": "Room 307", "days": [(3, "Afternoon"), (4, "Evening")]},

    # Orthopedics
    {"name": "Anura Jayasinghe", "dept": "Orthopedics", "code": "D-025", "room": "Room 201", "days": [(0, "Morning"), (2, "Evening"), (3, "Morning")]},
    {"name": "Lakshman Abeykoon", "dept": "Orthopedics", "code": "D-026", "room": "Room 202", "days": [(1, "Morning"), (3, "Evening"), (4, "Evening")]},
    {"name": "S. Gnanasekeran", "dept": "Orthopedics", "code": "D-027", "room": "Room 203", "days": [(2, "Afternoon"), (3, "Afternoon"), (5, "Morning")]},

    # Pediatrics
    {"name": "Manel Wickramasinghe", "dept": "Pediatrics", "code": "D-028", "room": "Room 112", "days": [(0, "Morning"), (2, "Morning"), (3, "Morning")]},
    {"name": "Harsha Senanayake", "dept": "Pediatrics", "code": "D-029", "room": "Room 114", "days": [(1, "Evening"), (3, "Evening"), (4, "Evening")]},
    {"name": "Faheemah Jameel", "dept": "Pediatrics", "code": "D-030", "room": "Room 115", "days": [(2, "Afternoon"), (3, "Afternoon"), (5, "Morning")]},

    # Psychiatry
    {"name": "Gamini Karunaratne", "dept": "Psychiatry", "code": "D-031", "room": "Room 401", "days": [(0, "Evening"), (2, "Evening"), (3, "Evening")]},
    {"name": "Kumuduni Fonseka", "dept": "Psychiatry", "code": "D-032", "room": "Room 402", "days": [(1, "Morning"), (3, "Morning"), (4, "Morning")]},
    {"name": "P. Vijayaratnam", "dept": "Psychiatry", "code": "D-033", "room": "Room 403", "days": [(3, "Afternoon"), (5, "Morning")]},

    # Urology
    {"name": "Channa Jayasumana", "dept": "Urology", "code": "D-034", "room": "Room 310", "days": [(0, "Morning"), (3, "Morning"), (4, "Evening")]},
    {"name": "Nawaz Marikkar", "dept": "Urology", "code": "D-035", "room": "Room 311", "days": [(1, "Afternoon"), (3, "Evening"), (5, "Morning")]},
    {"name": "Deepal Attanayake", "dept": "Urology", "code": "D-036", "room": "Room 312", "days": [(2, "Morning"), (3, "Afternoon")]},

    # Oncology (Unmodelled >= 2)
    {"name": "Maheshika Cooray", "dept": "Oncology", "code": "D-037", "room": "Room 410", "days": [(0, "Morning"), (3, "Morning")]},
    {"name": "G. Tharmalingam", "dept": "Oncology", "code": "D-038", "room": "Room 411", "days": [(2, "Evening"), (3, "Evening")]},

    # Ophthalmology (Unmodelled >= 2)
    {"name": "Sarath Edirisinghe", "dept": "Ophthalmology", "code": "D-039", "room": "Room 106", "days": [(1, "Morning"), (3, "Morning")]},
    {"name": "Zuhaira Hameed", "dept": "Ophthalmology", "code": "D-040", "room": "Room 107", "days": [(2, "Evening"), (3, "Evening")]},

    # Nephrology (Unmodelled >= 2)
    {"name": "Sujatha Senaratne", "dept": "Nephrology", "code": "D-041", "room": "Room 315", "days": [(0, "Afternoon"), (3, "Afternoon")]},
    {"name": "M. K. Murugesu", "dept": "Nephrology", "code": "D-042", "room": "Room 316", "days": [(1, "Evening"), (3, "Evening")]},

    # Pulmonology (Unmodelled >= 2)
    {"name": "Keerthi Rathnayake", "dept": "Pulmonology", "code": "D-043", "room": "Room 208", "days": [(2, "Morning"), (3, "Morning")]},
    {"name": "Farhana Zahir", "dept": "Pulmonology", "code": "D-044", "room": "Room 209", "days": [(3, "Evening"), (5, "Evening")]},

    # Radiology & X-ray (Unmodelled >= 2)
    {"name": "Saman Weerasinghe", "dept": "Radiology & X-ray", "code": "D-045", "room": "Room 105", "days": [(0, "Morning"), (3, "Afternoon"), (4, "Morning")]},
    {"name": "Thilini Alwis", "dept": "Radiology & X-ray", "code": "D-046", "room": "Room 104", "days": [(1, "Evening"), (3, "Morning"), (5, "Evening")]},
]

SESSION_TIMES = {
    "Morning": (time(8, 30), time(12, 30)),
    "Afternoon": (time(13, 30), time(16, 30)),
    "Evening": (time(17, 0), time(20, 0)),
}


def seed_departments(db):
    logger.info("Seeding departments...")
    dept_map = {}
    for d in DEPARTMENTS_CONFIG:
        row = db.query(models.Department).filter(models.Department.name == d["name"]).first()
        if not row:
            row = models.Department(
                name=d["name"],
                model_category=d["model_category"],
                icon=d["icon"],
                telehealth_ok=d["telehealth_ok"],
                active=True,
            )
            db.add(row)
            db.flush()
        else:
            row.model_category = d["model_category"]
            row.icon = d["icon"]
            row.telehealth_ok = d["telehealth_ok"]
        dept_map[d["name"]] = row.id
    db.commit()
    logger.info(f"Seeded {len(dept_map)} departments.")
    return dept_map


def seed_doctors_and_sessions(db, dept_map):
    logger.info("Seeding doctors and weekly sessions...")
    doctors_seeded = 0
    sessions_seeded = 0

    for doc_data in DOCTORS_CONFIG:
        dept_id = dept_map.get(doc_data["dept"])
        if not dept_id:
            continue

        doc = db.query(models.Doctor).filter(models.Doctor.full_name == doc_data["name"]).first()
        if not doc:
            doc = models.Doctor(
                id=uuid.uuid4(),
                title="Dr.",
                full_name=doc_data["name"],
                department_id=dept_id,
                his_doctor_code=doc_data["code"],
                default_room=doc_data["room"],
                active=True,
                needs_review=False,
            )
            db.add(doc)
            db.flush()
            doctors_seeded += 1
        else:
            doc.department_id = dept_id
            doc.his_doctor_code = doc_data["code"]
            doc.default_room = doc_data["room"]
            doc.active = True

        for weekday, label in doc_data["days"]:
            start_t, end_t = SESSION_TIMES[label]
            sess = (
                db.query(models.DoctorClinicSession)
                .filter(
                    models.DoctorClinicSession.doctor_id == doc.id,
                    models.DoctorClinicSession.weekday == weekday,
                    models.DoctorClinicSession.label == label,
                )
                .first()
            )
            if not sess:
                sess = models.DoctorClinicSession(
                    id=uuid.uuid4(),
                    doctor_id=doc.id,
                    weekday=weekday,
                    label=label,
                    start_time=start_t,
                    end_time=end_t,
                    room=doc_data["room"],
                    max_patients=25,
                    slot_minutes=12,
                    active=True,
                )
                db.add(sess)
                sessions_seeded += 1
            else:
                sess.start_time = start_t
                sess.end_time = end_t
                sess.room = doc_data["room"]
                sess.active = True

    db.commit()
    logger.info(f"Doctors checked/seeded. Total sessions: {sessions_seeded}.")


def seed_locations(db):
    logger.info("Seeding locations from lk_locations.json...")
    if not os.path.exists(LOCATIONS_FILE):
        logger.warning(f"Locations file not found: {LOCATIONS_FILE}. Run build_lk_locations.py first.")
        return

    with open(LOCATIONS_FILE, "r", encoding="utf-8") as f:
        locs = json.load(f)

    # Insert in batches of 1000
    batch_size = 1000
    total = len(locs)
    logger.info(f"Loaded {total} location records. Inserting into database...")

    for i in range(0, total, batch_size):
        batch = locs[i : i + batch_size]
        # Use PostgreSQL bulk upsert
        params = []
        for loc in batch:
            params.append({
                "name": loc["name"],
                "name_norm": loc["name_norm"],
                "district": loc.get("district"),
                "province": loc.get("province"),
                "kind": loc.get("kind", "town"),
                "latitude": loc["latitude"],
                "longitude": loc["longitude"],
                "population": loc.get("population"),
                "aliases": loc.get("aliases", []),
                "source": loc.get("source", "geonames"),
            })

        db.execute(
            text("""
                INSERT INTO locations (name, name_norm, district, province, kind, latitude, longitude, population, aliases, source)
                VALUES (:name, :name_norm, :district, :province, :kind, :latitude, :longitude, :population, :aliases, :source)
                ON CONFLICT (name_norm, district) DO UPDATE SET
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    aliases = EXCLUDED.aliases,
                    province = coalesce(EXCLUDED.province, locations.province),
                    population = coalesce(EXCLUDED.population, locations.population);
            """),
            params,
        )
        db.commit()

    logger.info("Locations seeded successfully.")


def seed_all():
    db = SessionLocal()
    try:
        dept_map = seed_departments(db)
        seed_doctors_and_sessions(db, dept_map)
        seed_locations(db)
        logger.info("seed_reference complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_all()

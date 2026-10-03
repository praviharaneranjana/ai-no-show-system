"""Seed the database with multi-hospital tenancy, real verified staff accounts,
departments, doctors, sessions, patients, appointments, and capacity settings.

Hospitals seeded:
1. Asiri Central Hospital (Colombo 10, domain: asiri.lk)
2. National Hospital of Sri Lanka (NHSL) (Colombo 08, domain: nhsl.health.gov.lk)

Staff accounts seeded (emails only; passwords are never stored in the repo):
- Platform Owner: owner@shai.health
- Asiri Central: kavindi (front desk), asela (manager), nipun (analyst), dilani (admin), tharindu (pending) @asiri.lk
- NHSL: sarath (front desk), chithra (manager), anura (admin) @nhsl.health.gov.lk

Passwords come from SEED_STAFF_PASSWORD / SEED_OWNER_PASSWORD (at least 10 characters). When a variable is
not set a random password is generated and printed once at the end of the run.
"""
import os
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

from app.database import Base, SessionLocal, engine
from app import models, security

ASIRI_ID = uuid.UUID("a0000000-0000-0000-0000-000000000001")
NHSL_ID = uuid.UUID("a0000000-0000-0000-0000-000000000002")

def _password_from_env(name: str) -> tuple[str, bool]:
    """(password, generated). Reads ``name`` from the environment or generates a strong random one."""
    value = os.getenv(name, "")
    if value:
        if len(value) < 10:
            raise SystemExit(f"{name} must be at least 10 characters")
        return value, False
    return secrets.token_urlsafe(12) + "aA1!", True


STAFF_PASSWORD, STAFF_PASSWORD_GENERATED = _password_from_env("SEED_STAFF_PASSWORD")
OWNER_PASSWORD, OWNER_PASSWORD_GENERATED = _password_from_env("SEED_OWNER_PASSWORD")


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    now_utc = datetime.now(timezone.utc)
    today = date.today()

    try:
        # 1. Seed Hospitals
        asiri = db.get(models.Hospital, ASIRI_ID)
        if not asiri:
            asiri = models.Hospital(
                id=ASIRI_ID,
                slug="asiri-central",
                name="Asiri Central Hospital",
                short_name="Asiri Central",
                legal_name="Asiri Hospital Holdings PLC",
                brand_color="#8B7CF6",
                established_date=date(2008, 10, 1),
                hospital_type="private",
                registration_number="PV-8921-CMB",
                bed_count=264,
                address_line1="114 Norris Canal Road",
                address_line2="Colombo 10",
                city="Colombo 10",
                district="Colombo",
                province="Western",
                postal_code="01000",
                country="Sri Lanka",
                latitude=6.9190,
                longitude=79.8668,
                timezone="Asia/Colombo",
                currency="LKR",
                website="https://asirihealth.com",
                main_phone="+94114524400",
                main_email="info.central@asiri.lk",
                emergency_phone="+94114524444",
                about="Premier tertiary healthcare provider in Colombo featuring state-of-the-art diagnostic and clinical care.",
                accreditations=["JCI Accredited", "ISO 9001:2015", "ACHS International"],
                go_live_date=date(2024, 1, 1),
                is_active=True,
            )
            db.add(asiri)
            db.flush()

        nhsl = db.get(models.Hospital, NHSL_ID)
        if not nhsl:
            nhsl = models.Hospital(
                id=NHSL_ID,
                slug="nhsl-colombo",
                name="National Hospital of Sri Lanka",
                short_name="NHSL Colombo",
                legal_name="Ministry of Health Sri Lanka - NHSL",
                brand_color="#0EA5E9",
                established_date=date(1864, 3, 15),
                hospital_type="public",
                registration_number="MOH-GOV-0001",
                bed_count=3400,
                address_line1="Regent Street / E W Perera Mawatha",
                address_line2="Colombo 08",
                city="Colombo 08",
                district="Colombo",
                province="Western",
                postal_code="00800",
                country="Sri Lanka",
                latitude=6.9195,
                longitude=79.8672,
                timezone="Asia/Colombo",
                currency="LKR",
                website="https://nhsl.health.gov.lk",
                main_phone="+94112691111",
                main_email="director@nhsl.health.gov.lk",
                emergency_phone="1990",
                about="The leading national referral tertiary public teaching hospital in Sri Lanka.",
                accreditations=["Ministry of Health Certified", "WHO Teaching Center"],
                go_live_date=date(2024, 2, 1),
                is_active=True,
            )
            db.add(nhsl)
            db.flush()

        # 2. Seed Email Domains
        domains = [
            (ASIRI_ID, "asiri.lk", True),
            (ASIRI_ID, "asiricentral.lk", False),
            (NHSL_ID, "nhsl.health.gov.lk", True),
            (NHSL_ID, "health.gov.lk", False),
        ]
        for hid, dom, is_prim in domains:
            if not db.query(models.HospitalEmailDomain).filter_by(domain=dom).first():
                db.add(models.HospitalEmailDomain(
                    hospital_id=hid,
                    domain=dom,
                    is_primary=is_prim,
                    is_verified=True,
                ))
        db.flush()

        # 3. Seed Users & Memberships
        def get_or_create_user(email: str, full_name: str, base_role: str, phone: str | None = None) -> models.User:
            u = db.query(models.User).filter_by(email=email.lower().strip()).first()
            if not u:
                u = models.User(
                    email=email.lower().strip(),
                    full_name=full_name,
                    role=base_role,
                    phone=phone,
                    password_hash=security.hash_password(STAFF_PASSWORD if base_role != "platform_owner" else OWNER_PASSWORD),
                    must_change_password=True,
                    is_active=True,
                )
                db.add(u)
                db.flush()
            return u

        # Platform owner
        owner = get_or_create_user("owner@shai.health", "System Architect (Owner)", "platform_owner", "+94770000000")

        # Asiri users
        asiri_admin = get_or_create_user("dilani@asiri.lk", "Dilani Wickramasinghe", "admin", "+94771112222")
        asiri_manager = get_or_create_user("asela@asiri.lk", "Asela Samarasekera", "manager", "+94772223333")
        asiri_analyst = get_or_create_user("nipun@asiri.lk", "Nipun Bandara", "analyst", "+94773334444")
        asiri_front = get_or_create_user("kavindi@asiri.lk", "Kavindi Jayasuriya", "front_desk", "+94774445555")
        asiri_pending = get_or_create_user("tharindu@asiri.lk", "Tharindu Ekanayake", "front_desk", "+94775556666")

        # NHSL users
        nhsl_admin = get_or_create_user("anura@nhsl.health.gov.lk", "Dr. Anura Kumara", "admin", "+94776667777")
        nhsl_manager = get_or_create_user("chithra@nhsl.health.gov.lk", "Chithra Dissanayake", "manager", "+94777778888")
        nhsl_front = get_or_create_user("sarath@nhsl.health.gov.lk", "Sarath Gunawardena", "front_desk", "+94778889999")

        # Memberships
        asiri_memberships = [
            (asiri_admin.id, "admin", "active", "Director of Hospital Operations", asiri_admin.id),
            (asiri_manager.id, "manager", "active", "Clinic Operations Manager", asiri_admin.id),
            (asiri_analyst.id, "analyst", "active", "Healthcare Data Analyst", asiri_admin.id),
            (asiri_front.id, "front_desk", "active", "Senior Reception Officer", asiri_admin.id),
            (asiri_pending.id, "front_desk", "pending", "Junior Receptionist", None),
        ]
        for uid, role, status, title, approver in asiri_memberships:
            m = db.query(models.HospitalMembership).filter_by(user_id=uid, hospital_id=ASIRI_ID).first()
            if not m:
                db.add(models.HospitalMembership(
                    hospital_id=ASIRI_ID,
                    user_id=uid,
                    role=role,
                    status=status,
                    job_title=title,
                    is_active=(status == "active"),
                    approved_at=now_utc if status == "active" else None,
                    approved_by_user_id=approver,
                ))

        nhsl_memberships = [
            (nhsl_admin.id, "admin", "active", "Chief Medical Superintendent", nhsl_admin.id),
            (nhsl_manager.id, "manager", "active", "Deputy Clinical Director", nhsl_admin.id),
            (nhsl_front.id, "front_desk", "active", "Outpatient Registration Lead", nhsl_admin.id),
        ]
        for uid, role, status, title, approver in nhsl_memberships:
            m = db.query(models.HospitalMembership).filter_by(user_id=uid, hospital_id=NHSL_ID).first()
            if not m:
                db.add(models.HospitalMembership(
                    hospital_id=NHSL_ID,
                    user_id=uid,
                    role=role,
                    status=status,
                    job_title=title,
                    is_active=(status == "active"),
                    approved_at=now_utc if status == "active" else None,
                    approved_by_user_id=approver,
                ))
        db.flush()

        # 4. Seed Departments & Doctors
        # Asiri Departments
        asiri_depts = ["Cardiology", "Neurology", "Orthopedics", "ENT"]
        dept_map = {}
        for dname in asiri_depts:
            dept = db.query(models.Department).filter_by(name=dname).first()
            if not dept:
                dept = models.Department(
                    hospital_id=ASIRI_ID,
                    name=dname,
                    model_category=dname,
                    icon="stethoscope",
                    active=True,
                    default_consultation_fee_lkr=4500.0,
                )
                db.add(dept)
                db.flush()
            else:
                dept.hospital_id = ASIRI_ID
            dept_map[dname] = dept

        # Asiri Doctors
        asiri_docs_data = [
            ("Dr. Rohan Perera", "Cardiology", "Consultant Cardiologist", 4500.0),
            ("Dr. Neluka Fernando", "Neurology", "Consultant Neurologist", 5000.0),
            ("Dr. Anura Jayasinghe", "Orthopedics", "Consultant Orthopedic Surgeon", 4000.0),
            ("Dr. Preethi Wijesinghe", "ENT", "Consultant ENT Surgeon", 3800.0),
        ]
        for doc_name, dname, title, fee in asiri_docs_data:
            doc = db.query(models.Doctor).filter_by(full_name=doc_name, hospital_id=ASIRI_ID).first()
            if not doc:
                db.add(models.Doctor(
                    hospital_id=ASIRI_ID,
                    full_name=doc_name,
                    department_id=dept_map[dname].id,
                    title=title,
                    consultation_fee_lkr=fee,
                    active=True,
                ))

        # NHSL Departments
        nhsl_depts = ["General Medicine", "NHSL Cardiology", "General Surgery"]
        nhsl_dept_map = {}
        for dname in nhsl_depts:
            dept = db.query(models.Department).filter_by(name=dname).first()
            if not dept:
                dept = models.Department(
                    hospital_id=NHSL_ID,
                    name=dname,
                    model_category="Cardiology" if "Cardiology" in dname else dname,
                    icon="stethoscope",
                    active=True,
                    default_consultation_fee_lkr=0.0,
                )
                db.add(dept)
                db.flush()
            else:
                dept.hospital_id = NHSL_ID
            nhsl_dept_map[dname] = dept

        # NHSL Doctors
        nhsl_docs_data = [
            ("Dr. Jayalath Perera", "NHSL Cardiology", "Consultant Cardiologist", 0.0),
            ("Dr. Shirani Senanayake", "General Medicine", "Senior Consultant Physician", 0.0),
            ("Dr. Bandula Samarasinghe", "General Surgery", "Consultant Surgeon", 0.0),
        ]
        for doc_name, dname, title, fee in nhsl_docs_data:
            doc = db.query(models.Doctor).filter_by(full_name=doc_name, hospital_id=NHSL_ID).first()
            if not doc:
                db.add(models.Doctor(
                    hospital_id=NHSL_ID,
                    full_name=doc_name,
                    department_id=nhsl_dept_map[dname].id,
                    title=title,
                    consultation_fee_lkr=fee,
                    active=True,
                ))
        db.flush()

        # Seed clinic sessions for doctors across Monday-Saturday
        from datetime import time as dt_time
        all_seeded_doctors = db.query(models.Doctor).filter(models.Doctor.hospital_id.in_([ASIRI_ID, NHSL_ID])).all()
        session_configs = [
            ("Morning", dt_time(9, 0), dt_time(12, 0), 20),
            ("Afternoon", dt_time(14, 0), dt_time(17, 0), 25),
            ("Evening", dt_time(17, 30), dt_time(20, 30), 20),
        ]
        for d in all_seeded_doctors:
            for wday in range(6):  # Monday (0) to Saturday (5)
                for label, s_time, e_time, max_pts in session_configs:
                    exists = (
                        db.query(models.DoctorClinicSession)
                        .filter_by(doctor_id=d.id, weekday=wday, label=label)
                        .first()
                    )
                    if not exists:
                        db.add(
                            models.DoctorClinicSession(
                                hospital_id=d.hospital_id,
                                doctor_id=d.id,
                                weekday=wday,
                                label=label,
                                start_time=s_time,
                                end_time=e_time,
                                room=f"Room {101 + (wday % 8)} ({'Asiri Central' if d.hospital_id == ASIRI_ID else 'NHSL OPD'})",
                                max_patients=max_pts,
                                slot_minutes=12,
                                delay_minutes=0,
                                delay_status="on_time",
                                active=True,
                            )
                        )
        db.flush()

        # 5. Seed Capacity Settings for both hospitals
        for hid in [ASIRI_ID, NHSL_ID]:
            if db.query(models.CapacitySetting).filter_by(hospital_id=hid).count() == 0:
                db.add(models.CapacitySetting(
                    hospital_id=hid,
                    scope="global",
                    safety_factor=0.75,
                    max_overbook_per_slot=2,
                    max_overbook_per_session=4,
                    wait_tolerance_mins=15,
                    consultation_fee_lkr=4500.0 if hid == ASIRI_ID else 0.0,
                    badge_safe_mins=8,
                    badge_moderate_mins=15,
                    auto_assign_waitlist=False,
                    sim_runs=2000,
                ))

        # 6. Seed Patients & Appointments for NHSL to demonstrate tenant isolation
        nhsl_patient_count = db.query(models.Patient).filter_by(hospital_id=NHSL_ID).count()
        if nhsl_patient_count == 0:
            nhsl_patients = [
                dict(
                    hospital_id=NHSL_ID,
                    uhid="UHID-NHSL-1001",
                    full_name="Gamini Wickramasinghe",
                    date_of_birth=date(1965, 8, 22),
                    gender="M",
                    phone="+94711122233",
                    email="gamini@nhsl-patient.lk",
                    city="Kandy",
                    distance_km=115.0,
                    scholarship=True,
                    hypertension=True,
                    diabetes=True,
                    alcoholism=False,
                    handicap=0,
                ),
                dict(
                    hospital_id=NHSL_ID,
                    uhid="UHID-NHSL-1002",
                    full_name="Damayanthi Alwis",
                    date_of_birth=date(1972, 1, 14),
                    gender="F",
                    phone="+94712233344",
                    email="damayanthi@nhsl-patient.lk",
                    city="Galle",
                    distance_km=118.0,
                    scholarship=False,
                    hypertension=False,
                    diabetes=True,
                    alcoholism=False,
                    handicap=0,
                ),
            ]
            for pdata in nhsl_patients:
                p = models.Patient(**pdata)
                db.add(p)
                db.flush()

                appt = models.Appointment(
                    hospital_id=NHSL_ID,
                    patient_id=p.id,
                    scheduled_day=today - timedelta(days=3),
                    appointment_day=today,
                    department="NHSL Cardiology",
                    doctor_name="Dr. Jayalath Perera",
                    booking_channel="Hospital Counter",
                    payment_mode="Government Subsidized",
                    scheduled_time="09:00",
                    queue_number=1,
                    ai_action_status="Confirmed via WhatsApp",
                    sms_received=True,
                    status="scheduled",
                )
                db.add(appt)
                db.flush()

                db.add(models.Prediction(
                    hospital_id=NHSL_ID,
                    appointment_id=appt.id,
                    risk_score=0.42,
                    risk_category="Medium",
                    explanation={"contributions": [
                        {"feature": "DistanceKm", "contribution": 0.30, "value": 115.0},
                        {"feature": "Age", "contribution": -0.10, "value": 59.0},
                    ]},
                    recommendation="Medium risk: Send Sinhala reminder SMS.",
                ))

        # Ensure all existing Asiri patients and appointments have hospital_id set
        db.query(models.Patient).filter(models.Patient.hospital_id.is_(None)).update({"hospital_id": ASIRI_ID})
        db.query(models.Appointment).filter(models.Appointment.hospital_id.is_(None)).update({"hospital_id": ASIRI_ID})
        db.query(models.Doctor).filter(models.Doctor.hospital_id.is_(None)).update({"hospital_id": ASIRI_ID})
        db.query(models.Department).filter(models.Department.hospital_id.is_(None)).update({"hospital_id": ASIRI_ID})
        db.query(models.Prediction).filter(models.Prediction.hospital_id.is_(None)).update({"hospital_id": ASIRI_ID})

        db.commit()
        print("Seeded hospitals, staff accounts and demo reference records.")
        if STAFF_PASSWORD_GENERATED:
            print(f"  Staff accounts password (shown once, change it at first login): {STAFF_PASSWORD}")
        if OWNER_PASSWORD_GENERATED:
            print(f"  owner@shai.health password (shown once): {OWNER_PASSWORD}")
        if not (STAFF_PASSWORD_GENERATED or OWNER_PASSWORD_GENERATED):
            print("  Passwords were taken from SEED_STAFF_PASSWORD / SEED_OWNER_PASSWORD.")

    finally:
        db.close()


if __name__ == "__main__":
    seed()

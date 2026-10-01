import concurrent.futures
import uuid
from datetime import date, datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.services.uhid import LK_TZ
import seed_reference


@pytest.fixture(autouse=True)
def setup_reference_data(db_session):
    dept_map = seed_reference.seed_departments(db_session)
    seed_reference.seed_doctors_and_sessions(db_session, dept_map)
    if db_session.query(models.Location).count() == 0:
        seed_reference.seed_locations(db_session)


def get_active_doctor_and_session(db_session: Session):
    doctor = db_session.query(models.Doctor).filter(models.Doctor.active == True).first()
    assert doctor is not None
    session = (
        db_session.query(models.DoctorClinicSession)
        .filter(models.DoctorClinicSession.doctor_id == doctor.id, models.DoctorClinicSession.active == True)
        .first()
    )
    assert session is not None
    # Calculate future date matching session weekday
    today_lk = datetime.now(LK_TZ).date()
    for d in range(1, 14):
        target = today_lk + timedelta(days=d)
        if target.weekday() == session.weekday:
            return doctor, session, target
    raise RuntimeError("Could not find matching weekday")


def test_intake_success(client: TestClient, db_session: Session):
    doctor, session, appt_day = get_active_doctor_and_session(db_session)

    payload = {
        "patient": {
            "full_name": "Test Intake Patient",
            "date_of_birth": "1990-05-15",
            "gender": "male",
            "phone": "+94771234567",
            "nic": "199013500123",
            "city": "Nugegoda",
            "district": "Colombo",
            "hypertension": False,
            "diabetes": False,
        },
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": appt_day.isoformat(),
        "booking_channel": "Counter",
        "payment_mode": "Cash",
        "sms_reminder_opt_in": True,
        "notes": "First appointment test",
    }

    response = client.post("/appointments/intake", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    # Patient assertions
    patient = data["patient"]
    assert patient["uhid"].startswith("SHAI-")
    assert patient["full_name"] == "Test Intake Patient"
    assert patient["phone"] == "+94771234567"

    # Appointment assertions
    appt = data["appointment"]
    assert appt["doctor_id"] == str(doctor.id)
    assert appt["clinic_session_id"] == str(session.id)
    assert appt["source"] == "manual"
    assert appt["status"] == "scheduled"
    assert appt["appointment_day"] == appt_day.isoformat()

    # Slot assertions
    slot = data["slot"]
    assert slot["token"] == 1
    assert slot["room"] == session.room

    # Prediction assertions
    pred = data["prediction"]
    assert pred is not None
    assert "risk_score" in pred
    assert 0.0 <= pred["risk_score"] <= 1.0
    assert pred["risk_category"].lower() in ["low", "medium", "high"]

    # Verify database records
    db_appt = db_session.get(models.Appointment, uuid.UUID(appt["id"]))
    assert db_appt is not None
    assert db_appt.queue_number == 1

    # Check event
    event = db_session.query(models.AppointmentEvent).filter_by(appointment_id=db_appt.id).first()
    assert event is not None
    assert event.event_type == "booked"

    # Check prediction log
    log = db_session.query(models.PredictionLog).filter_by(appointment_id=db_appt.id).first()
    assert log is not None
    assert log.stage == "booking"


def test_intake_duplicate_error(client: TestClient, db_session: Session):
    doctor, session, appt_day = get_active_doctor_and_session(db_session)

    # First booking
    payload = {
        "patient": {
            "full_name": "Duplicate Check Patient",
            "date_of_birth": "1985-02-10",
            "phone": "+94779998877",
            "nic": "198512345678",
        },
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": appt_day.isoformat(),
    }
    r1 = client.post("/appointments/intake", json=payload)
    assert r1.status_code == 200
    patient_id = r1.json()["patient"]["id"]

    # Try duplicate booking same patient, same doctor, same day
    payload_dup = {
        "patient_id": patient_id,
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": appt_day.isoformat(),
    }
    r2 = client.post("/appointments/intake", json=payload_dup)
    assert r2.status_code == 409


def test_intake_wrong_weekday(client: TestClient, db_session: Session):
    doctor, session, appt_day = get_active_doctor_and_session(db_session)
    # Pick wrong weekday
    wrong_day = appt_day + timedelta(days=1)
    if wrong_day.weekday() == session.weekday:
        wrong_day += timedelta(days=1)

    payload = {
        "patient": {
            "full_name": "Weekday Mismatch",
            "date_of_birth": "1992-08-20",
        },
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": wrong_day.isoformat(),
    }
    r = client.post("/appointments/intake", json=payload)
    assert r.status_code == 400
    assert "weekday" in r.text.lower()


def test_intake_past_date(client: TestClient, db_session: Session):
    doctor, session, appt_day = get_active_doctor_and_session(db_session)
    past_date = appt_day - timedelta(days=7)

    payload = {
        "patient": {
            "full_name": "Time Traveler",
            "date_of_birth": "1992-08-20",
        },
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": past_date.isoformat(),
    }
    r = client.post("/appointments/intake", json=payload)
    assert r.status_code == 400
    assert "past" in r.text.lower()


def test_intake_session_full(client: TestClient, db_session: Session):
    doctor, session, appt_day = get_active_doctor_and_session(db_session)
    # Set max_patients to 1 for test
    session.max_patients = 1
    db_session.commit()

    # First booking
    p1 = {
        "patient": {"full_name": "First Patient", "date_of_birth": "1980-01-01"},
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": appt_day.isoformat(),
    }
    r1 = client.post("/appointments/intake", json=p1)
    assert r1.status_code == 200

    # Second booking should 409 session_full
    p2 = {
        "patient": {"full_name": "Second Patient", "date_of_birth": "1982-02-02"},
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": appt_day.isoformat(),
    }
    r2 = client.post("/appointments/intake", json=p2)
    assert r2.status_code == 409
    data = r2.json()
    assert "detail" in data
    assert data["detail"]["code"] == "session_full"
    assert "next_available" in data["detail"]


def test_predict_preview_ephemeral(client: TestClient, db_session: Session):
    doctor, session, appt_day = get_active_doctor_and_session(db_session)

    init_patients = db_session.query(models.Patient).count()
    init_appts = db_session.query(models.Appointment).count()
    init_preds = db_session.query(models.Prediction).count()

    payload = {
        "patient": {
            "full_name": "Ephemeral Preview Patient",
            "date_of_birth": "1975-04-12",
            "gender": "female",
            "hypertension": True,
            "diabetes": True,
        },
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": appt_day.isoformat(),
        "booking_channel": "Phone",
        "payment_mode": "Cash",
    }
    response = client.post("/predict/preview", json=payload)
    assert response.status_code == 200
    res = response.json()
    assert "risk_score" in res
    assert "risk_category" in res
    assert "explanation" in res

    # Verify NOTHING was saved to database
    assert db_session.query(models.Patient).count() == init_patients
    assert db_session.query(models.Appointment).count() == init_appts
    assert db_session.query(models.Prediction).count() == init_preds


def test_patients_search(client: TestClient, db_session: Session):
    # Book a patient
    doctor, session, appt_day = get_active_doctor_and_session(db_session)
    payload = {
        "patient": {
            "full_name": "Searchable Kumarasiri",
            "date_of_birth": "1968-11-23",
            "phone": "+94718889900",
            "nic": "196833445566",
        },
        "doctor_id": str(doctor.id),
        "clinic_session_id": str(session.id),
        "appointment_day": appt_day.isoformat(),
    }
    client.post("/appointments/intake", json=payload)

    # Search by name
    r1 = client.get("/patients/search?q=kumarasiri")
    assert r1.status_code == 200
    results1 = r1.json()
    assert len(results1) >= 1
    assert "Kumarasiri" in results1[0]["full_name"]
    assert results1[0]["total_visits"] >= 1

    # Search by phone
    r2 = client.get("/patients/search?q=8889900")
    assert r2.status_code == 200
    results2 = r2.json()
    assert len(results2) >= 1
    assert results2[0]["phone"] == "+94718889900"


def test_intake_concurrent_tokens(client: TestClient, db_session: Session):
    doctor, session, appt_day = get_active_doctor_and_session(db_session)
    target_day = appt_day + timedelta(days=21)

    tokens = []
    for i in range(1, 6):
        payload = {
            "patient": {
                "full_name": f"Concurrent Patient {i}",
                "date_of_birth": f"198{i}-01-01",
                "phone": f"+9477000000{i}",
                "nic": f"198{i}0000000{i}",
            },
            "doctor_id": str(doctor.id),
            "clinic_session_id": str(session.id),
            "appointment_day": target_day.isoformat(),
        }
        res = client.post("/appointments/intake", json=payload)
        assert res.status_code == 200, res.text
        tokens.append(res.json()["slot"]["token"])

    assert tokens == [1, 2, 3, 4, 5]

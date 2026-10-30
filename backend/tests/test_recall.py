import uuid
from datetime import datetime, timedelta

import pytest

import seed_reference
from app import models
from app.recall import wilson
from app.services.uhid import LK_TZ

HOSPITAL_ID = uuid.UUID("a0000000-0000-0000-0000-000000000001")


@pytest.fixture(autouse=True)
def reference_data(db_session):
    dept_map = seed_reference.seed_departments(db_session)
    seed_reference.seed_doctors_and_sessions(db_session, dept_map)
    if db_session.query(models.Location).count() == 0:
        seed_reference.seed_locations(db_session)


def _doctor_session(db_session):
    doctor = db_session.query(models.Doctor).filter(models.Doctor.active == True).first()
    session = db_session.query(models.DoctorClinicSession).filter(
        models.DoctorClinicSession.doctor_id == doctor.id, models.DoctorClinicSession.active == True).first()
    return doctor, session


def _missed(db_session, days_ago=10, department=None, status="no_show"):
    """A recorded no-show `days_ago` days back, booked into the doctor's real session."""
    doctor, session = _doctor_session(db_session)
    patient = models.Patient(
        uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="Missed Patient", date_of_birth=datetime(1985, 3, 3).date(),
        phone="+94771112222", hospital_id=HOSPITAL_ID, preferred_language="en",
    )
    db_session.add(patient)
    db_session.flush()
    day = datetime.now(LK_TZ).date() - timedelta(days=days_ago)
    appt = models.Appointment(
        patient_id=patient.id, doctor_id=doctor.id, clinic_session_id=session.id, hospital_id=HOSPITAL_ID,
        scheduled_day=day - timedelta(days=3), appointment_day=day, department=department or doctor.department.name,
        doctor_name=doctor.full_name, status=status, no_show=(status == "no_show"), data_source="synthetic",
    )
    db_session.add(appt)
    db_session.flush()
    return appt


def _next_session_day(session):
    today = datetime.now(LK_TZ).date()
    return next(today + timedelta(days=d) for d in range(1, 30) if (today + timedelta(days=d)).weekday() == session.weekday)


def test_queue_lists_recent_no_shows_with_a_suggested_channel(client, db_session):
    appt = _missed(db_session)
    body = client.get("/recall/queue").json()
    item = next(i for i in body["items"] if i["appointment_id"] == str(appt.id))
    assert item["state"] == "not_contacted"
    assert item["suggested_channel"] == "Call"
    assert item["days_since"] == 10
    assert body["not_contacted"] >= 1


def test_queue_ignores_old_misses_and_attended_visits(client, db_session):
    old = _missed(db_session, days_ago=40)
    attended = _missed(db_session, days_ago=5, status="completed")
    ids = {i["appointment_id"] for i in client.get("/recall/queue").json()["items"]}
    assert str(old.id) not in ids and str(attended.id) not in ids
    assert str(old.id) in {i["appointment_id"] for i in client.get("/recall/queue?days=60").json()["items"]}


def test_draft_never_names_a_sensitive_specialty(client, db_session):
    appt = _missed(db_session, department="Psychiatry")
    for lang in ("en", "si", "ta"):
        d = client.post(f"/recall/{appt.id}/draft?language={lang}").json()
        assert d["discreet"] is True
        assert "psychiatry" not in d["message"].lower()
    assert next(i for i in client.get("/recall/queue").json()["items"] if i["appointment_id"] == str(appt.id))["discreet"] is True


def test_contact_is_logged_and_moves_the_patient_to_contacted(client, db_session):
    appt = _missed(db_session)
    assert client.post(f"/recall/{appt.id}/contact", json={"channel": "Call"}).status_code == 200
    item = next(i for i in client.get("/recall/queue").json()["items"] if i["appointment_id"] == str(appt.id))
    assert item["state"] == "contacted" and item["contacts"] == 1 and item["last_contact_channel"] == "Call"
    assert client.post(f"/recall/{appt.id}/contact", json={"channel": "Pigeon"}).status_code == 422


def test_recall_only_applies_to_no_shows(client, db_session):
    attended = _missed(db_session, status="completed")
    assert client.post(f"/recall/{attended.id}/contact", json={"channel": "Call"}).status_code == 409
    assert client.post(f"/recall/{attended.id}/draft").status_code == 409


def test_rebook_keeps_the_no_show_and_links_the_new_booking(client, db_session):
    appt = _missed(db_session)
    _, session = _doctor_session(db_session)
    day = _next_session_day(session)
    r = client.post(f"/recall/{appt.id}/rebook", json={"clinic_session_id": str(session.id), "appointment_day": day.isoformat()})
    assert r.status_code == 200, r.text
    new_id = r.json()["appointment_id"]

    assert client.get(f"/appointments/{appt.id}").json()["status"] == "no_show"  # the miss stays on record
    new = client.get(f"/appointments/{new_id}").json()
    assert new["status"] == "scheduled" and new["rescheduled_from_id"] == str(appt.id)

    item = next(i for i in client.get("/recall/queue").json()["items"] if i["appointment_id"] == str(appt.id))
    assert item["state"] == "rebooked" and item["rebooked_appointment_id"] == new_id


def test_summary_counts_contacts_and_returns(client, db_session):
    contacted_back = _missed(db_session, days_ago=20)
    contacted_gone = _missed(db_session, days_ago=20)
    untouched = _missed(db_session, days_ago=20)
    too_recent = _missed(db_session, days_ago=3)  # inside the one-week grace, not in the cohort
    _, session = _doctor_session(db_session)
    for a in (contacted_back, contacted_gone):
        client.post(f"/recall/{a.id}/contact", json={"channel": "SMS"})
    client.post(f"/recall/{contacted_back.id}/rebook", json={"clinic_session_id": str(session.id), "appointment_day": _next_session_day(session).isoformat()})

    s = client.get("/recall/summary?days=60").json()
    assert s["missed"] >= 3 and s["contacted"] == 2
    assert s["returned_contacted"] == 1 and s["return_rate_contacted"] == 0.5
    assert s["return_rate_not_contacted"] == 0.0
    assert s["benchmark"]["rate"] == pytest.approx(16 / 61)
    assert too_recent.id and untouched.id  # created, but excluded/untouched above


def test_wilson_interval_matches_the_published_study():
    lo, hi = wilson(16, 61)
    assert lo == pytest.approx(0.168, abs=0.003) and hi == pytest.approx(0.384, abs=0.003)
    assert wilson(0, 0) is None

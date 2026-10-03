"""Capacity counts only the sessions that run on the target date, with their real max_patients."""
import uuid
from datetime import date, time, timedelta

from app import models

ASIRI = uuid.UUID("a0000000-0000-0000-0000-000000000001")


def _next_weekday(wd: int) -> date:
    d = date.today() + timedelta(days=1)
    while d.weekday() != wd:
        d += timedelta(days=1)
    return d


def _setup(db, hospital_id=ASIRI):
    dept = models.Department(name=f"Cardiology-{uuid.uuid4().hex[:5]}", model_category="Cardiology", hospital_id=hospital_id)
    db.add(dept)
    db.flush()
    doc = models.Doctor(full_name="Dr Test", department_id=dept.id, hospital_id=hospital_id, consultation_fee_lkr=5000.0)
    db.add(doc)
    db.flush()
    sessions = {}
    for wd, cap in ((0, 6), (1, 40), (2, 40)):
        s = models.DoctorClinicSession(doctor_id=doc.id, hospital_id=hospital_id, weekday=wd, label="Evening",
                                       start_time=time(17, 0), end_time=time(20, 0), room="R1", max_patients=cap)
        db.add(s)
        sessions[wd] = s
    db.flush()
    return doc, sessions


def _book(db, doc, session, day, probs, hospital_id=ASIRI):
    for p in probs:
        pat = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="T P", date_of_birth=date(1990, 1, 1), hospital_id=hospital_id)
        db.add(pat)
        db.flush()
        a = models.Appointment(patient_id=pat.id, hospital_id=hospital_id, scheduled_day=date.today(), appointment_day=day,
                               doctor_id=doc.id, clinic_session_id=session.id, department="Cardiology",
                               scheduled_time="17:00", status="scheduled", fee_lkr=5000.0)
        db.add(a)
        db.flush()
        db.add(models.Prediction(appointment_id=a.id, risk_score=p, risk_category="High" if p >= 0.27 else "Low",
                                 explanation={}, recommendation="x"))
    db.flush()


def test_capacity_is_only_the_sessions_running_that_day(client, db_session):
    doc, sessions = _setup(db_session)
    monday = _next_weekday(0)
    _book(db_session, doc, sessions[0], monday, [0.3] * 8)  # 8 booked into a 6-seat session

    body = client.get(f"/capacity/overview?date={monday.isoformat()}").json()
    assert body["total_capacity"] == 6  # not 6 + 40 + 40 (every session of every weekday)
    assert body["total_booked"] == 8
    assert body["sessions_running"] == 1
    assert body["expected_no_shows_total"] == 2.4
    sess = body["sessions"][0]
    assert sess["max_capacity"] == 6 and sess["free_seats"] == 0
    assert 0.0 <= sess["p_overcrowding"] <= 1.0
    assert sess["recommended_extra_bookings"] == sess["recommended_overbook_count"] == sess["overbook_if_full"]  # nothing free


def test_idle_sessions_are_reported_not_counted(client, db_session):
    doc, sessions = _setup(db_session)
    tuesday = _next_weekday(1)
    _book(db_session, doc, sessions[1], tuesday, [0.2] * 3)
    body = client.get(f"/capacity/overview?date={tuesday.isoformat()}").json()
    assert body["total_capacity"] == 40 and body["total_booked"] == 3
    assert body["sessions"][0]["free_seats"] == 37
    assert body["sessions"][0]["recommended_overbook_count"] == 0  # not full: just keep booking
    thursday = _next_weekday(3)  # the doctor has no Thursday session
    empty = client.get(f"/capacity/overview?date={thursday.isoformat()}").json()
    assert empty["total_capacity"] == 0 and empty["sessions"] == []


def test_overview_is_scoped_to_the_users_hospital(client, db_session):
    other = models.Hospital(id=uuid.UUID("a0000000-0000-0000-0000-0000000000f2"), slug=f"o-{uuid.uuid4().hex[:5]}", name="Other", short_name="O")
    db_session.add(other)
    db_session.flush()
    doc, sessions = _setup(db_session, hospital_id=other.id)
    monday = _next_weekday(0)
    _book(db_session, doc, sessions[0], monday, [0.3] * 4, hospital_id=other.id)
    body = client.get(f"/capacity/overview?date={monday.isoformat()}").json()  # client is an Asiri user
    assert body["total_booked"] == 0 and body["total_capacity"] == 0


def test_what_if_changes_with_wait_cost(client, db_session):
    doc, sessions = _setup(db_session)
    monday = _next_weekday(0)
    _book(db_session, doc, sessions[0], monday, [0.3] * 6)
    cheap = client.post("/capacity/what-if", json={"target_date": monday.isoformat(), "wait_cost_lkr": 0}).json()
    dear = client.post("/capacity/what-if", json={"target_date": monday.isoformat(), "wait_cost_lkr": 1_000_000}).json()
    assert cheap["what_if_policy"]["recommended_overbook"] >= dear["what_if_policy"]["recommended_overbook"]
    assert dear["what_if_policy"]["recommended_overbook"] == 0
    assert cheap["trade_off_curve"] and cheap["trade_off_curve"][0]["extra_bookings"] == 0

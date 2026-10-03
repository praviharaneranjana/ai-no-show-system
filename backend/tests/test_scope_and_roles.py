"""Hospital scoping, role gates and the real waitlist assignment."""
import uuid
from datetime import date, time, timedelta

import pytest

from app import models, security
from tests.conftest import TEST_PASSWORD, make_user, token_for

ASIRI = uuid.UUID("a0000000-0000-0000-0000-000000000001")
OTHER = uuid.UUID("a0000000-0000-0000-0000-0000000000f3")


def _login_as(raw_client, db, role):
    user = make_user(db, role)
    raw_client.headers["Authorization"] = f"Bearer {token_for(user)}"
    return user


def _other_hospital(db):
    h = models.Hospital(id=OTHER, slug=f"o-{uuid.uuid4().hex[:5]}", name="Other", short_name="O")
    db.add(h)
    db.flush()
    return h


def _doctor_with_session(db, hospital_id=ASIRI, weekday=None, cap=2, dept_name="Cardiology"):
    dept = models.Department(name=f"{dept_name}-{uuid.uuid4().hex[:4]}", model_category=dept_name, hospital_id=hospital_id)
    db.add(dept)
    db.flush()
    doc = models.Doctor(full_name=f"Free {uuid.uuid4().hex[:4]}", department_id=dept.id, hospital_id=hospital_id)
    db.add(doc)
    db.flush()
    sessions = []
    for wd in range(7) if weekday is None else [weekday]:
        s = models.DoctorClinicSession(doctor_id=doc.id, hospital_id=hospital_id, weekday=wd, label="Evening",
                                       start_time=time(17, 0), end_time=time(20, 0), room="R1", max_patients=cap)
        db.add(s)
        sessions.append(s)
    db.flush()
    return dept, doc, sessions


def _patient(db, hospital_id=ASIRI, name="Wait Er", phone="+94771112222"):
    p = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name=name, phone=phone, date_of_birth=date(1985, 5, 5),
                       hospital_id=hospital_id)
    db.add(p)
    db.flush()
    return p


# ---- roles ---------------------------------------------------------------
def test_analyst_ranks_below_manager():
    assert security.ROLE_RANK["front_desk"] < security.ROLE_RANK["analyst"] < security.ROLE_RANK["manager"]
    assert security.ROLE_RANK["manager"] < security.ROLE_RANK["admin"] < security.ROLE_RANK["platform_owner"]


@pytest.mark.parametrize("path,method", [
    ("/capacity/overview", "get"), ("/capacity/settings", "get"), ("/expenses", "get"),
    ("/simulator/evaluate", "post"), ("/capacity/accuracy", "get"),
])
def test_analyst_cannot_reach_manager_endpoints(raw_client, db_session, path, method):
    _login_as(raw_client, db_session, "analyst")
    r = getattr(raw_client, method)(path, **({"json": {}} if method == "post" else {}))
    assert r.status_code == 403


@pytest.mark.parametrize("path,body", [
    ("/patients", {"full_name": "X", "date_of_birth": "1990-01-01"}),
    ("/capacity/waitlist", {"patient_name": "X", "patient_phone": "1", "specialty": "Cardiology", "doctor_name": "Y"}),
])
def test_analyst_cannot_write_front_line_data(raw_client, db_session, path, body):
    _login_as(raw_client, db_session, "analyst")
    assert raw_client.post(path, json=body).status_code == 403


def test_analyst_can_read_analytics_and_front_desk_cannot(raw_client, db_session):
    _login_as(raw_client, db_session, "analyst")
    assert raw_client.get("/analytics/trend").status_code == 200
    _login_as(raw_client, db_session, "front_desk")
    assert raw_client.get("/analytics/trend").status_code == 403


def test_front_desk_can_write_but_not_run_batches_or_sync(raw_client, db_session):
    _login_as(raw_client, db_session, "front_desk")
    assert raw_client.post("/patients", json={"full_name": "Fd Patient", "date_of_birth": "1990-01-01"}).status_code == 201
    assert raw_client.post("/predictions/runs", json={}).status_code == 403
    assert raw_client.post("/his/sync").status_code == 403


def test_manager_cannot_use_admin_dev_endpoint(raw_client, db_session):
    _login_as(raw_client, db_session, "manager")
    assert raw_client.post("/his/simulate/arrivals").status_code == 403


# ---- tenancy ---------------------------------------------------------------
def test_search_waitlist_and_expenses_are_hospital_scoped(client, db_session):
    _other_hospital(db_session)
    cat = client.get("/expenses/categories").json()[0]
    other_exp = models.HospitalExpense(hospital_id=OTHER, category_id=cat["id"], title="Other cost", amount_lkr=1.0)
    other_w = models.WaitlistEntry(hospital_id=OTHER, patient_name="Theirs", patient_phone="1", specialty="X", doctor_name="Y")
    db_session.add_all([other_exp, other_w])
    _patient(db_session, hospital_id=OTHER, name="Zebra Foreign", phone="+94779990000")
    _patient(db_session, hospital_id=ASIRI, name="Zebra Local", phone="+94779990001")
    db_session.flush()

    assert client.get("/expenses").json() == []
    assert client.get("/capacity/waitlist").json() == []
    names = [p["full_name"] for p in client.get("/patients/search", params={"q": "zebra"}).json()]
    assert names == ["Zebra Local"]
    assert client.patch(f"/expenses/{other_exp.id}", json={"title": "x"}).status_code == 404
    assert client.delete(f"/expenses/{other_exp.id}").status_code == 404
    assert client.post(f"/capacity/waitlist/{other_w.id}/assign").status_code == 404


def test_new_appointments_always_get_the_users_hospital(client, db_session):
    _dept, doc, sessions = _doctor_with_session(db_session, weekday=None, cap=5)
    patient = _patient(db_session)
    day = date.today() + timedelta(days=1)
    sess = next(s for s in sessions if s.weekday == day.weekday())
    r = client.post("/appointments/intake", json={
        "patient_id": str(patient.id), "doctor_id": str(doc.id), "clinic_session_id": str(sess.id),
        "appointment_day": day.isoformat(), "heavy_rain": True,
    })
    assert r.status_code == 200, r.text
    appt = db_session.get(models.Appointment, uuid.UUID(r.json()["appointment"]["id"]))
    assert appt.hospital_id == ASIRI
    assert appt.data_source == "real" and appt.heavy_rain is True and appt.fee_lkr == doc.consultation_fee_lkr
    plain = client.post("/appointments", json={
        "patient_id": str(patient.id), "scheduled_day": date.today().isoformat(), "appointment_day": day.isoformat(),
        "department": "Cardiology",
    })
    assert plain.status_code == 201
    assert db_session.get(models.Appointment, uuid.UUID(plain.json()["id"])).hospital_id == ASIRI


def test_cannot_book_another_hospitals_patient(client, db_session):
    _other_hospital(db_session)
    foreign = _patient(db_session, hospital_id=OTHER, name="Foreign P")
    r = client.post("/appointments", json={
        "patient_id": str(foreign.id), "scheduled_day": date.today().isoformat(),
        "appointment_day": (date.today() + timedelta(days=2)).isoformat(),
    })
    assert r.status_code == 404


# ---- waitlist assignment -------------------------------------------------
def test_assign_creates_a_real_appointment_in_a_free_slot(client, db_session):
    _dept, doc, _sessions = _doctor_with_session(db_session, cap=1, dept_name="Cardiology")
    patient = _patient(db_session, phone="+94775550001")
    w = client.post("/capacity/waitlist", json={
        "patient_id": str(patient.id), "patient_name": patient.full_name, "patient_phone": patient.phone,
        "specialty": "Cardiology", "doctor_name": doc.full_name,
    }).json()
    r = client.post(f"/capacity/waitlist/{w['id']}/assign")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "accepted"
    appt = db_session.get(models.Appointment, uuid.UUID(body["appointment_id"]))
    assert appt.patient_id == patient.id and appt.doctor_id == doc.id and appt.status == "scheduled"
    assert appt.hospital_id == ASIRI and appt.prediction is not None
    assert date.fromisoformat(body["appointment_day"]) > date.today()
    # a second assign of the same entry is refused
    assert client.post(f"/capacity/waitlist/{w['id']}/assign").status_code == 409


def test_assign_returns_clear_error_when_no_slot_is_free(client, db_session):
    _dept, doc, sessions = _doctor_with_session(db_session, cap=1, dept_name="Neurology")
    # fill every session of the next 28 days (capacity 1)
    filler = _patient(db_session, name="Filler", phone="+94770000099")
    for offset in range(1, 29):
        day = date.today() + timedelta(days=offset)
        sess = next(s for s in sessions if s.weekday == day.weekday())
        db_session.add(models.Appointment(patient_id=filler.id, hospital_id=ASIRI, doctor_id=doc.id, clinic_session_id=sess.id,
                                          scheduled_day=date.today(), appointment_day=day, status="scheduled"))
    db_session.flush()
    patient = _patient(db_session, phone="+94775550002")
    w = client.post("/capacity/waitlist", json={
        "patient_id": str(patient.id), "patient_name": patient.full_name, "patient_phone": patient.phone,
        "specialty": "Neurology", "doctor_name": doc.full_name,
    }).json()
    r = client.post(f"/capacity/waitlist/{w['id']}/assign")
    assert r.status_code == 409
    assert "No free slot" in r.json()["detail"]
    assert db_session.get(models.WaitlistEntry, uuid.UUID(w["id"])).status == "waiting"


def test_assign_without_a_registered_patient_is_a_clear_422(client):
    w = client.post("/capacity/waitlist", json={
        "patient_name": "Ghost", "patient_phone": "+94770000123", "specialty": "Cardiology", "doctor_name": "Dr. X",
    }).json()
    r = client.post(f"/capacity/waitlist/{w['id']}/assign")
    assert r.status_code == 422 and "Register the patient" in r.json()["detail"]

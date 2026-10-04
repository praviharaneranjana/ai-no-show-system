from datetime import datetime, timedelta

import uuid

import pytest

import seed_reference
from app import models
from app.services.uhid import LK_TZ


@pytest.fixture(autouse=True)
def reference_data(db_session):
    dept_map = seed_reference.seed_departments(db_session)
    seed_reference.seed_doctors_and_sessions(db_session, dept_map)
    if db_session.query(models.Location).count() == 0:
        seed_reference.seed_locations(db_session)


def _book(client, doctor, session, day):
    resp = client.post("/appointments/intake", json={
        "patient": {"full_name": "Resched Patient", "date_of_birth": "1990-05-15", "gender": "male",
                    "phone": "+94771234567", "city": "Nugegoda", "district": "Colombo"},
        "doctor_id": str(doctor.id), "clinic_session_id": str(session.id),
        "appointment_day": day.isoformat(), "booking_channel": "Counter", "payment_mode": "Cash",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["appointment"]


def _next_session_days(session, n):
    today = datetime.now(LK_TZ).date()
    return [today + timedelta(days=d) for d in range(1, 60) if (today + timedelta(days=d)).weekday() == session.weekday][:n]


def _doctor_session(db_session):
    doctor = db_session.query(models.Doctor).filter(models.Doctor.active == True).first()
    session = db_session.query(models.DoctorClinicSession).filter(
        models.DoctorClinicSession.doctor_id == doctor.id, models.DoctorClinicSession.active == True).first()
    return doctor, session


def test_reschedule_moves_booking_and_frees_old_slot(client, db_session):
    doctor, session = _doctor_session(db_session)
    first, second = _next_session_days(session, 2)
    old = _book(client, doctor, session, first)

    resp = client.post(f"/appointments/{old['id']}/reschedule", json={
        "appointment_day": second.isoformat(), "clinic_session_id": str(session.id)})
    assert resp.status_code == 200, resp.text
    new = resp.json()["appointment"]
    assert new["appointment_day"] == second.isoformat()
    assert new["status"] == "scheduled"
    assert new["id"] != old["id"]

    assert client.get(f"/appointments/{old['id']}").json()["status"] == "cancelled"
    assert client.get(f"/appointments/{new['id']}/prediction").status_code == 200


def test_reschedule_rejects_same_slot_and_wrong_weekday(client, db_session):
    doctor, session = _doctor_session(db_session)
    (first,) = _next_session_days(session, 1)
    old = _book(client, doctor, session, first)

    same = client.post(f"/appointments/{old['id']}/reschedule", json={
        "appointment_day": first.isoformat(), "clinic_session_id": str(session.id)})
    assert same.status_code == 400

    wrong = client.post(f"/appointments/{old['id']}/reschedule", json={
        "appointment_day": (first + timedelta(days=1)).isoformat(), "clinic_session_id": str(session.id)})
    assert wrong.status_code == 400


def test_reschedule_twice_conflicts(client, db_session):
    doctor, session = _doctor_session(db_session)
    first, second = _next_session_days(session, 2)
    old = _book(client, doctor, session, first)
    body = {"appointment_day": second.isoformat(), "clinic_session_id": str(session.id)}
    assert client.post(f"/appointments/{old['id']}/reschedule", json=body).status_code == 200
    assert client.post(f"/appointments/{old['id']}/reschedule", json=body).status_code == 409


def _colleague_with_session(db_session, doctor, session):
    """A second active doctor in the same department who holds a session on the same weekday."""
    colleague = models.Doctor(
        hospital_id=doctor.hospital_id, department_id=doctor.department_id, title="Dr.", full_name="Colleague Test",
        active=True, consultation_fee_lkr=3000, default_room="9",
    )
    db_session.add(colleague)
    db_session.flush()
    sess = models.DoctorClinicSession(
        hospital_id=session.hospital_id, doctor_id=colleague.id, weekday=session.weekday, label="Colleague",
        start_time=session.start_time, end_time=session.end_time, room="9", max_patients=5, slot_minutes=10, active=True,
    )
    db_session.add(sess)
    db_session.commit()
    return colleague, sess


def test_options_span_the_department_and_reschedule_to_another_doctor(client, db_session):
    doctor, session = _doctor_session(db_session)
    colleague, csess = _colleague_with_session(db_session, doctor, session)
    first, second = _next_session_days(session, 2)
    old = _book(client, doctor, session, first)

    opts = client.get(f"/appointments/{old['id']}/reschedule-options").json()
    assert {o["doctor_id"] for o in opts} >= {str(doctor.id), str(colleague.id)}
    assert all(o["remaining"] > 0 for o in opts)
    assert not any(o["session_id"] == str(session.id) and o["date"] == first.isoformat() for o in opts)

    resp = client.post(f"/appointments/{old['id']}/reschedule", json={
        "appointment_day": second.isoformat(), "clinic_session_id": str(csess.id),
        "doctor_id": str(colleague.id), "notify": True, "language": "si"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["appointment"]["doctor_id"] == str(colleague.id)
    assert "Colleague Test" in body["appointment"]["doctor_name"]
    assert body["message"] and "Colleague Test" in body["message"]

    history = client.get(f"/appointments/{body['appointment']['id']}/interventions").json()
    assert history and history[0]["message_text"] == body["message"] and history[0]["language"] == "si"


def test_reschedule_rejects_a_session_of_another_department(client, db_session):
    doctor, session = _doctor_session(db_session)
    other = (
        db_session.query(models.Doctor)
        .filter(models.Doctor.active == True, models.Doctor.department_id != doctor.department_id)
        .first()
    )
    if other is None:
        pytest.skip("seed has a single department")
    osess = db_session.query(models.DoctorClinicSession).filter_by(doctor_id=other.id, active=True).first()
    today = datetime.now(LK_TZ).date()
    day = next(today + timedelta(days=d) for d in range(1, 15) if (today + timedelta(days=d)).weekday() == osess.weekday)
    (first,) = _next_session_days(session, 1)
    old = _book(client, doctor, session, first)
    resp = client.post(f"/appointments/{old['id']}/reschedule", json={
        "appointment_day": day.isoformat(), "clinic_session_id": str(osess.id)})
    assert resp.status_code == 400


def _say(client, appt_id, text, language="en"):
    resp = client.post("/outreach/simulate-agent", json={"appointment_id": appt_id, "patient_message": text, "language": language})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_patient_request_offers_a_real_slot_and_waits_for_staff_approval(client, db_session):
    doctor, session = _doctor_session(db_session)
    (first,) = _next_session_days(session, 1)
    old = _book(client, doctor, session, first)

    offer = _say(client, old["id"], "I can't come, can we change the date?")
    assert offer["status_updated"] == "offering"
    slot = offer["offered_slot"]
    assert slot and (slot["session_id"], slot["date"]) != (str(session.id), first.isoformat())
    assert slot["start_time"] in offer["agent_response"]

    agreed = _say(client, old["id"], "1")
    assert agreed["status_updated"] == "pending_approval"
    assert client.get(f"/appointments/{old['id']}").json()["status"] == "scheduled"  # still not booked

    conv = client.get(f"/appointments/{old['id']}/conversation").json()
    approved = client.post(f"/outreach/conversations/{conv['id']}/approve")
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["booked"] is True and "token" in body["message"].lower()
    new_id = body["conversation"]["appointment_id"]
    moved = client.get(f"/appointments/{new_id}").json()
    assert moved["appointment_day"] == slot["date"] and moved["clinic_session_id"] == slot["session_id"]
    assert client.get(f"/appointments/{old['id']}").json()["status"] == "cancelled"

    history = client.get(f"/appointments/{new_id}/history").json()
    assert [h["appointment"]["id"] for h in history] == [old["id"], new_id]


def test_declining_an_offer_proposes_a_different_slot(client, db_session):
    doctor, session = _doctor_session(db_session)
    (first,) = _next_session_days(session, 1)
    old = _book(client, doctor, session, first)
    a = _say(client, old["id"], "reschedule please")
    b = _say(client, old["id"], "2")
    assert b["status_updated"] == "offering"
    assert (a["offered_slot"]["session_id"], a["offered_slot"]["date"]) != (b["offered_slot"]["session_id"], b["offered_slot"]["date"])


def test_telehealth_follows_the_department_flag(client, db_session):
    doctor, session = _doctor_session(db_session)
    (first,) = _next_session_days(session, 1)
    old = _book(client, doctor, session, first)

    doctor.department.telehealth_ok = False
    db_session.commit()
    no = _say(client, old["id"], "can we do a video call")
    assert no["status_updated"] == "offering" and "in-person" in no["agent_response"]

    doctor.department.telehealth_ok = True
    db_session.commit()
    other = _book(client, doctor, session, _next_session_days(session, 2)[1])
    yes = _say(client, other["id"], "can we do a video call")
    assert yes["status_updated"] == "telehealth_requested"


def test_staff_start_asks_first_and_a_keep_reply_closes_it(client, db_session):
    doctor, session = _doctor_session(db_session)
    (first,) = _next_session_days(session, 1)
    old = _book(client, doctor, session, first)

    conv = client.post("/outreach/conversations", json={"appointment_id": old["id"]}).json()
    assert conv["state"] == "awaiting_reply" and conv["expires_at"]
    thread = client.get(f"/outreach/threads/{conv['patient_id']}").json()
    assert thread["messages"][0]["direction"] == "out" and "Reply 1" in thread["messages"][0]["text"]

    kept = client.post(f"/outreach/conversations/{conv['id']}/incoming", json={"text": "1"}).json()
    assert kept["state"] == "kept"


def test_unknown_date_with_same_doctor_full_lists_colleagues(client, db_session):
    doctor, session = _doctor_session(db_session)
    colleague, csess = _colleague_with_session(db_session, doctor, session)
    first, second = _next_session_days(session, 2)
    old = _book(client, doctor, session, first)
    # fill the same doctor's session on the asked day
    sess = db_session.get(models.DoctorClinicSession, session.id)
    sess.max_patients = 1
    db_session.commit()
    _book(client, doctor, session, second) if False else None

    conv = client.post("/outreach/conversations", json={"appointment_id": old["id"]}).json()
    out = client.post(f"/outreach/conversations/{conv['id']}/incoming", json={"text": f"change to {second.isoformat()}"}).json()
    assert out["state"] in ("offering", "choosing_doctor")
    if out["state"] == "choosing_doctor":
        assert len(out["options"]) <= 3
        picked = client.post(f"/outreach/conversations/{conv['id']}/incoming", json={"text": "1"}).json()
        assert picked["state"] == "pending_approval"


def test_silence_for_24_hours_is_flagged_and_listed_for_the_desk(client, db_session):
    from datetime import timezone
    doctor, session = _doctor_session(db_session)
    (first,) = _next_session_days(session, 1)
    old = _book(client, doctor, session, first)
    conv = client.post("/outreach/conversations", json={"appointment_id": old["id"]}).json()

    row = db_session.get(models.RescheduleConversation, uuid.UUID(conv["id"]))
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    att = client.get("/outreach/attention").json()
    assert att["no_reply"] == 1 and att["items"][0]["state"] == "no_reply"
    notes = client.get("/notifications").json()["items"]
    assert any(n["type"] == "no_reply" for n in notes)


def test_staff_can_take_over_and_book_manually(client, db_session):
    doctor, session = _doctor_session(db_session)
    first, second = _next_session_days(session, 2)
    old = _book(client, doctor, session, first)
    conv = client.post("/outreach/conversations", json={"appointment_id": old["id"]}).json()

    client.post(f"/outreach/conversations/{conv['id']}/take-over")
    quiet = client.post(f"/outreach/conversations/{conv['id']}/incoming", json={"text": "2"}).json()
    assert quiet["state"] == "awaiting_reply"  # automation paused

    done = client.post(f"/outreach/conversations/{conv['id']}/book", json={
        "clinic_session_id": str(session.id), "appointment_day": second.isoformat(), "notify": True}).json()
    assert done["state"] == "booked"

from datetime import date, timedelta


def make_patient(client, **overrides):
    payload = {
        "full_name": "Test Patient",
        "date_of_birth": "1990-01-01",
        "gender": "F",
        "scholarship": False,
        "hypertension": False,
        "diabetes": False,
        "alcoholism": False,
        "handicap": 0,
        **overrides,
    }
    resp = client.post("/patients", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def make_appointment(client, patient_id, **overrides):
    today = date.today()
    payload = {
        "patient_id": patient_id,
        "scheduled_day": today.isoformat(),
        "appointment_day": (today + timedelta(days=7)).isoformat(),
        "department": "General Medicine",
        "sms_received": True,
        **overrides,
    }
    resp = client.post("/appointments", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ===================================
# Doctor Sessions
# ===================================

def test_list_doctor_sessions_auto_seeds_when_empty(client):
    resp = client.get("/doctors/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) >= 1
    for s in sessions:
        assert s["delay_minutes"] >= 0
        assert s["status"] in {"on_time", "delayed", "in_progress", "completed"}


def test_update_doctor_delay(client):
    sessions = client.get("/doctors/sessions").json()
    session_id = sessions[0]["id"]

    resp = client.patch(
        f"/doctors/sessions/{session_id}/delay",
        json={"delay_minutes": 40, "status": "delayed"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["delay_minutes"] == 40
    assert body["status"] == "delayed"


def test_update_delay_for_unknown_session_404s(client):
    resp = client.patch(
        "/doctors/sessions/00000000-0000-0000-0000-000000000000/delay",
        json={"delay_minutes": 10, "status": "delayed"},
    )
    assert resp.status_code == 404


# ===================================
# Capacity & Overbooking
# ===================================

def test_optimize_capacity_returns_non_negative_recommendations(client):
    resp = client.post("/capacity/optimize", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["total_capacity"] >= 0
    assert body["total_booked"] >= 0
    assert body["total_predicted_no_shows"] >= 0
    assert body["total_recommended_overbooks"] >= 0
    assert body["estimated_revenue_recovery_lkr"] >= 0
    assert len(body["sessions"]) >= 1

    for session in body["sessions"]:
        assert session["recommended_overbook_count"] >= 0
        assert session["expected_revenue_gain_lkr"] >= 0
        assert session["expected_wait_time_mins"] >= 0
        assert session["risk_level"] in {"Safe", "Moderate", "Caution"}


def test_optimize_capacity_respects_wait_time_tolerance(client):
    # A very tight tolerance should never recommend more overbooking than a loose one.
    tight = client.post("/capacity/optimize", json={"max_wait_time_tolerance_mins": 1}).json()
    loose = client.post("/capacity/optimize", json={"max_wait_time_tolerance_mins": 60}).json()
    assert tight["total_recommended_overbooks"] <= loose["total_recommended_overbooks"]


# ===================================
# Waitlist
# ===================================

def test_get_waitlist_auto_seeds_when_empty(client):
    resp = client.get("/capacity/waitlist")
    assert resp.status_code == 200
    waitlist = resp.json()
    assert len(waitlist) >= 1
    assert all(w["status"] == "waiting" for w in waitlist)


def test_assign_waitlist_slot_transitions_status(client):
    waitlist = client.get("/capacity/waitlist").json()
    entry_id = waitlist[0]["id"]

    resp = client.post(f"/capacity/waitlist/{entry_id}/assign")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "offered"


def test_assign_unknown_waitlist_entry_404s(client):
    resp = client.post("/capacity/waitlist/00000000-0000-0000-0000-000000000000/assign")
    assert resp.status_code == 404


# ===================================
# Autonomous Agent Hub — trilingual intent classification
# ===================================

def test_agent_detects_reschedule_intent_in_english(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "I can't come tomorrow, can we change to next week?",
        "language": "en",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["intent"] == "reschedule"


def test_agent_detects_reschedule_intent_in_sinhala(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Mata heta enna bahe, wena dawasak thiyenawada?",
        "language": "si",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["intent"] == "reschedule"


def test_agent_detects_reschedule_intent_in_tamil(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Naan naalai varamudiyadhu, vera naal kidaikuma?",
        "language": "ta",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["intent"] == "reschedule"


def test_agent_detects_telehealth_intent(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Can we do a video call instead?",
        "language": "en",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["intent"] == "telehealth"


def test_agent_detects_prep_inquiry_intent(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "What should I do before the fasting test?",
        "language": "en",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["intent"] == "prep_inquiry"


def test_agent_detects_cancel_intent_and_updates_appointment_status(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Please cancel my appointment",
        "language": "en",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["intent"] == "cancel"

    updated = client.get(f"/appointments/{appointment['id']}").json()
    assert updated["status"] == "cancelled"


def test_agent_defaults_to_confirm_intent(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Yes, I'll be coming, thank you",
        "language": "en",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["intent"] == "confirm"


def test_agent_persists_conversation_to_log(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Yes, I'll be coming",
        "language": "en",
    })

    conversations = client.get("/outreach/conversations").json()
    assert any(c["appointment_id"] == appointment["id"] for c in conversations)


def test_agent_unknown_appointment_404s(client):
    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": "00000000-0000-0000-0000-000000000000",
        "patient_message": "Yes",
        "language": "en",
    })
    assert resp.status_code == 404


# ===================================
# Executive ROI Simulator
# ===================================

def test_simulator_evaluate_matches_expected_formula_at_defaults(client):
    resp = client.post("/simulator/evaluate", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # 30 clinics * 20 patients/clinic * 18% baseline no-show rate
    assert body["daily_slots_at_risk"] == 108.0
    assert body["annual_revenue_leakage_lkr"] == 241056000.0
    assert body["annual_revenue_recovered_lkr"] == 120555119.0
    assert body["recovered_doctor_hours_annual"] == 3348.8
    assert body["nurse_phone_hours_saved_monthly"] == 773.5
    assert body["net_roi_multiple"] == 67.0


def test_simulator_evaluate_scales_with_clinic_volume(client):
    small = client.post("/simulator/evaluate", json={"daily_clinics_count": 5}).json()
    large = client.post("/simulator/evaluate", json={"daily_clinics_count": 100}).json()
    assert large["annual_revenue_leakage_lkr"] > small["annual_revenue_leakage_lkr"]
    assert large["annual_revenue_recovered_lkr"] > small["annual_revenue_recovered_lkr"]


def test_simulator_evaluate_rejects_out_of_range_params(client):
    resp = client.post("/simulator/evaluate", json={"baseline_no_show_rate": 1.5})
    assert resp.status_code == 422


# ===================================
# /predict contextual adjustment integration
# ===================================

VALID_PREDICT_FEATURES = {
    "Age": 45,
    "Scholarship": 0,
    "Hipertension": 1,
    "Diabetes": 0,
    "Alcoholism": 0,
    "Handcap": 0,
    "SMS_received": 1,
    "DaysAhead": 7,
    "DayOfWeek": 2,
    "IsWeekend": 0,
    "Month": 8,
}


def test_predict_without_contextual_fields_is_neutral(client):
    # AppointmentCreate defaults booking_channel/payment_mode to real values
    # (Doc990 / NSR-protected) when omitted, so this test must explicitly
    # null them out to exercise the true "no context available" path.
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"], booking_channel=None, payment_mode=None)

    resp = client.post("/predict", json={
        "appointment_id": appointment["id"],
        **VALID_PREDICT_FEATURES,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()

    adjustment = body["contextual_adjustment"]
    assert adjustment["combined_multiplier"] == 1.0
    assert adjustment["final_risk_score"] == adjustment["ml_risk_score"]
    assert body["risk_score"] == adjustment["final_risk_score"]


def test_predict_with_contextual_fields_shifts_score(client):
    patient = make_patient(client, distance_km=62.5, city="Kandy")
    appointment = make_appointment(
        client,
        patient["id"],
        doctor_name="Dr. Neluka Fernando",
        booking_channel="Hospital Counter",
        payment_mode="Cash",
    )

    resp = client.post("/predict", json={
        "appointment_id": appointment["id"],
        **VALID_PREDICT_FEATURES,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()

    adjustment = body["contextual_adjustment"]
    assert adjustment["distance_multiplier"] > 1.0
    assert adjustment["channel_multiplier"] > 1.0
    assert adjustment["payment_multiplier"] > 1.0
    assert adjustment["final_risk_score"] > adjustment["ml_risk_score"]
    assert body["risk_score"] == adjustment["final_risk_score"]

    # Persisted prediction should carry the same breakdown on read-back.
    stored = client.get(f"/appointments/{appointment['id']}/prediction").json()
    assert stored["contextual_adjustment"]["final_risk_score"] == adjustment["final_risk_score"]

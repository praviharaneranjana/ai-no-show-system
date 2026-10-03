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

def test_optimize_capacity_empty_day_is_honest(client):
    resp = client.post("/capacity/optimize", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_capacity"] == 0  # no booked sessions -> no invented capacity
    assert body["total_booked"] == 0
    assert body["sessions"] == []
    assert body["total_recommended_overbooks"] == 0


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
    appointment = make_appointment(client, patient["id"], department="Psychiatry")

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Can we do a video call instead?",
        "language": "en",
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["intent"] == "telehealth"
    assert "video telehealth" in body["agent_response"].lower()
    assert "https://telehealth" in body["agent_response"]


def test_agent_guards_against_telehealth_for_physical_specialties(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"], department="Orthopedics", doctor_name="Dr. Anura Jayasinghe")

    resp = client.post("/outreach/simulate-agent", json={
        "appointment_id": appointment["id"],
        "patient_message": "Can we do a video call instead?",
        "language": "en",
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["intent"] == "telehealth"
    # Clinical guardrail must explain physical exam requirement and offer in-person reschedule
    assert "physical examination" in body["agent_response"].lower()
    assert "cannot be conducted virtually" in body["agent_response"].lower()
    assert "Telehealth Ineligible" in body["action_executed"]


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

def test_simulator_evaluate_is_empty_without_history(client):
    resp = client.post("/simulator/evaluate", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["empty"] is True
    assert body["assumptions"]["intervention_efficacy"] == 0.3


def test_simulator_evaluate_rejects_out_of_range_params(client):
    assert client.post("/simulator/evaluate", json={"contact_fraction": 1.5}).status_code == 422
    assert client.post("/simulator/evaluate", json={"intervention_efficacy": -0.1}).status_code == 422


# ===================================
# /predict (SHAI model: features derived server-side)
# ===================================

def test_predict_is_model_native_without_contextual_layer(client):
    patient = make_patient(client, distance_km=62.5, city="Kandy")
    appointment = make_appointment(client, patient["id"], booking_channel="Hospital Counter", payment_mode="Cash")

    resp = client.post("/predict", json={"appointment_id": appointment["id"]})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["contextual_adjustment"] is None
    assert 0.0 <= body["risk_score"] <= 1.0
    # SHAP features come from the SHAI schema, not the legacy Kaggle columns.
    assert {c["feature"] for c in body["explanation"]} <= set(shai_model_columns())

    stored = client.get(f"/appointments/{appointment['id']}/prediction").json()
    assert stored["risk_score"] == body["risk_score"]
    assert stored["contextual_adjustment"] is None


def test_predict_uses_visit_history_and_heavy_rain(client):
    patient = make_patient(client)
    # Three past no-shows on record for this patient.
    for days_ago in (90, 60, 30):
        past = client.post("/appointments", json={
            "patient_id": patient["id"],
            "scheduled_day": (date.today() - timedelta(days=days_ago + 5)).isoformat(),
            "appointment_day": (date.today() - timedelta(days=days_ago)).isoformat(),
        }).json()
        client.patch(f"/appointments/{past['id']}/outcome", json={"no_show": True})
    repeat = make_appointment(client, patient["id"])

    fresh_patient = make_patient(client)
    fresh = make_appointment(client, fresh_patient["id"])

    repeat_score = client.post("/predict", json={"appointment_id": repeat["id"]}).json()["risk_score"]
    fresh_score = client.post("/predict", json={"appointment_id": fresh["id"]}).json()["risk_score"]
    assert repeat_score > fresh_score

    rainy = client.post("/predict", json={"appointment_id": fresh["id"], "heavy_rain": 1}).json()["risk_score"]
    assert rainy >= fresh_score


def shai_model_columns():
    from app.main import shai
    return shai.columns


# ===================================
# Hospital Expenses & CapEx/OpEx Tests
# ===================================

def test_expense_categories_and_expenses_crud(client):
    # 1. Fetch categories (auto-seeded)
    cats_resp = client.get("/expenses/categories")
    assert cats_resp.status_code == 200, cats_resp.text
    cats = cats_resp.json()
    assert len(cats) >= 5
    cat_keys = {c["key"] for c in cats}
    assert "patient_incentives" in cat_keys
    assert "tech_infrastructure" in cat_keys

    # 2. Fetch default expenses (auto-seeded)
    exp_resp = client.get("/expenses")
    assert exp_resp.status_code == 200, exp_resp.text
    expenses = exp_resp.json()
    assert len(expenses) >= 3

    # 3. Create a custom hospital giveaway expense
    incentive_cat = next(c for c in cats if c["key"] == "patient_incentives")
    new_exp_payload = {
        "category_id": incentive_cat["id"],
        "hospital_name": "Colombo Central Hospital",
        "title": "PickMe Free Transport Vouchers for Cardiology Clinics",
        "amount_lkr": 500000.0,
        "recurrence": "annual",
        "is_active": True,
        "notes": "Pilot transport subsidy for elderly cardiac patients",
    }
    create_resp = client.post("/expenses", json=new_exp_payload)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["title"] == "PickMe Free Transport Vouchers for Cardiology Clinics"
    assert created["amount_lkr"] == 500000.0

    # 4. Patch expense (toggle active or edit amount)
    patch_resp = client.patch(f"/expenses/{created['id']}", json={"amount_lkr": 600000.0, "is_active": False})
    assert patch_resp.status_code == 200, patch_resp.text
    updated = patch_resp.json()
    assert updated["amount_lkr"] == 600000.0
    assert updated["is_active"] is False

    # 5. Delete expense
    del_resp = client.delete(f"/expenses/{created['id']}")
    assert del_resp.status_code == 200, del_resp.text

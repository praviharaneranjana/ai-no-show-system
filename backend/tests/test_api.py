from datetime import date, timedelta

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


def test_root_and_health_are_public(client):
    assert client.get("/").status_code == 200
    health = client.get("/health").json()
    assert health["status"] == "ok"
    assert health["database"] == "ok"


def test_protected_endpoint_requires_api_key(client):
    client.headers.pop("X-API-Key", None)
    resp = client.get("/patients")
    assert resp.status_code == 401


def test_patient_and_appointment_crud(client):
    patient = make_patient(client, full_name="Alice")
    assert patient["full_name"] == "Alice"

    fetched = client.get(f"/patients/{patient['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == patient["id"]

    appointment = make_appointment(client, patient["id"])
    assert appointment["patient_id"] == patient["id"]
    assert appointment["status"] == "scheduled"

    listed = client.get(f"/appointments?patient_id={patient['id']}")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_create_appointment_for_unknown_patient_404s(client):
    resp = make_appointment_expect_status(client, "00000000-0000-0000-0000-000000000000")
    assert resp == 404


def make_appointment_expect_status(client, patient_id):
    resp = client.post("/appointments", json={
        "patient_id": patient_id,
        "scheduled_day": date.today().isoformat(),
        "appointment_day": (date.today() + timedelta(days=1)).isoformat(),
    })
    return resp.status_code


def test_predict_persists_and_can_be_read_back(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    predict_resp = client.post("/predict", json={
        "appointment_id": appointment["id"],
        **VALID_PREDICT_FEATURES,
    })
    assert predict_resp.status_code == 200, predict_resp.text
    body = predict_resp.json()
    assert 0.0 <= body["risk_score"] <= 1.0
    assert body["risk_category"] in {"Low", "Medium", "High"}
    assert len(body["explanation"]) <= 6

    stored = client.get(f"/appointments/{appointment['id']}/prediction")
    assert stored.status_code == 200
    stored_body = stored.json()
    assert stored_body["risk_score"] == body["risk_score"]
    assert stored_body["appointment_id"] == appointment["id"]


def test_predict_twice_updates_existing_row_instead_of_erroring(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    for _ in range(2):
        resp = client.post("/predict", json={
            "appointment_id": appointment["id"],
            **VALID_PREDICT_FEATURES,
        })
        assert resp.status_code == 200


def test_predict_unknown_appointment_404s(client):
    resp = client.post("/predict", json={
        "appointment_id": "00000000-0000-0000-0000-000000000000",
        **VALID_PREDICT_FEATURES,
    })
    assert resp.status_code == 404


def test_get_prediction_for_appointment_without_one_404s(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])
    resp = client.get(f"/appointments/{appointment['id']}/prediction")
    assert resp.status_code == 404


def test_predict_rejects_out_of_range_handcap(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])
    bad_features = {**VALID_PREDICT_FEATURES, "Handcap": 5}
    resp = client.post("/predict", json={
        "appointment_id": appointment["id"],
        **bad_features,
    })
    assert resp.status_code == 422


def test_record_appointment_outcome_no_show(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.patch(f"/appointments/{appointment['id']}/outcome", json={"no_show": True})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["no_show"] is True
    assert body["status"] == "no_show"


def test_record_appointment_outcome_attended(client):
    patient = make_patient(client)
    appointment = make_appointment(client, patient["id"])

    resp = client.patch(f"/appointments/{appointment['id']}/outcome", json={"no_show": False})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["no_show"] is False
    assert body["status"] == "completed"


def test_record_outcome_for_unknown_appointment_404s(client):
    resp = client.patch(
        "/appointments/00000000-0000-0000-0000-000000000000/outcome",
        json={"no_show": True},
    )
    assert resp.status_code == 404


def test_appointments_overview_joins_patient_and_prediction_and_windows_by_date(client):
    patient = make_patient(client)
    recent = make_appointment(client, patient["id"])
    client.post("/predict", json={"appointment_id": recent["id"]})
    old = client.post("/appointments", json={
        "patient_id": patient["id"],
        "scheduled_day": (date.today() - timedelta(days=400)).isoformat(),
        "appointment_day": (date.today() - timedelta(days=395)).isoformat(),
    }).json()

    resp = client.get("/appointments/overview?days_back=30")
    assert resp.status_code == 200, resp.text
    rows = {r["appointment"]["id"]: r for r in resp.json()}
    assert recent["id"] in rows and old["id"] not in rows
    row = rows[recent["id"]]
    assert row["patient"]["id"] == patient["id"]
    assert row["prediction"]["risk_category"] in {"Low", "Medium", "High"}

    wide = {r["appointment"]["id"] for r in client.get("/appointments/overview?days_back=500").json()}
    assert old["id"] in wide

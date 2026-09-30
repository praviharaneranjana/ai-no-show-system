from tests.test_shai_endpoints import make_appointment, make_patient


def test_appointment_interventions_lists_only_that_appointments_logs_newest_first(client):
    patient = make_patient(client)
    mine = make_appointment(client, patient["id"])
    other = make_appointment(client, patient["id"])

    for text in ("Can't make it", "Yes I will come"):
        assert client.post("/outreach/simulate-agent", json={
            "appointment_id": mine["id"], "patient_message": text, "language": "en",
        }).status_code == 200
    client.post("/outreach/simulate-agent", json={
        "appointment_id": other["id"], "patient_message": "Confirm", "language": "en",
    })

    resp = client.get(f"/appointments/{mine['id']}/interventions")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 2
    assert {r["appointment_id"] for r in rows} == {mine["id"]}
    assert rows[0]["created_at"] >= rows[1]["created_at"]


def test_appointment_interventions_empty_and_404(client):
    patient = make_patient(client)
    appt = make_appointment(client, patient["id"])
    assert client.get(f"/appointments/{appt['id']}/interventions").json() == []
    resp = client.get("/appointments/00000000-0000-0000-0000-000000000000/interventions")
    assert resp.status_code == 404

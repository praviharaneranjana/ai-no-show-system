from datetime import date, datetime, timedelta, time
import uuid
import zoneinfo
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.services.uhid import LK_TZ
from seed_reference import seed_departments, seed_doctors_and_sessions, seed_locations
from seed_his import seed_his_appointments
from app.his.connector import SimulatedHISConnector, HttpHISConnector, HISAppointmentPayload


@pytest.fixture(autouse=True)
def ensure_reference_data(db_session: Session):
    dept_map = seed_departments(db_session)
    seed_doctors_and_sessions(db_session, dept_map)
    if db_session.query(models.Location).count() == 0:
        seed_locations(db_session)


def test_his_status_endpoint(client: TestClient, db_session: Session):
    response = client.get("/his/status")
    assert response.status_code == 200
    data = response.json()
    assert "connector_type" in data
    assert "connector_healthy" in data
    assert data["connector_healthy"] is True
    assert "total_his_records" in data
    assert "synced_appointments_today" in data


def test_his_sync_and_idempotency(client: TestClient, db_session: Session):
    today_lk = datetime.now(LK_TZ).date()

    # Seed mock HIS appointments for today
    seed_his_appointments(db_session, target_date=today_lk)

    # First sync
    res1 = client.post(f"/his/sync?date={today_lk.isoformat()}")
    assert res1.status_code == 200, res1.text
    d1 = res1.json()
    assert d1["status"] == "done"
    assert d1["fetched"] > 0
    assert d1["created"] > 0
    created_first = d1["created"]

    # Verify appointments in SHAI
    appts = (
        db_session.query(models.Appointment)
        .filter(
            models.Appointment.source == "his_sync",
            models.Appointment.appointment_day == today_lk,
        )
        .all()
    )
    assert len(appts) >= created_first

    # Verify each synced appointment has an event 'synced_from_his'
    sample_appt = appts[0]
    event = (
        db_session.query(models.AppointmentEvent)
        .filter_by(appointment_id=sample_appt.id)
        .first()
    )
    assert event is not None
    assert event.event_type == "synced_from_his"

    # Second sync: MUST BE IDEMPOTENT (0 created)
    res2 = client.post(f"/his/sync?date={today_lk.isoformat()}")
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["status"] == "done"
    assert d2["created"] == 0
    assert d2["unchanged"] + d2["updated"] == d1["fetched"]


def test_his_simulate_arrivals_and_resync(client: TestClient, db_session: Session):
    today_lk = datetime.now(LK_TZ).date()
    seed_his_appointments(db_session, target_date=today_lk)

    # Initial sync
    client.post(f"/his/sync?date={today_lk.isoformat()}")

    # Simulate arrivals
    sim_res = client.post("/his/simulate/arrivals?count=3")
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data["marked_arrived_count"] >= 1
    arrived_refs = sim_data["external_refs"]

    # Re-sync to ingest arrival status
    sync_res = client.post(f"/his/sync?date={today_lk.isoformat()}")
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["updated"] >= len(arrived_refs)

    # Verify arrived status in SHAI appointments
    for ref in arrived_refs:
        appt = db_session.query(models.Appointment).filter_by(external_ref=ref).first()
        assert appt is not None
        assert appt.status == "arrived"


def test_simulated_connector_post_outcome(db_session: Session):
    today_lk = datetime.now(LK_TZ).date()
    seed_his_appointments(db_session, target_date=today_lk)

    connector = SimulatedHISConnector(db=db_session)
    appts = connector.fetch_appointments(today_lk)
    assert len(appts) > 0

    target = appts[0]
    ok = connector.post_outcome(target.external_ref, "attended")
    assert ok is True

    # Verify in DB
    refreshed = connector.fetch_appointment(target.external_ref)
    assert refreshed is not None
    assert refreshed.his_status == "completed"


def test_http_connector_retry_logic(monkeypatch):
    import httpx
    connector = HttpHISConnector(api_url="http://fake-his.local/api")

    attempts = 0

    def mock_request(self, method, url, **kwargs):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise httpx.RequestError("Simulated network timeout", request=httpx.Request("GET", url))
        return httpx.Response(200, json=[{
            "external_ref": "HTTP-001",
            "his_patient_ref": "PAT-001",
            "patient_name": "Mock Patient",
            "date_of_birth": "1990-01-01",
            "doctor_code": "D-001",
            "doctor_name": "Rohan Perera",
            "department": "Cardiology",
            "appointment_date": "2026-10-01",
            "appointment_time": "10:00:00",
            "booked_on": "2026-09-25",
            "token_no": 1,
            "his_status": "booked",
        }], request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.Client, "request", mock_request)

    res = connector.fetch_appointments(date(2026, 10, 1))
    assert attempts == 3
    assert len(res) == 1
    assert res[0].external_ref == "HTTP-001"


def test_his_test_connection_endpoint(client: TestClient, db_session: Session):
    response = client.post("/his/test-connection")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["mode"] == "simulated"
    assert "latency_ms" in data
    assert data["status_code"] == 200
    assert len(data["checks"]) >= 4
    for check in data["checks"]:
        assert check["status"] in ("passed", "warning")


def test_his_test_connection_simulate_error(client: TestClient):
    response = client.post("/his/test-connection?simulate_error=true")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert data["status_code"] == 503
    assert any(check["status"] == "failed" for check in data["checks"])

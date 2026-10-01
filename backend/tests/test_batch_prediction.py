from datetime import date, datetime, timedelta
import uuid
import zoneinfo
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.services.uhid import LK_TZ
from seed_reference import seed_departments, seed_doctors_and_sessions, seed_locations
from seed_his import seed_his_appointments
from app.services.his_sync import sync_day
from app.services.prediction_runner import run_predictions


@pytest.fixture(autouse=True)
def setup_test_data(db_session: Session):
    dept_map = seed_departments(db_session)
    seed_doctors_and_sessions(db_session, dept_map)
    if db_session.query(models.Location).count() == 0:
        seed_locations(db_session)


def test_batch_prediction_run_sync(client: TestClient, db_session: Session):
    today_lk = datetime.now(LK_TZ).date()

    # Seed HIS and sync into SHAI
    seed_his_appointments(db_session, target_date=today_lk)
    sync_day(today_lk, db_session)

    # Trigger synchronous prediction run
    payload = {
        "run_date": today_lk.isoformat(),
        "with_sync": False,
        "heavy_rain": False,
    }
    response = client.post("/predictions/runs?run_sync=true", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "done"
    assert data["stage"] == "completed"
    assert data["total"] > 0
    assert data["scored"] == data["total"]
    assert data["percent_complete"] == 100.0

    run_id = data["id"]

    # Poll run status endpoint
    poll_res = client.get(f"/predictions/runs/{run_id}")
    assert poll_res.status_code == 200
    poll_data = poll_res.json()
    assert poll_data["id"] == run_id
    assert poll_data["status"] == "done"
    assert poll_data["scored"] > 0
    assert poll_data["percent_complete"] == 100.0


def test_predictions_today_composite(client: TestClient, db_session: Session):
    today_lk = datetime.now(LK_TZ).date()

    # Seed and sync
    seed_his_appointments(db_session, target_date=today_lk)
    sync_day(today_lk, db_session)

    # Run predictions
    client.post("/predictions/runs?run_sync=true", json={"run_date": today_lk.isoformat()})

    # Call composite Hub endpoint
    res = client.get(f"/predictions/today?date={today_lk.isoformat()}")
    assert res.status_code == 200, res.text
    hub = res.json()

    # KPI assertions
    kpis = hub["kpis"]
    assert kpis["total_appointments"] > 0
    assert kpis["scored_count"] == kpis["total_appointments"]
    assert kpis["high_risk_count"] + kpis["medium_risk_count"] + kpis["low_risk_count"] == kpis["scored_count"]
    assert 0.0 <= kpis["average_no_show_risk"] <= 1.0

    # By doctor assertions
    by_doctor = hub["by_doctor"]
    assert len(by_doctor) > 0
    doc0 = by_doctor[0]
    assert "doctor_id" in doc0
    assert "doctor_name" in doc0
    assert "department" in doc0
    assert doc0["total"] > 0
    assert len(doc0["appointments"]) > 0

    # Appointment item assertions
    appt0 = doc0["appointments"][0]
    assert "appointment_id" in appt0
    assert "patient_name" in appt0
    assert appt0["uhid"].startswith("SHAI-")
    assert appt0["risk_score"] is not None
    assert appt0["risk_category"] in ["High", "Medium", "Low", "high", "medium", "low"]
    assert isinstance(appt0["top_reasons"], list)
    assert len(appt0["actions_available"]) >= 2

    # Sync status assertions
    sync_status = hub["sync_status"]
    assert "last_sync_timestamp" in sync_status
    assert "source" in sync_status
    assert "is_stale" in sync_status

    # Last run assertions
    assert hub["last_run"] is not None
    assert hub["last_run"]["status"] == "done"

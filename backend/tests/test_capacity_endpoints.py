"""Integration tests for Capacity v2 API endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


def test_capacity_nav_counts_endpoint(client):
    """G10: GET /capacity/nav-counts returns live waitlist and outreach counts."""
    response = client.get("/capacity/nav-counts")
    assert response.status_code == 200
    data = response.json()
    assert "waitlist_waiting" in data
    assert "high_risk_open" in data
    assert "unscored_today" in data
    assert isinstance(data["waitlist_waiting"], int)


def test_capacity_overview_endpoint(client):
    """Test GET /capacity/overview endpoint returns valid schema."""
    response = client.get("/capacity/overview")
    assert response.status_code == 200
    data = response.json()
    assert "total_capacity" in data
    assert "total_booked" in data
    assert "total_predicted_no_shows" in data
    assert "total_recommended_overbooks" in data
    assert "booked_utilisation_pct" in data
    assert "expected_attendance_pct" in data
    assert "sessions" in data


def test_capacity_slots_endpoint(client):
    """Test Feature A: GET /capacity/slots."""
    response = client.get("/capacity/slots")
    assert response.status_code == 200
    data = response.json()
    assert "date" in data
    assert "doctors" in data


def test_what_if_endpoint(client):
    """Test Feature B: POST /capacity/what-if."""
    payload = {
        "max_wait_time_tolerance_mins": 15,
        "safety_factor": 0.75,
        "max_overbook_per_slot": 2,
        "consultation_fee_lkr": 4500.0,
        "assume_doctor_delay_mins": 10,
    }
    response = client.post("/capacity/what-if", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "current_policy" in data
    assert "what_if_policy" in data
    assert "delta_overbook" in data
    assert "wait_histogram" in data
    assert "trade_off_curve" in data


def test_forecast_endpoint(client):
    """Test Feature D: GET /capacity/forecast."""
    response = client.get("/capacity/forecast?horizon=7")
    assert response.status_code == 200
    data = response.json()
    assert data["horizon_days"] == 7
    assert len(data["days"]) == 7
    assert "summary" in data


def test_accuracy_endpoint_empty_state_without_outcomes(client):
    """GET /capacity/accuracy: no recorded outcomes -> explicit empty state, no invented numbers."""
    response = client.get("/capacity/accuracy")
    assert response.status_code == 200
    data = response.json()
    assert data["empty"] is True
    assert data["n_evaluated"] == 0
    assert "roc_auc" not in data and "brier" not in data



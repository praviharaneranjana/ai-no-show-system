import os
import uuid
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app import models
from app.main import app
from app.services.uhid import LK_TZ
import seed_reference


@pytest.fixture(autouse=True)
def setup_reference_data(db_session):
    dept_map = seed_reference.seed_departments(db_session)
    seed_reference.seed_doctors_and_sessions(db_session, dept_map)
    if db_session.query(models.Location).count() == 0:
        seed_reference.seed_locations(db_session)


def test_get_departments(client: TestClient, db_session: Session):
    response = client.get("/departments")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 12
    # Check cardiology
    cardio = next((d for d in data if d["name"] == "Cardiology"), None)
    assert cardio is not None
    assert cardio["doctor_count"] >= 3
    assert cardio["icon"] is not None


def test_get_doctors_department_filter(client: TestClient, db_session: Session):
    # Fetch cardiology department
    cardio_dept = db_session.query(models.Department).filter(models.Department.name == "Cardiology").first()
    assert cardio_dept is not None

    response = client.get(f"/doctors?department_id={cardio_dept.id}")
    assert response.status_code == 200
    doctors = response.json()
    assert len(doctors) >= 3
    for doc in doctors:
        assert doc["department_id"] == cardio_dept.id
        assert doc["department"]["name"] == "Cardiology"
        assert doc["display_name"].startswith("Dr.")

    # Fetch dermatology department
    derma_dept = db_session.query(models.Department).filter(models.Department.name == "Dermatology").first()
    assert derma_dept is not None

    response_derma = client.get(f"/doctors?department_id={derma_dept.id}")
    assert response_derma.status_code == 200
    derma_docs = response_derma.json()
    assert len(derma_docs) >= 3
    # Doctors in cardiology must not be in dermatology
    cardio_ids = {d["id"] for d in doctors}
    for doc in derma_docs:
        assert doc["department_id"] == derma_dept.id
        assert doc["id"] not in cardio_ids


def test_get_doctors_search_query(client: TestClient, db_session: Session):
    # Search for Rohan
    response = client.get("/doctors?q=rohan")
    assert response.status_code == 200
    docs = response.json()
    assert len(docs) >= 1
    assert any("Rohan" in d["full_name"] for d in docs)


def test_doctor_availability(client: TestClient, db_session: Session):
    doctor = db_session.query(models.Doctor).filter(models.Doctor.active == True).first()
    assert doctor is not None

    response = client.get(f"/doctors/{doctor.id}/availability?days=14")
    assert response.status_code == 200
    avail = response.json()
    assert "days" in avail
    assert isinstance(avail["days"], list)
    for day_item in avail["days"]:
        assert "date" in day_item
        assert "sessions" in day_item
        for s in day_item["sessions"]:
            assert "session_id" in s
            assert "max_patients" in s
            assert "booked" in s
            assert "remaining" in s
            assert "next_token" in s
            assert s["remaining"] <= s["max_patients"]
            assert s["next_token"] == s["booked"] + 1


def test_doctor_availability_404(client: TestClient):
    fake_id = uuid.uuid4()
    response = client.get(f"/doctors/{fake_id}/availability")
    assert response.status_code == 404


def test_locations_search_nugegoda_first(client: TestClient, db_session: Session):
    # Ensure Nugegoda is in DB
    loc = db_session.query(models.Location).filter(models.Location.name_norm == "nugegoda").first()
    if not loc:
        db_session.add(
            models.Location(
                name="Nugegoda",
                name_norm="nugegoda",
                district="Colombo",
                province="Western",
                kind="town",
                latitude=6.8649,
                longitude=79.8997,
                population=60000,
                aliases=["nugegoda"],
                source="geonames",
            )
        )
        db_session.commit()

    response = client.get("/locations?q=nug&limit=8")
    assert response.status_code == 200
    results = response.json()
    assert len(results) >= 1
    assert results[0]["name"] == "Nugegoda"
    assert "Colombo District" in results[0]["label"]


def test_distance_calculation_estimate(client: TestClient, monkeypatch):
    monkeypatch.setenv("ROUTING", "estimate")
    # Nugegoda: (6.8649, 79.8997)
    payload = {"latitude": 6.8649, "longitude": 79.8997}
    response = client.post("/distance", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "estimated"
    # Straight-line ~ 7 km, estimated with 1.3x road factor is approx 9 - 11 km
    assert 8.0 <= data["distance_km"] <= 14.0


def test_distance_calculation_osrm_mock(client: TestClient, monkeypatch):
    monkeypatch.setenv("ROUTING", "osrm")
    fake_response = MagicMock()
    fake_response.status = 200
    fake_response.read.return_value = b'{"routes": [{"distance": 11400.0}]}'
    fake_response.__enter__.return_value = fake_response

    with patch("urllib.request.urlopen", return_value=fake_response):
        payload = {"latitude": 6.8649, "longitude": 79.8997}
        response = client.post("/distance", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "road_osrm"
        assert data["distance_km"] == 11.4


def test_geocode_location_local_mode(client: TestClient, monkeypatch):
    monkeypatch.setenv("GEOCODER", "local")
    response = client.get("/locations/geocode?q=Colombo")
    assert response.status_code == 200
    assert response.json() == []

"""Comprehensive tests proving multi-hospital data isolation, role-based access,
domain resolution, registration approval workflows, and hospital profile endpoints.
"""
import uuid
from datetime import date, timedelta

import pytest
from app import models, security
from tests.conftest import TEST_PASSWORD, make_user, token_for

HOSPITAL_A_ID = uuid.UUID("a0000000-0000-0000-0000-000000000001")
HOSPITAL_B_ID = uuid.UUID("a0000000-0000-0000-0000-000000000002")


@pytest.fixture
def setup_tenants(db_session):
    """Ensure two distinct hospitals exist with separate email domains, patients, and appointments."""
    # Hospital A (Asiri)
    hosp_a = db_session.get(models.Hospital, HOSPITAL_A_ID)
    if not hosp_a:
        hosp_a = models.Hospital(
            id=HOSPITAL_A_ID,
            slug="asiri-central-test",
            name="Asiri Central Hospital",
            short_name="Asiri",
            is_active=True,
        )
        db_session.add(hosp_a)

    dom_a = db_session.query(models.HospitalEmailDomain).filter_by(domain="asiri.lk").first()
    if not dom_a:
        db_session.add(models.HospitalEmailDomain(hospital_id=HOSPITAL_A_ID, domain="asiri.lk", is_primary=True, is_verified=True))

    # Hospital B (NHSL)
    hosp_b = db_session.get(models.Hospital, HOSPITAL_B_ID)
    if not hosp_b:
        hosp_b = models.Hospital(
            id=HOSPITAL_B_ID,
            slug="nhsl-test",
            name="National Hospital of Sri Lanka",
            short_name="NHSL",
            is_active=True,
        )
        db_session.add(hosp_b)

    dom_b = db_session.query(models.HospitalEmailDomain).filter_by(domain="nhsl.health.gov.lk").first()
    if not dom_b:
        db_session.add(models.HospitalEmailDomain(hospital_id=HOSPITAL_B_ID, domain="nhsl.health.gov.lk", is_primary=True, is_verified=True))

    db_session.flush()

    # Patients
    patient_a = models.Patient(
        id=uuid.uuid4(),
        hospital_id=HOSPITAL_A_ID,
        uhid="UHID-A-100",
        full_name="Patient at Asiri",
        date_of_birth=date(1980, 1, 1),
        gender="F",
        city="Colombo 07",
        distance_km=4.0,
    )
    patient_b = models.Patient(
        id=uuid.uuid4(),
        hospital_id=HOSPITAL_B_ID,
        uhid="UHID-B-200",
        full_name="Patient at NHSL",
        date_of_birth=date(1975, 5, 10),
        gender="M",
        city="Kandy",
        distance_km=115.0,
    )
    db_session.add(patient_a)
    db_session.add(patient_b)
    db_session.flush()

    # Appointments
    today = date.today()
    appt_a = models.Appointment(
        id=uuid.uuid4(),
        hospital_id=HOSPITAL_A_ID,
        patient_id=patient_a.id,
        scheduled_day=today - timedelta(days=2),
        appointment_day=today,
        department="Cardiology",
        doctor_name="Dr. Rohan Perera",
        booking_channel="Doc990",
        payment_mode="Cash",
        scheduled_time="10:00",
        queue_number=1,
        status="scheduled",
    )
    appt_b = models.Appointment(
        id=uuid.uuid4(),
        hospital_id=HOSPITAL_B_ID,
        patient_id=patient_b.id,
        scheduled_day=today - timedelta(days=2),
        appointment_day=today,
        department="Cardiology",
        doctor_name="Dr. Jayalath Perera",
        booking_channel="Hospital Counter",
        payment_mode="Government Subsidized",
        scheduled_time="11:00",
        queue_number=1,
        status="scheduled",
    )
    db_session.add(appt_a)
    db_session.add(appt_b)
    db_session.flush()

    return {
        "hosp_a": hosp_a,
        "hosp_b": hosp_b,
        "patient_a": patient_a,
        "patient_b": patient_b,
        "appt_a": appt_a,
        "appt_b": appt_b,
    }


def auth_client_for(raw_client, user, hospital_id):
    """Helper to attach bearer token for a specific user and hospital context."""
    token = security.create_token(
        user_id=str(user.id),
        email=user.email,
        name=user.full_name,
        role=user.role,
        hospital_id=str(hospital_id),
    )
    raw_client.headers["Authorization"] = f"Bearer {token}"
    return raw_client


# ---- Tests: Multi-Hospital Isolation -----------------------------------------
def test_hospital_a_staff_cannot_see_hospital_b_appointments(raw_client, db_session, setup_tenants):
    staff_a = make_user(db_session, role="front_desk", email="staff_a@asiri.lk", hospital_id=HOSPITAL_A_ID)
    client_a = auth_client_for(raw_client, staff_a, HOSPITAL_A_ID)

    # List appointments
    resp = client_a.get("/appointments")
    assert resp.status_code == 200
    appt_ids = [a["id"] for a in resp.json()]

    assert str(setup_tenants["appt_a"].id) in appt_ids
    assert str(setup_tenants["appt_b"].id) not in appt_ids


def test_hospital_b_staff_cannot_see_hospital_a_appointments(raw_client, db_session, setup_tenants):
    staff_b = make_user(db_session, role="front_desk", email="staff_b@nhsl.health.gov.lk", hospital_id=HOSPITAL_B_ID)
    client_b = auth_client_for(raw_client, staff_b, HOSPITAL_B_ID)

    resp = client_b.get("/appointments")
    assert resp.status_code == 200
    appt_ids = [a["id"] for a in resp.json()]

    assert str(setup_tenants["appt_b"].id) in appt_ids
    assert str(setup_tenants["appt_a"].id) not in appt_ids


def test_cross_hospital_direct_appointment_access_is_404(raw_client, db_session, setup_tenants):
    staff_a = make_user(db_session, role="front_desk", email="nurse_a@asiri.lk", hospital_id=HOSPITAL_A_ID)
    client_a = auth_client_for(raw_client, staff_a, HOSPITAL_A_ID)

    # Hospital A staff tries to read Hospital B's appointment by ID
    resp = client_a.get(f"/appointments/{setup_tenants['appt_b'].id}")
    assert resp.status_code == 404


def test_cross_hospital_direct_patient_access_is_404(raw_client, db_session, setup_tenants):
    staff_a = make_user(db_session, role="front_desk", email="desk_a@asiri.lk", hospital_id=HOSPITAL_A_ID)
    client_a = auth_client_for(raw_client, staff_a, HOSPITAL_A_ID)

    # Hospital A staff tries to read Hospital B's patient
    resp = client_a.get(f"/patients/{setup_tenants['patient_b'].id}")
    assert resp.status_code == 404


# ---- Tests: Role Restrictions (Front Desk vs Manager/Analyst) ----------------
def test_front_desk_cannot_access_analytics(raw_client, db_session, setup_tenants):
    front_user = make_user(db_session, role="front_desk", email="reception@asiri.lk", hospital_id=HOSPITAL_A_ID)
    client = auth_client_for(raw_client, front_user, HOSPITAL_A_ID)

    resp = client.get("/analytics/trend")
    assert resp.status_code == 403

    resp2 = client.get("/analytics/revenue-at-risk")
    assert resp2.status_code == 403


def test_front_desk_cannot_access_roi_simulator(raw_client, db_session, setup_tenants):
    front_user = make_user(db_session, role="front_desk", email="reception2@asiri.lk", hospital_id=HOSPITAL_A_ID)
    client = auth_client_for(raw_client, front_user, HOSPITAL_A_ID)

    resp = client.post("/simulator/evaluate", json={"safety_margin": 0.8})
    assert resp.status_code == 403


def test_manager_and_analyst_can_access_analytics_and_simulator(raw_client, db_session, setup_tenants):
    manager_user = make_user(db_session, role="manager", email="ops_manager@asiri.lk", hospital_id=HOSPITAL_A_ID)
    client = auth_client_for(raw_client, manager_user, HOSPITAL_A_ID)

    # Manager can access Analytics Trend
    resp = client.get("/analytics/trend")
    assert resp.status_code == 200

    # Manager can access Simulator
    resp2 = client.post("/simulator/evaluate", json={"safety_margin": 0.8})
    assert resp2.status_code == 200


# ---- Tests: Email Domain Resolution & Registration ----------------------------
def test_resolve_email_domain(raw_client, db_session, setup_tenants):
    # Registered domain
    resp = raw_client.post("/auth/resolve-email", json={"email": "nurse.perera@asiri.lk"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_registered_domain"] is True
    assert data["hospital"]["id"] == str(HOSPITAL_A_ID)
    assert data["requires_manual_hospital_selection"] is False

    # Unregistered personal email (e.g. Gmail)
    resp2 = raw_client.post("/auth/resolve-email", json={"email": "sunil.fernando@gmail.com"})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["is_registered_domain"] is False
    assert data2["requires_manual_hospital_selection"] is True
    assert len(data2["hospitals_available"]) >= 2


def test_registration_creates_pending_membership_and_admin_approves(raw_client, db_session, setup_tenants):
    reg_email = "new_nurse@asiri.lk"
    resp = raw_client.post(
        "/auth/register",
        json={
            "email": reg_email,
            "full_name": "New Nurse Perera",
            "password": "ValidPassword2026!",
            "phone": "+94770001122",
        },
    )
    assert resp.status_code == 201
    reg_data = resp.json()
    assert reg_data["membership_status"] == "pending"

    # With pending status, trying to access private appointments is refused (403)
    pending_token = reg_data["access_token"]
    raw_client.headers["Authorization"] = f"Bearer {pending_token}"
    resp_blocked = raw_client.get("/appointments")
    assert resp_blocked.status_code == 403
    assert "pending administrator approval" in resp_blocked.text

    # However, /auth/me is accessible to show the pending screen
    resp_me = raw_client.get("/auth/me")
    assert resp_me.status_code == 200
    assert resp_me.json()["membership_status"] == "pending"

    # Now Asiri Admin approves the registration
    admin_user = make_user(db_session, role="admin", email="admin@asiri.lk", hospital_id=HOSPITAL_A_ID)
    admin_client = auth_client_for(raw_client, admin_user, HOSPITAL_A_ID)

    # Admin checks pending staff list
    resp_pending = admin_client.get("/admin/staff/pending")
    assert resp_pending.status_code == 200
    pending_list = resp_pending.json()
    nurse_entry = next((e for e in pending_list if e["email"] == reg_email), None)
    assert nurse_entry is not None

    # Admin approves
    resp_approve = admin_client.post(
        f"/admin/staff/{nurse_entry['membership_id']}/approve",
        json={"role": "front_desk"},
    )
    assert resp_approve.status_code == 200
    assert resp_approve.json()["status"] == "active"


# ---- Tests: Hospital Profile & Governance -------------------------------------
def test_hospital_profile_endpoint_returns_real_summary(raw_client, db_session, setup_tenants):
    manager_user = make_user(db_session, role="manager", email="mgr@asiri.lk", hospital_id=HOSPITAL_A_ID)
    client = auth_client_for(raw_client, manager_user, HOSPITAL_A_ID)

    resp = client.get("/hospital")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(HOSPITAL_A_ID)
    assert data["name"] == "Asiri Central Hospital"
    assert "financial_summary" in data
    assert data["financial_summary"]["total_appointments"] >= 1

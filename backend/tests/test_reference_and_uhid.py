import concurrent.futures
import pytest
from sqlalchemy import text
from app import models
from app.services.uhid import generate_uhid
import seed_reference


@pytest.fixture(autouse=True)
def setup_reference_data(db_session):
    dept_map = seed_reference.seed_departments(db_session)
    seed_reference.seed_doctors_and_sessions(db_session, dept_map)
    if db_session.query(models.Location).count() == 0:
        seed_reference.seed_locations(db_session)


def test_generate_uhid_format_and_concurrency(db_session):
    """Test UHID format SHAI-{YY}-{seq:06d} and uniqueness under concurrent calls."""
    uhid1 = generate_uhid(db_session)
    assert uhid1.startswith("SHAI-")
    parts = uhid1.split("-")
    assert len(parts) == 3
    assert len(parts[1]) == 2
    assert len(parts[2]) == 6
    assert parts[2].isdigit()

    # Test 20 concurrent generations
    def get_uhid(_):
        return generate_uhid(db_session)

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(get_uhid, range(20)))

    assert len(results) == 20
    assert len(set(results)) == 20  # All 20 must be completely unique


def test_departments_and_doctors_seeded(db_session):
    """Verify departments and doctor count per department."""
    departments = db_session.query(models.Department).all()
    assert len(departments) >= 17

    modelled_depts = [
        "Cardiology", "Dermatology", "ENT", "Endocrinology", "Gastroenterology",
        "General Medicine", "Gynecology", "Neurology", "Orthopedics", "Pediatrics",
        "Psychiatry", "Urology"
    ]
    unmodelled_depts = ["Oncology", "Ophthalmology", "Nephrology", "Pulmonology", "Radiology & X-ray"]

    for m_dept in modelled_depts:
        dept = db_session.query(models.Department).filter(models.Department.name == m_dept).first()
        assert dept is not None
        assert dept.model_category == m_dept
        doc_count = db_session.query(models.Doctor).filter(models.Doctor.department_id == dept.id).count()
        assert doc_count >= 3, f"Expected >= 3 doctors for {m_dept}, found {doc_count}"

    for u_dept in unmodelled_depts:
        dept = db_session.query(models.Department).filter(models.Department.name == u_dept).first()
        assert dept is not None
        assert dept.model_category is None
        doc_count = db_session.query(models.Doctor).filter(models.Doctor.department_id == dept.id).count()
        assert doc_count >= 2, f"Expected >= 2 doctors for {u_dept}, found {doc_count}"


def test_rohan_perera_only_cardiology(db_session):
    """Rohan Perera must appear ONLY under Cardiology and never be the default for others."""
    cardio_dept = db_session.query(models.Department).filter(models.Department.name == "Cardiology").first()
    rohan = db_session.query(models.Doctor).filter(models.Doctor.full_name == "Rohan Perera").first()
    assert rohan is not None
    assert rohan.department_id == cardio_dept.id


def test_locations_seeded_and_colombo_suburbs(db_session):
    """Verify that locations are populated in DB with Colombo zones and suburbs."""
    count = db_session.query(models.Location).count()
    assert count > 1000

    nugegoda = db_session.query(models.Location).filter(models.Location.name == "Nugegoda").first()
    assert nugegoda is not None
    assert nugegoda.district == "Colombo"
    assert abs(nugegoda.latitude - 6.8649) < 0.05
    assert abs(nugegoda.longitude - 79.8997) < 0.05

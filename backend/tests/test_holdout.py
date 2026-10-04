import uuid
from datetime import datetime, timedelta

import pytest

from app import holdout, models
from app.services.uhid import LK_TZ

HOSPITAL_ID = uuid.UUID("a0000000-0000-0000-0000-000000000001")


def test_arm_is_off_by_default_and_deterministic_when_on(monkeypatch):
    monkeypatch.delenv("OUTREACH_HOLDOUT_PCT", raising=False)
    ids = [uuid.uuid4() for _ in range(200)]
    assert all(holdout.arm_for(i) == "contact" for i in ids)
    monkeypatch.setenv("OUTREACH_HOLDOUT_PCT", "10")
    first = [holdout.arm_for(i) for i in ids]
    assert first == [holdout.arm_for(i) for i in ids]  # same id, same arm


def test_arm_share_matches_the_configured_percentage():
    ids = [uuid.uuid4() for _ in range(20000)]
    share = sum(holdout.arm_for(i, 10.0) == "holdout" for i in ids) / len(ids)
    assert share == pytest.approx(0.10, abs=0.01)
    assert sum(holdout.arm_for(i, 0.0) == "holdout" for i in ids) == 0


def test_analyse_estimates_the_effect_from_both_arms():
    rows = (
        [{"arm": "holdout", "no_show": i < 40, "contacted": False} for i in range(100)]      # 40% no-show
        + [{"arm": "contact", "no_show": i < 30, "contacted": True} for i in range(100)]    # 30% no-show
    )
    out = holdout.analyse(rows, 10.0)
    assert out["difference"]["absolute"] == pytest.approx(0.10)
    assert out["implied_efficacy"]["point"] == pytest.approx(0.25)
    assert out["implied_efficacy"]["ci"][0] < 0.25 < out["implied_efficacy"]["ci"][1]
    assert out["difference"]["significant"] is False  # n=100 per arm is too few to tell


def test_required_sample_size_is_large_for_a_modest_effect():
    n = holdout.required_n_per_arm(0.36, 0.26)
    assert 150 < n < 400
    assert holdout.required_n_per_arm(0.0, 0.26) is None


def test_report_is_off_without_a_percentage(client, monkeypatch):
    monkeypatch.delenv("OUTREACH_HOLDOUT_PCT", raising=False)
    body = client.get("/outreach/holdout/report").json()
    assert body["enabled"] is False and "OUTREACH_HOLDOUT_PCT" in body["message"]


def test_report_compares_arms_and_flags_contamination(client, db_session, monkeypatch):
    monkeypatch.setenv("OUTREACH_HOLDOUT_PCT", "50")
    patient = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="H", date_of_birth=datetime(1990, 1, 1).date(), hospital_id=HOSPITAL_ID)
    db_session.add(patient)
    db_session.flush()
    today = datetime.now(LK_TZ).date()
    appts = []
    for i in range(60):
        day = today - timedelta(days=2 + i % 20)
        a = models.Appointment(patient_id=patient.id, hospital_id=HOSPITAL_ID, scheduled_day=day - timedelta(days=2), appointment_day=day,
                               status="no_show" if i % 3 == 0 else "completed", no_show=(i % 3 == 0), data_source="synthetic")
        db_session.add(a)
        db_session.flush()
        db_session.add(models.Prediction(appointment_id=a.id, risk_score=0.5, risk_category="High", explanation={}, recommendation="x"))
        appts.append(a)
    db_session.flush()
    # contact a holdout appointment: the report must notice the contamination
    contaminated = next(a for a in appts if holdout.arm_for(a.id, 50.0) == "holdout")
    db_session.add(models.Intervention(appointment_id=contaminated.id, hospital_id=HOSPITAL_ID, channel="SMS", language="en", status="sent"))
    db_session.flush()

    body = client.get("/outreach/holdout/report?tiers=High").json()
    assert body["enabled"] is True and body["holdout_pct"] == 50
    assert body["arms"]["contact"]["n"] + body["arms"]["holdout"]["n"] == 60
    assert body["arms"]["holdout"]["n"] > 0 and body["arms"]["contact"]["n"] > 0
    assert body["difference"] is not None
    assert body["contamination_warning"] is True


def test_appointments_expose_their_arm(client, db_session, monkeypatch):
    monkeypatch.setenv("OUTREACH_HOLDOUT_PCT", "50")
    patient = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="A", date_of_birth=datetime(1990, 1, 1).date(), hospital_id=HOSPITAL_ID)
    db_session.add(patient)
    db_session.flush()
    a = models.Appointment(patient_id=patient.id, hospital_id=HOSPITAL_ID, scheduled_day=datetime.now(LK_TZ).date(),
                           appointment_day=datetime.now(LK_TZ).date() + timedelta(days=3), status="scheduled")
    db_session.add(a)
    db_session.flush()
    assert client.get(f"/appointments/{a.id}").json()["outreach_arm"] == holdout.arm_for(a.id, 50.0)

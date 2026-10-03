from datetime import date, timedelta
import uuid

import pytest

from app import models
from app.services import roi


def _rows():
    d1, d2 = date(2026, 9, 1), date(2026, 9, 2)
    return [
        {"day": d1, "risk": 0.9, "no_show": True, "fee": 4000.0},
        {"day": d1, "risk": 0.5, "no_show": False, "fee": 4000.0},
        {"day": d1, "risk": 0.3, "no_show": True, "fee": 6000.0},
        {"day": d1, "risk": 0.1, "no_show": False, "fee": 4000.0},
        {"day": d2, "risk": 0.8, "no_show": False, "fee": 5000.0},
        {"day": d2, "risk": 0.2, "no_show": True, "fee": 5000.0},
    ]


def test_replay_top_k_per_day_vs_random():
    a = roi.replay(_rows(), 0.5)  # day1 contacts top 2 of 4, day2 top 1 of 2
    assert a["contacts"] == 3
    assert a["no_shows"] == 3
    assert a["caught_model"] == 1  # only the 0.9 no-show is in the picked group
    assert a["caught_model_fee_lkr"] == 4000.0
    # random expectation: half of each day's no-shows
    assert a["caught_random"] == pytest.approx(0.5 * 2 + 0.5 * 1)
    assert a["caught_random_fee_lkr"] == pytest.approx(0.5 * 10000 + 0.5 * 5000)


def test_scenario_arithmetic():
    a = roi.replay(_rows(), 0.5)
    sc = roi._scenario(a, efficacy=0.5, value_multiplier=2.0, cost_per_contact=100.0)
    assert sc["recovered_lkr_model"] == pytest.approx(4000 * 0.5 * 2.0)
    assert sc["contact_cost_lkr"] == 300.0
    assert sc["net_lkr_model"] == pytest.approx(4000 - 300)
    assert sc["uplift_vs_random_lkr"] == pytest.approx(4000 - 7500 * 0.5 * 2.0)


def test_annual_expenses_recurrence_and_inactive():
    items = [
        {"amount_lkr": 1000, "recurrence": "monthly", "category_key": "a"},
        {"amount_lkr": 500, "recurrence": "annual", "category_key": "b"},
        {"amount_lkr": 2, "recurrence": "per_patient", "category_key": "b"},
        {"amount_lkr": 9999, "recurrence": "annual", "is_active": False},
    ]
    total, breakdown = roi.annual_expenses(items, contacts_per_year=100)
    assert total == 12000 + 500 + 200
    assert breakdown == {"a": 12000.0, "b": 700.0}


def test_evaluate_from_db_rows(db_session):
    today = date.today()
    pat = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="T", date_of_birth=date(1990, 1, 1))
    db_session.add(pat)
    db_session.flush()
    for i in range(20):
        day = today - timedelta(days=1 + i % 5)
        ns = i % 4 == 0
        appt = models.Appointment(patient_id=pat.id, scheduled_day=day - timedelta(days=2), appointment_day=day,
                                  status="no_show" if ns else "completed", no_show=ns, fee_lkr=4000.0,
                                  data_source="synthetic")
        db_session.add(appt)
        db_session.flush()
        db_session.add(models.Prediction(appointment_id=appt.id, risk_score=0.5 if ns else 0.1,
                                         risk_category="High" if ns else "Low", explanation={}, recommendation="x"))
    db_session.flush()
    out = roi.evaluate(db_session, hospital_id=None, window_days=30, custom_expenses=[])
    assert out["empty"] is False
    assert out["baseline"]["no_show_rate"] == pytest.approx(5 / 20)
    assert out["baseline"]["avg_fee_lkr"] == 4000.0
    assert out["baseline"]["synthetic"] is True
    assert out["replay"]["recall_model"] == pytest.approx(1.0)  # perfect ranking
    assert out["annual"]["fixed_expenses_lkr"] == 0.0
    assert len(out["sensitivity"]["cells"]) == 12
    assert out["annual"]["net_benefit_low_lkr"] <= out["annual"]["net_benefit_lkr"] <= out["annual"]["net_benefit_high_lkr"]
    # random contact never beats a perfect ranking
    assert out["replay"]["recovered_lkr_model"] >= out["replay"]["recovered_lkr_random"]

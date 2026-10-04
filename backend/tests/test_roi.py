from datetime import date, timedelta
import uuid

import pytest

from app import economics, models
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
    assert out["assumptions"]["cost_per_contact_lkr"] == pytest.approx(economics.DEFAULT_COST_PER_CONTACT_LKR)
    assert out["annual"]["net_benefit_low_lkr"] <= out["annual"]["net_benefit_lkr"] <= out["annual"]["net_benefit_high_lkr"]
    # random contact never beats a perfect ranking
    assert out["replay"]["recovered_lkr_model"] >= out["replay"]["recovered_lkr_random"]


def test_cost_per_contact_is_sms_plus_call_share():
    assert economics.cost_per_contact(1.0, 0.0, 3.5, 850.0) == 1.0  # SMS only
    assert economics.cost_per_contact(1.0, 1.0, 6.0, 600.0) == pytest.approx(1.0 + 60.0)  # always a 6 min call
    assert 5 < economics.DEFAULT_COST_PER_CONTACT_LKR < 25  # nowhere near the old flat LKR 50


def test_break_even_efficacy_closes_the_gap(db_session):
    today = date.today()
    pat = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="T", date_of_birth=date(1990, 1, 1))
    db_session.add(pat)
    db_session.flush()
    for i in range(40):
        day = today - timedelta(days=1 + i % 8)
        ns = i % 4 == 0
        appt = models.Appointment(patient_id=pat.id, scheduled_day=day - timedelta(days=2), appointment_day=day,
                                  status="no_show" if ns else "completed", no_show=ns, fee_lkr=2500.0, data_source="synthetic")
        db_session.add(appt)
        db_session.flush()
        db_session.add(models.Prediction(appointment_id=appt.id, risk_score=0.5 if ns else 0.1,
                                         risk_category="High" if ns else "Low", explanation={}, recommendation="x"))
    db_session.flush()
    fixed = [{"amount_lkr": 20000, "recurrence": "annual", "category_key": "platform"}]
    base = roi.evaluate(db_session, hospital_id=None, window_days=30, custom_expenses=fixed)
    be = base["annual"]["break_even_efficacy"]
    assert be is not None and 0 < be
    # Running at the break-even efficacy makes the annual net benefit zero.
    at_be = roi.evaluate(db_session, hospital_id=None, window_days=30, custom_expenses=fixed, efficacy=min(be, 1.0))
    assert at_be["annual"]["net_benefit_lkr"] == pytest.approx(0.0, abs=1.0)
    assert base["evidence"]["efficacy_central"] == economics.EFFICACY_CENTRAL
    assert base["evidence"]["break_even_above_evidence"] == (be > economics.EFFICACY_HIGH)
    # A lower reach rate raises the efficacy needed to break even.
    low_reach = roi.evaluate(db_session, hospital_id=None, window_days=30, custom_expenses=fixed, reach_rate=0.5)
    assert low_reach["annual"]["break_even_efficacy"] == pytest.approx(be * 2, rel=1e-6)


def test_synthetic_fee_scale_hits_the_target_average():
    assert economics.scale_synthetic_fee(economics.CSV_MEAN_FEE_LKR) == pytest.approx(economics.DEFAULT_CONSULTATION_FEE_LKR, abs=25)
    assert economics.scale_synthetic_fee(7450) % 50 == 0

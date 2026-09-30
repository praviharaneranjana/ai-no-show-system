from datetime import date

import pytest

from app import shai_model
from app.main import shai


def test_calibration_is_monotone_and_bounded():
    import numpy as np
    raw = np.linspace(0, 1, 101)
    cal = shai.calibrate(raw)
    assert (cal >= 0).all() and (cal <= 1).all()
    assert (np.diff(cal) >= -1e-12).all()


def test_poya_days_match_known_full_moons():
    assert shai_model.is_poya(date(2024, 10, 17))  # Il Poya 2024
    assert shai_model.is_poya(date(2024, 11, 16))
    assert not shai_model.is_poya(date(2024, 10, 18))


@pytest.mark.parametrize("raw,expected", [
    ("Doc990", "Doc990"), ("eChannelling", "eChannelling"), ("Asiri MyHealth", "MyHealth"),
    ("Hospital Counter", "Counter"), (None, "Phone"),
])
def test_channel_mapping(raw, expected):
    assert shai_model.map_channel(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("Credit Card (NSR Protected)", "Prepaid_Online"), ("Credit Card", "Card"),
    ("Corporate Insurance", "Corporate"), ("Government Scholarship", "Insurance"),
    ("Cash", "Cash"), (None, "Cash"),
])
def test_payment_mapping(raw, expected):
    assert shai_model.map_payment(raw) == expected


def test_smoothed_rate_matches_notebook():
    assert shai_model.smoothed_no_show_rate(0, 0) == pytest.approx(0.16)
    assert shai_model.smoothed_no_show_rate(0, 1) == pytest.approx(0.106667, abs=1e-6)


def test_engineer_fills_missing_distance_and_builds_all_columns():
    feats = shai_model.engineer(
        model=shai, age=40, gender="Female", distance_km=None,
        scheduled_day=date(2026, 10, 1), appointment_day=date(2026, 10, 10), scheduled_time="05:30 PM",
        department="Orthopaedics", booking_channel="Doc990", payment_mode="Cash", sms_sent=True,
        hypertension=True, diabetes=True, prior_appts=0, prior_no_shows=0,
    )
    assert feats["distance_missing"] == 1 and feats["distance_km"] == shai.distance_median
    assert feats["appt_hour"] == 17 and feats["lead_days"] == 9 and feats["chronic_count"] == 2
    assert feats["department"] == "Orthopedics"
    df = shai.frame([feats])
    assert list(df.columns) == shai.columns and df.shape == (1, len(shai.columns))

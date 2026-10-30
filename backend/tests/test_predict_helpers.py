from app.main import get_recommendation, get_risk_category, shai


def test_risk_category_uses_bundle_thresholds():
    high, medium = shai.high_threshold, shai.medium_threshold
    assert medium < high
    assert get_risk_category(0.0) == "Low"
    assert get_risk_category(medium - 1e-6) == "Low"
    assert get_risk_category(medium) == "Medium"
    assert get_risk_category(high - 1e-6) == "Medium"
    assert get_risk_category(high) == "High"
    assert get_risk_category(1.0) == "High"


def test_recommendation_matches_category():
    assert "Standard SMS" in get_recommendation(0.0)
    assert "SMS + Email" in get_recommendation(shai.medium_threshold)
    assert "multiple reminders" in get_recommendation(shai.high_threshold)

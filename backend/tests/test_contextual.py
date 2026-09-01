from app.contextual import apply_contextual_adjustment


def test_distance_multiplier_none_and_zero_are_neutral():
    assert apply_contextual_adjustment(0.5, distance_km=None, booking_channel=None, payment_mode=None)["distance_multiplier"] == 1.0
    assert apply_contextual_adjustment(0.5, distance_km=0, booking_channel=None, payment_mode=None)["distance_multiplier"] == 1.0


def test_distance_multiplier_scales_and_caps():
    near = apply_contextual_adjustment(0.5, distance_km=5, booking_channel=None, payment_mode=None)
    assert near["distance_multiplier"] == 1.015

    far_but_under_cap = apply_contextual_adjustment(0.5, distance_km=50, booking_channel=None, payment_mode=None)
    assert far_but_under_cap["distance_multiplier"] == 1.15

    very_far = apply_contextual_adjustment(0.5, distance_km=500, booking_channel=None, payment_mode=None)
    assert very_far["distance_multiplier"] == 1.20  # capped, doesn't grow unbounded


def test_channel_multiplier_prepaid_vs_counter():
    prepaid = apply_contextual_adjustment(0.5, distance_km=None, booking_channel="Doc990", payment_mode=None)
    assert prepaid["channel_multiplier"] == 0.95

    myhealth = apply_contextual_adjustment(0.5, distance_km=None, booking_channel="Asiri MyHealth", payment_mode=None)
    assert myhealth["channel_multiplier"] == 0.95

    counter = apply_contextual_adjustment(0.5, distance_km=None, booking_channel="Hospital Counter", payment_mode=None)
    assert counter["channel_multiplier"] == 1.08

    unknown = apply_contextual_adjustment(0.5, distance_km=None, booking_channel="Some Other Channel", payment_mode=None)
    assert unknown["channel_multiplier"] == 1.0


def test_payment_multiplier_commitment_effect():
    nsr = apply_contextual_adjustment(0.5, distance_km=None, booking_channel=None, payment_mode="Credit Card (NSR Protected)")
    assert nsr["payment_multiplier"] == 0.88

    cash = apply_contextual_adjustment(0.5, distance_km=None, booking_channel=None, payment_mode="Cash")
    assert cash["payment_multiplier"] == 1.06

    card = apply_contextual_adjustment(0.5, distance_km=None, booking_channel=None, payment_mode="Credit Card")
    assert card["payment_multiplier"] == 0.96


def test_final_score_is_clamped_to_valid_probability_range():
    # Best-case multipliers pushed against a near-zero ML score should floor at 0.01,
    # never hit exactly 0 (which would claim mathematical certainty of attendance).
    floor_case = apply_contextual_adjustment(
        0.005, distance_km=None, booking_channel="Doc990", payment_mode="Credit Card (NSR Protected)"
    )
    assert floor_case["final_risk_score"] == 0.01

    # Worst-case multipliers pushed against a near-certain ML score should cap at 0.99,
    # never hit exactly 1 (which would claim mathematical certainty of no-show).
    ceiling_case = apply_contextual_adjustment(
        0.99, distance_km=500, booking_channel="Hospital Counter", payment_mode="Cash"
    )
    assert ceiling_case["final_risk_score"] == 0.99


def test_ml_component_is_preserved_unmodified_alongside_adjustment():
    result = apply_contextual_adjustment(
        0.2618, distance_km=62.5, booking_channel="Hospital Counter", payment_mode="Cash"
    )
    assert result["ml_risk_score"] == 0.2618
    assert result["method"] == "rule_based_heuristic"
    assert result["final_risk_score"] != result["ml_risk_score"]

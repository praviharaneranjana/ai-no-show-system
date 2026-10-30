"""Unit tests for Capacity & Smart Overbooking v2 mathematical algorithms,
queue simulation, and candidate ranking.
"""

import pytest
from datetime import datetime, timezone, timedelta
from app.services.capacity_math import (
    calculate_poisson_binomial_stats,
    calculate_effective_tolerance,
    calculate_utilisation_metrics,
    calculate_expected_filled_gaps,
    calculate_expected_revenue,
)
from app.services.candidate_ranker import score_waitlist_candidate


def test_effective_tolerance_curtailed_by_lateness():
    """G4, 4.C: Effective tolerance = max(0, base - delay)."""
    assert calculate_effective_tolerance(15, 0) == 15
    assert calculate_effective_tolerance(15, 10) == 5
    assert calculate_effective_tolerance(15, 15) == 0
    assert calculate_effective_tolerance(15, 25) == 0  # Floored at 0
    assert calculate_effective_tolerance(20, 5) == 15


def test_poisson_binomial_small_n_exact_dp():
    """4.A: Exact dynamic programming for n < 10."""
    # 4 appointments with identical 0.5 probability
    # Expected no-shows = 2.0, variance = 4 * 0.5 * 0.5 = 1.0
    probs = [0.5, 0.5, 0.5, 0.5]
    exp, var, low, high = calculate_poisson_binomial_stats(probs, confidence_level=0.80)
    assert exp == 2.0
    assert var == 1.0
    assert low <= exp <= high
    assert 0.0 <= low <= 4.0
    assert 0.0 <= high <= 4.0


def test_poisson_binomial_large_n_is_exact():
    """4.A: the interval is the exact Binomial(20, 0.2) 10th / 90th percentile, not a normal approximation."""
    probs = [0.20] * 20
    exp, var, low, high = calculate_poisson_binomial_stats(probs, confidence_level=0.80)
    assert exp == 4.0
    assert var == 3.2
    # Binomial(20, .2): P(X<=2)=0.2061 >= 0.10 (first), P(X<=6)=0.9133 >= 0.90 (first)
    assert (low, high) == (2.0, 6.0)


def test_poisson_binomial_empty_honest_state():
    """G2: Empty list returns honest 0.0 stats."""
    exp, var, low, high = calculate_poisson_binomial_stats([])
    assert exp == 0.0
    assert var == 0.0
    assert low == 0.0
    assert high == 0.0


def test_utilisation_metrics():
    """G5: Booked / Capacity, and (Booked - NoShow) / Capacity."""
    # 20 booked out of 25 capacity, 4 expected no-shows
    booked_util, exp_attend = calculate_utilisation_metrics(booked=20, capacity=25, expected_no_shows=4.0)
    assert booked_util == 80.0  # 20 / 25
    assert exp_attend == 64.0   # (20 - 4) / 25 = 16 / 25 = 64%

    # Edge cases
    assert calculate_utilisation_metrics(0, 25, 0.0) == (0.0, 0.0)
    assert calculate_utilisation_metrics(25, 25, 0.0) == (100.0, 100.0)


def test_expected_revenue_filled_gaps():
    """4.E, G14: Expected revenue = filled gaps * fee, not recommended * fee."""
    gaps = calculate_expected_filled_gaps(recommended_overbook=3, expected_no_shows=4.5, variance=2.1)
    assert gaps > 0.0
    assert gaps <= 3.0

    fee = 4500.0
    rev = calculate_expected_revenue(gaps, fee)
    assert rev == round(gaps * 4500.0, 2)
    assert rev > 0.0


def test_candidate_ranking_priorities():
    """Feature C: Multi-attribute ranker favors matching specialty, low no-show risk, urgency, proximity."""
    now = datetime.now(timezone.utc)
    
    # Candidate A: Urgent, matching doctor, low risk (0.05), Borella (3 km)
    cand_a = score_waitlist_candidate(
        target_specialty="Cardiology",
        target_doctor_name="Dr. Rohan Perera",
        candidate_specialty="Cardiology",
        candidate_doctor_name="Dr. Rohan Perera",
        predicted_no_show_prob=0.05,
        created_at=now - timedelta(days=14),
        urgency_level="High",
        distance_km=3.0,
    )

    # Candidate B: Routine, different doctor, high risk (0.50), Kandy (120 km)
    cand_b = score_waitlist_candidate(
        target_specialty="Cardiology",
        target_doctor_name="Dr. Rohan Perera",
        candidate_specialty="Cardiology",
        candidate_doctor_name="Dr. Jayasinghe",
        predicted_no_show_prob=0.50,
        created_at=now - timedelta(days=2),
        urgency_level="Routine",
        distance_km=120.0,
    )

    assert cand_a["total_score"] > cand_b["total_score"]
    assert cand_a["breakdown"]["specialty_doctor_match"] == 35.0
    assert cand_a["breakdown"]["clinical_urgency"] == 15.0
    assert cand_b["breakdown"]["clinical_urgency"] == 4.0

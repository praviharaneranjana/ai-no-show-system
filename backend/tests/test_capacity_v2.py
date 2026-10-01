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
from app.services.queue_simulator import (
    simulate_single_server_queue,
    optimize_overbook_count,
    linear_wait_estimate_fallback,
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


def test_poisson_binomial_large_n_normal_approximation():
    """4.A: Normal approximation for n >= 10."""
    # 20 appointments with 0.20 probability
    # Expected = 4.0, var = 20 * 0.2 * 0.8 = 3.2, std = sqrt(3.2) ~ 1.789
    # Margin ~ 1.28155 * 1.789 ~ 2.29 -> [1.7, 6.3]
    probs = [0.20] * 20
    exp, var, low, high = calculate_poisson_binomial_stats(probs, confidence_level=0.80)
    assert exp == 4.0
    assert var == 3.2
    assert low < exp < high
    assert round(low, 1) == 1.7
    assert round(high, 1) == 6.3


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


def test_queue_simulator_deterministic_seeded():
    """4.D: Single-server queue simulation with fixed seed produces deterministic results."""
    probs = [0.30] * 15
    res1 = simulate_single_server_queue(
        scheduled_no_show_probs=probs,
        overbook_count=2,
        avg_consultation_mins=12.0,
        consultation_std_mins=3.0,
        doctor_delay_mins=0,
        effective_tolerance_mins=15,
        sim_runs=1000,
        seed=123,
    )
    res2 = simulate_single_server_queue(
        scheduled_no_show_probs=probs,
        overbook_count=2,
        avg_consultation_mins=12.0,
        consultation_std_mins=3.0,
        doctor_delay_mins=0,
        effective_tolerance_mins=15,
        sim_runs=1000,
        seed=123,
    )
    assert res1 == res2
    assert "mean_added_wait_mins" in res1
    assert "p_overcrowding" in res1
    assert 0.0 <= res1["p_overcrowding"] <= 1.0
    assert len(res1["wait_histogram"]) == 8


def test_optimize_overbook_count_empty_session():
    """G2, 4.B: Session with no appointments gives 0 overbook, no fabricated numbers."""
    opt_k, sim, curve = optimize_overbook_count(
        scheduled_no_show_probs=[],
        max_capacity=25,
        booked_count=0,
    )
    assert opt_k == 0
    assert sim["mean_added_wait_mins"] == 0.0


def test_optimize_overbook_count_lateness_reduction():
    """4.B, 4.C: Severe doctor delay reduces recommended overbooking."""
    probs = [0.40] * 20  # High expected no-shows (8.0)
    
    # On time doctor
    opt_on_time, _, _ = optimize_overbook_count(
        scheduled_no_show_probs=probs,
        max_capacity=25,
        booked_count=20,
        doctor_delay_mins=0,
        effective_tolerance_mins=15,
        seed=42,
    )

    # Late doctor (+30m late -> effective tolerance 0m)
    opt_late, _, _ = optimize_overbook_count(
        scheduled_no_show_probs=probs,
        max_capacity=25,
        booked_count=20,
        doctor_delay_mins=30,
        effective_tolerance_mins=0,
        seed=42,
    )

    assert opt_late <= opt_on_time


def test_linear_wait_estimate_fallback():
    """G7: Old linear formula preserved as labelled fallback."""
    est = linear_wait_estimate_fallback(overbook_count=3, avg_consultation_mins=12.0)
    # 3 * 12 * 0.35 = 12.6
    assert est == 12.6


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

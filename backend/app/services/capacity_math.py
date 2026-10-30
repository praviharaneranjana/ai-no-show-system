"""Capacity & Smart Overbooking v2: Mathematical utilities.

Covers:
- 4.A Poisson-binomial expected no-shows and confidence interval (exact DP for every n).
- 4.C Effective queue delay tolerance scaled by doctor lateness: max(0, base_tolerance - delay_minutes).
- 4.E Expected filled gaps and revenue calculation: expected revenue = expected filled gaps * fee.
- G5 Utilisation and expected attendance rates.
"""

from typing import Iterable, Sequence, Tuple
import math


def calculate_poisson_binomial_stats(
    probabilities: Sequence[float],
    confidence_level: float = 0.80,
) -> Tuple[float, float, float, float]:
    """Calculate the expected sum, variance, and confidence interval for independent Bernoulli trials.

    Args:
        probabilities: Calibrated no-show probabilities p_i for each booked patient.
        confidence_level: Desired interval coverage (default 80%, z ~ 1.28155).

    Returns:
        (expected_no_shows, variance, interval_low, interval_high)
    """
    n = len(probabilities)
    if n == 0:
        return 0.0, 0.0, 0.0, 0.0

    # Clean probabilities to [0.0, 1.0]
    p_clamped = [max(0.0, min(1.0, float(p))) for p in probabilities]

    expected = sum(p_clamped)
    variance = sum(p * (1.0 - p) for p in p_clamped)

    # Exact distribution via dynamic programming (dp[k] = P(exactly k no-shows)); fast enough for any session size.
    from app.services.overbooking import poisson_binomial

    dp = poisson_binomial(p_clamped)
    alpha = 1.0 - confidence_level
    tail_prob = alpha / 2.0

    cum = 0.0
    low = 0
    for k, prob in enumerate(dp):
        cum += prob
        if cum >= tail_prob:
            low = k
            break

    cum = 0.0
    high = n
    for k, prob in enumerate(dp):
        cum += prob
        if cum >= (1.0 - tail_prob):
            high = k
            break

    interval_low = float(max(0, low))
    interval_high = float(min(n, max(low, high)))

    return round(expected, 2), round(variance, 2), round(interval_low, 1), round(interval_high, 1)


def calculate_effective_tolerance(base_tolerance_mins: int, doctor_delay_mins: int) -> int:
    """Calculate effective wait tolerance curtailed by doctor punctuality (G4, 4.C).

    Formula:
        effective_tolerance = max(0, base_tolerance_mins - doctor_delay_mins)
    """
    return max(0, int(base_tolerance_mins) - max(0, int(doctor_delay_mins)))


def calculate_utilisation_metrics(booked: int, capacity: int, expected_no_shows: float) -> Tuple[float, float]:
    """Calculate true booked utilisation and expected attendance rate (G5).

    Args:
        booked: Number of appointments booked.
        capacity: Maximum session capacity.
        expected_no_shows: Sum of calibrated no-show probabilities.

    Returns:
        (booked_utilisation_pct, expected_attendance_pct)
    """
    if capacity <= 0:
        return 0.0, 0.0

    booked_util = min(100.0, max(0.0, (booked / capacity) * 100.0))
    expected_attend = max(0.0, booked - expected_no_shows)
    expected_attend_pct = min(100.0, max(0.0, (expected_attend / capacity) * 100.0))

    return round(booked_util, 1), round(expected_attend_pct, 1)


def calculate_expected_filled_gaps(
    recommended_overbook: int,
    expected_no_shows: float,
    variance: float,
) -> float:
    """Calculate expected filled overbooking gaps (4.E, G14).

    Gaps filled = min(recommended_overbook, actual_no_shows).
    Approximated using normal distribution or min bound.
    """
    if recommended_overbook <= 0 or expected_no_shows <= 0.0:
        return 0.0

    k = float(recommended_overbook)
    # Conservative expectation: cannot fill more than recommended or expected no-shows
    # With variance buffer: min(k, expected) * fill_efficiency
    ratio = min(1.0, expected_no_shows / max(1.0, k))
    filled = k * (0.85 * ratio + 0.15 * min(1.0, ratio))
    return round(min(k, max(0.0, filled)), 2)


def calculate_expected_revenue(
    expected_filled_gaps: float,
    consultation_fee_lkr: float,
) -> float:
    """Calculate expected revenue upside in LKR (4.E, G14)."""
    return round(expected_filled_gaps * max(0.0, consultation_fee_lkr), 2)

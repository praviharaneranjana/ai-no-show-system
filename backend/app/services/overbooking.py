"""Exact (Poisson-binomial) overbooking maths for one clinic session.

Each booked patient i shows up independently with probability q_i = 1 - p_i, where p_i is the calibrated
no-show risk. The number of arrivals N is Poisson-binomial; its distribution is computed exactly by dynamic-programming
convolution (no Monte-Carlo, no normal approximation).

For ``k`` extra bookings (each showing with probability ``q_extra``) and a session ``capacity``:

    E[seen](k)     = E[min(N_k, capacity)]
    E[overflow](k) = E[max(N_k - capacity, 0)]
    value(k)       = fee * E[seen](k) - wait_cost * E[overflow](k)
    P(overflow)    = P(N_k > capacity)

The recommendation is ``argmax_k value(k)`` over ``0 <= k <= free_seats + max_overbook``; the part of ``k`` that
exceeds the free seats is the overbooking proper.
"""
from typing import Sequence


def poisson_binomial(probs: Sequence[float]) -> list[float]:
    """dist[n] = P(exactly n successes) for independent Bernoulli(probs[i])."""
    dist = [1.0]
    for p in probs:
        p = min(1.0, max(0.0, float(p)))
        nxt = [0.0] * (len(dist) + 1)
        for n, pr in enumerate(dist):
            nxt[n] += pr * (1.0 - p)
            nxt[n + 1] += pr * p
        dist = nxt
    return dist


def show_distribution(no_show_probs: Sequence[float]) -> list[float]:
    """Distribution of the number of patients who ARRIVE given their no-show probabilities."""
    return poisson_binomial([1.0 - min(1.0, max(0.0, float(p))) for p in no_show_probs])


def evaluate(show_dist: Sequence[float], capacity: int, fee: float, wait_cost: float) -> dict:
    e_seen = sum(pr * min(n, capacity) for n, pr in enumerate(show_dist))
    e_over = sum(pr * max(n - capacity, 0) for n, pr in enumerate(show_dist))
    p_over = sum(pr for n, pr in enumerate(show_dist) if n > capacity)
    return {
        "expected_seen": e_seen,
        "expected_overflow": e_over,
        "p_overflow": p_over,
        "value_lkr": fee * e_seen - wait_cost * e_over,
    }


def recommend(
    booked_no_show_probs: Sequence[float],
    capacity: int,
    fee: float,
    wait_cost: float,
    max_overbook: int,
    default_no_show_prob: float,
) -> dict:
    """Best number of extra bookings for one session.

    ``default_no_show_prob`` is used for the extra bookings when nobody is booked yet; otherwise they are assumed
    to be as reliable as the average booked patient.
    """
    booked = len(booked_no_show_probs)
    mean_p = (sum(booked_no_show_probs) / booked) if booked else float(default_no_show_prob)
    free = max(int(capacity) - booked, 0)
    base = show_distribution(booked_no_show_probs)
    q_extra = 1.0 - mean_p

    curve = []
    dist = base
    best = None
    for k in range(0, free + max(int(max_overbook), 0) + 1):
        if k > 0:
            nxt = [0.0] * (len(dist) + 1)
            for n, pr in enumerate(dist):
                nxt[n] += pr * (1.0 - q_extra)
                nxt[n + 1] += pr * q_extra
            dist = nxt
        ev = evaluate(dist, capacity, fee, wait_cost)
        row = {"extra_bookings": k, "overbooked": max(k - free, 0), **ev}
        curve.append(row)
        # strict improvement only: ties keep the smaller k
        if best is None or row["value_lkr"] > best["value_lkr"] + 1e-9:
            best = row
    assert best is not None
    return {
        "booked": booked,
        "capacity": int(capacity),
        "free_seats": free,
        "extra_show_prob": q_extra,
        "recommended_extra_bookings": best["extra_bookings"],
        "recommended_overbook": best["overbooked"],
        "expected_seen": best["expected_seen"],
        "expected_overflow": best["expected_overflow"],
        "p_overflow": best["p_overflow"],
        "value_lkr": best["value_lkr"],
        "baseline_value_lkr": curve[0]["value_lkr"],
        "value_gain_lkr": best["value_lkr"] - curve[0]["value_lkr"],
        "curve": curve,
    }

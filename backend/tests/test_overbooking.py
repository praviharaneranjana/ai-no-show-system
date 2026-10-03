"""The overbooking maths is exact: verify against brute-force enumeration of every show / no-show outcome."""
import itertools
import random

import pytest

from app.services import overbooking


def brute(no_show_probs, capacity, fee, wait_cost):
    e_seen = e_over = p_over = 0.0
    for outcome in itertools.product((0, 1), repeat=len(no_show_probs)):  # 1 = shows up
        pr = 1.0
        for shows, p in zip(outcome, no_show_probs):
            pr *= (1 - p) if shows else p
        n = sum(outcome)
        e_seen += pr * min(n, capacity)
        e_over += pr * max(n - capacity, 0)
        p_over += pr * (n > capacity)
    return e_seen, e_over, p_over, fee * e_seen - wait_cost * e_over


@pytest.mark.parametrize("seed", range(8))
def test_evaluate_matches_brute_force(seed):
    rng = random.Random(seed)
    n = rng.randint(1, 9)
    probs = [rng.random() * 0.6 for _ in range(n)]
    capacity = rng.randint(1, n + 1)
    fee, wc = 4500.0, rng.choice([0.0, 1000.0, 3000.0])
    got = overbooking.evaluate(overbooking.show_distribution(probs), capacity, fee, wc)
    seen, over, p_over, value = brute(probs, capacity, fee, wc)
    assert got["expected_seen"] == pytest.approx(seen)
    assert got["expected_overflow"] == pytest.approx(over)
    assert got["p_overflow"] == pytest.approx(p_over)
    assert got["value_lkr"] == pytest.approx(value)


def test_distribution_sums_to_one_and_has_right_mean():
    probs = [0.1, 0.4, 0.25, 0.05]
    dist = overbooking.show_distribution(probs)
    assert sum(dist) == pytest.approx(1.0)
    assert sum(n * p for n, p in enumerate(dist)) == pytest.approx(sum(1 - p for p in probs))


def test_recommend_matches_brute_force_over_k():
    booked = [0.30, 0.25, 0.20, 0.35, 0.15, 0.40]  # 6 booked, capacity 6 -> no free seats
    rec = overbooking.recommend(booked, capacity=6, fee=4500.0, wait_cost=2000.0, max_overbook=3, default_no_show_prob=0.16)
    mean_p = sum(booked) / len(booked)
    best_k, best_v = None, None
    for k in range(0, 4):
        _, _, _, v = brute(booked + [mean_p] * k, 6, 4500.0, 2000.0)
        if best_v is None or v > best_v + 1e-9:
            best_k, best_v = k, v
    assert rec["recommended_extra_bookings"] == best_k
    assert rec["value_lkr"] == pytest.approx(best_v)
    assert rec["free_seats"] == 0 and rec["recommended_overbook"] == best_k


def test_free_seats_are_not_called_overbooking():
    rec = overbooking.recommend([0.2, 0.2], capacity=10, fee=4500.0, wait_cost=2000.0, max_overbook=2, default_no_show_prob=0.16)
    assert rec["free_seats"] == 8
    assert rec["recommended_extra_bookings"] >= 8  # filling empty seats never loses money
    assert rec["recommended_overbook"] == rec["recommended_extra_bookings"] - 8


def test_higher_wait_cost_never_recommends_more():
    booked = [0.3] * 10
    low = overbooking.recommend(booked, 10, 4500.0, 0.0, 4, 0.16)["recommended_overbook"]
    high = overbooking.recommend(booked, 10, 4500.0, 1_000_000.0, 4, 0.16)["recommended_overbook"]
    assert high <= low
    assert high == 0  # an absurd wait cost forbids overbooking


def test_empty_session():
    rec = overbooking.recommend([], capacity=5, fee=4500.0, wait_cost=2000.0, max_overbook=2, default_no_show_prob=0.16)
    assert rec["booked"] == 0 and rec["expected_overflow"] >= 0.0

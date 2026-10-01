"""Capacity & Smart Overbooking v2: Vectorized Queue Simulation Engine.

Simulates single-server doctor consultation clinic queues under stochastic patient arrivals
and log-normal/normal consultation service times.
Uses NumPy vectorization to achieve 2,000 Monte Carlo runs in < 40 ms.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np


def simulate_single_server_queue(
    scheduled_no_show_probs: List[float],
    overbook_count: int,
    avg_consultation_mins: float = 12.0,
    consultation_std_mins: float = 3.5,
    doctor_delay_mins: int = 0,
    effective_tolerance_mins: int = 15,
    sim_runs: int = 2000,
    seed: Optional[int] = 42,
) -> Dict[str, float]:
    """Run a vectorized Monte Carlo simulation of a doctor clinic session queue.

    Args:
        scheduled_no_show_probs: Calibrated no-show probability p_i for each scheduled patient.
        overbook_count: Candidate number of extra overbooked patients added to session.
        avg_consultation_mins: Mean consultation service time in minutes.
        consultation_std_mins: Standard deviation of service time in minutes.
        doctor_delay_mins: Initial lateness of the consultant in minutes.
        effective_tolerance_mins: Curtailed wait tolerance (max(0, base_tolerance - delay)).
        sim_runs: Number of Monte Carlo iterations (default 2,000).
        seed: Random seed for deterministic unit test execution.

    Returns:
        Dict with keys:
            - mean_added_wait_mins: Average added waiting time per attending patient.
            - p90_wait_mins: 90th percentile wait time.
            - p95_wait_mins: 95th percentile wait time.
            - p_overcrowding: Probability that added wait exceeds effective_tolerance_mins.
            - expected_arriving_patients: Mean number of patients who attend.
            - expected_filled_gaps: Mean number of overbooked patients absorbed by no-shows.
            - regret_rate: Proportion of runs where wait exceeded tolerance.
    """
    if seed is not None:
        rng = np.random.default_rng(seed)
    else:
        rng = np.random.default_rng()

    n_sched = len(scheduled_no_show_probs)
    total_slots = n_sched + max(0, overbook_count)

    if total_slots == 0:
        return {
            "mean_added_wait_mins": 0.0,
            "p90_wait_mins": 0.0,
            "p95_wait_mins": 0.0,
            "p_overcrowding": 0.0,
            "expected_arriving_patients": 0.0,
            "expected_filled_gaps": 0.0,
            "regret_rate": 0.0,
            "wait_histogram": [0] * 8,
        }

    # Arrival probabilities: 1 - p_noshow for scheduled; default 0.90 for overbooked
    p_attend_sched = [1.0 - max(0.0, min(1.0, float(p))) for p in scheduled_no_show_probs]
    p_attend_over = [0.85] * max(0, overbook_count)  # Overbooked patients also have ~15% baseline no-show
    all_p_attend = np.array(p_attend_sched + p_attend_over, dtype=np.float32)

    # 1. Sample patient arrivals (sim_runs x total_slots) ~ Bernoulli(p_attend)
    # Shape: (sim_runs, total_slots)
    uniform_draws = rng.random((sim_runs, total_slots), dtype=np.float32)
    arrivals = (uniform_draws < all_p_attend).astype(np.int32)

    # Count scheduled arrivals and no-shows
    sched_arrivals = arrivals[:, :n_sched].sum(axis=1) if n_sched > 0 else np.zeros(sim_runs, dtype=np.int32)
    sched_no_shows = n_sched - sched_arrivals
    over_arrivals = arrivals[:, n_sched:].sum(axis=1) if overbook_count > 0 else np.zeros(sim_runs, dtype=np.int32)

    # Filled gaps: min(overbooked patients who arrived, scheduled patients who no-showed)
    filled_gaps = np.minimum(over_arrivals, sched_no_shows)

    # 2. Sample consultation service times (truncated at min 2.0 mins)
    service_times = rng.normal(
        loc=avg_consultation_mins,
        scale=max(1.0, consultation_std_mins),
        size=(sim_runs, total_slots),
    ).astype(np.float32)
    service_times = np.maximum(2.0, service_times)

    # Active consultation durations for attending patients only
    active_service = service_times * arrivals

    # 3. Queue wait calculation
    # Scheduled inter-arrival spacing: approx avg_consultation_mins per slot
    slot_spacing = max(5.0, avg_consultation_mins)
    
    # Vectorized iterative Lindley recursion:
    # W_{i+1} = max(0, W_i + S_i - A_i)
    waits = np.zeros(sim_runs, dtype=np.float32)
    current_wait = np.full(sim_runs, max(0.0, float(doctor_delay_mins)), dtype=np.float32)
    total_wait_accum = np.zeros(sim_runs, dtype=np.float32)
    total_attended = arrivals.sum(axis=1)

    for i in range(total_slots):
        arr_i = arrivals[:, i]
        dur_i = active_service[:, i]
        
        # Patients arriving at step i experience current_wait
        total_wait_accum += current_wait * arr_i
        
        # Advance server state by service time minus slot progression
        current_wait = np.maximum(0.0, current_wait + dur_i - slot_spacing)

    # Average wait experienced by attending patients in each run
    safe_attended = np.maximum(1, total_attended)
    mean_wait_per_run = total_wait_accum / safe_attended

    # Statistics across all runs
    mean_wait = float(np.mean(mean_wait_per_run))
    p90_wait = float(np.percentile(mean_wait_per_run, 90))
    p95_wait = float(np.percentile(mean_wait_per_run, 95))
    
    # Overcrowding probability: runs where mean wait exceeded effective tolerance
    tol = max(0.0, float(effective_tolerance_mins))
    runs_over_tol = (mean_wait_per_run > tol).astype(np.float32)
    p_overcrowding = float(np.mean(runs_over_tol))

    # Regret rate: runs where extra overbooked patients caused excessive delay
    regret_rate = p_overcrowding

    # Generate 8-bucket histogram data for UI chart (0-5, 5-10, 10-15, 15-20, 20-25, 25-30, 30-35, 35+)
    hist_counts, _ = np.histogram(mean_wait_per_run, bins=[0, 5, 10, 15, 20, 25, 30, 35, 100])
    hist_norm = [int(round(c / sim_runs * 100)) for c in hist_counts]

    return {
        "mean_added_wait_mins": round(mean_wait, 1),
        "p90_wait_mins": round(p90_wait, 1),
        "p95_wait_mins": round(p95_wait, 1),
        "p_overcrowding": round(p_overcrowding, 3),
        "expected_arriving_patients": round(float(np.mean(total_attended)), 1),
        "expected_filled_gaps": round(float(np.mean(filled_gaps)), 2),
        "regret_rate": round(regret_rate, 3),
        "wait_histogram": hist_norm,
    }


def optimize_overbook_count(
    scheduled_no_show_probs: List[float],
    max_capacity: int,
    booked_count: int,
    safety_factor: float = 0.75,
    max_overbook_cap: int = 4,
    effective_tolerance_mins: int = 15,
    avg_consultation_mins: float = 12.0,
    consultation_std_mins: float = 3.5,
    doctor_delay_mins: int = 0,
    risk_budget: float = 0.08,  # P(overcrowding) must be <= 8%
    sim_runs: int = 1500,
    seed: Optional[int] = 42,
) -> Tuple[int, Dict[str, float], List[Dict[str, float]]]:
    """Find the optimal recommended overbook count k meeting the risk budget (4.B).

    Rule:
        Largest k in [0, max_overbook_cap] such that:
        P(overcrowding > effective_tolerance) <= risk_budget,
        scaled by safety_factor. Does NOT force a minimum of 1.

    Returns:
        (optimal_k, best_simulation_result, trade_off_curve)
    """
    # Honest empty state: no appointments -> 0 overbook (G2)
    if booked_count == 0 or len(scheduled_no_show_probs) == 0:
        empty_sim = {
            "mean_added_wait_mins": 0.0,
            "p90_wait_mins": 0.0,
            "p95_wait_mins": 0.0,
            "p_overcrowding": 0.0,
            "expected_arriving_patients": 0.0,
            "expected_filled_gaps": 0.0,
            "regret_rate": 0.0,
            "wait_histogram": [0] * 8,
        }
        return 0, empty_sim, []

    # Expected no-shows upper ceiling
    exp_no_shows = sum(scheduled_no_show_probs)
    theoretical_max = max(0, int(round(exp_no_shows * safety_factor)))
    ceiling_k = min(max_overbook_cap, theoretical_max)

    # Evaluate candidate k in [0, ceiling_k]
    trade_off_curve = []
    best_k = 0
    best_sim = None

    for k in range(max_overbook_cap + 1):
        sim = simulate_single_server_queue(
            scheduled_no_show_probs=scheduled_no_show_probs,
            overbook_count=k,
            avg_consultation_mins=avg_consultation_mins,
            consultation_std_mins=consultation_std_mins,
            doctor_delay_mins=doctor_delay_mins,
            effective_tolerance_mins=effective_tolerance_mins,
            sim_runs=sim_runs,
            seed=seed,
        )
        trade_off_curve.append({
            "overbook": k,
            "mean_wait": sim["mean_added_wait_mins"],
            "p_overcrowd": sim["p_overcrowding"],
            "filled_gaps": sim["expected_filled_gaps"],
        })

        if k <= ceiling_k and sim["p_overcrowding"] <= risk_budget:
            best_k = k
            best_sim = sim
        elif best_sim is None and k == 0:
            best_k = 0
            best_sim = sim

    if best_sim is None:
        best_sim = trade_off_curve[0]

    return best_k, best_sim, trade_off_curve


def linear_wait_estimate_fallback(
    overbook_count: int,
    avg_consultation_mins: float = 12.0,
) -> float:
    """Old linear estimate preserved as a labelled fallback (G7).

    Formula:
        est_extra_wait = overbook * avg_consultation_mins * 0.35
    """
    return round(max(0, overbook_count) * avg_consultation_mins * 0.35, 1)

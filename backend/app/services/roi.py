"""ROI of risk-ranked outreach, computed from the hospital's own history.

The single implementation of the model (the frontend only renders what this returns):

* Baseline volume, average fee and no-show rate come from appointments with a recorded outcome.
* "Replay on history": for every day, rank that day's appointments by their stored risk score, contact the top
  ``K`` share, and count the no-shows that fall inside the contacted group. A contacted would-be no-show is
  recovered with probability ``efficacy`` and is worth ``fee * value_multiplier``. The comparison is the same
  number of contacts chosen at random, whose expected capture is simply ``K`` of the no-shows.
* Costs: ``cost_per_contact`` per contact, plus the hospital's recorded expenses (annualised).

Everything that is not in the database is an explicit assumption: efficacy, K, value multiplier, contact cost.
"""
import math
import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app import models

DEFAULT_EFFICACY = 0.30
DEFAULT_CONTACT_FRACTION = 0.20
DEFAULT_VALUE_MULTIPLIER = 1.0  # hospital revenue per LKR of consultation fee (1.0 = fee only, no ancillary)
DEFAULT_COST_PER_CONTACT_LKR = 50.0  # ~3.5 min of staff time at ~LKR 850/h plus message cost
DEFAULT_WINDOW_DAYS = 90
SENS_EFFICACIES = (0.1, 0.2, 0.3, 0.4)
SENS_KS = (0.10, 0.20, 0.30)


def replay(rows: list[dict], k: float) -> dict:
    """Rank each day's appointments by risk, contact the top ``k`` share.

    ``rows``: dicts with ``day``, ``risk``, ``no_show`` (bool) and ``fee`` (LKR).
    Returns raw (efficacy-free) aggregates; multiply recovered values by the efficacy.
    """
    by_day: dict[date, list[dict]] = defaultdict(list)
    for r in rows:
        by_day[r["day"]].append(r)

    contacts = 0
    caught = 0
    caught_fee = 0.0
    rand_caught = 0.0
    rand_caught_fee = 0.0
    total_ns = 0
    total_ns_fee = 0.0
    for day_rows in by_day.values():
        n = len(day_rows)
        take = max(int(math.ceil(k * n)), 1)
        ranked = sorted(day_rows, key=lambda r: -r["risk"])
        picked = ranked[:take]
        contacts += take
        day_ns = [r for r in day_rows if r["no_show"]]
        total_ns += len(day_ns)
        day_ns_fee = sum(r["fee"] for r in day_ns)
        total_ns_fee += day_ns_fee
        got = [r for r in picked if r["no_show"]]
        caught += len(got)
        caught_fee += sum(r["fee"] for r in got)
        share = take / n
        rand_caught += share * len(day_ns)
        rand_caught_fee += share * day_ns_fee
    return {
        "k": k,
        "days": len(by_day),
        "appointments": len(rows),
        "contacts": contacts,
        "no_shows": total_ns,
        "no_show_fee_lkr": total_ns_fee,
        "caught_model": caught,
        "caught_model_fee_lkr": caught_fee,
        "caught_random": rand_caught,
        "caught_random_fee_lkr": rand_caught_fee,
    }


def _scenario(agg: dict, efficacy: float, value_multiplier: float, cost_per_contact: float) -> dict:
    recovered_model = agg["caught_model_fee_lkr"] * efficacy * value_multiplier
    recovered_random = agg["caught_random_fee_lkr"] * efficacy * value_multiplier
    cost = agg["contacts"] * cost_per_contact
    return {
        "k": agg["k"],
        "efficacy": efficacy,
        "contacts": agg["contacts"],
        "recovered_lkr_model": recovered_model,
        "recovered_lkr_random": recovered_random,
        "contact_cost_lkr": cost,
        "net_lkr_model": recovered_model - cost,
        "net_lkr_random": recovered_random - cost,
        "uplift_vs_random_lkr": recovered_model - recovered_random,
        "recall_model": (agg["caught_model"] / agg["no_shows"]) if agg["no_shows"] else None,
        "recall_random": (agg["caught_random"] / agg["no_shows"]) if agg["no_shows"] else None,
    }


def annual_expenses(items: list[dict], contacts_per_year: float) -> tuple[float, dict[str, float]]:
    total = 0.0
    breakdown: dict[str, float] = {}
    for item in items:
        if not item.get("is_active", True):
            continue
        amount = float(item["amount_lkr"])
        rec = item.get("recurrence", "annual")
        cost = amount * 12 if rec == "monthly" else amount * contacts_per_year if rec == "per_patient" else amount
        total += cost
        key = item.get("category_key") or "other"
        breakdown[key] = round(breakdown.get(key, 0.0) + cost, 2)
    return total, breakdown


def load_history(db: Session, hospital_id: uuid.UUID | None, window_days: int, as_of: date | None = None) -> list[dict]:
    as_of = as_of or date.today()
    q = (
        db.query(
            models.Appointment.appointment_day,
            models.Appointment.no_show,
            models.Appointment.fee_lkr,
            models.Appointment.data_source,
            models.Prediction.risk_score,
            models.Doctor.consultation_fee_lkr,
        )
        .join(models.Prediction, models.Prediction.appointment_id == models.Appointment.id)
        .outerjoin(models.Doctor, models.Doctor.id == models.Appointment.doctor_id)
        .filter(
            models.Appointment.no_show.isnot(None),
            models.Appointment.status != "cancelled",
            models.Appointment.appointment_day < as_of,
            models.Appointment.appointment_day >= as_of - timedelta(days=window_days),
        )
    )
    if hospital_id is not None:
        q = q.filter(models.Appointment.hospital_id == hospital_id)
    out = []
    for day, ns, fee, src, risk, doc_fee in q.all():
        out.append({
            "day": day, "no_show": bool(ns), "risk": float(risk),
            "fee": float(fee if fee is not None else (doc_fee or 0.0)), "synthetic": src == "synthetic",
        })
    return out


def load_expenses(db: Session, hospital_id: uuid.UUID | None) -> list[dict]:
    q = db.query(models.HospitalExpense).filter(models.HospitalExpense.is_active.is_(True))
    if hospital_id is not None:
        q = q.filter(models.HospitalExpense.hospital_id == hospital_id)
    return [
        {"id": str(e.id), "category_key": e.category.key if e.category else None, "title": e.title,
         "amount_lkr": e.amount_lkr, "recurrence": e.recurrence, "is_active": e.is_active}
        for e in q.all()
    ]


def evaluate(
    db: Session,
    *,
    hospital_id: uuid.UUID | None,
    contact_fraction: float = DEFAULT_CONTACT_FRACTION,
    efficacy: float = DEFAULT_EFFICACY,
    value_multiplier: float = DEFAULT_VALUE_MULTIPLIER,
    cost_per_contact_lkr: float = DEFAULT_COST_PER_CONTACT_LKR,
    window_days: int = DEFAULT_WINDOW_DAYS,
    custom_expenses: list[dict] | None = None,
    as_of: date | None = None,
) -> dict:
    rows = load_history(db, hospital_id, window_days, as_of)
    assumptions = {
        "contact_fraction": contact_fraction,
        "intervention_efficacy": efficacy,
        "value_multiplier": value_multiplier,
        "cost_per_contact_lkr": cost_per_contact_lkr,
        "window_days": window_days,
    }
    if not rows:
        return {"empty": True, "assumptions": assumptions}

    n = len(rows)
    ns = sum(1 for r in rows if r["no_show"])
    days = {r["day"] for r in rows}
    span_days = (max(days) - min(days)).days + 1
    annual_scale = 365.0 / span_days
    baseline = {
        "source": "database",
        "n_appointments": n,
        "days_with_appointments": len(days),
        "window_calendar_days": span_days,
        "daily_appointments": n / len(days),
        "avg_fee_lkr": sum(r["fee"] for r in rows) / n,
        "no_show_rate": ns / n,
        "synthetic": any(r["synthetic"] for r in rows),
    }

    agg = replay(rows, contact_fraction)
    main = _scenario(agg, efficacy, value_multiplier, cost_per_contact_lkr)

    cells = []
    for k in SENS_KS:
        a = replay(rows, k)
        for e in SENS_EFFICACIES:
            cells.append(_scenario(a, e, value_multiplier, cost_per_contact_lkr))

    expenses = custom_expenses if custom_expenses is not None else load_expenses(db, hospital_id)
    contacts_per_year = main["contacts"] * annual_scale
    fixed, breakdown = annual_expenses(expenses, contacts_per_year)

    def annual_net(sc: dict) -> float:
        return (sc["recovered_lkr_model"] - sc["contact_cost_lkr"]) * annual_scale - fixed

    annual_recovered = main["recovered_lkr_model"] * annual_scale
    annual_cost = main["contact_cost_lkr"] * annual_scale
    net = annual_recovered - annual_cost - fixed
    nets = [annual_net(c) for c in cells]
    total_cost = annual_cost + fixed
    return {
        "empty": False,
        "baseline": baseline,
        "assumptions": assumptions,
        "replay": {**main, "no_shows": agg["no_shows"], "appointments": agg["appointments"],
                   "days": agg["days"], "caught_model": agg["caught_model"], "caught_random": agg["caught_random"]},
        "annual": {
            "scale": annual_scale,
            "recovered_lkr": annual_recovered,
            "recovered_lkr_random_contact": main["recovered_lkr_random"] * annual_scale,
            "contact_cost_lkr": annual_cost,
            "fixed_expenses_lkr": fixed,
            "net_benefit_lkr": net,
            "net_benefit_low_lkr": min(nets),
            "net_benefit_high_lkr": max(nets),
            "roi_multiple": (annual_recovered / total_cost) if total_cost > 0 else None,
            "payback_days": (total_cost / annual_recovered * 365.0) if annual_recovered > 0 and total_cost > 0 else None,
            "expense_category_breakdown": breakdown,
            "expenses_recorded": len(expenses),
        },
        "sensitivity": {
            "efficacies": list(SENS_EFFICACIES),
            "ks": list(SENS_KS),
            "cells": [
                {**c, "annual_net_lkr": annual_net(c), "annual_recovered_lkr": c["recovered_lkr_model"] * annual_scale}
                for c in cells
            ],
        },
    }

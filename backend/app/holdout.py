"""Randomised hold-out for outreach, so the efficacy of contacting patients can be measured instead of assumed.

When enabled (``OUTREACH_HOLDOUT_PCT`` > 0) a fixed share of appointments is the *control* arm: staff are told not to
contact them. The arm is a deterministic hash of the appointment id, so it is reproducible, cannot be picked by staff
and needs no stored column. The report compares no-show rates between the arms, the intention-to-treat estimate
the Sri Lankan reminder study (Rajasuriya et al. 2010) said it lacked: it had no control group.

Changing the percentage or the salt part-way through re-labels past appointments; start a new measurement period
instead. Hold-out is for a pilot with real patients and is off by default.
"""
from __future__ import annotations

import hashlib
import math
import os
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app import auth, models
from app.database import get_db
from app.services.uhid import LK_TZ

router = APIRouter()

Z_ALPHA = 1.96  # two-sided 5%
Z_POWER = 0.8416  # 80% power


def holdout_pct() -> float:
    try:
        return min(max(float(os.getenv("OUTREACH_HOLDOUT_PCT", "0")), 0.0), 50.0)
    except ValueError:
        return 0.0


def arm_for(appointment_id: uuid.UUID, pct: float | None = None) -> Literal["contact", "holdout"]:
    """'holdout' for ``pct`` percent of appointments, chosen by hashing the appointment id."""
    pct = holdout_pct() if pct is None else pct
    if pct <= 0:
        return "contact"
    salt = os.getenv("OUTREACH_HOLDOUT_SALT", "shai-holdout-v1")
    bucket = int(hashlib.sha256(f"{salt}:{appointment_id}".encode()).hexdigest()[:8], 16) % 10000 / 100.0
    return "holdout" if bucket < pct else "contact"


def required_n_per_arm(control_rate: float, efficacy: float) -> int | None:
    """Patients needed in each arm to detect that outreach cuts the no-show rate by ``efficacy`` (80% power)."""
    p1, p2 = control_rate, control_rate * (1 - efficacy)
    if p1 <= 0 or p1 >= 1 or p1 == p2:
        return None
    return math.ceil((Z_ALPHA + Z_POWER) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2)) / (p1 - p2) ** 2)


def analyse(rows: list[dict], pct: float) -> dict:
    """``rows``: dicts with ``arm``, ``no_show`` (bool) and ``contacted`` (bool)."""
    arms: dict[str, dict] = {}
    for name in ("contact", "holdout"):
        sub = [r for r in rows if r["arm"] == name]
        n = len(sub)
        ns = sum(r["no_show"] for r in sub)
        arms[name] = {
            "n": n, "no_shows": ns, "rate": (ns / n) if n else None,
            "contacted_share": (sum(r["contacted"] for r in sub) / n) if n else None,
        }
    c, h = arms["contact"], arms["holdout"]
    out: dict = {"arms": arms, "difference": None, "implied_efficacy": None, "required_n_per_arm": None}
    if c["n"] and h["n"]:
        diff = h["rate"] - c["rate"]  # positive when contacting helps
        se = math.sqrt(c["rate"] * (1 - c["rate"]) / c["n"] + h["rate"] * (1 - h["rate"]) / h["n"])
        out["difference"] = {"absolute": diff, "ci": [diff - Z_ALPHA * se, diff + Z_ALPHA * se], "significant": abs(diff) > Z_ALPHA * se}
        if h["rate"]:
            out["implied_efficacy"] = {
                "point": diff / h["rate"],
                "ci": [(diff - Z_ALPHA * se) / h["rate"], (diff + Z_ALPHA * se) / h["rate"]],
            }
    base = h["rate"] if h["rate"] is not None else c["rate"]
    if base:
        out["required_n_per_arm"] = required_n_per_arm(base, 0.26)
    return out


@router.get("/outreach/holdout/report", dependencies=[Depends(auth.require_role("manager"))])
def holdout_report(
    request: Request,
    days: int = Query(90, ge=14, le=730),
    tiers: str = Query("High", description="Comma-separated risk tiers included, e.g. High,Medium"),
    db: Session = Depends(get_db),
):
    """No-show rate with and without outreach among flagged appointments (intention to treat)."""
    pct = holdout_pct()
    wanted = [t.strip().capitalize() for t in tiers.split(",") if t.strip()]
    base = {"enabled": pct > 0, "holdout_pct": pct, "days": days, "tiers": wanted}
    if pct <= 0:
        return {**base, "message": "Hold-out is off. Set OUTREACH_HOLDOUT_PCT (for example 10) to start a measurement period."}

    today = datetime.now(LK_TZ).date()
    q = (
        db.query(models.Appointment.id, models.Appointment.no_show, models.Appointment.data_source)
        .join(models.Prediction, models.Prediction.appointment_id == models.Appointment.id)
        .filter(
            models.Appointment.no_show.isnot(None),
            models.Appointment.status != "cancelled",
            models.Appointment.appointment_day < today,
            models.Appointment.appointment_day >= today - timedelta(days=days),
            models.Prediction.risk_category.in_(wanted),
        )
    )
    hid = getattr(request.state, "hospital_id", None)
    if hid:
        q = q.filter(models.Appointment.hospital_id == hid)
    found = q.all()
    contacted_ids = set()
    if found:
        contacted_ids = {
            a for (a,) in db.query(models.Intervention.appointment_id)
            .filter(models.Intervention.appointment_id.in_([f[0] for f in found])).distinct().all()
        }
    rows = [{"arm": arm_for(i, pct), "no_show": bool(ns), "contacted": i in contacted_ids} for i, ns, _ in found]
    result = analyse(rows, pct)
    contaminated = (result["arms"]["holdout"]["contacted_share"] or 0) > 0  # any contact of a control patient
    return {
        **base, **result,
        "synthetic": any(src == "synthetic" for _, _, src in found),
        "contamination_warning": contaminated,
        "caveat": "Intention to treat: the contact arm is who staff were told to contact, whether or not they reached "
                  "everyone, so the effect is diluted by missed contacts. Synthetic history has no real outreach and "
                  "will show no effect; this fills in during a real pilot." ,
    }

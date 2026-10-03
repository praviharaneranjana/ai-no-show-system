"""Model evaluation computed from appointments that have a recorded outcome.

Pure numpy (no scikit-learn at runtime). Only non-cancelled appointments with ``no_show`` recorded
and an ``appointment_day`` before ``as_of`` are evaluated, so scheduled (future) rows never count.
"""
import uuid
from datetime import date

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models

TIERS = ("High", "Medium", "Low")


def roc_auc(y: np.ndarray, p: np.ndarray) -> float | None:
    y = np.asarray(y, dtype=int)
    n_pos = int(y.sum())
    n_neg = len(y) - n_pos
    if n_pos == 0 or n_neg == 0:
        return None
    order = np.argsort(p, kind="mergesort")
    ranks = np.empty(len(p), dtype=float)
    ps = np.asarray(p)[order]
    # average ranks for ties
    i = 0
    n = len(ps)
    while i < n:
        j = i
        while j + 1 < n and ps[j + 1] == ps[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return float((ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))


def pr_auc(y: np.ndarray, p: np.ndarray) -> float | None:
    """Average precision (step-wise area under the precision-recall curve)."""
    y = np.asarray(y, dtype=int)
    n_pos = int(y.sum())
    if n_pos == 0:
        return None
    order = np.argsort(-np.asarray(p), kind="mergesort")
    ys = y[order]
    ps = np.asarray(p)[order]
    tp = np.cumsum(ys)
    fp = np.cumsum(1 - ys)
    # only evaluate at the last index of each distinct score
    last = np.r_[ps[1:] != ps[:-1], True]
    tp, fp = tp[last], fp[last]
    precision = tp / (tp + fp)
    recall = tp / n_pos
    recall_prev = np.r_[0.0, recall[:-1]]
    return float(np.sum((recall - recall_prev) * precision))


def brier(y: np.ndarray, p: np.ndarray) -> float:
    y = np.asarray(y, dtype=float)
    return float(np.mean((np.asarray(p) - y) ** 2))


def recall_at_top(y: np.ndarray, p: np.ndarray, frac: float = 0.20) -> dict:
    y = np.asarray(y, dtype=int)
    k = max(int(round(len(y) * frac)), 1)
    order = np.argsort(-np.asarray(p), kind="mergesort")[:k]
    caught = int(y[order].sum())
    total = int(y.sum())
    base = total / len(y) if len(y) else 0.0
    precision = caught / k
    return {
        "k": k,
        "recall": caught / total if total else None,
        "precision": precision,
        "lift": (precision / base) if base else None,
    }


def evaluate_arrays(y: np.ndarray, p: np.ndarray, categories: np.ndarray, medium_threshold: float | None = None) -> dict:
    y = np.asarray(y, dtype=int)
    p = np.asarray(p, dtype=float)
    categories = np.asarray(categories)
    n = int(len(y))
    out: dict = {"n_evaluated": n}
    if n == 0:
        return out
    top20 = recall_at_top(y, p, 0.20)
    tiers = {}
    for t in TIERS:
        m = categories == t
        cnt = int(m.sum())
        tiers[t] = {
            "n": cnt,
            "share": cnt / n,
            "mean_predicted": float(p[m].mean()) if cnt else None,
            "observed_no_show_rate": float(y[m].mean()) if cnt else None,
            "no_shows": int(y[m].sum()),
        }
    flagged = np.isin(categories, ["High", "Medium"])
    tp = int((flagged & (y == 1)).sum())
    fp = int((flagged & (y == 0)).sum())
    fn = int((~flagged & (y == 1)).sum())
    tn = int((~flagged & (y == 0)).sum())
    out.update({
        "observed_no_show_rate": float(y.mean()),
        "mean_predicted": float(p.mean()),
        "roc_auc": roc_auc(y, p),
        "pr_auc": pr_auc(y, p),
        "brier": brier(y, p),
        "recall_top20": top20["recall"],
        "precision_top20": top20["precision"],
        "lift_top20": top20["lift"],
        "tiers": tiers,
        "confusion_matrix": {
            "rule": "flagged = High or Medium tier",
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "specificity": tn / (tn + fp) if tn + fp else None,
            "flagged_share": (tp + fp) / n,
        },
    })
    return out


def fetch_outcomes(
    db: Session,
    *,
    hospital_id: uuid.UUID | None = None,
    data_source: str | None = None,
    as_of: date | None = None,
):
    """(y, p, categories, appointment_ids) for evaluated appointments (outcome recorded, not cancelled, past)."""
    as_of = as_of or date.today()
    q = (
        db.query(models.Appointment.no_show, models.Prediction.risk_score, models.Prediction.risk_category)
        .join(models.Prediction, models.Prediction.appointment_id == models.Appointment.id)
        .filter(
            models.Appointment.no_show.isnot(None),
            models.Appointment.status != "cancelled",
            models.Appointment.appointment_day < as_of,
        )
    )
    if hospital_id is not None:
        q = q.filter(models.Appointment.hospital_id == hospital_id)
    if data_source is not None:
        q = q.filter(models.Appointment.data_source == data_source)
    rows = q.all()
    y = np.array([1 if r[0] else 0 for r in rows], dtype=int)
    p = np.array([float(r[1]) for r in rows], dtype=float)
    cats = np.array([r[2] for r in rows], dtype=object)
    return y, p, cats


def evaluate_db(db: Session, **kwargs) -> dict:
    y, p, cats = fetch_outcomes(db, **kwargs)
    return evaluate_arrays(y, p, cats)


def data_source_mix(db: Session, hospital_id: uuid.UUID | None = None) -> dict[str, int]:
    q = db.query(models.Appointment.data_source, func.count()).group_by(models.Appointment.data_source)
    if hospital_id is not None:
        q = q.filter(models.Appointment.hospital_id == hospital_id)
    return {(k or "unknown"): int(v) for k, v in q.all()}

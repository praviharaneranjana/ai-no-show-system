"""Batch (re)scoring of stored appointments with the active SHAI bundle.

Uses exactly the same feature derivation as ``services.scoring.score_appointment``
(prior history = this patient's earlier-dated appointments with a recorded outcome),
but vectorises the history lookup so tens of thousands of rows score in seconds.
Each prediction row is stamped with ``model_version``.
"""
import uuid
from datetime import date, datetime

import numpy as np
import pandas as pd
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app import models, shai_model

CHUNK = 5000


def _age_on(dob: date, day: date) -> int:
    return max(day.year - dob.year - ((day.month, day.day) < (dob.month, dob.day)), 0)


def _history_counts(rows: pd.DataFrame) -> pd.DataFrame:
    """prior_appts / prior_no_shows per row.

    Same rule as ``scoring.score_appointment`` and the training notebook: the patient's other appointments that
    took place before this one was *booked* (``appointment_day < scheduled_day``) and have a recorded outcome.
    """
    rows = rows.copy()
    prior_appts = np.zeros(len(rows), dtype=int)
    prior_ns = np.zeros(len(rows), dtype=int)
    known = rows[rows["no_show"].notna()]
    hist = {
        pid: (
            np.array(sorted(g["appointment_day"]), dtype="datetime64[D]"),
            np.cumsum([int(bool(x)) for x in g.sort_values("appointment_day")["no_show"]]),
        )
        for pid, g in known.groupby("patient_id")
    }
    sched = rows["scheduled_day"].to_numpy(dtype="datetime64[D]")
    pids = rows["patient_id"].to_numpy()
    for i in range(len(rows)):
        h = hist.get(pids[i])
        if h is None:
            continue
        n = int(np.searchsorted(h[0], sched[i], side="left"))
        if n:
            prior_appts[i] = n
            prior_ns[i] = int(h[1][n - 1])
    rows["prior_appts"] = prior_appts
    rows["prior_no_shows"] = prior_ns
    return rows


def load_scoring_frame(db: Session, hospital_id: uuid.UUID | None = None, data_source: str | None = None) -> pd.DataFrame:
    q = (
        select(
            models.Appointment.id.label("appointment_id"),
            models.Appointment.hospital_id,
            models.Appointment.patient_id,
            models.Appointment.scheduled_day,
            models.Appointment.appointment_day,
            models.Appointment.scheduled_time,
            models.Appointment.department.label("appt_department"),
            models.Appointment.booking_channel,
            models.Appointment.payment_mode,
            models.Appointment.sms_received,
            models.Appointment.sms_reminder_opt_in,
            models.Appointment.heavy_rain,
            models.Appointment.status,
            models.Appointment.no_show,
            models.Patient.date_of_birth,
            models.Patient.gender,
            models.Patient.distance_km,
            models.Patient.hypertension,
            models.Patient.diabetes,
            models.Department.model_category,
            models.Department.name.label("dept_name"),
        )
        .join(models.Patient, models.Patient.id == models.Appointment.patient_id)
        .outerjoin(models.Doctor, models.Doctor.id == models.Appointment.doctor_id)
        .outerjoin(models.Department, models.Department.id == models.Doctor.department_id)
    )
    if hospital_id is not None:
        q = q.where(models.Appointment.hospital_id == hospital_id)
    if data_source is not None:
        q = q.where(models.Appointment.data_source == data_source)
    rows = pd.DataFrame(db.execute(q).mappings().all())
    return rows.astype(object).where(rows.notna(), None) if not rows.empty else rows


def rescore_all(
    db: Session,
    shai: shai_model.ShaiModel,
    *,
    hospital_id: uuid.UUID | None = None,
    data_source: str | None = None,
    stage: str = "rescore",
    include_cancelled: bool = False,
    log: bool = True,
) -> dict:
    """Score every (non-cancelled) appointment and replace its stored prediction. Returns summary counts."""
    rows = load_scoring_frame(db, hospital_id, data_source)
    if rows.empty:
        return {"scored": 0, "model_version": shai.version}

    # History is computed over ALL of the patient's appointments in scope, then cancelled rows are dropped.
    rows = _history_counts(rows)
    if not include_cancelled:
        rows = rows[rows["status"] != "cancelled"]
    rows = rows.reset_index(drop=True)

    records = []
    for r in rows.itertuples(index=False):
        dept = r.model_category or r.dept_name or r.appt_department
        records.append(
            shai_model.engineer(
                model=shai,
                age=_age_on(r.date_of_birth, r.appointment_day),
                gender=r.gender,
                distance_km=None if r.distance_km is None else float(r.distance_km),
                scheduled_day=r.scheduled_day,
                appointment_day=r.appointment_day,
                scheduled_time=r.scheduled_time or "09:00",
                department=dept,
                booking_channel=r.booking_channel or "in_person",
                payment_mode=r.payment_mode or "cash",
                sms_sent=bool(r.sms_received or r.sms_reminder_opt_in),
                hypertension=bool(r.hypertension),
                diabetes=bool(r.diabetes),
                prior_appts=int(r.prior_appts),
                prior_no_shows=int(r.prior_no_shows),
                heavy_rain=1 if r.heavy_rain else 0,
            )
        )

    ids = list(rows["appointment_id"])
    now = datetime.now().astimezone()
    pred_rows, log_rows = [], []
    for start in range(0, len(records), CHUNK):
        chunk = records[start:start + CHUNK]
        df = shai.frame(chunk)
        _, calibrated = shai.score(df)
        contribs = shai.explain(df)
        for i, feats in enumerate(chunk):
            idx = start + i
            score = round(float(calibrated[i]), 4)
            cat = shai.category(score)
            pred_rows.append(dict(
                id=uuid.uuid4(),
                hospital_id=rows.at[idx, "hospital_id"],
                appointment_id=ids[idx],
                risk_score=score,
                risk_category=cat,
                explanation={"contributions": contribs[i], "model_version": shai.version},
                recommendation=shai.recommendation(cat),
                model_version=shai.version,
            ))
            if log:
                log_rows.append(dict(
                    id=uuid.uuid4(), appointment_id=ids[idx], stage=stage, features=feats,
                    risk_score=score, risk_category=cat, model_version=shai.version, created_at=now,
                ))

    for start in range(0, len(ids), CHUNK):
        db.execute(delete(models.Prediction).where(models.Prediction.appointment_id.in_(ids[start:start + CHUNK])))
    for start in range(0, len(pred_rows), CHUNK):
        db.execute(insert(models.Prediction), pred_rows[start:start + CHUNK])
    for start in range(0, len(log_rows), CHUNK):
        db.execute(insert(models.PredictionLog), log_rows[start:start + CHUNK])
    db.commit()
    return {"scored": len(pred_rows), "model_version": shai.version}

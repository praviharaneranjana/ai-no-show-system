"""Batch prediction runner service for Prediction Hub.

Executes batch predictions across appointments for a given day (and optional doctor),
optionally running an HIS sync first, tracking progress every 5 appointments,
and recording run metrics in prediction_runs.
"""
from __future__ import annotations

import logging
import uuid
import zoneinfo
from datetime import timedelta, date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.services import his_sync, scoring

logger = logging.getLogger("prediction_runner")
LK_TZ = zoneinfo.ZoneInfo("Asia/Colombo")


def run_predictions(
    run_date: date,
    doctor_id: Optional[uuid.UUID],
    with_sync: bool,
    heavy_rain: bool,
    db: Session,
    user: Optional[models.User] = None,
    run_id: Optional[uuid.UUID] = None,
    department_id: Optional[int] = None,
    slot_label: Optional[str] = None,
    user_filter: Optional[str] = None,
    re_score: bool = True,
    department_wise: bool = False,
    hospital_id: Optional[uuid.UUID] = None,
) -> models.PredictionRun:
    """Run batch prediction engine. Can be called synchronously or in background task."""
    actor = user.email if user else "system"
    user_hid = None
    if user:
        user_hid = getattr(user, "hospital_id", None)
        if user_hid is None and getattr(user, "memberships", None):
            user_hid = user.memberships[0].hospital_id
    eff_hospital_id = hospital_id or user_hid


    if run_id:
        run = db.get(models.PredictionRun, run_id)
        if not run:
            run = models.PredictionRun(
                id=run_id,
                hospital_id=eff_hospital_id,
                run_date=run_date,
                doctor_id=doctor_id,
                status="running",
                stage="queued",
                with_sync=with_sync,
                triggered_by=actor,
                started_at=datetime.now(timezone.utc),
            )
            db.add(run)
            db.commit()
    else:
        run = models.PredictionRun(
            id=uuid.uuid4(),
            hospital_id=eff_hospital_id,
            run_date=run_date,
            doctor_id=doctor_id,
            status="running",
            stage="queued",
            with_sync=with_sync,
            triggered_by=actor,
            started_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()

    try:
        # 1. Sync stage (optional)
        if with_sync:
            run.status = "running"
            run.stage = "syncing"
            db.commit()
            sync_res = his_sync.sync_day(
                target_date=run_date,
                db=db,
                triggered_by=actor,
                trigger="combined_run",
                hospital_id=eff_hospital_id,
            )
            if sync_res.status == "failed":
                logger.warning("HIS sync stage completed with errors: %s", sync_res.error)

        # 2. Query target appointments
        run.status = "running"
        run.stage = "scoring"
        db.commit()

        from sqlalchemy import or_, and_

        q = (
            db.query(models.Appointment)
            .filter(
                models.Appointment.appointment_day == run_date,
                models.Appointment.status.in_(["scheduled", "booked"]),
            )
        )

        if eff_hospital_id:
            q = q.filter(models.Appointment.hospital_id == eff_hospital_id)

        if doctor_id:
            q = q.filter(models.Appointment.doctor_id == doctor_id)

        if department_id:
            q = q.join(models.Doctor, models.Appointment.doctor_id == models.Doctor.id).filter(
                models.Doctor.department_id == department_id
            )

        if slot_label and slot_label.lower() != "all":
            sl = slot_label.lower().strip()
            if sl == "morning":
                q = q.filter(
                    or_(
                        models.Appointment.scheduled_time < "12:30",
                        models.Appointment.clinic_session.has(models.DoctorClinicSession.label == "Morning"),
                    )
                )
            elif sl == "afternoon":
                q = q.filter(
                    or_(
                        and_(models.Appointment.scheduled_time >= "12:30", models.Appointment.scheduled_time < "16:30"),
                        models.Appointment.clinic_session.has(models.DoctorClinicSession.label == "Afternoon"),
                    )
                )
            elif sl == "evening":
                q = q.filter(
                    or_(
                        models.Appointment.scheduled_time >= "16:30",
                        models.Appointment.clinic_session.has(models.DoctorClinicSession.label == "Evening"),
                    )
                )

        if user_filter and user_filter.lower() != "all":
            uf = user_filter.strip()
            q = q.filter(
                or_(
                    models.Appointment.booking_channel.ilike(f"%{uf}%"),
                    models.Appointment.booked_by.ilike(f"%{uf}%"),
                )
            )

        if not re_score:
            scored_subquery = db.query(models.Prediction.appointment_id).subquery()
            q = q.filter(models.Appointment.id.not_in(scored_subquery))

        if department_wise:
            q = q.outerjoin(models.Doctor, models.Appointment.doctor_id == models.Doctor.id).outerjoin(
                models.Department, models.Doctor.department_id == models.Department.id
            )
            appointments = q.order_by(models.Department.name.asc().nulls_last(), models.Appointment.scheduled_time.asc()).all()
        else:
            appointments = q.order_by(models.Appointment.scheduled_time.asc()).all()

        total_count = len(appointments)
        run.total = total_count
        db.commit()

        scored = 0
        failed = 0
        high = 0
        medium = 0
        low = 0
        expected_sum = 0.0
        dept_breakdown: dict[str, int] = {}

        for appt in appointments:
            try:
                pred_res = scoring.score_appointment(
                    db=db,
                    appointment=appt,
                    stage="day_of",
                    run_id=run.id,
                    heavy_rain=heavy_rain,
                    persist=True,
                )
                score = pred_res["risk_score"]
                cat = pred_res["risk_category"].lower()
                expected_sum += score

                if cat == "high":
                    high += 1
                elif cat == "medium":
                    medium += 1
                else:
                    low += 1

                # Track department-wise counts
                dept_name = "General"
                if appt.doctor and appt.doctor.department:
                    dept_name = appt.doctor.department.name
                elif appt.department:
                    dept_name = appt.department
                dept_breakdown[dept_name] = dept_breakdown.get(dept_name, 0) + 1

                scored += 1
            except Exception as e:
                logger.error("Failed scoring appointment %s: %s", appt.id, e)
                failed += 1

            # Progress update every 5 items
            if (scored + failed) % 5 == 0 or (scored + failed) == total_count:
                run.scored = scored
                run.failed = failed
                run.high = high
                run.medium = medium
                run.low = low
                db.commit()

        run.status = "done"
        run.stage = "completed"
        run.scored = scored
        run.failed = failed
        run.high = high
        run.medium = medium
        run.low = low
        run.expected_no_shows = round(expected_sum, 2)
        run.finished_at = datetime.now(timezone.utc)
        setattr(run, "_dept_breakdown", dept_breakdown)
        db.commit()
        db.refresh(run)
        return run

    except Exception as err:
        logger.exception("Batch prediction run %s failed: %s", run.id, err)
        db.rollback()
        run.status = "failed"
        run.stage = "failed"
        run.error = f"Run failed ({type(err).__name__}); see the server log"
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(run)
        return run


def reap_stale_runs(db: Session, older_than_minutes: int = 30) -> int:
    """Mark runs still 'running' after ``older_than_minutes`` as failed.

    A background task killed by a restart leaves its row 'running' forever; the Prediction Hub would then
    show a run that never finishes. Called at API start-up.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)
    stale = (
        db.query(models.PredictionRun)
        .filter(models.PredictionRun.status == "running", models.PredictionRun.started_at < cutoff)
        .all()
    )
    for run in stale:
        run.status = "failed"
        run.stage = "failed"
        run.error = "Interrupted: the server restarted or the run timed out before it finished"
        run.finished_at = datetime.now(timezone.utc)
    if stale:
        db.commit()
    return len(stale)

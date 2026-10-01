"""Batch prediction runner service for Prediction Hub.

Executes batch predictions across appointments for a given day (and optional doctor),
optionally running an HIS sync first, tracking progress every 5 appointments,
and recording run metrics in prediction_runs.
"""
from __future__ import annotations

import logging
import uuid
import zoneinfo
from datetime import date, datetime, timezone
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
) -> models.PredictionRun:
    """Run batch prediction engine. Can be called synchronously or in background task."""
    actor = user.email if user else "system"

    if run_id:
        run = db.get(models.PredictionRun, run_id)
        if not run:
            run = models.PredictionRun(
                id=run_id,
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
            )
            if sync_res.status == "failed":
                logger.warning("HIS sync stage completed with errors: %s", sync_res.error)

        # 2. Query target appointments
        run.status = "running"
        run.stage = "scoring"
        db.commit()

        q = (
            db.query(models.Appointment)
            .filter(
                models.Appointment.appointment_day == run_date,
                models.Appointment.status.in_(["scheduled", "booked"]),
            )
        )
        if doctor_id:
            q = q.filter(models.Appointment.doctor_id == doctor_id)

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
        db.commit()
        db.refresh(run)
        return run

    except Exception as err:
        logger.exception("Batch prediction run %s failed: %s", run.id, err)
        db.rollback()
        run.status = "failed"
        run.stage = "failed"
        run.error = str(err)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(run)
        return run

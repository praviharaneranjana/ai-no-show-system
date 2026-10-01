"""HIS synchronization service.

Pulls appointments from the configured HIS connector (Simulated or HTTP),
idempotently synchronizes patients, doctors, clinic sessions, and appointments into SHAI,
and records sync run metrics in his_sync_runs.
"""
from __future__ import annotations

import logging
import uuid
import zoneinfo
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.his.connector import HISConnector, HISAppointmentPayload, get_his_connector
from app.services.uhid import generate_uhid
from app.services import geo_service

logger = logging.getLogger("his_sync")
LK_TZ = zoneinfo.ZoneInfo("Asia/Colombo")


@dataclass
class SyncResult:
    run_id: uuid.UUID
    target_date: date
    status: str
    fetched: int
    created: int
    updated: int
    unchanged: int
    failed: int
    error: Optional[str] = None


def map_his_status(his_status: str) -> str:
    s = (his_status or "booked").lower()
    mapping = {
        "booked": "scheduled",
        "arrived": "arrived",
        "completed": "attended",
        "no_show": "no_show",
        "cancelled": "cancelled",
    }
    return mapping.get(s, "scheduled")


def sync_day(
    target_date: date,
    db: Session,
    connector: Optional[HISConnector] = None,
    triggered_by: Optional[str] = None,
    trigger: str = "manual",
) -> SyncResult:
    """Pull appointments from HIS connector for target_date and synchronize into SHAI."""
    if connector is None:
        connector = get_his_connector(db=db)

    # 1. Create his_sync_runs record
    sync_run = models.HISSyncRun(
        id=uuid.uuid4(),
        target_date=target_date,
        trigger=trigger if trigger in ("manual", "auto", "combined_run") else "manual",
        status="running",
        fetched=0,
        created=0,
        updated=0,
        unchanged=0,
        failed=0,
        triggered_by=triggered_by or "system",
        started_at=datetime.now(timezone.utc),
    )
    db.add(sync_run)
    db.commit()

    fetched = 0
    created = 0
    updated = 0
    unchanged = 0
    failed = 0

    try:
        items = connector.fetch_appointments(target_date)
        fetched = len(items)
        sync_run.fetched = fetched
        db.flush()

        # Cache default department for unknown doctors
        gen_med_dept = (
            db.query(models.Department)
            .filter(models.Department.name == "General Medicine")
            .first()
        )
        if not gen_med_dept:
            gen_med_dept = db.query(models.Department).first()

        for item in items:
            try:
                # 2. Patient Resolution / Upsert
                patient = None
                if item.his_patient_ref:
                    patient = (
                        db.query(models.Patient)
                        .filter(models.Patient.his_patient_ref == item.his_patient_ref)
                        .first()
                    )

                if not patient and item.nic and item.nic.strip():
                    patient = (
                        db.query(models.Patient)
                        .filter(func.lower(models.Patient.nic) == item.nic.strip().lower())
                        .first()
                    )

                if not patient and item.phone and item.phone.strip():
                    clean_name = item.patient_name.strip().lower()
                    clean_phone = item.phone.strip()
                    patient = (
                        db.query(models.Patient)
                        .filter(
                            func.lower(models.Patient.full_name) == clean_name,
                            models.Patient.phone == clean_phone,
                        )
                        .first()
                    )

                if patient:
                    # Update fields if not already populated
                    if not patient.his_patient_ref and item.his_patient_ref:
                        patient.his_patient_ref = item.his_patient_ref
                    if not patient.phone and item.phone:
                        patient.phone = item.phone.strip()
                    if not patient.nic and item.nic:
                        patient.nic = item.nic.strip()
                    if not patient.city and item.city:
                        patient.city = item.city.strip()
                    if item.hypertension is not None:
                        patient.hypertension = item.hypertension
                    if item.diabetes is not None:
                        patient.diabetes = item.diabetes
                    if item.alcoholism is not None:
                        patient.alcoholism = item.alcoholism
                    if item.scholarship is not None:
                        patient.scholarship = item.scholarship
                else:
                    new_uhid = generate_uhid(db)
                    dist_km = None
                    dist_src = None
                    lat = None
                    lon = None

                    if item.city:
                        locs = geo_service.search_locations(db, item.city, limit=1)
                        if locs:
                            loc = locs[0]
                            lat = loc["latitude"]
                            lon = loc["longitude"]
                            dist_km, dist_src = geo_service.calculate_distance(lat, lon)

                    clean_gender = (item.gender or "female").strip().lower()
                    if clean_gender in ("male", "m"):
                        p_gender = "male"
                    elif clean_gender in ("female", "f"):
                        p_gender = "female"
                    else:
                        p_gender = "other"

                    patient = models.Patient(
                        id=uuid.uuid4(),
                        uhid=new_uhid,
                        his_patient_ref=item.his_patient_ref,
                        full_name=item.patient_name.strip(),
                        date_of_birth=item.date_of_birth,
                        gender=p_gender,
                        phone=item.phone.strip() if item.phone else None,
                        nic=item.nic.strip() if item.nic else None,
                        city=item.city.strip() if item.city else None,
                        distance_km=dist_km,
                        distance_source=dist_src,
                        latitude=lat,
                        longitude=lon,
                        hypertension=bool(item.hypertension),
                        diabetes=bool(item.diabetes),
                        alcoholism=bool(item.alcoholism),
                        handicap=item.handicap or 0,
                        scholarship=bool(item.scholarship),
                        preferred_language="en",
                    )
                    db.add(patient)
                    db.flush()

                # 3. Doctor Resolution
                doctor = None
                if item.doctor_code:
                    doctor = (
                        db.query(models.Doctor)
                        .filter(models.Doctor.his_doctor_code == item.doctor_code)
                        .first()
                    )

                if not doctor and item.doctor_name:
                    clean_doc_name = item.doctor_name.replace("Dr.", "").strip().lower()
                    doctor = (
                        db.query(models.Doctor)
                        .filter(func.lower(models.Doctor.full_name) == clean_doc_name)
                        .first()
                    )

                if not doctor:
                    clean_doc_name = item.doctor_name.replace("Dr.", "").strip()
                    doctor = models.Doctor(
                        id=uuid.uuid4(),
                        title="Dr.",
                        full_name=clean_doc_name,
                        department_id=gen_med_dept.id if gen_med_dept else 1,
                        his_doctor_code=item.doctor_code or f"HIS-{uuid.uuid4().hex[:6].upper()}",
                        needs_review=True,
                        active=True,
                    )
                    db.add(doctor)
                    db.flush()

                # 4. Session Resolution
                weekday = item.appointment_date.weekday()
                matching_sessions = (
                    db.query(models.DoctorClinicSession)
                    .filter(
                        models.DoctorClinicSession.doctor_id == doctor.id,
                        models.DoctorClinicSession.weekday == weekday,
                        models.DoctorClinicSession.active == True,
                    )
                    .all()
                )

                session = None
                for s in matching_sessions:
                    if s.start_time <= item.appointment_time <= s.end_time:
                        session = s
                        break
                if not session and matching_sessions:
                    session = matching_sessions[0]

                # 5. Appointment Upsert
                existing_appt = (
                    db.query(models.Appointment)
                    .filter(models.Appointment.external_ref == item.external_ref)
                    .first()
                )

                mapped_status = map_his_status(item.his_status)
                now_utc = datetime.now(timezone.utc)

                if existing_appt:
                    has_change = False
                    if existing_appt.status != mapped_status:
                        existing_appt.status = mapped_status
                        has_change = True
                    slot_str = item.appointment_time.strftime("%H:%M")
                    if existing_appt.scheduled_time != slot_str:
                        existing_appt.scheduled_time = slot_str
                        has_change = True
                    if existing_appt.doctor_id != doctor.id:
                        existing_appt.doctor_id = doctor.id
                        existing_appt.doctor_name = f"{doctor.title} {doctor.full_name}".strip()
                        has_change = True
                    if session and existing_appt.clinic_session_id != session.id:
                        existing_appt.clinic_session_id = session.id
                        has_change = True

                    existing_appt.his_synced_at = now_utc
                    if has_change:
                        updated += 1
                    else:
                        unchanged += 1
                else:
                    dept_name = (
                        doctor.department.model_category or doctor.department.name
                        if doctor.department
                        else item.department
                    )
                    new_appt = models.Appointment(
                        id=uuid.uuid4(),
                        patient_id=patient.id,
                        doctor_id=doctor.id,
                        clinic_session_id=session.id if session else None,
                        doctor_name=f"{doctor.title} {doctor.full_name}".strip(),
                        scheduled_day=item.booked_on,
                        appointment_day=item.appointment_date,
                        scheduled_time=item.appointment_time.strftime("%H:%M"),
                        queue_number=item.token_no or 1,
                        department=dept_name,
                        booking_channel=schemas.normalise_channel(item.booking_channel) or "Counter",
                        payment_mode=schemas.normalise_payment(item.payment_mode) or "Cash",
                        sms_reminder_opt_in=bool(item.sms_sent),
                        source="his_sync",
                        external_ref=item.external_ref,
                        his_synced_at=now_utc,
                        status=mapped_status,
                    )
                    db.add(new_appt)
                    db.flush()

                    event = models.AppointmentEvent(
                        id=uuid.uuid4(),
                        appointment_id=new_appt.id,
                        event_type="synced_from_his",
                        from_status=None,
                        to_status=mapped_status,
                        actor="his_sync",
                        note=f"Synced from HIS (ref: {item.external_ref})",
                        payload={"external_ref": item.external_ref, "token": item.token_no},
                    )
                    db.add(event)
                    created += 1

            except Exception as item_err:
                logger.error("Failed to sync HIS appointment %s: %s", getattr(item, "external_ref", "unknown"), item_err)
                failed += 1

        sync_run.status = "done"
        sync_run.created = created
        sync_run.updated = updated
        sync_run.unchanged = unchanged
        sync_run.failed = failed
        sync_run.finished_at = datetime.now(timezone.utc)
        db.commit()

        return SyncResult(
            run_id=sync_run.id,
            target_date=target_date,
            status="done",
            fetched=fetched,
            created=created,
            updated=updated,
            unchanged=unchanged,
            failed=failed,
        )

    except Exception as err:
        logger.exception("HIS sync failed for date %s: %s", target_date, err)
        db.rollback()
        sync_run.status = "failed"
        sync_run.error = str(err)
        sync_run.finished_at = datetime.now(timezone.utc)
        db.commit()

        return SyncResult(
            run_id=sync_run.id,
            target_date=target_date,
            status="failed",
            fetched=fetched,
            created=created,
            updated=updated,
            unchanged=unchanged,
            failed=failed,
            error=str(err),
        )

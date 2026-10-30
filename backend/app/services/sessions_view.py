"""Clinic sessions that run on a date, in the shape the dashboard's "Consultant Session Status" panel expects."""
import uuid
from datetime import date

from sqlalchemy.orm import Session, joinedload

from app import models, schemas


def running_sessions(db: Session, hospital_id: uuid.UUID | None, day: date) -> list[models.DoctorClinicSession]:
    """Timetable sessions for ``day``'s weekday that have at least one non-cancelled booking that day."""
    q = (
        db.query(models.DoctorClinicSession)
        .options(joinedload(models.DoctorClinicSession.doctor).joinedload(models.Doctor.department))
        .join(models.Doctor, models.Doctor.id == models.DoctorClinicSession.doctor_id)
        .filter(models.DoctorClinicSession.weekday == day.weekday(), models.DoctorClinicSession.active.is_(True))
        .filter(
            db.query(models.Appointment.id)
            .filter(
                models.Appointment.clinic_session_id == models.DoctorClinicSession.id,
                models.Appointment.appointment_day == day,
                models.Appointment.status != "cancelled",
            )
            .exists()
        )
    )
    if hospital_id:
        q = q.filter(models.Doctor.hospital_id == hospital_id)
    return q.order_by(models.DoctorClinicSession.start_time).all()


def session_out(s: models.DoctorClinicSession, day: date) -> schemas.DoctorSessionOut:
    doc = s.doctor
    return schemas.DoctorSessionOut(
        id=s.id,
        doctor_name=f"{doc.title} {doc.full_name}".strip(),
        specialty=doc.department.name if doc.department else "",
        room_number=s.room,
        session_date=day,
        scheduled_start_time=s.start_time.strftime("%H:%M"),
        status=s.delay_status,
        delay_minutes=s.delay_minutes,
        avg_consultation_mins=s.slot_minutes,
        max_capacity=s.max_patients,
        created_at=doc.created_at,
    )

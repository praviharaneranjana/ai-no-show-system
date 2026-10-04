"""Real rescheduling: find open sessions, move a booking, and tell the patient.

Used by the staff reschedule panel and by the outreach agent, so both book through the
same capacity, duplicate and token rules.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app import models
from app.services.uhid import LK_TZ

HORIZON_DAYS = 28


class RescheduleError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class SlotOption:
    doctor_id: uuid.UUID
    doctor_name: str
    session_id: uuid.UUID
    label: str
    day: date
    start_time: str
    end_time: str
    room: str
    remaining: int
    max_patients: int
    same_doctor: bool
    next_token: int

    @property
    def key(self) -> tuple[str, str]:
        return (str(self.session_id), self.day.isoformat())


def doctor_display(doc: models.Doctor) -> str:
    return f"{doc.title} {doc.full_name}".strip()


def _department_id(db: Session, appt: models.Appointment) -> Optional[int]:
    if appt.doctor and appt.doctor.department_id:
        return appt.doctor.department_id
    if appt.department:
        dept = db.query(models.Department).filter(func.lower(models.Department.name) == appt.department.lower()).first()
        return dept.id if dept else None
    return None


def _in_hospital(doc: models.Doctor, hospital_id: Optional[uuid.UUID]) -> bool:
    return hospital_id is None or doc.hospital_id in (None, hospital_id)


def find_options(
    db: Session,
    appt: models.Appointment,
    hospital_id: Optional[uuid.UUID],
    *,
    doctor_id: Optional[uuid.UUID] = None,
    horizon_days: int = HORIZON_DAYS,
    exclude: Iterable[tuple[str, str]] = (),
) -> list[SlotOption]:
    """Open sessions (free seat, not the current booking) of the same department, soonest first.

    The booking's own doctor is listed before colleagues on the same day.
    """
    dept_id = _department_id(db, appt)
    q = (
        db.query(models.Doctor)
        .options(joinedload(models.Doctor.sessions))
        .filter(models.Doctor.active.is_(True))
    )
    if doctor_id:
        q = q.filter(models.Doctor.id == doctor_id)
    elif dept_id is not None:
        q = q.filter(models.Doctor.department_id == dept_id)
    elif appt.doctor_id:
        q = q.filter(models.Doctor.id == appt.doctor_id)
    else:
        return []
    doctors = [d for d in q.all() if _in_hospital(d, hospital_id)]
    if doctor_id and dept_id is not None:
        doctors = [d for d in doctors if d.department_id == dept_id]
    if not doctors:
        return []

    now = datetime.now(LK_TZ)
    today = now.date()
    last = today + timedelta(days=horizon_days)
    session_ids = [s.id for d in doctors for s in d.sessions if s.active]
    booked: dict[tuple[uuid.UUID, date], int] = {}
    if session_ids:
        rows = (
            db.query(models.Appointment.clinic_session_id, models.Appointment.appointment_day, func.count())
            .filter(
                models.Appointment.clinic_session_id.in_(session_ids),
                models.Appointment.appointment_day >= today,
                models.Appointment.appointment_day <= last,
                models.Appointment.status != "cancelled",
            )
            .group_by(models.Appointment.clinic_session_id, models.Appointment.appointment_day)
            .all()
        )
        booked = {(sid, day): n for sid, day, n in rows}

    skip = set(exclude)
    options: list[SlotOption] = []
    for offset in range(0, horizon_days + 1):
        day = today + timedelta(days=offset)
        for d in doctors:
            for s in d.sessions:
                if not s.active or s.weekday != day.weekday():
                    continue
                if day == today and s.end_time <= now.time():
                    continue  # today's session is already over
                if day == appt.appointment_day and s.id == appt.clinic_session_id:
                    continue  # that is the current booking
                taken = booked.get((s.id, day), 0)
                if taken >= s.max_patients:
                    continue
                opt = SlotOption(
                    doctor_id=d.id,
                    doctor_name=doctor_display(d),
                    session_id=s.id,
                    label=s.label,
                    day=day,
                    start_time=s.start_time.strftime("%H:%M"),
                    end_time=s.end_time.strftime("%H:%M"),
                    room=s.room,
                    remaining=s.max_patients - taken,
                    max_patients=s.max_patients,
                    same_doctor=d.id == appt.doctor_id,
                    next_token=taken + 1,
                )
                if opt.key not in skip:
                    options.append(opt)
    options.sort(key=lambda o: (o.day, 0 if o.same_doctor else 1, o.start_time, o.doctor_name))
    return options


# ---------------------------------------------------------------- messages

def _when(day: date, start: str) -> str:
    return f"{day:%a %d %b %Y} {start}"


_CONFIRMED = {
    "en": "Hello {name}, your appointment is now on {when} with {doctor} (Room {room}, token #{token}). Reply 1 to confirm, or call us if you need another time.",
    "si": "ආයුබෝවන් {name}, ඔබගේ වේලාව {doctor} සමඟ {when} (කාමරය {room}, ටෝකන් #{token}) වෙත මාරු කර ඇත. තහවුරු කිරීමට 1 ලෙස පිළිතුරු දෙන්න, වෙනත් වේලාවක් අවශ්‍ය නම් අපට අමතන්න.",
    "ta": "வணக்கம் {name}, உங்கள் சந்திப்பு {doctor} உடன் {when} (அறை {room}, டோக்கன் #{token}) என மாற்றப்பட்டுள்ளது. உறுதிப்படுத்த 1 என பதிலளிக்கவும்; வேறு நேரம் தேவைப்பட்டால் எங்களை அழைக்கவும்.",
}
_OFFER = {
    "en": "Hello {name}, we can offer you {doctor} on {when} (Room {room}). Reply YES to book it, or NO to see another time.",
    "si": "ආයුබෝවන් {name}, {doctor} සමඟ {when} (කාමරය {room}) වේලාවක් ලබා දිය හැක. වෙන්කර ගැනීමට 'ඔව්' ලෙසත්, වෙනත් වේලාවක් සඳහා 'නැහැ' ලෙසත් පිළිතුරු දෙන්න.",
    "ta": "வணக்கம் {name}, {doctor} உடன் {when} (அறை {room}) நேரம் வழங்க முடியும். பதிவு செய்ய 'ஆம்' என்றும், வேறு நேரத்திற்கு 'இல்லை' என்றும் பதிலளிக்கவும்.",
}
_NONE = {
    "en": "Sorry {name}, we have no open session in the next {days} days for this clinic. Our desk will call you to arrange a time.",
    "si": "සමාවන්න {name}, මෙම සායනයේ ඉදිරි දින {days} තුළ හිස් වේලාවක් නැත. ඔබට වේලාවක් සකස් කිරීමට අපගේ කාර්යාලය ඔබට අමතනු ඇත.",
    "ta": "மன்னிக்கவும் {name}, இந்த கிளினிக்கில் அடுத்த {days} நாட்களில் காலி நேரம் இல்லை. நேரம் ஏற்பாடு செய்ய எங்கள் மேசை உங்களை அழைக்கும்.",
}


def _lang(language: str | None) -> str:
    return language if language in _CONFIRMED else "en"


def first_name(patient: models.Patient) -> str:
    return (patient.full_name or "").split()[0] if patient.full_name else ""


def confirmation_text(language: str | None, name: str, opt_doctor: str, day: date, start: str, room: str, token: int) -> str:
    return _CONFIRMED[_lang(language)].format(name=name, doctor=opt_doctor, when=_when(day, start), room=room, token=token)


def offer_text(language: str | None, name: str, opt: SlotOption) -> str:
    return _OFFER[_lang(language)].format(name=name, doctor=opt.doctor_name, when=_when(opt.day, opt.start_time), room=opt.room)


def no_slot_text(language: str | None, name: str) -> str:
    return _NONE[_lang(language)].format(name=name, days=HORIZON_DAYS)


# ---------------------------------------------------------------- booking

def reschedule_booking(
    db: Session,
    old: models.Appointment,
    *,
    session_id: uuid.UUID,
    day: date,
    doctor_id: Optional[uuid.UUID],
    hospital_id: Optional[uuid.UUID],
    actor: str,
    reason: str | None = None,
    notify_language: str | None = None,
    notify: bool = False,
    channel: str = "SMS",
    shai_instance=None,
    recall: bool = False,
) -> tuple[models.Appointment, Optional[str]]:
    """Cancel ``old`` and book the same patient into the chosen session, optionally messaging them.

    With ``recall`` the old booking is a recorded no-show: it stays a no-show (the miss is history, not a
    cancellation) and the new booking is linked to it. Raises RescheduleError; commits on success.
    """
    from app.services import scoring  # local import: scoring pulls in the model stack

    if old.status != "scheduled" and not (recall and old.status == "no_show"):
        raise RescheduleError(409, f"Only scheduled appointments can be rescheduled (this one is {old.status})")
    if not old.doctor_id:
        raise RescheduleError(400, "This appointment has no doctor to reschedule from")

    session = db.get(models.DoctorClinicSession, session_id)
    if not session or not session.active:
        raise RescheduleError(400, "Clinic session not found")
    doctor = db.get(models.Doctor, session.doctor_id)
    if doctor_id and doctor_id != session.doctor_id:
        raise RescheduleError(400, "Session does not belong to that doctor")
    if not doctor or not doctor.active or not _in_hospital(doctor, hospital_id):
        raise RescheduleError(404, "Doctor not found or inactive")
    dept_id = _department_id(db, old)
    if dept_id is not None and doctor.department_id != dept_id:
        raise RescheduleError(400, "Appointments can only move within the same department")

    today = datetime.now(LK_TZ).date()
    if day < today:
        raise RescheduleError(400, "Cannot reschedule into the past")
    if day.weekday() != session.weekday:
        raise RescheduleError(400, "The doctor does not hold this session on that weekday")
    if day == old.appointment_day and session.id == old.clinic_session_id:
        raise RescheduleError(400, "That is the current slot")

    # Serialise the capacity check and token assignment on the target session.
    db.query(models.DoctorClinicSession).filter_by(id=session.id).with_for_update().first()
    taken = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.clinic_session_id == session.id,
            models.Appointment.appointment_day == day,
            models.Appointment.status != "cancelled",
        )
        .count()
    )
    if taken >= session.max_patients:
        raise RescheduleError(409, f"Clinic session is full ({taken}/{session.max_patients})")
    duplicate = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.patient_id == old.patient_id,
            models.Appointment.doctor_id == doctor.id,
            models.Appointment.appointment_day == day,
            models.Appointment.status == "scheduled",
        )
        .first()
    )
    if duplicate:
        raise RescheduleError(409, "Patient already has a scheduled appointment with this doctor on that date")

    max_token = (
        db.query(func.coalesce(func.max(models.Appointment.queue_number), 0))
        .filter(
            models.Appointment.clinic_session_id == session.id,
            models.Appointment.appointment_day == day,
        )
        .scalar()
    ) or 0
    token = int(max_token) + 1
    slot_time = min(
        (datetime.combine(day, session.start_time) + timedelta(minutes=(token - 1) * session.slot_minutes)).time(),
        session.end_time,
    )
    now_utc = datetime.now(timezone.utc)

    new = models.Appointment(
        id=uuid.uuid4(),
        hospital_id=old.hospital_id,
        patient_id=old.patient_id,
        doctor_id=doctor.id,
        clinic_session_id=session.id,
        data_source=old.data_source,
        heavy_rain=old.heavy_rain,
        fee_lkr=doctor.consultation_fee_lkr if doctor.id != old.doctor_id else old.fee_lkr,
        doctor_name=doctor_display(doctor),
        scheduled_day=today,
        appointment_day=day,
        scheduled_time=slot_time.strftime("%H:%M"),
        queue_number=token,
        department=old.department,
        booking_channel=old.booking_channel,
        payment_mode=old.payment_mode,
        sms_reminder_opt_in=old.sms_reminder_opt_in,
        source="manual",
        booked_by=actor,
        status="scheduled",
        rescheduled_from_id=old.id,
        ai_action_status="Recalled" if recall else "Rescheduled",
    )
    db.add(new)

    if recall:
        old.ai_action_status = "Recalled and rebooked"
    else:
        old.status = "cancelled"
        old.cancelled_at = now_utc
        old.cancel_reason = reason or "rescheduled"
        old.ai_action_status = "Rescheduled"
    db.flush()

    db.add(models.AppointmentEvent(
        id=uuid.uuid4(), appointment_id=old.id, event_type="recall_rebooked" if recall else "rescheduled",
        from_status=old.status if recall else "scheduled", to_status=old.status, actor=actor,
        note=f"Moved to {doctor_display(doctor)} on {day.isoformat()} {slot_time:%H:%M}",
        payload={"new_appointment_id": str(new.id)},
    ))
    db.add(models.AppointmentEvent(
        id=uuid.uuid4(), appointment_id=new.id, event_type="booked",
        from_status=None, to_status="scheduled", actor=actor, note="Booked by recall" if recall else "Booked by reschedule",
        payload={"from_appointment_id": str(old.id), "token": token, "session_label": session.label, "room": session.room},
    ))

    message = None
    if notify:
        patient = old.patient
        message = confirmation_text(
            notify_language or getattr(patient, "preferred_language", None),
            first_name(patient), doctor_display(doctor), day, slot_time.strftime("%H:%M"), session.room, token,
        )
        new.sms_received = True
        new.reminder_sent_at = now_utc
        db.add(models.Intervention(
            hospital_id=old.hospital_id,
            appointment_id=new.id,
            channel=channel,
            language=_lang(notify_language or getattr(patient, "preferred_language", None)),
            status="sent",
            intent_detected="Reschedule confirmation",
            offered_slot=f"{doctor_display(doctor)} · {day.isoformat()} {slot_time:%H:%M}",
            message_text=message,
        ))

    new.patient = old.patient
    new.doctor = doctor
    new.clinic_session = session
    scoring.score_appointment(
        db=db, appointment=new, stage="booking", heavy_rain=bool(new.heavy_rain), persist=True, shai_instance=shai_instance,
    )
    db.commit()
    db.refresh(new)
    return new, message

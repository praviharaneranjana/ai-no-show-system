"""Post-miss recall: contact patients who missed an appointment and bring them back.

This is the intervention the Sri Lankan reminder study actually tested (Rajasuriya et al. 2010): patients who did
not attend were contacted by phone or letter and 16 of 61 (26.2%) attended within six weeks. The queue lists recent
no-shows, staff log each contact, a rebooking goes through the normal capacity rules, and the summary measures how
many contacted patients came back, so the hospital builds its own efficacy estimate instead of assuming one.
"""
from __future__ import annotations

import math
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app import auth, models, outreach_drafter
from app.database import get_db
from app.services import rescheduling
from app.services.uhid import LK_TZ

router = APIRouter()

RECALL_INTENT = "Recall"
CHANNELS = ("Call", "SMS", "WhatsApp", "Letter")
DEFAULT_WINDOW_DAYS = 14  # the study recalled non-attendees after two weeks; staff can act inside this window
BENCHMARK = {"recovered": 16, "contacted": 61, "source": "Rajasuriya, de Silva & Hanwella (2010), The Psychiatrist 34:515-518"}

_MSG = {
    "en": "Hello {name}, we missed you at your {dept} appointment on {when}. Please call us or reply to this message and we will find you a new time.",
    "si": "ආයුබෝවන් {name}, {when} දින ඔබගේ {dept} වෙන්කිරීමට ඔබව දැකගත නොහැකි විය. අපට ඇමතුමක් දෙන්න හෝ මෙයට පිළිතුරු දෙන්න, අපි ඔබට නව වේලාවක් සොයා දෙන්නෙමු.",
    "ta": "வணக்கம் {name}, {when} அன்று உங்கள் {dept} சந்திப்பில் உங்களைக் காண முடியவில்லை. எங்களை அழைக்கவும் அல்லது பதிலளிக்கவும்; புதிய நேரத்தை ஏற்பாடு செய்கிறோம்.",
}


def _hid(request: Request):
    return getattr(request.state, "hospital_id", None)


def _actor(request: Request) -> str:
    return getattr(getattr(request.state, "user", None), "email", None) or "staff"


def _shai():
    from app.main import shai  # lazy: avoids an import cycle with main
    return shai


def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """95% Wilson score interval for a proportion; None when there is nothing to measure."""
    if n <= 0:
        return None
    p = successes / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return max(0.0, centre - half), min(1.0, centre + half)


# ------------------------------------------------------------------ schemas

class RecallItem(BaseModel):
    appointment_id: uuid.UUID
    patient_id: uuid.UUID
    patient_name: str
    phone: str | None = None
    preferred_language: str = "en"
    department: str | None = None
    doctor_name: str | None = None
    missed_day: date
    days_since: int
    risk_category: str | None = None
    no_show_reason: str | None = None
    state: str  # not_contacted, contacted, rebooked
    suggested_channel: str  # Call, Letter or none
    discreet: bool  # sensitive department: messages must not name it
    contacts: int = 0
    last_contact_channel: str | None = None
    last_contact_at: datetime | None = None
    rebooked_appointment_id: uuid.UUID | None = None
    rebooked_day: date | None = None


class RecallQueue(BaseModel):
    window_days: int
    items: list[RecallItem]
    not_contacted: int
    contacted: int
    rebooked: int


class ContactRequest(BaseModel):
    channel: str
    language: str | None = None
    message_text: str | None = Field(None, max_length=1000)
    note: str | None = Field(None, max_length=500)


class RebookRequest(BaseModel):
    clinic_session_id: uuid.UUID
    appointment_day: date
    doctor_id: Optional[uuid.UUID] = None
    notify: bool = False
    language: str | None = None


class DraftOut(BaseModel):
    appointment_id: uuid.UUID
    language: str
    message: str
    discreet: bool


# ------------------------------------------------------------------ queries

def _missed(db: Session, hid, earliest: date, latest: date) -> list[models.Appointment]:
    q = (
        db.query(models.Appointment)
        .options(joinedload(models.Appointment.patient), joinedload(models.Appointment.prediction))
        .filter(
            models.Appointment.status == "no_show",
            models.Appointment.appointment_day >= earliest,
            models.Appointment.appointment_day <= latest,
        )
    )
    if hid:
        q = q.filter(models.Appointment.hospital_id == hid)
    return q.all()


def _returns(db: Session, missed: list[models.Appointment]) -> dict[uuid.UUID, models.Appointment]:
    """For each missed appointment, the first booking made on or after the miss that brought the patient back.

    A return is a non-cancelled appointment in the same department, booked on or after the day of the miss, for a
    later day. A booking linked through ``rescheduled_from_id`` always counts.
    """
    if not missed:
        return {}
    later = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.patient_id.in_({m.patient_id for m in missed}),
            models.Appointment.appointment_day >= min(m.appointment_day for m in missed),
            models.Appointment.status != "cancelled",
        )
        .order_by(models.Appointment.appointment_day)
        .all()
    )
    by_patient: dict[uuid.UUID, list[models.Appointment]] = defaultdict(list)
    for a in later:
        by_patient[a.patient_id].append(a)
    found: dict[uuid.UUID, models.Appointment] = {}
    for m in missed:
        for a in by_patient.get(m.patient_id, []):
            if a.id == m.id:
                continue
            linked = a.rescheduled_from_id == m.id
            same_service = (a.department or "") == (m.department or "")
            if linked or (same_service and a.appointment_day > m.appointment_day and a.scheduled_day >= m.appointment_day):
                found[m.id] = a
                break
    return found


def _contacts(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, list[models.Intervention]]:
    if not ids:
        return {}
    rows = (
        db.query(models.Intervention)
        .filter(models.Intervention.appointment_id.in_(ids), models.Intervention.intent_detected == RECALL_INTENT)
        .order_by(models.Intervention.created_at)
        .all()
    )
    out: dict[uuid.UUID, list[models.Intervention]] = defaultdict(list)
    for r in rows:
        out[r.appointment_id].append(r)
    return out


def _channel_for(patient: models.Patient) -> str:
    if patient.phone:
        return "Call"
    if patient.address_line or patient.city:
        return "Letter"
    return "none"


# ------------------------------------------------------------------ endpoints

@router.get("/recall/queue", response_model=RecallQueue)
def recall_queue(request: Request, days: int = Query(DEFAULT_WINDOW_DAYS, ge=1, le=60), db: Session = Depends(get_db)):
    """Recent no-shows to bring back, the ones whose window closes soonest first."""
    today = datetime.now(LK_TZ).date()
    missed = _missed(db, _hid(request), today - timedelta(days=days), today - timedelta(days=1))
    returns = _returns(db, missed)
    contacts = _contacts(db, [m.id for m in missed])

    items: list[RecallItem] = []
    for m in missed:
        hist = contacts.get(m.id, [])
        back = returns.get(m.id)
        state = "rebooked" if back else "contacted" if hist else "not_contacted"
        last = hist[-1] if hist else None
        items.append(RecallItem(
            appointment_id=m.id, patient_id=m.patient_id, patient_name=m.patient.full_name, phone=m.patient.phone,
            preferred_language=m.patient.preferred_language or "en", department=m.department, doctor_name=m.doctor_name,
            missed_day=m.appointment_day, days_since=(today - m.appointment_day).days,
            risk_category=m.prediction.risk_category if m.prediction else None, no_show_reason=m.no_show_reason,
            state=state, suggested_channel=_channel_for(m.patient),
            discreet=outreach_drafter.is_sensitive_department(m.department), contacts=len(hist),
            last_contact_channel=last.channel if last else None, last_contact_at=last.created_at if last else None,
            rebooked_appointment_id=back.id if back else None, rebooked_day=back.appointment_day if back else None,
        ))
    order = {"not_contacted": 0, "contacted": 1, "rebooked": 2}
    items.sort(key=lambda i: (order[i.state], i.missed_day))
    return RecallQueue(
        window_days=days, items=items,
        not_contacted=sum(i.state == "not_contacted" for i in items),
        contacted=sum(i.state == "contacted" for i in items),
        rebooked=sum(i.state == "rebooked" for i in items),
    )


def _appointment(db: Session, request: Request, appointment_id: uuid.UUID) -> models.Appointment:
    appt = db.get(models.Appointment, appointment_id)
    hid = _hid(request)
    if appt is None or (hid and appt.hospital_id != hid):
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status != "no_show":
        raise HTTPException(status_code=409, detail="Recall applies to appointments recorded as no-show")
    return appt


@router.post("/recall/{appointment_id}/draft", response_model=DraftOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def recall_draft(appointment_id: uuid.UUID, request: Request, language: str = "en", db: Session = Depends(get_db)):
    """A short recall message for staff to review. Template only; the specialty is withheld when it is sensitive."""
    appt = _appointment(db, request, appointment_id)
    lang = language if language in _MSG else (appt.patient.preferred_language if appt.patient.preferred_language in _MSG else "en")
    message = _MSG[lang].format(
        name=appt.patient.full_name.split()[0],
        dept=outreach_drafter.patient_facing_department(appt.department, lang),
        when=f"{appt.appointment_day:%d %b %Y}",
    )
    return DraftOut(appointment_id=appt.id, language=lang, message=message,
                    discreet=outreach_drafter.is_sensitive_department(appt.department))


@router.post("/recall/{appointment_id}/contact", dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def log_contact(appointment_id: uuid.UUID, body: ContactRequest, request: Request, db: Session = Depends(get_db)):
    """Record that staff contacted the patient (nothing is sent from here; staff phone, post or message them)."""
    if body.channel not in CHANNELS:
        raise HTTPException(status_code=422, detail=f"channel must be one of {', '.join(CHANNELS)}")
    appt = _appointment(db, request, appointment_id)
    lang = body.language if body.language in _MSG else (appt.patient.preferred_language or "en")
    row = models.Intervention(
        hospital_id=appt.hospital_id, appointment_id=appt.id, channel=body.channel, language=lang, status="sent",
        intent_detected=RECALL_INTENT, message_text=body.message_text,
        patient_reply=None,
    )
    db.add(row)
    db.add(models.AppointmentEvent(
        id=uuid.uuid4(), appointment_id=appt.id, event_type="recall_contact", from_status="no_show", to_status="no_show",
        actor=_actor(request), note=body.note, payload={"channel": body.channel},
    ))
    db.commit()
    return {"ok": True, "appointment_id": str(appt.id), "channel": body.channel}


@router.post("/recall/{appointment_id}/rebook", dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def rebook(appointment_id: uuid.UUID, body: RebookRequest, request: Request, db: Session = Depends(get_db)):
    """Book the patient a new slot after a miss. The no-show stays on record; the new booking links back to it."""
    appt = _appointment(db, request, appointment_id)
    try:
        new, message = rescheduling.reschedule_booking(
            db, appt, session_id=body.clinic_session_id, day=body.appointment_day, doctor_id=body.doctor_id,
            hospital_id=_hid(request), actor=_actor(request), reason="recall", notify=body.notify,
            notify_language=body.language, shai_instance=_shai(), recall=True,
        )
    except rescheduling.RescheduleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return {"appointment_id": str(new.id), "appointment_day": new.appointment_day.isoformat(), "message": message}


@router.get("/recall/summary")
def recall_summary(request: Request, days: int = Query(90, ge=14, le=365), db: Session = Depends(get_db)):
    """How many missed patients were contacted and how many came back, against a non-contacted comparison.

    The cohort is every no-show from ``days`` ago up to one week ago, so each patient has had time to return.
    The comparison is not randomised: contacted patients may differ from the rest. Use the hold-out report for a
    fair efficacy estimate.
    """
    today = datetime.now(LK_TZ).date()
    missed = _missed(db, _hid(request), today - timedelta(days=days), today - timedelta(days=7))
    returns = _returns(db, missed)
    contacts = _contacts(db, [m.id for m in missed])

    contacted = [m for m in missed if contacts.get(m.id)]
    others = [m for m in missed if not contacts.get(m.id)]
    back_c = sum(1 for m in contacted if m.id in returns)
    back_o = sum(1 for m in others if m.id in returns)
    attended_c = sum(1 for m in contacted if m.id in returns and returns[m.id].status == "completed")

    def rate(x: int, n: int):
        return (x / n) if n else None

    ci = wilson(back_c, len(contacted))
    bench = BENCHMARK["recovered"] / BENCHMARK["contacted"]
    return {
        "window_days": days,
        "missed": len(missed),
        "contacted": len(contacted),
        "contact_rate": rate(len(contacted), len(missed)),
        "returned_contacted": back_c,
        "returned_not_contacted": back_o,
        "attended_contacted": attended_c,
        "return_rate_contacted": rate(back_c, len(contacted)),
        "return_rate_contacted_ci": list(ci) if ci else None,
        "return_rate_not_contacted": rate(back_o, len(others)),
        "benchmark": {**BENCHMARK, "rate": bench, "ci": list(wilson(BENCHMARK["recovered"], BENCHMARK["contacted"]))},
        "synthetic": any(m.data_source == "synthetic" for m in missed),
        "caveat": "Not randomised: contacted patients may differ from those who were not. Synthetic history has no real "
                  "contacts, so this fills in only once staff log recall contacts." ,
    }

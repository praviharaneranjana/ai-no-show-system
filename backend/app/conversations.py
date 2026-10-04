"""Outreach threads, the ask-first reschedule conversation and the staff-attention summary."""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import auth, models
from app.database import get_db
from app.services import reschedule_flow as flow
from app.services import rescheduling
from app.services.rescheduling import RescheduleError

router = APIRouter()

_APPROVERS = auth.FRONT_LINE  # front desk talks to the patients, so front desk approves; analysts are read-only


def _hid(request: Request):
    return getattr(request.state, "hospital_id", None)


def _shai():
    from app.main import shai  # the shared model instance; imported lazily to avoid a cycle
    return shai


def _actor(request: Request) -> str:
    return getattr(getattr(request.state, "user", None), "email", None) or "staff"


def _conv(db: Session, request: Request, conv_id: uuid.UUID) -> models.RescheduleConversation:
    c = db.get(models.RescheduleConversation, conv_id)
    hid = _hid(request)
    if c is None or (hid and c.hospital_id != hid):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


def _fail(err: RescheduleError):
    raise HTTPException(status_code=err.status_code, detail=err.detail)


# ------------------------------------------------------------------ schemas

class ApptBrief(BaseModel):
    id: uuid.UUID
    day: date
    time: str | None = None
    doctor_name: str | None = None
    department: str | None = None
    token: int | None = None
    status: str


class ConversationOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    patient_name: str
    appointment_id: uuid.UUID
    origin_appointment_id: uuid.UUID
    state: str
    language: str
    initiated_by: str
    requested_date: date | None = None
    offer: dict | None = None
    options: list[dict] = []
    handled_by_staff: bool
    approved_by: str | None = None
    expires_at: datetime | None = None
    updated_at: datetime | None = None
    appointment: ApptBrief | None = None


class Bubble(BaseModel):
    id: str
    direction: str  # in (patient), out (system or staff), note (system event)
    text: str
    at: datetime
    kind: str | None = None
    channel: str | None = None
    offer: dict | None = None


class PatientBrief(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None = None
    uhid: str | None = None
    language: str = "en"


class ThreadSummary(BaseModel):
    patient_id: uuid.UUID
    patient_name: str
    phone: str | None = None
    last_text: str
    last_at: datetime
    state: str | None = None
    needs_attention: bool = False
    conversation_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None


class ThreadDetail(BaseModel):
    patient: PatientBrief
    conversation: ConversationOut | None = None
    messages: list[Bubble]
    appointment: ApptBrief | None = None


class AttentionItem(BaseModel):
    conversation_id: uuid.UUID
    patient_name: str
    state: str
    detail: str
    at: datetime
    href: str


class AttentionOut(BaseModel):
    pending_approval: int
    needs_staff: int
    no_reply: int
    in_progress: int
    items: list[AttentionItem]


class StartRequest(BaseModel):
    appointment_id: uuid.UUID
    language: str | None = None


class TextRequest(BaseModel):
    text: str


class RejectRequest(BaseModel):
    note: str | None = None


class StaffBookRequest(BaseModel):
    clinic_session_id: uuid.UUID
    appointment_day: date
    doctor_id: uuid.UUID | None = None
    notify: bool = True
    language: str | None = None


class ApproveOut(BaseModel):
    booked: bool
    message: str
    conversation: ConversationOut


# ------------------------------------------------------------------ builders

def _brief(a: models.Appointment | None) -> ApptBrief | None:
    if a is None:
        return None
    return ApptBrief(id=a.id, day=a.appointment_day, time=a.scheduled_time, doctor_name=a.doctor_name,
                     department=a.department, token=a.queue_number, status=a.status)


def _conv_out(db: Session, c: models.RescheduleConversation) -> ConversationOut:
    patient = c.patient or db.get(models.Patient, c.patient_id)
    return ConversationOut(
        id=c.id, patient_id=c.patient_id, patient_name=patient.full_name if patient else "Patient",
        appointment_id=c.appointment_id, origin_appointment_id=c.origin_appointment_id, state=c.state,
        language=c.language, initiated_by=c.initiated_by, requested_date=c.requested_date, offer=c.offer,
        options=c.options or [], handled_by_staff=c.handled_by_staff, approved_by=c.approved_by,
        expires_at=c.expires_at, updated_at=c.updated_at, appointment=_brief(db.get(models.Appointment, c.appointment_id)),
    )


def _bubbles(rows: list[models.Intervention]) -> list[Bubble]:
    out: list[Bubble] = []
    for r in rows:
        at = r.created_at
        if r.patient_reply:
            out.append(Bubble(id=f"{r.id}:in", direction="in", text=r.patient_reply, at=at, kind=r.intent_detected, channel=r.channel))
        if r.message_text:
            out.append(Bubble(id=f"{r.id}:out", direction="out", text=r.message_text, at=at + timedelta(milliseconds=1),
                              kind=r.intent_detected, channel=r.channel, offer=r.offer))
        elif not r.patient_reply and (r.intent_detected or r.offered_slot):
            out.append(Bubble(id=f"{r.id}:note", direction="note", text=" · ".join(x for x in (r.intent_detected, r.offered_slot) if x),
                              at=at, kind=r.status))
    return out


# ------------------------------------------------------------------ threads

@router.get("/outreach/threads", response_model=list[ThreadSummary])
def list_threads(
    request: Request,
    q: str = Query("", max_length=80),
    status: str = Query("all"),
    db: Session = Depends(get_db),
):
    """One row per patient with outreach, newest first. ``q`` searches names, phones, UHIDs and message text."""
    hid = _hid(request)
    flow.expire_stale(db, hid)
    rows_q = (
        db.query(models.Intervention, models.Appointment.patient_id)
        .join(models.Appointment, models.Intervention.appointment_id == models.Appointment.id)
    )
    if hid:
        rows_q = rows_q.filter(models.Intervention.hospital_id == hid)
    rows = rows_q.order_by(models.Intervention.created_at.desc()).limit(4000).all()

    by_patient: dict[uuid.UUID, list[models.Intervention]] = defaultdict(list)
    for iv, pid in rows:
        by_patient[pid].append(iv)
    if not by_patient:
        return []

    patients = {p.id: p for p in db.query(models.Patient).filter(models.Patient.id.in_(by_patient.keys())).all()}
    convs: dict[uuid.UUID, models.RescheduleConversation] = {}
    for c in (
        db.query(models.RescheduleConversation)
        .filter(models.RescheduleConversation.patient_id.in_(by_patient.keys()))
        .order_by(models.RescheduleConversation.created_at.asc())
        .all()
    ):
        convs[c.patient_id] = c  # newest wins

    needle = q.strip().lower()
    out: list[ThreadSummary] = []
    for pid, ivs in by_patient.items():
        p = patients.get(pid)
        if p is None:
            continue
        c = convs.get(pid)
        state = c.state if c else None
        if needle:
            haystack = [p.full_name, p.phone or "", p.uhid or ""]
            haystack += [t for iv in ivs for t in (iv.patient_reply, iv.message_text) if t]
            if not any(needle in (h or "").lower() for h in haystack):
                continue
        group = {
            "all": True,
            "needs_staff": state in ("needs_staff", "no_reply"),
            "approval": state == "pending_approval",
            "in_progress": state in ("awaiting_reply", "offering", "choosing_doctor"),
            "booked": state == "booked",
        }.get(status, True)
        if not group:
            continue
        last = ivs[0]
        out.append(ThreadSummary(
            patient_id=pid, patient_name=p.full_name, phone=p.phone,
            last_text=last.message_text or last.patient_reply or last.intent_detected or last.offered_slot or "",
            last_at=last.created_at, state=state,
            needs_attention=state in ("pending_approval", "needs_staff", "no_reply"),
            conversation_id=c.id if c else None, appointment_id=(c.appointment_id if c else last.appointment_id),
        ))
    out.sort(key=lambda t: (not t.needs_attention, -t.last_at.timestamp()))
    return out


@router.get("/outreach/threads/{patient_id}", response_model=ThreadDetail)
def thread_detail(patient_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    hid = _hid(request)
    patient = db.get(models.Patient, patient_id)
    if patient is None or (hid and patient.hospital_id != hid):
        raise HTTPException(status_code=404, detail="Patient not found")
    rows = (
        db.query(models.Intervention)
        .join(models.Appointment, models.Intervention.appointment_id == models.Appointment.id)
        .filter(models.Appointment.patient_id == patient_id)
        .order_by(models.Intervention.created_at.asc())
        .all()
    )
    conv = (
        db.query(models.RescheduleConversation)
        .filter(models.RescheduleConversation.patient_id == patient_id)
        .order_by(models.RescheduleConversation.created_at.desc())
        .first()
    )
    latest_appt = (
        db.get(models.Appointment, conv.appointment_id) if conv
        else (db.get(models.Appointment, rows[-1].appointment_id) if rows else None)
    )
    return ThreadDetail(
        patient=PatientBrief(id=patient.id, name=patient.full_name, phone=patient.phone, uhid=patient.uhid,
                             language=patient.preferred_language or "en"),
        conversation=_conv_out(db, conv) if conv else None,
        messages=_bubbles(rows),
        appointment=_brief(latest_appt),
    )


# ------------------------------------------------------------------ conversation actions

@router.post("/outreach/conversations", response_model=ConversationOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def start_conversation(body: StartRequest, request: Request, db: Session = Depends(get_db)):
    """Ask the patient whether they can attend and offer to change the time. Nothing is booked yet."""
    appt = db.get(models.Appointment, body.appointment_id)
    hid = _hid(request)
    if appt is None or (hid and appt.hospital_id != hid):
        raise HTTPException(status_code=404, detail="Appointment not found")
    hospital = getattr(request.state, "hospital", None)
    try:
        conv, _ = flow.start(db, appt, hospital_id=hid, actor=_actor(request), language=body.language,
                             hospital_name=getattr(hospital, "name", None) or "the hospital")
    except RescheduleError as err:
        _fail(err)
    db.commit()
    return _conv_out(db, conv)


@router.get("/appointments/{appointment_id}/conversation", response_model=ConversationOut | None)
def appointment_conversation(appointment_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    hid = _hid(request)
    flow.expire_stale(db, hid)
    conv = (
        db.query(models.RescheduleConversation)
        .filter(or_(models.RescheduleConversation.appointment_id == appointment_id,
                    models.RescheduleConversation.origin_appointment_id == appointment_id))
        .order_by(models.RescheduleConversation.created_at.desc())
        .first()
    )
    if conv is None or (hid and conv.hospital_id != hid):
        return None
    return _conv_out(db, conv)


@router.post("/outreach/conversations/{conv_id}/incoming", response_model=ConversationOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def incoming_patient_message(conv_id: uuid.UUID, body: TextRequest, request: Request, db: Session = Depends(get_db)):
    """Single entry point for a patient's reply. The simulator calls it today; a WhatsApp or SMS webhook would call it too."""
    conv = _conv(db, request, conv_id)
    try:
        flow.handle_patient_message(db, conv, body.text, hospital_id=_hid(request), shai=_shai())
    except RescheduleError as err:
        _fail(err)
    db.commit()
    return _conv_out(db, conv)


@router.post("/outreach/conversations/{conv_id}/staff-message", response_model=ConversationOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def staff_message(conv_id: uuid.UUID, body: TextRequest, request: Request, db: Session = Depends(get_db)):
    conv = _conv(db, request, conv_id)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Message is empty")
    flow.staff_message(db, conv, body.text.strip())
    db.commit()
    return _conv_out(db, conv)


@router.post("/outreach/conversations/{conv_id}/approve", response_model=ApproveOut, dependencies=[Depends(auth.require_any_role(*_APPROVERS))])
def approve_conversation(conv_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    conv = _conv(db, request, conv_id)
    try:
        booked, reply = flow.approve(db, conv, hospital_id=_hid(request), actor=_actor(request), shai=_shai())
    except RescheduleError as err:
        _fail(err)
    db.commit()
    return ApproveOut(booked=booked, message=reply.text, conversation=_conv_out(db, conv))


@router.post("/outreach/conversations/{conv_id}/reject", response_model=ConversationOut, dependencies=[Depends(auth.require_any_role(*_APPROVERS))])
def reject_conversation(conv_id: uuid.UUID, body: RejectRequest, request: Request, db: Session = Depends(get_db)):
    conv = _conv(db, request, conv_id)
    try:
        flow.reject(db, conv, actor=_actor(request), note=body.note)
    except RescheduleError as err:
        _fail(err)
    db.commit()
    return _conv_out(db, conv)


@router.post("/outreach/conversations/{conv_id}/take-over", response_model=ConversationOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def take_over(conv_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    conv = _conv(db, request, conv_id)
    conv.handled_by_staff = True
    flow.log_message(db, conv, intent=f"Staff took over ({_actor(request)})")
    db.commit()
    return _conv_out(db, conv)


@router.post("/outreach/conversations/{conv_id}/resume", response_model=ConversationOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def resume_automation(conv_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    conv = _conv(db, request, conv_id)
    conv.handled_by_staff = False
    flow.log_message(db, conv, intent="Automation resumed")
    db.commit()
    return _conv_out(db, conv)


@router.post("/outreach/conversations/{conv_id}/book", response_model=ConversationOut, dependencies=[Depends(auth.require_any_role(*auth.FRONT_LINE))])
def book_manually(conv_id: uuid.UUID, body: StaffBookRequest, request: Request, db: Session = Depends(get_db)):
    """Staff pick any open session themselves (same rules as the automatic booking)."""
    conv = _conv(db, request, conv_id)
    if conv.state in ("booked", "kept"):
        raise HTTPException(status_code=409, detail="This conversation is already closed")
    try:
        flow.staff_book(db, conv, session_id=body.clinic_session_id, day=body.appointment_day, doctor_id=body.doctor_id,
                        hospital_id=_hid(request), actor=_actor(request), notify=body.notify, language=body.language, shai=_shai())
    except RescheduleError as err:
        _fail(err)
    db.commit()
    return _conv_out(db, conv)


# ------------------------------------------------------------------ attention summary

@router.get("/outreach/attention", response_model=AttentionOut)
def attention(request: Request, db: Session = Depends(get_db)):
    """What the desk should look at: approvals waiting, patients who need a person, and 24-hour silences."""
    hid = _hid(request)
    flow.expire_stale(db, hid)
    q = db.query(models.RescheduleConversation).filter(
        models.RescheduleConversation.state.in_(("pending_approval", "needs_staff", "no_reply", "awaiting_reply", "offering", "choosing_doctor"))
    )
    if hid:
        q = q.filter(models.RescheduleConversation.hospital_id == hid)
    rows = q.order_by(models.RescheduleConversation.updated_at.desc()).all()
    counts = {"pending_approval": 0, "needs_staff": 0, "no_reply": 0, "in_progress": 0}
    items: list[AttentionItem] = []
    for c in rows:
        key = c.state if c.state in counts else "in_progress"
        counts[key] += 1
        if key == "in_progress":
            continue
        name = c.patient.full_name if c.patient else "Patient"
        detail = {
            "pending_approval": f"agreed to {c.offer['doctor_name']} on {c.offer['date']} {c.offer['start_time']}" if c.offer else "agreed to a new time",
            "needs_staff": "needs a person to arrange a time",
            "no_reply": "did not reply within 24 hours",
        }[key]
        items.append(AttentionItem(conversation_id=c.id, patient_name=name, state=c.state, detail=detail,
                                   at=c.updated_at or datetime.now(timezone.utc), href=f"/outreach?patient={c.patient_id}"))
    return AttentionOut(items=items, **counts)


# ------------------------------------------------------------------ booking history of one appointment

class HistoryStep(BaseModel):
    appointment: ApptBrief
    current: bool


@router.get("/appointments/{appointment_id}/history", response_model=list[HistoryStep])
def appointment_history(appointment_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    """The reschedule chain this booking belongs to, oldest first."""
    hid = _hid(request)
    appt = db.get(models.Appointment, appointment_id)
    if appt is None or (hid and appt.hospital_id != hid):
        raise HTTPException(status_code=404, detail="Appointment not found")
    chain = [appt]
    cur = appt
    for _ in range(20):  # ancestors
        if not cur.rescheduled_from_id:
            break
        cur = db.get(models.Appointment, cur.rescheduled_from_id)
        if cur is None:
            break
        chain.insert(0, cur)
    cur = appt
    for _ in range(20):  # descendants
        nxt = db.query(models.Appointment).filter(models.Appointment.rescheduled_from_id == cur.id).first()
        if nxt is None:
            break
        chain.append(nxt)
        cur = nxt
    if len(chain) == 1:
        return []
    return [HistoryStep(appointment=_brief(a), current=a.id == appointment_id) for a in chain]

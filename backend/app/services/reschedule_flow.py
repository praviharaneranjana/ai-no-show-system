"""Ask-first rescheduling conversation.

The patient is asked before anything is offered. When they pick a slot the conversation stops at
``pending_approval``; only a staff approval books it and sends the confirmation with the token.

States: awaiting_reply -> offering | choosing_doctor -> pending_approval -> booked
        and the exits kept (patient will attend), needs_staff, no_reply (24 h without an answer).
"""
from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.services import rescheduling
from app.services.rescheduling import RescheduleError, SlotOption
from app.services.uhid import LK_TZ

ACTIVE = {"awaiting_reply", "offering", "choosing_doctor", "pending_approval"}
WAITING_PATIENT = {"awaiting_reply", "offering", "choosing_doctor"}
REPLY_WINDOW = timedelta(hours=24)
MAX_COLLEAGUES = 3
MAX_UNCLEAR = 2
MAX_SAME_DOCTOR_DECLINES = 2


def require_approval() -> bool:
    """Booking waits for staff approval unless explicitly disabled (RESCHEDULE_REQUIRE_APPROVAL=false)."""
    return os.getenv("RESCHEDULE_REQUIRE_APPROVAL", "true").strip().lower() not in {"0", "false", "no"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ wording

MSG = {
    "en": {
        "ask": "Hello {name}, this is {hospital}. Can you still attend your appointment with {doctor} on {when}? Reply 1 to confirm, or 2 if you need to change the time.",
        "kept": "Thank you {name}, your appointment on {when} stays as booked (token #{token}). See you then.",
        "offer": "Dr {doctor} is free on {when} (Room {room}). Reply 1 to take this time, or 2 to see other options.",
        "offer_other_day": "We have no free place with {doctor} on {asked}. The next opening is {when} (Room {room}). Reply 1 to take it, or 2 to see other options.",
        "list_head": "{doctor} has no free place {on}. These doctors are available:",
        "list_line": "{n}. {doctor}, {when} (Room {room})",
        "list_tail": "Reply with the number you prefer, or 0 if none suits you.",
        "pending": "Thank you {name}. We are confirming {doctor} on {when} with our desk and will message you shortly.",
        "no_slot": "Sorry {name}, we have no free place in the next {days} days. Our desk will call you to arrange a time.",
        "unclear": "Sorry, I did not understand. {hint}",
        "hint_ask": "Reply 1 to keep your appointment, or 2 to change it.",
        "hint_offer": "Reply 1 to take this time, or 2 for other options.",
        "hint_list": "Reply with 1, 2 or 3, or 0 if none suits you.",
        "escalate": "Thank you {name}. Our desk will call you shortly to arrange a time.",
        "taken": "Sorry, that time was just taken.",
        "rejected": "Thank you {name}. Our desk will call you shortly to arrange a suitable time.",
        "on": "on {date}",
        "anyday": "in the coming days",
    },
    "si": {
        "ask": "ආයුබෝවන් {name}, මෙය {hospital}. {when} දින {doctor} සමඟ ඔබගේ වේලාවට පැමිණිය හැකිද? තහවුරු කිරීමට 1 ද, වේලාව වෙනස් කිරීමට 2 ද ලෙස පිළිතුරු දෙන්න.",
        "kept": "ස්තූතියි {name}, {when} ඔබගේ වේලාව එලෙසම පවතී (ටෝකන් #{token}).",
        "offer": "{doctor} {when} (කාමරය {room}) නිදහස්ය. මෙම වේලාව ගැනීමට 1 ද, වෙනත් විකල්ප සඳහා 2 ද ලෙස පිළිතුරු දෙන්න.",
        "offer_other_day": "{asked} දින {doctor} සමඟ නිදහස් වේලාවක් නැත. ඊළඟ අවස්ථාව {when} (කාමරය {room}). ගැනීමට 1 ද, වෙනත් විකල්ප සඳහා 2 ද ලෙස පිළිතුරු දෙන්න.",
        "list_head": "{doctor} සමඟ {on} නිදහස් වේලාවක් නැත. පහත වෛද්‍යවරුන් නිදහස්ය:",
        "list_line": "{n}. {doctor}, {when} (කාමරය {room})",
        "list_tail": "කැමති අංකය ලෙස පිළිතුරු දෙන්න, කිසිවක් නොගැලපේ නම් 0.",
        "pending": "ස්තූතියි {name}. {when} {doctor} සමඟ වේලාව අපගේ කාර්යාලය සමඟ තහවුරු කරමින් සිටිමු; ඉක්මනින් පණිවිඩයක් එවමු.",
        "no_slot": "සමාවන්න {name}, ඉදිරි දින {days} තුළ නිදහස් වේලාවක් නැත. වේලාවක් සකස් කිරීමට අපගේ කාර්යාලය ඔබට අමතනු ඇත.",
        "unclear": "සමාවන්න, මට තේරුණේ නැත. {hint}",
        "hint_ask": "වේලාව තබා ගැනීමට 1 ද, වෙනස් කිරීමට 2 ද ලෙස පිළිතුරු දෙන්න.",
        "hint_offer": "මෙම වේලාව ගැනීමට 1 ද, වෙනත් විකල්ප සඳහා 2 ද ලෙස පිළිතුරු දෙන්න.",
        "hint_list": "1, 2 හෝ 3 ලෙස පිළිතුරු දෙන්න, කිසිවක් නොගැලපේ නම් 0.",
        "escalate": "ස්තූතියි {name}. වේලාවක් සකස් කිරීමට අපගේ කාර්යාලය ඉක්මනින් ඔබට අමතනු ඇත.",
        "taken": "සමාවන්න, එම වේලාව දැන් වෙන් වී ඇත.",
        "rejected": "ස්තූතියි {name}. සුදුසු වේලාවක් සකස් කිරීමට අපගේ කාර්යාලය ඉක්මනින් ඔබට අමතනු ඇත.",
        "on": "{date} දින",
        "anyday": "ඉදිරි දිනවල",
    },
    "ta": {
        "ask": "வணக்கம் {name}, இது {hospital}. {when} அன்று {doctor} உடனான உங்கள் சந்திப்புக்கு வர முடியுமா? உறுதிப்படுத்த 1, நேரத்தை மாற்ற 2 என பதிலளிக்கவும்.",
        "kept": "நன்றி {name}, {when} உங்கள் சந்திப்பு அப்படியே உள்ளது (டோக்கன் #{token}).",
        "offer": "{doctor} {when} (அறை {room}) அன்று இலவசம். இந்த நேரத்தை எடுக்க 1, வேறு விருப்பங்களுக்கு 2 என பதிலளிக்கவும்.",
        "offer_other_day": "{asked} அன்று {doctor} உடன் இடம் இல்லை. அடுத்த வாய்ப்பு {when} (அறை {room}). எடுக்க 1, வேறு விருப்பங்களுக்கு 2 என பதிலளிக்கவும்.",
        "list_head": "{doctor} உடன் {on} இடம் இல்லை. கீழ்க்கண்ட மருத்துவர்கள் உள்ளனர்:",
        "list_line": "{n}. {doctor}, {when} (அறை {room})",
        "list_tail": "விரும்பும் எண்ணை பதிலளிக்கவும்; எதுவும் பொருந்தவில்லை என்றால் 0.",
        "pending": "நன்றி {name}. {when} {doctor} உடன் நேரத்தை எங்கள் மேசையுடன் உறுதிப்படுத்துகிறோம்; விரைவில் செய்தி அனுப்புவோம்.",
        "no_slot": "மன்னிக்கவும் {name}, அடுத்த {days} நாட்களில் இடம் இல்லை. நேரம் ஏற்பாடு செய்ய எங்கள் மேசை உங்களை அழைக்கும்.",
        "unclear": "மன்னிக்கவும், புரியவில்லை. {hint}",
        "hint_ask": "சந்திப்பை வைத்திருக்க 1, மாற்ற 2 என பதிலளிக்கவும்.",
        "hint_offer": "இந்த நேரத்தை எடுக்க 1, வேறு விருப்பங்களுக்கு 2 என பதிலளிக்கவும்.",
        "hint_list": "1, 2 அல்லது 3 என பதிலளிக்கவும்; எதுவும் பொருந்தவில்லை என்றால் 0.",
        "escalate": "நன்றி {name}. நேரம் ஏற்பாடு செய்ய எங்கள் மேசை விரைவில் உங்களை அழைக்கும்.",
        "taken": "மன்னிக்கவும், அந்த நேரம் இப்போதுதான் எடுக்கப்பட்டது.",
        "rejected": "நன்றி {name}. பொருத்தமான நேரத்தை ஏற்பாடு செய்ய எங்கள் மேசை விரைவில் உங்களை அழைக்கும்.",
        "on": "{date} அன்று",
        "anyday": "வரும் நாட்களில்",
    },
}


def _lang(conv_or_lang) -> str:
    lang = conv_or_lang if isinstance(conv_or_lang, str) else conv_or_lang.language
    return lang if lang in MSG else "en"


def _when(day: date, start: str) -> str:
    return f"{day:%a %d %b} {start}"


# ------------------------------------------------------------------ parsing

_YES = ["yes", "yeah", "yep", "ok", "okay", "sure", "confirm", "coming", "ow", "aam", "ඔව්", "ஆம்", "hari", "sari", "ennam", "varuven"]
_NO = ["no", "nope", "not", "another", "different", "naa", "nahe", "nehe", "නැහැ", "இல்லை", "illai"]
_CHANGE = ["change", "reschedule", "resched", "postpone", "can't", "cant", "cannot", "unable", "bahe", "mudiyadhu", "vera", "wena", "another day", "next week", "different"]
_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def _tokens(msg: str) -> set[str]:
    return set(re.findall(r"[\w඀-෿஀-௿']+", msg.lower()))


def has_word(msg: str, words: list[str]) -> bool:
    toks, low = _tokens(msg), msg.lower()
    return any((w in low) if " " in w else (w in toks) for w in words)


def parse_date(text: str, today: date) -> Optional[date]:
    low = text.lower()
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", low)
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    m = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", low)
    if m:
        try:
            d = date(today.year, _MONTHS.index(m[2]) + 1, int(m[1]))
            return d if d >= today else date(today.year + 1, d.month, d.day)
        except ValueError:
            return None
    if "day after tomorrow" in low:
        return today + timedelta(days=2)
    if "tomorrow" in low:
        return today + timedelta(days=1)
    if "next week" in low:
        return today + timedelta(days=7)
    for i, name in enumerate(_WEEKDAYS):
        if name in low:
            return today + timedelta(days=(i - today.weekday() - 1) % 7 + 1)
    return None


def _number(text: str) -> Optional[int]:
    m = re.fullmatch(r"\s*(\d)\s*[.)!]?\s*", text)
    return int(m[1]) if m else None


# ------------------------------------------------------------------ helpers

def slot_dict(o: SlotOption) -> dict:
    return {
        "doctor_id": str(o.doctor_id), "doctor_name": o.doctor_name, "session_id": str(o.session_id),
        "label": o.label, "date": o.day.isoformat(), "start_time": o.start_time, "end_time": o.end_time,
        "room": o.room, "remaining": o.remaining, "max_patients": o.max_patients,
        "same_doctor": o.same_doctor, "next_token": o.next_token,
    }


def _slot_when(s: dict) -> str:
    return _when(date.fromisoformat(s["date"]), s["start_time"])


def _key(s: dict) -> str:
    return f"{s['session_id']}|{s['date']}"


def active_for_appointment(db: Session, appointment_id: uuid.UUID) -> Optional[models.RescheduleConversation]:
    return (
        db.query(models.RescheduleConversation)
        .filter(models.RescheduleConversation.appointment_id == appointment_id, models.RescheduleConversation.state.in_(ACTIVE))
        .order_by(models.RescheduleConversation.created_at.desc())
        .first()
    )


@dataclass
class Reply:
    text: str
    intent: str


def log_message(
    db: Session, conv: models.RescheduleConversation, *, inbound: str | None = None, outbound: str | None = None,
    intent: str, status: str | None = None, offer: dict | None = None, channel: str = "WhatsApp",
    appointment_id: uuid.UUID | None = None,
) -> models.Intervention:
    now = _now()
    row = models.Intervention(
        hospital_id=conv.hospital_id,
        appointment_id=appointment_id or conv.appointment_id,
        conversation_id=conv.id,
        channel=channel,
        language=_lang(conv),
        status=status or conv.state,
        patient_reply=inbound,
        message_text=outbound,
        intent_detected=intent,
        offered_slot=(f"{offer['doctor_name']} · {offer['date']} {offer['start_time']}" if offer else None),
        offer=offer,
    )
    db.add(row)
    if inbound:
        conv.last_inbound_at = now
    if outbound:
        conv.last_outbound_at = now
    conv.updated_at = now
    db.flush()
    return row


def _arm_deadline(conv: models.RescheduleConversation) -> None:
    conv.expires_at = _now() + REPLY_WINDOW if conv.state in WAITING_PATIENT else None


def _brief(appt: models.Appointment) -> tuple[str, str]:
    return (appt.doctor_name or "your doctor", _when(appt.appointment_day, appt.scheduled_time or ""))


# ------------------------------------------------------------------ search

def _search(db: Session, conv: models.RescheduleConversation, appt: models.Appointment, hospital_id) -> Reply:
    """Same doctor first (on the asked date if any), then up to three colleagues; else escalate."""
    lang = _lang(conv)
    t = MSG[lang]
    name = rescheduling.first_name(appt.patient)
    asked = conv.requested_date
    options = [o for o in rescheduling.find_options(db, appt, hospital_id) if _key_of(o) not in set(conv.shown_keys or [])]
    if asked:
        later = [o for o in options if o.day >= asked]
        options = later or options
    same = [o for o in options if o.same_doctor]
    others = [o for o in options if not o.same_doctor]
    doc_name = appt.doctor_name or "your doctor"

    def colleagues(pool: list[SlotOption]) -> list[SlotOption]:
        seen, out = set(), []
        for o in pool:
            if o.doctor_id not in seen:
                seen.add(o.doctor_id)
                out.append(o)
            if len(out) == MAX_COLLEAGUES:
                break
        return out

    on_asked = [o for o in same if asked and o.day == asked]
    if on_asked or (same and not asked):
        pick = (on_asked or same)[0]
        return _offer(conv, pick, t["offer"].format(doctor=pick.doctor_name, when=_when(pick.day, pick.start_time), room=pick.room))
    pool_day = [o for o in others if asked and o.day == asked] if asked else []
    listed = colleagues(pool_day or others)
    if listed and (asked or not same):
        return _list(conv, listed, doc_name, asked, lang)
    if same:  # asked a date with nothing; same doctor has a later day
        pick = same[0]
        return _offer(conv, pick, t["offer_other_day"].format(
            doctor=doc_name, asked=asked.isoformat() if asked else "", when=_when(pick.day, pick.start_time), room=pick.room))
    conv.state, conv.offer, conv.options = "needs_staff", None, []
    _arm_deadline(conv)
    return Reply(t["no_slot"].format(name=name, days=rescheduling.HORIZON_DAYS), "no_slot")


def _key_of(o: SlotOption) -> str:
    return f"{o.session_id}|{o.day.isoformat()}"


def _offer(conv: models.RescheduleConversation, o: SlotOption, text: str) -> Reply:
    s = slot_dict(o)
    conv.state, conv.offer, conv.options = "offering", s, []
    conv.shown_keys = [*(conv.shown_keys or []), _key(s)]
    _arm_deadline(conv)
    return Reply(text, "slot_offer")


def _list(conv: models.RescheduleConversation, listed: list[SlotOption], doc_name: str, asked: Optional[date], lang: str) -> Reply:
    t = MSG[lang]
    slots = [slot_dict(o) for o in listed]
    conv.state, conv.offer, conv.options = "choosing_doctor", None, slots
    conv.shown_keys = [*(conv.shown_keys or []), *(_key(s) for s in slots)]
    _arm_deadline(conv)
    on = t["on"].format(date=asked.isoformat()) if asked else t["anyday"]
    lines = [t["list_line"].format(n=i + 1, doctor=s["doctor_name"], when=_slot_when(s), room=s["room"]) for i, s in enumerate(slots)]
    return Reply("\n".join([t["list_head"].format(doctor=doc_name, on=on), *lines, t["list_tail"]]), "doctor_options")


def _to_approval(db: Session, conv: models.RescheduleConversation, appt: models.Appointment, slot: dict, hospital_id, actor: str, shai) -> Reply:
    lang = _lang(conv)
    name = rescheduling.first_name(appt.patient)
    conv.offer, conv.options = slot, []
    if require_approval():
        conv.state = "pending_approval"
        _arm_deadline(conv)
        return Reply(MSG[lang]["pending"].format(name=name, doctor=slot["doctor_name"], when=_slot_when(slot)), "awaiting_approval")
    try:
        return _book(db=db, conv=conv, appt=appt, hospital_id=hospital_id, actor=actor, shai=shai)
    except RescheduleError:  # taken meanwhile: offer the next option
        conv.state, conv.requested_date = "offering", None
        again = _search(db, conv, appt, hospital_id)
        return Reply(MSG[lang]["taken"] + " " + again.text, again.intent)


# ------------------------------------------------------------------ public API

def start(
    db: Session, appt: models.Appointment, *, hospital_id, actor: str, language: str | None,
    initiated_by: str = "staff", hospital_name: str = "the hospital",
) -> tuple[models.RescheduleConversation, Optional[Reply]]:
    if appt.status != "scheduled":
        raise RescheduleError(409, f"Only scheduled appointments can be rescheduled (this one is {appt.status})")
    existing = active_for_appointment(db, appt.id)
    if existing:
        return existing, None
    patient = appt.patient
    lang = language if language in MSG else (patient.preferred_language if patient and patient.preferred_language in MSG else "en")
    conv = models.RescheduleConversation(
        hospital_id=appt.hospital_id or hospital_id, patient_id=appt.patient_id, appointment_id=appt.id,
        origin_appointment_id=appt.id, language=lang, state="awaiting_reply", initiated_by=initiated_by,
        options=[], shown_keys=[], declines=0, unclear=0, handled_by_staff=False,
    )
    db.add(conv)
    db.flush()
    reply = None
    if initiated_by == "staff":
        doctor, when = _brief(appt)
        text = MSG[lang]["ask"].format(name=rescheduling.first_name(patient), hospital=hospital_name, doctor=doctor, when=when)
        reply = Reply(text, "reschedule_ask")
        log_message(db, conv, outbound=text, intent="Reschedule request", appointment_id=appt.id)
        _arm_deadline(conv)
    return conv, reply


def handle_patient_message(
    db: Session, conv: models.RescheduleConversation, text: str, *, hospital_id, shai, prefix: str = "", force_change: bool = False,
) -> Optional[Reply]:
    """Advance the conversation with one inbound patient message. Returns the automatic reply (None when staff have taken over)."""
    appt = db.get(models.Appointment, conv.appointment_id)
    lang, t = _lang(conv), MSG[_lang(conv)]
    name = rescheduling.first_name(appt.patient)
    today = datetime.now(LK_TZ).date()

    if conv.handled_by_staff or conv.state not in ACTIVE:
        log_message(db, conv, inbound=text, intent="Patient message (staff handling)" if conv.handled_by_staff else "Patient message")
        return None

    num = _number(text)
    said_yes, said_no = has_word(text, _YES), has_word(text, _NO)
    wants_change = force_change or has_word(text, _CHANGE)
    asked_date = parse_date(text, today)
    reply: Reply
    inbound_logged = False

    def finish(r: Reply) -> Reply:
        offer = conv.offer if conv.state in {"offering", "pending_approval"} else None
        log_message(db, conv, inbound=None if inbound_logged else text, outbound=prefix + r.text, intent=r.intent, offer=offer)
        return Reply(prefix + r.text, r.intent)

    if conv.state == "awaiting_reply":
        if wants_change or num == 2 or asked_date:
            conv.requested_date = asked_date
            reply = _search(db, conv, appt, hospital_id)
        elif num == 1 or said_yes:
            conv.state, conv.expires_at = "kept", None
            doctor, when = _brief(appt)
            appt.ai_action_status = "Confirmed via WhatsApp"
            reply = Reply(t["kept"].format(name=name, when=when, token=appt.queue_number or 1), "attendance_kept")
        else:
            reply = _unclear(conv, t, "hint_ask", name)

    elif conv.state == "offering":
        slot = conv.offer
        if asked_date and not (num or said_yes):
            conv.requested_date, conv.declines = asked_date, 0
            reply = _search(db, conv, appt, hospital_id)
        elif num == 1 or (said_yes and not said_no):
            reply = _to_approval(db, conv, appt, slot, hospital_id, "patient", shai)
        elif num == 2 or said_no or wants_change:
            conv.declines += 1
            if conv.declines > MAX_SAME_DOCTOR_DECLINES:
                conv.requested_date = None
            reply = _search(db, conv, appt, hospital_id)
        else:
            reply = _unclear(conv, t, "hint_offer", name)

    elif conv.state == "choosing_doctor":
        opts = conv.options or []
        if num and 1 <= num <= len(opts):
            reply = _to_approval(db, conv, appt, opts[num - 1], hospital_id, "patient", shai)
        elif asked_date:
            conv.requested_date = asked_date
            reply = _search(db, conv, appt, hospital_id)
        elif num == 0 or said_no:
            conv.state, conv.offer, conv.options = "needs_staff", None, []
            reply = Reply(t["escalate"].format(name=name), "escalated")
        else:
            reply = _unclear(conv, t, "hint_list", name)

    else:  # pending_approval: the patient is waiting for staff; acknowledge without changing anything
        reply = Reply(t["pending"].format(name=name, doctor=conv.offer["doctor_name"], when=_slot_when(conv.offer)), "awaiting_approval")

    if conv.state in ("awaiting_reply", "offering", "choosing_doctor"):
        conv.unclear = conv.unclear if reply.intent == "unclear" else 0
    return finish(reply)


def _unclear(conv: models.RescheduleConversation, t: dict, hint_key: str, name: str) -> Reply:
    conv.unclear += 1
    if conv.unclear > MAX_UNCLEAR:
        conv.state, conv.offer, conv.options, conv.expires_at = "needs_staff", None, [], None
        return Reply(t["escalate"].format(name=name), "escalated")
    return Reply(t["unclear"].format(hint=t[hint_key]), "unclear")


def _book(*, db: Session, conv: models.RescheduleConversation, appt: models.Appointment, hospital_id, actor: str, shai) -> Reply:
    slot = conv.offer
    lang = _lang(conv)
    new, _ = rescheduling.reschedule_booking(
        db, appt, session_id=uuid.UUID(slot["session_id"]), day=date.fromisoformat(slot["date"]),
        doctor_id=uuid.UUID(slot["doctor_id"]), hospital_id=hospital_id, actor=actor,
        reason="rescheduled via patient conversation", shai_instance=shai,
    )
    text = rescheduling.confirmation_text(
        lang, rescheduling.first_name(new.patient), new.doctor_name or "", new.appointment_day,
        new.scheduled_time or slot["start_time"], slot["room"], new.queue_number or 1,
    )
    conv.appointment_id, conv.state, conv.approved_by, conv.expires_at = new.id, "booked", actor, None
    return Reply(text, "booked")


def approve(db: Session, conv: models.RescheduleConversation, *, hospital_id, actor: str, shai) -> tuple[bool, Reply]:
    """Staff approval: book the held slot and confirm it to the patient. If it was taken meanwhile, re-offer."""
    if conv.state != "pending_approval" or not conv.offer:
        raise RescheduleError(409, "This conversation is not waiting for approval")
    appt = db.get(models.Appointment, conv.appointment_id)
    t = MSG[_lang(conv)]
    try:
        reply = _book(db=db, conv=conv, appt=appt, hospital_id=hospital_id, actor=actor, shai=shai)
    except RescheduleError as err:
        if err.status_code not in (409, 400):
            raise
        conv.state, conv.requested_date = "offering", None
        again = _search(db, conv, appt, hospital_id)
        text = t["taken"] + " " + again.text
        log_message(db, conv, outbound=text, intent="Slot no longer free", offer=conv.offer)
        return False, Reply(text, "slot_taken")
    log_message(db, conv, outbound=reply.text, intent="Booking confirmed", status="booked", offer=conv.offer,
                appointment_id=conv.appointment_id)
    return True, reply


def reject(db: Session, conv: models.RescheduleConversation, *, actor: str, note: str | None = None) -> Reply:
    if conv.state != "pending_approval":
        raise RescheduleError(409, "This conversation is not waiting for approval")
    appt = db.get(models.Appointment, conv.appointment_id)
    text = MSG[_lang(conv)]["rejected"].format(name=rescheduling.first_name(appt.patient))
    conv.state, conv.offer, conv.options, conv.expires_at, conv.note = "needs_staff", None, [], None, note
    log_message(db, conv, outbound=text, intent=f"Declined by {actor}")
    return Reply(text, "declined")


def staff_message(db: Session, conv: models.RescheduleConversation, text: str) -> None:
    conv.handled_by_staff = True
    log_message(db, conv, outbound=text, intent="Staff message", channel="SMS")


def staff_book(
    db: Session, conv: models.RescheduleConversation, *, session_id, day, doctor_id, hospital_id, actor: str,
    notify: bool, language: str | None, shai,
) -> tuple[models.Appointment, Optional[str]]:
    appt = db.get(models.Appointment, conv.appointment_id)
    new, message = rescheduling.reschedule_booking(
        db, appt, session_id=session_id, day=day, doctor_id=doctor_id, hospital_id=hospital_id, actor=actor,
        reason="rescheduled by staff from conversation", notify=False, shai_instance=shai,
    )
    if notify:
        message = rescheduling.confirmation_text(
            language or conv.language, rescheduling.first_name(new.patient), new.doctor_name or "", new.appointment_day,
            new.scheduled_time or "", new.clinic_session.room if new.clinic_session else "", new.queue_number or 1,
        )
        new.sms_received, new.reminder_sent_at = True, _now()
    conv.appointment_id, conv.state, conv.approved_by, conv.offer, conv.options, conv.expires_at = new.id, "booked", actor, None, [], None
    log_message(db, conv, outbound=message, intent="Booked by staff", status="booked", appointment_id=new.id)
    return new, message


def expire_stale(db: Session, hospital_id) -> int:
    """Flag conversations whose patient has not answered within the reply window. Evaluated on read (no scheduler)."""
    now = _now()
    q = db.query(models.RescheduleConversation).filter(
        models.RescheduleConversation.state.in_(WAITING_PATIENT), models.RescheduleConversation.expires_at.is_not(None),
        models.RescheduleConversation.expires_at < now,
    )
    if hospital_id:
        q = q.filter(models.RescheduleConversation.hospital_id == hospital_id)
    rows = q.all()
    for c in rows:
        c.state, c.expires_at = "no_reply", None
        log_message(db, c, intent="No reply within 24 hours", status="no_reply")
    if rows:
        db.commit()
    return len(rows)

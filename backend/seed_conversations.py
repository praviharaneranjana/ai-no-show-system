"""Seed demo data for the Autonomous Patient Outreach Hub: realistic two-way WhatsApp threads.

Synthetic data for demos/screenshots only. Each thread has patient replies and system/staff messages, worded
exactly like the live reschedule flow, across every state (awaiting reply, offering, choosing doctor, pending
approval, booked, kept, needs staff, no reply). Idempotent: re-running replaces rows it created earlier
(patient UHIDs start DEMO-CV-, phones start 0771).

Usage (from backend/, venv active):
    python seed_conversations.py [--hospital-id <uuid>]
"""
import argparse
import uuid
from datetime import date, datetime, timedelta, timezone

from app import models
from app.database import SessionLocal

ACH = "a0000000-0000-0000-0000-000000000001"

IN, OUT = "in", "out"

# name, language, state, days until the appointment, [(direction, minutes after first message, text, intent)]
# "{D}" = their doctor, "{W}" = appointment day/time, "{S1}"/"{S2}"/"{S3}" = offered slots, "{N1}" = first name
SCENARIOS = [
    ("Kamala Perera", "en", "pending_approval", 3, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 14, "2", "Wants to reschedule"),
        (OUT, 14, "{D} is free on {S1} (Room {R}). Reply 1 to take this time, or 2 to see other options.", "slot_offer"),
        (IN, 31, "1", "Accepted slot"),
        (OUT, 31, "Thank you {N1}. We are confirming {D} on {S1} with our desk and will message you shortly.", "awaiting_approval"),
    ]),
    ("Nuwan Jayasuriya", "en", "booked", 5, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 6, "Hi, I have a work trip that day. Can I come the week after?", "Wants to reschedule"),
        (OUT, 6, "{D} is free on {S1} (Room {R}). Reply 1 to take this time, or 2 to see other options.", "slot_offer"),
        (IN, 12, "Yes that works", "Accepted slot"),
        (OUT, 12, "Thank you {N1}. We are confirming {D} on {S1} with our desk and will message you shortly.", "awaiting_approval"),
        (OUT, 38, "Your appointment with {D} is confirmed for {S1} (Room {R}). Please arrive 15 minutes early and bring your clinic book.", "Booking confirmed"),
    ]),
    ("Ishara Fernando", "en", "kept", 2, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 3, "1", "Confirmed attendance"),
        (OUT, 3, "Thank you {N1}, your appointment on {W} stays as booked (token #{T}). See you then.", "Kept"),
    ]),
    ("Dilshan Wickramasinghe", "en", "choosing_doctor", 4, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 22, "cant come, exam that day", "Wants to reschedule"),
        (OUT, 22, "{D} is free on {S1} (Room {R}). Reply 1 to take this time, or 2 to see other options.", "slot_offer"),
        (IN, 25, "2", "Declined slot"),
        (OUT, 25, "{D} has no free place in the coming days. These doctors are available:\n1. {C1}, {S2} (Room {R})\n2. {C2}, {S3} (Room {R})\nReply with the number you prefer, or 0 if none suits you.", "doctor_options"),
    ]),
    ("Sanduni Rajapaksa", "si", "awaiting_reply", 2, [
        (OUT, 0, "ආයුබෝවන් {N1}, මෙය {H}. {W} දින {D} සමඟ ඔබගේ වේලාවට පැමිණිය හැකිද? තහවුරු කිරීමට 1 ද, වේලාව වෙනස් කිරීමට 2 ද ලෙස පිළිතුරු දෙන්න.", "Reschedule ask"),
    ]),
    ("Mohamed Rizwan", "en", "needs_staff", 3, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 9, "I need an evening slot only, I work till 6", "Wants to reschedule"),
        (OUT, 9, "Sorry {N1}, we have no free place in the next 14 days. Our desk will call you to arrange a time.", "No slot available"),
        (IN, 40, "ok please call after 6pm", "Message for staff"),
    ]),
    ("Tharindu Gunawardena", "en", "no_reply", 1, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (OUT, 360, "Hello {N1}, a gentle reminder: please reply 1 to confirm your appointment on {W}, or 2 to change it.", "Reminder"),
        (OUT, 1440, "", "No reply within 24 hours"),
    ]),
    ("Priyanka Silva", "ta", "pending_approval", 4, [
        (OUT, 0, "வணக்கம் {N1}, இது {H}. {W} அன்று {D} உடனான உங்கள் நேரத்திற்கு வர முடியுமா? உறுதிப்படுத்த 1, நேரத்தை மாற்ற 2 என பதிலளிக்கவும்.", "Reschedule ask"),
        (IN, 18, "2", "Wants to reschedule"),
        (OUT, 18, "{D} {S1} (அறை {R}) அன்று இலவசம். இந்த நேரத்தை எடுக்க 1, வேறு விருப்பங்களுக்கு 2 என பதிலளிக்கவும்.", "slot_offer"),
        (IN, 27, "1", "Accepted slot"),
        (OUT, 27, "நன்றி {N1}. {D} {S1} அன்று உங்கள் நேரத்தை எங்கள் மேசையுடன் உறுதிப்படுத்துகிறோம், விரைவில் தகவல் தருவோம்.", "awaiting_approval"),
    ]),
    ("Chamari Dissanayake", "si", "booked", 6, [
        (OUT, 0, "ආයුබෝවන් {N1}, මෙය {H}. {W} දින {D} සමඟ ඔබගේ වේලාවට පැමිණිය හැකිද? තහවුරු කිරීමට 1 ද, වේලාව වෙනස් කිරීමට 2 ද ලෙස පිළිතුරු දෙන්න.", "Reschedule ask"),
        (IN, 11, "2", "Wants to reschedule"),
        (OUT, 11, "{D} {S1} (කාමරය {R}) නිදහස්ය. මෙම වේලාව ගැනීමට 1 ද, වෙනත් විකල්ප සඳහා 2 ද ලෙස පිළිතුරු දෙන්න.", "slot_offer"),
        (IN, 15, "1", "Accepted slot"),
        (OUT, 15, "Thank you {N1}. We are confirming {D} on {S1} with our desk and will message you shortly.", "awaiting_approval"),
        (OUT, 52, "Your appointment with {D} is confirmed for {S1} (Room {R}). Please arrive 15 minutes early.", "Booking confirmed"),
    ]),
    ("Rajeev Thiyagarajah", "ta", "kept", 2, [
        (OUT, 0, "வணக்கம் {N1}, இது {H}. {W} அன்று {D} உடனான உங்கள் நேரத்திற்கு வர முடியுமா? உறுதிப்படுத்த 1, நேரத்தை மாற்ற 2 என பதிலளிக்கவும்.", "Reschedule ask"),
        (IN, 7, "ஆம், வருகிறேன்", "Confirmed attendance"),
        (OUT, 7, "Thank you {N1}, your appointment on {W} stays as booked (token #{T}). See you then.", "Kept"),
    ]),
    ("Anoma Weerasinghe", "en", "offering", 3, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 5, "Can I move it to next week? my daughter has a school event", "Wants to reschedule"),
        (OUT, 5, "We have no free place with {D} on that day. The next opening is {S1} (Room {R}). Reply 1 to take it, or 2 to see other options.", "slot_offer"),
    ]),
    ("Lahiru Bandara", "en", "pending_approval", 2, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 4, "sorry i got a fever, can we change", "Wants to reschedule"),
        (OUT, 4, "{D} is free on {S1} (Room {R}). Reply 1 to take this time, or 2 to see other options.", "slot_offer"),
        (IN, 9, "Ok", "Accepted slot"),
        (OUT, 9, "Thank you {N1}. We are confirming {D} on {S1} with our desk and will message you shortly.", "awaiting_approval"),
    ]),
    ("Fathima Nazeer", "en", "needs_staff", 5, [
        (OUT, 0, "Hello {N1}, this is {H}. Can you still attend your appointment with {D} on {W}? Reply 1 to confirm, or 2 if you need to change the time.", "Reschedule ask"),
        (IN, 20, "hmm", "Unclear"),
        (OUT, 20, "Sorry, I did not understand. Reply 1 to keep your appointment, or 2 to change it.", "Unclear"),
        (IN, 33, "can i talk to someone? its about my mother's appointment also", "Wants a person"),
        (OUT, 33, "Thank you {N1}. Our desk will call you shortly to arrange a time.", "Escalated to staff"),
    ]),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hospital-id", default=ACH)
    hid = uuid.UUID(ap.parse_args().hospital_id)
    db = SessionLocal()

    # clear earlier demo rows
    for p in db.query(models.Patient).filter(models.Patient.uhid.like("DEMO-CV-%")).all():
        for c in db.query(models.RescheduleConversation).filter_by(patient_id=p.id).all():
            db.delete(c)
        for a in db.query(models.Appointment).filter_by(patient_id=p.id).all():
            db.query(models.Intervention).filter_by(appointment_id=a.id).delete()
            db.query(models.Prediction).filter_by(appointment_id=a.id).delete()
            db.delete(a)
        db.delete(p)
    db.flush()

    hospital = db.get(models.Hospital, hid)
    hname = hospital.short_name if hospital else "the hospital"
    doctors = [d for d in db.query(models.Doctor).filter_by(hospital_id=hid, active=True).all() if d.department]
    if len(doctors) < 3:
        raise SystemExit("Need at least 3 doctors for this hospital; run the base seed first.")
    sessions = {s.doctor_id: s for s in db.query(models.DoctorClinicSession).filter_by(hospital_id=hid).all()}
    now = datetime.now(timezone.utc)
    today = date.today()

    def slot(doc, day: date, hhmm: str) -> dict:
        s = sessions.get(doc.id)
        return {
            "doctor_id": str(doc.id), "doctor_name": f"{doc.title} {doc.full_name}".strip(), "session_id": str(s.id) if s else str(uuid.uuid4()),
            "label": s.label if s else "Evening", "date": day.isoformat(), "start_time": hhmm, "end_time": "19:00",
            "room": (s.room if s else None) or doc.default_room or "204", "remaining": 6, "max_patients": 25,
            "same_doctor": True, "next_token": 14,
        }

    def when(day: date, hhmm: str) -> str:
        return f"{day:%a %d %b} {hhmm}"

    count = 0
    for i, (name, lang, state, days_out, script) in enumerate(SCENARIOS):
        doc = doctors[i % len(doctors)]
        c1, c2 = doctors[(i + 1) % len(doctors)], doctors[(i + 2) % len(doctors)]
        dname = f"{doc.title} {doc.full_name}".strip()
        appt_day = today + timedelta(days=days_out)
        pat = models.Patient(
            hospital_id=hid, uhid=f"DEMO-CV-{i:03d}", full_name=name, date_of_birth=date(1960 + i * 3, 6, 9),
            phone=f"0771{i:06d}", preferred_language=lang,
        )
        db.add(pat)
        db.flush()
        token = 8 + i
        appt = models.Appointment(
            hospital_id=hid, patient_id=pat.id, scheduled_day=today - timedelta(days=14), appointment_day=appt_day,
            department=doc.department.name, doctor_id=doc.id, doctor_name=dname, status="scheduled",
            scheduled_time="17:30", queue_number=token, data_source="synthetic",
        )
        db.add(appt)
        db.flush()

        s1 = slot(doc, appt_day + timedelta(days=7), "17:30")
        s2, s3 = slot(c1, appt_day + timedelta(days=2), "16:00"), slot(c2, appt_day + timedelta(days=3), "18:00")
        s1_when = when(date.fromisoformat(s1["date"]), s1["start_time"])
        fill = {
            "N1": name.split()[0], "H": hname, "D": dname, "W": when(appt_day, "17:30"), "T": token, "R": s1["room"],
            "S1": s1_when, "S2": when(date.fromisoformat(s2["date"]), s2["start_time"]), "S3": when(date.fromisoformat(s3["date"]), s3["start_time"]),
            "C1": s2["doctor_name"], "C2": s3["doctor_name"],
        }
        # the first message went out `span` ago; the latest message lands a bit before now
        span = timedelta(minutes=script[-1][1])
        start = now - span - timedelta(minutes=5 + 37 * i)
        last_in = last_out = None
        offer_shown = state in ("offering", "pending_approval", "booked")
        conv = models.RescheduleConversation(
            hospital_id=hid, patient_id=pat.id, appointment_id=appt.id, origin_appointment_id=appt.id, language=lang, state=state,
            initiated_by="staff", offer=s1 if offer_shown else None, options=[s2, s3] if state == "choosing_doctor" else [],
            shown_keys=[], approved_by="front.desk@demo" if state == "booked" else None,
            expires_at=now + timedelta(hours=20) if state in ("awaiting_reply", "offering", "choosing_doctor", "pending_approval") else None,
        )
        db.add(conv)
        db.flush()
        for direction, mins, text, intent in script:
            at = start + timedelta(minutes=mins)
            text = text.format(**fill)
            has_offer = intent in ("slot_offer", "awaiting_approval", "Booking confirmed", "Accepted slot") and offer_shown
            db.add(models.Intervention(
                hospital_id=hid, appointment_id=appt.id, conversation_id=conv.id, channel="WhatsApp", language=lang,
                status=state, intent_detected=intent, created_at=at,
                patient_reply=text if direction == IN else None,
                message_text=text if (direction == OUT and text) else None,
                offer=s1 if has_offer else None,
                offered_slot=f"{s1['doctor_name']} · {s1['date']} {s1['start_time']}" if has_offer else None,
            ))
            if direction == IN:
                last_in = at
            elif text:
                last_out = at
        conv.last_inbound_at, conv.last_outbound_at, conv.created_at, conv.updated_at = last_in, last_out, start, start + span
        count += 1
    db.commit()
    print(f"Seeded {count} outreach conversations for {hid}")


if __name__ == "__main__":
    main()

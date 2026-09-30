"""AI drafting of appointment-reminder messages (English / Sinhala / Tamil).

Gemini writes a short reminder tuned to the *reasons* behind a patient's no-show risk
(the positive SHAP drivers of the SHAI model). If there is no API key, or Gemini keeps
failing (e.g. 503 high demand), a canned template is returned instead, so the feature
never breaks. The output is a DRAFT for staff to review; nothing is sent.

Privacy: only the patient's first name, department, appointment date/time, the risk tier
and coarse reason categories are sent to Gemini. No phone, email, UHID, full name,
conditions or exact distance.
"""
import logging
import os
import time
from dataclasses import dataclass

logger = logging.getLogger("noshow_api")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
LANGUAGES = {"en": "English", "si": "Sinhala (සිංහල script)", "ta": "Tamil (தமிழ் script)"}

# SHAP feature -> coarse reason category (only positive contributions count as reasons).
_REASON_OF_FEATURE = {
    "lead_days": "long_wait",
    "distance_km": "distance",
    "distance_missing": "distance",
    "prior_no_shows": "history",
    "prior_no_show_rate": "history",
    "prior_appts": "history",
    "is_first_visit": "first_visit",
    "heavy_rain": "weather",
    "is_poya": "poya",
    "sms_sent": "no_reminder",
    "appt_hour": "timing",
    "appt_dow": "timing",
    "is_weekend": "timing",
}
_REASON_OF_PREFIX = {"booking_channel_": "booking", "payment_mode_": "payment"}

# What the message may do about each reason (guidance for the model and the template).
_GUIDANCE = {
    "long_wait": "the appointment is booked far ahead, so gently ask them to confirm they can still attend",
    "distance": "travelling may be difficult, so offer a video (telehealth) consultation or a closer time",
    "history": "they have missed visits before, so be warm (not scolding) and offer an easy way to reschedule",
    "first_visit": "it is their first visit, so briefly reassure them and invite questions",
    "weather": "heavy rain is expected, so offer to reschedule or switch to a video consultation",
    "poya": "it falls on a Poya holiday period, so offer to reschedule if it is inconvenient",
    "no_reminder": "they have not had a reminder yet, so ask them to confirm",
    "timing": "the time slot may be inconvenient, so offer another time",
    "booking": "ask them to confirm their booking",
    "payment": "ask them to confirm their booking",
}

_TEMPLATES = {
    "en": {
        "base": "Hello {name}, this is a reminder of your {dept} appointment on {when}.",
        "tail": " Reply 1 to CONFIRM, 2 to RESCHEDULE.",
        "telehealth": " A video consultation is also available; reply 3 if you prefer that.",
    },
    "si": {
        "base": "ආයුබෝවන් {name}, {when} දින ඔබගේ {dept} වෙන්කිරීම සිහිපත් කරමු.",
        "tail": " තහවුරු කිරීමට 1 ද, වෙනත් වේලාවකට මාරු කිරීමට 2 ද ලෙස පිළිතුරු දෙන්න.",
        "telehealth": " වීඩියෝ මගින් වෛද්‍ය උපදේශනයක්ද ලබාගත හැක; එය කැමති නම් 3 ලෙස පිළිතුරු දෙන්න.",
    },
    "ta": {
        "base": "வணக்கம் {name}, {when} அன்று உங்கள் {dept} சந்திப்பை நினைவூட்டுகிறோம்.",
        "tail": " உறுதிப்படுத்த 1, வேறு நேரத்திற்கு மாற்ற 2 என பதிலளிக்கவும்.",
        "telehealth": " வீடியோ ஆலோசனையும் உள்ளது; விரும்பினால் 3 என பதிலளிக்கவும்.",
    },
}
_TELEHEALTH_REASONS = {"distance", "weather"}


@dataclass
class Draft:
    message: str
    source: str  # "gemini" | "template"
    reasons: list[str]
    model: str | None


def reasons_from_contributions(contributions: list[dict], limit: int = 3) -> list[str]:
    """Positive SHAP drivers -> distinct reason categories, strongest first."""
    out: list[str] = []
    for c in sorted(contributions, key=lambda c: c.get("contribution", 0), reverse=True):
        if c.get("contribution", 0) <= 0:
            continue
        feature = c["feature"]
        reason = _REASON_OF_FEATURE.get(feature) or next(
            (r for p, r in _REASON_OF_PREFIX.items() if feature.startswith(p)), None
        )
        if reason and reason not in out:
            out.append(reason)
        if len(out) == limit:
            break
    return out


def template_draft(language: str, first_name: str, department: str, when: str, reasons: list[str]) -> str:
    t = _TEMPLATES.get(language, _TEMPLATES["en"])
    msg = t["base"].format(name=first_name, dept=department, when=when)
    if _TELEHEALTH_REASONS & set(reasons):
        msg += t["telehealth"]
    return msg + t["tail"]


def _prompt(language: str, first_name: str, department: str, when: str, tier: str, reasons: list[str]) -> str:
    guidance = "; ".join(_GUIDANCE[r] for r in reasons) or "simply ask them to confirm"
    return (
        f"Write ONE short appointment-reminder message for a Sri Lankan private hospital to send by WhatsApp/SMS.\n"
        f"Language: {LANGUAGES[language]}.\n"
        f"Patient first name: {first_name}. Department: {department}. Appointment: {when}.\n"
        f"Priority: {tier}. Tailor the message to this: {guidance}.\n"
        "Rules: at most 45 words; polite and warm; never scolding; do NOT mention risk scores, AI, "
        "predictions or medical advice; do NOT invent phone numbers, links, prices or doctor names; "
        "end by telling the patient to reply 1 to CONFIRM, 2 to RESCHEDULE"
        + (", or 3 for a video consultation" if _TELEHEALTH_REASONS & set(reasons) else "")
        + ". Output only the message text."
    )


def _call_gemini(prompt: str, attempts: int = 3) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        logger.warning("google-genai is not installed; using template drafts")
        return None

    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=15000))
    try:
        for attempt in range(attempts):
            try:
                resp = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
                text = (resp.text or "").strip()
                if text:
                    return text
            except Exception as exc:  # 503 high demand, timeouts, quota...
                logger.warning("Gemini draft attempt %d/%d failed: %s", attempt + 1, attempts, type(exc).__name__)
                time.sleep(0.8 * (attempt + 1))
    finally:
        client.close()
    return None


def draft_reminder(
    *, language: str, first_name: str, department: str, when: str, tier: str, contributions: list[dict]
) -> Draft:
    language = language if language in LANGUAGES else "en"
    reasons = reasons_from_contributions(contributions)
    text = _call_gemini(_prompt(language, first_name, department, when, tier, reasons))
    if text:
        return Draft(message=text, source="gemini", reasons=reasons, model=GEMINI_MODEL)
    return Draft(
        message=template_draft(language, first_name, department, when, reasons),
        source="template", reasons=reasons, model=None,
    )

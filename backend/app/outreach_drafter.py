"""AI drafting of appointment-reminder messages (English / Sinhala / Tamil).

Gemini writes a short reminder tuned to the *reasons* behind a patient's no-show risk
(the positive SHAP drivers of the SHAI model). If there is no API key, or Gemini keeps
failing (e.g. 503 high demand), a canned template is returned instead, so the feature
never breaks. The output is a DRAFT for staff to review; nothing is sent.

Privacy: the prompt contains only the first-name INITIAL, an age band, the department, the
appointment DATE, the risk tier and coarse reason categories. For sensitive departments (psychiatry and similar)
the department is withheld altogether: a message sent to a phone someone else may read must not reveal the kind
of care. The Sri Lankan reminder study (Rajasuriya et al. 2010) did the same, naming only the hospital in letters. Names, phone numbers, UHIDs,
e-mail, times, conditions and exact distances never leave the server: the model is told to
write the placeholders {NAME} and {TIME}, which are filled in locally afterwards.
"""
import logging
import os
import time
from dataclasses import dataclass

logger = logging.getLogger("noshow_api")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
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

# Departments whose name must never appear in a patient-facing message or in a prompt sent to Gemini.
SENSITIVE_DEPARTMENT_KEYWORDS = (
    "psychiatr", "psycholog", "mental", "counsel", "psychother", "addiction", "substance", "de-addiction",
)
_NEUTRAL_CLINIC = {"en": "clinic", "si": "සායන", "ta": "கிளினிக்"}


def is_sensitive_department(department: str | None) -> bool:
    """True for departments where revealing the specialty in a message could stigmatise or expose the patient."""
    if not department:
        return False
    dept = department.strip().lower()
    return any(k in dept for k in SENSITIVE_DEPARTMENT_KEYWORDS)


def patient_facing_department(department: str | None, language: str = "en") -> str:
    """The department name to put in a message to the patient: a neutral word for sensitive departments."""
    if is_sensitive_department(department):
        return _NEUTRAL_CLINIC.get(language, _NEUTRAL_CLINIC["en"])
    return department or _NEUTRAL_CLINIC.get(language, _NEUTRAL_CLINIC["en"])


TELEHEALTH_ELIGIBLE_SPECIALTIES = {
    "psychiatry", "psychology", "mental health", "counseling",
    "endocrinology", "diabetes", "nutrition", "dietetics",
    "dermatology", "general medicine",
}

TELEHEALTH_INELIGIBLE_SPECIALTIES = {
    "orthopedics", "orthopedic", "surgery", "general surgery",
    "cardiology", "ent", "ophthalmology", "dentistry", "dental", "physiotherapy"
}


def is_telehealth_eligible(department: str | None, telehealth_ok: bool | None = None) -> bool:
    """Clinical guardrail for video consults.

    ``telehealth_ok`` is the hospital's own per-department setting and wins when known;
    the specialty keyword lists are only a fallback when no setting is available.
    """
    if telehealth_ok is not None:
        return telehealth_ok
    if not department:
        return False
    dept = department.strip().lower()
    if any(inelig in dept for inelig in TELEHEALTH_INELIGIBLE_SPECIALTIES):
        return False
    return any(elig in dept for elig in TELEHEALTH_ELIGIBLE_SPECIALTIES)


@dataclass
class Draft:
    message: str
    source: str  # "gemini" | "template"
    reasons: list[str]
    model: str | None
    discreet: bool = False  # the department name was withheld because the specialty is sensitive


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


def template_draft(language: str, first_name: str, department: str, when: str, reasons: list[str], telehealth_ok: bool | None = None) -> str:
    t = _TEMPLATES.get(language, _TEMPLATES["en"])
    msg = t["base"].format(name=first_name, dept=patient_facing_department(department, language), when=when)
    if is_telehealth_eligible(department, telehealth_ok) and (_TELEHEALTH_REASONS & set(reasons)):
        msg += t["telehealth"]
    return msg + t["tail"]


def age_band(age: int | None) -> str:
    if age is None:
        return "unknown"
    for upper, label in ((17, "under 18"), (29, "18-29"), (44, "30-44"), (59, "45-59")):
        if age <= upper:
            return label
    return "60+"


def _prompt(language: str, name_initial: str, band: str, department: str, date_text: str, tier: str, reasons: list[str], telehealth_ok: bool | None = None) -> str:
    # Eligibility is judged on the real department; only the neutral label is written into the prompt.
    can_telehealth = is_telehealth_eligible(department, telehealth_ok) and bool(_TELEHEALTH_REASONS & set(reasons))
    discreet = is_sensitive_department(department)
    adapted_guidance = []
    for r in reasons:
        if r in _TELEHEALTH_REASONS and not is_telehealth_eligible(department, telehealth_ok):
            adapted_guidance.append("travelling or weather may be difficult, so offer an easy way to reschedule to another in-person day")
        else:
            adapted_guidance.append(_GUIDANCE.get(r, ""))
    guidance = "; ".join(filter(None, adapted_guidance)) or "simply ask them to confirm"
    return (
        f"Write ONE short appointment-reminder message for a Sri Lankan private hospital to send by WhatsApp/SMS.\n"
        f"Language: {LANGUAGES[language]}.\n"
        f"Patient: first-name initial {name_initial}, age band {band}. "
        + (
            "Department: not disclosed - call it only 'the clinic' and never name or hint at the specialty. "
            if discreet else f"Department: {department}. "
        )
        + f"Appointment date: {date_text}.\n"
        "Write the patient's name as the literal placeholder {NAME} and the appointment time as the literal placeholder {TIME}; "
        "never guess a real name or time.\n"
        f"Priority: {tier}. Tailor the message to this: {guidance}.\n"
        "Rules: at most 45 words; polite and warm; never scolding; do NOT mention risk scores, AI, "
        "predictions, the date being far away, or medical advice; do NOT invent phone numbers, links, prices or doctor names; "
        "end by telling the patient to reply 1 to CONFIRM, 2 to RESCHEDULE"
        + (", or 3 for a video consultation" if can_telehealth else "")
        + ". Output only the message text."
    )


def _call_gemini(prompt: str, attempts: int = 2) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        logger.warning("google-genai is not installed; using template drafts")
        return None

    try:
        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=12000))
    except Exception as exc:  # bad key format, SDK/config errors: fall back to the template
        logger.warning("Gemini client could not be created: %s", type(exc).__name__)
        return None
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


def _fill_placeholders(text: str, first_name: str, time_text: str) -> str:
    return text.replace("{NAME}", first_name).replace("{TIME}", time_text or "your appointment time")


def draft_reminder(
    *,
    language: str,
    first_name: str,
    department: str,
    when: str,
    tier: str,
    contributions: list[dict],
    age: int | None = None,
    date_text: str | None = None,
    time_text: str = "",
    telehealth_ok: bool | None = None,
) -> Draft:
    """``when`` (date and time) is only used for the local template; Gemini sees ``date_text`` (date only)."""
    language = language if language in LANGUAGES else "en"
    reasons = reasons_from_contributions(contributions)
    initial = (first_name[:1].upper() + ".") if first_name else "?"
    discreet = is_sensitive_department(department)
    prompt = _prompt(language, initial, age_band(age), department, date_text or when, tier, reasons, telehealth_ok)
    text = _call_gemini(prompt)
    if text and discreet and _mentions_sensitive_term(text, department):
        logger.warning("Gemini draft named a sensitive specialty; using the discreet template instead")
        text = None
    if text:
        return Draft(message=_fill_placeholders(text, first_name, time_text), source="gemini", reasons=reasons,
                     model=GEMINI_MODEL, discreet=discreet)
    return Draft(
        message=template_draft(language, first_name, department, when, reasons, telehealth_ok),
        source="template", reasons=reasons, model=None, discreet=discreet,
    )


def _mentions_sensitive_term(text: str, department: str) -> bool:
    low = text.lower()
    return department.strip().lower() in low or any(k in low for k in SENSITIVE_DEPARTMENT_KEYWORDS)

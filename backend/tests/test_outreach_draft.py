from app import outreach_drafter
from tests.test_shai_endpoints import make_appointment, make_patient


def test_reasons_use_positive_shap_only_and_dedupe():
    contribs = [
        {"feature": "lead_days", "contribution": 0.3, "value": 40},
        {"feature": "distance_km", "contribution": 0.2, "value": 50},
        {"feature": "distance_missing", "contribution": 0.1, "value": 0},
        {"feature": "sms_sent", "contribution": -0.4, "value": 1},
        {"feature": "payment_mode_Cash", "contribution": 0.05, "value": 1},
    ]
    assert outreach_drafter.reasons_from_contributions(contribs) == ["long_wait", "distance", "payment"]


def test_template_adds_telehealth_for_distance_in_every_language_when_eligible():
    for lang in ("en", "si", "ta"):
        msg = outreach_drafter.template_draft(lang, "Nimal", "Psychiatry", "05 Oct 2026", ["distance"])
        assert "Nimal" in msg and "3" in msg
    assert "video" not in outreach_drafter.template_draft("en", "A", "ENT", "x", ["long_wait"])


def test_template_excludes_telehealth_for_ineligible_specialties():
    for dept in ("Orthopedics", "Cardiology", "General Surgery", "ENT"):
        msg = outreach_drafter.template_draft("en", "Nimal", dept, "05 Oct 2026", ["distance"])
        assert "video" not in msg.lower()
        assert "3" not in msg


def test_draft_endpoint_falls_back_to_template_without_api_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    patient = make_patient(client)
    appt = make_appointment(client, patient["id"])
    client.post("/predict", json={"appointment_id": appt["id"]})

    resp = client.post("/outreach/draft", json={"appointment_id": appt["id"], "language": "si"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "template" and body["language"] == "si" and body["message"]
    assert patient["full_name"].split()[0] in body["message"]


def test_draft_endpoint_uses_gemini_text_when_available(client, monkeypatch):
    monkeypatch.setattr(outreach_drafter, "_call_gemini", lambda prompt, attempts=2: "Hello! Please reply 1 to confirm.")
    patient = make_patient(client)
    appt = make_appointment(client, patient["id"])
    body = client.post("/outreach/draft", json={"appointment_id": appt["id"], "language": "en"}).json()
    assert body["source"] == "gemini" and body["message"].startswith("Hello!")


def test_draft_prompt_contains_no_names_phones_or_uhids():
    prompt = outreach_drafter._prompt("en", "N.", outreach_drafter.age_band(52), "Cardiology", "05 Oct 2026", "High", ["distance"])
    assert "N." in prompt and "45-59" in prompt and "05 Oct 2026" in prompt
    assert "{NAME}" in prompt and "{TIME}" in prompt
    assert "@" not in prompt and "+94" not in prompt and "SHAI-" not in prompt and ":" not in "05 Oct 2026"


def test_the_prompt_sent_to_gemini_never_contains_the_real_name_phone_or_uhid(client, monkeypatch):
    seen = {}

    def fake_gemini(prompt, attempts=2):
        seen["prompt"] = prompt
        return "Hello {NAME}, your appointment is at {TIME}. Reply 1 to CONFIRM, 2 to RESCHEDULE."

    monkeypatch.setattr(outreach_drafter, "_call_gemini", fake_gemini)
    patient = make_patient(client, full_name="Chamindri Wickramasinghe", phone="+94771234567")
    appt = make_appointment(client, patient["id"])
    body = client.post("/outreach/draft", json={"appointment_id": appt["id"], "language": "en"}).json()
    prompt = seen["prompt"]
    for secret in ("Chamindri", "Wickramasinghe", "+94771234567", "771234567", patient["uhid"]):
        assert secret not in prompt
    assert "C." in prompt
    assert body["source"] == "gemini"
    assert body["message"].startswith("Hello Chamindri,")  # filled in locally, after the call


def test_gemini_failure_falls_back_to_the_template(client, monkeypatch):
    import sys
    import types

    class Boom:
        def __init__(self, *a, **k):
            raise RuntimeError("503 high demand")

    fake_genai = types.ModuleType("google.genai")
    fake_genai.Client = Boom
    fake_genai.types = types.SimpleNamespace(HttpOptions=lambda **k: None)
    google = types.ModuleType("google")
    google.genai = fake_genai
    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai)
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    patient = make_patient(client)
    appt = make_appointment(client, patient["id"])
    body = client.post("/outreach/draft", json={"appointment_id": appt["id"], "language": "en"}).json()
    assert body["source"] == "template" and body["message"]


def test_draft_unknown_appointment_404s(client):
    resp = client.post("/outreach/draft", json={"appointment_id": "00000000-0000-0000-0000-000000000000"})
    assert resp.status_code == 404

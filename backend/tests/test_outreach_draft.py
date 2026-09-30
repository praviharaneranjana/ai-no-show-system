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


def test_template_adds_telehealth_for_distance_in_every_language():
    for lang in ("en", "si", "ta"):
        msg = outreach_drafter.template_draft(lang, "Nimal", "Cardiology", "05 Oct 2026", ["distance"])
        assert "Nimal" in msg and "3" in msg
    assert "video" not in outreach_drafter.template_draft("en", "A", "ENT", "x", ["long_wait"])


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
    monkeypatch.setattr(outreach_drafter, "_call_gemini", lambda prompt, attempts=3: "Hello! Please reply 1 to confirm.")
    patient = make_patient(client)
    appt = make_appointment(client, patient["id"])
    body = client.post("/outreach/draft", json={"appointment_id": appt["id"], "language": "en"}).json()
    assert body["source"] == "gemini" and body["message"].startswith("Hello!")


def test_draft_prompt_contains_no_contact_details():
    prompt = outreach_drafter._prompt("en", "Nimal", "Cardiology", "05 Oct 2026", "High", ["distance"])
    assert "Nimal" in prompt and "@" not in prompt and "+94" not in prompt


def test_draft_unknown_appointment_404s(client):
    resp = client.post("/outreach/draft", json={"appointment_id": "00000000-0000-0000-0000-000000000000"})
    assert resp.status_code == 404

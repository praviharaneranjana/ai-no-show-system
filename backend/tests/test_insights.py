from datetime import date, timedelta

from tests.test_shai_endpoints import make_appointment, make_patient


def _record_outcome(client, appt_id, no_show):
    r = client.patch(f"/appointments/{appt_id}/outcome", json={"no_show": no_show})
    assert r.status_code == 200, r.text


def test_create_patient_geocodes_city_and_derives_distance(client):
    p = make_patient(client, city="Ratnapura", distance_km=6.9)  # a wrong client-supplied distance is overridden
    assert p["latitude"] is not None and p["longitude"] is not None
    assert 55 < p["distance_km"] < 100


def test_trend_uses_only_recorded_outcomes(client):
    p = make_patient(client, city="Colombo 07")
    past = (date.today() - timedelta(days=3)).isoformat()
    ids = [make_appointment(client, p["id"], appointment_day=past, scheduled_day=past)["id"] for _ in range(4)]
    for i, appt in enumerate(ids):
        _record_outcome(client, appt, no_show=(i == 0))
    body = client.get("/analytics/trend", params={"granularity": "day"}).json()
    assert body["sample_size"] >= 4
    day = next(pt for pt in body["points"] if pt["period"] == past)
    assert day["total"] >= 4 and day["no_shows"] >= 1
    assert 0 <= day["rate"] <= 100


def test_register_pages_and_counts(client):
    p = make_patient(client, city="Kandy")
    for _ in range(3):
        make_appointment(client, p["id"])
    r = client.get("/appointments/register", params={"page": 1, "page_size": 2}).json()
    assert len(r["items"]) == 2
    assert r["total"] >= 3 and r["counts"]["all"] >= 3


def test_register_route_is_not_shadowed_by_uuid_route(client):
    assert client.get("/appointments/register").status_code == 200


def test_search_finds_patient_by_name(client):
    p = make_patient(client, full_name="Zyxwv Quentin")
    make_appointment(client, p["id"])
    hits = client.get("/search", params={"q": "Zyxwv"}).json()
    assert any(h["title"] == "Zyxwv Quentin" for h in hits)


def test_geo_endpoint_returns_hospital_and_real_points(client):
    p = make_patient(client, city="Galle")
    make_appointment(client, p["id"])
    body = client.get("/geo/patients").json()
    assert body["hospital_name"] == "Asiri Central Hospital"
    pt = next(x for x in body["points"] if x["patient_name"] == "Test Patient" and x["city"] == "Galle")
    assert 80 < pt["distance_km"] < 130  # Galle is ~100 km from Colombo


def test_revenue_and_notifications_and_activity_respond(client):
    assert client.get("/analytics/revenue-at-risk").status_code == 200
    assert client.get("/notifications").status_code == 200
    assert client.get("/outreach/activity").status_code == 200

from app import geo


def test_haversine_known_distance():
    # Colombo -> Kandy is ~94 km in a straight line
    d = geo.haversine_km(6.9271, 79.8612, 7.2906, 80.6337)
    assert 88 < d < 100


def test_ratnapura_is_about_65_to_100_km_not_7():
    lat, lng = geo.geocode_city("Ratnapura")
    assert 55 < geo.distance_to_hospital_km(lat, lng) < 100


def test_colombo_postal_zone_variants_resolve():
    assert geo.geocode_city("Colombo 07") == geo.geocode_city("colombo 7") == geo.geocode_city(" Colombo 07 ")


def test_unknown_city_is_none_not_a_guess():
    assert geo.geocode_city("Atlantis") is None
    assert geo.geocode_city(None) is None


def test_offset_is_small_and_deterministic():
    centre = geo.geocode_city("Kandy")
    a = geo.geocode_city("Kandy", seed="patient-1")
    assert a == geo.geocode_city("Kandy", seed="patient-1")
    assert geo.haversine_km(*centre, *a) < 1.0


def test_every_seeded_city_resolves():
    from fake_data_lk import CITIES

    assert [c for c in CITIES if geo.geocode_city(c) is None] == []

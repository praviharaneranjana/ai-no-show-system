"""Real patient geography: a fixed hospital location and a land-only town lookup.

Patients only store a free-text `city`; we resolve it to the town centre (always on
land) plus a small deterministic offset so patients from the same town don't stack on
one pixel. Distances are straight-line (haversine) and labelled as such in the UI.
"""
import math
import re
import uuid

# Asiri Central Hospital (Norris Canal Rd, Colombo 10)
HOSPITAL_NAME = "Asiri Central Hospital"
HOSPITAL_LAT = 6.9248
HOSPITAL_LNG = 79.8654

# (lat, lng) of the town centre. Colombo postal zones use their neighbourhood centre.
TOWNS: dict[str, tuple[float, float]] = {
    "colombo 01": (6.9344, 79.8428), "colombo 02": (6.9198, 79.8486),
    "colombo 03": (6.9147, 79.8520), "colombo 04": (6.8939, 79.8546),
    "colombo 05": (6.8866, 79.8691), "colombo 06": (6.8721, 79.8603),
    "colombo 07": (6.9036, 79.8612), "colombo 08": (6.9173, 79.8772),
    "colombo 09": (6.9290, 79.8800), "colombo 10": (6.9281, 79.8659),
    "colombo 11": (6.9374, 79.8530), "colombo 12": (6.9370, 79.8560),
    "colombo 13": (6.9498, 79.8616), "colombo 14": (6.9520, 79.8720),
    "colombo 15": (6.9660, 79.8780),
    "colombo": (6.9271, 79.8612),
    "nugegoda": (6.8649, 79.8997), "dehiwala": (6.8511, 79.8653),
    "mount lavinia": (6.8389, 79.8653), "wattala": (6.9897, 79.8917),
    "kelaniya": (6.9553, 79.9220), "negombo": (7.2083, 79.8358),
    "gampaha": (7.0873, 79.9925), "kadawatha": (7.0014, 79.9533),
    "kandy": (7.2906, 80.6337), "kurunegala": (7.4863, 80.3623),
    "galle": (6.0535, 80.2210), "matara": (5.9549, 80.5550),
    "jaffna": (9.6615, 80.0255), "batticaloa": (7.7310, 81.6747),
    "anuradhapura": (8.3114, 80.4037), "ratnapura": (6.6828, 80.3992),
    "badulla": (6.9934, 81.0550), "trincomalee": (8.5874, 81.2152),
    "kalutara": (6.5854, 79.9607), "panadura": (6.7132, 79.9026),
    "homagama": (6.8439, 80.0024), "maharagama": (6.8480, 79.9265),
    "kotte": (6.8905, 79.9179), "sri jayawardenepura kotte": (6.8905, 79.9179),
    "malabe": (6.9061, 79.9582), "kottawa": (6.8411, 79.9654),
    "moratuwa": (6.7730, 79.8816), "ragama": (7.0278, 79.9220),
    "ja-ela": (7.0744, 79.8919), "kiribathgoda": (6.9780, 79.9260),
    "battaramulla": (6.9009, 79.9181), "rajagiriya": (6.9089, 79.8953),
    "piliyandala": (6.8018, 79.9228), "avissawella": (6.9523, 80.2100),
    "horana": (6.7158, 80.0627), "kegalle": (7.2513, 80.3464),
    "matale": (7.4675, 80.6234), "nuwara eliya": (6.9497, 80.7891),
    "hambantota": (6.1241, 81.1185), "kalmunai": (7.4311, 81.8190),
    "vavuniya": (8.7514, 80.4971), "puttalam": (8.0362, 79.8283),
    "chilaw": (7.5758, 79.7953), "polonnaruwa": (7.9403, 81.0188),
}


def _normalise(city: str) -> str:
    return re.sub(r"\s+", " ", city.strip().lower())


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def distance_to_hospital_km(
    lat: float, lng: float, hospital_lat: float = HOSPITAL_LAT, hospital_lng: float = HOSPITAL_LNG
) -> float:
    return round(haversine_km(lat, lng, hospital_lat, hospital_lng), 1)


def geocode_city(city: str | None, seed: uuid.UUID | str | None = None) -> tuple[float, float] | None:
    """Town centre for `city` (None if unknown), offset ~±600 m deterministically by `seed`.

    The offset is small enough that an inland/coastal town never lands in the sea
    at its scale, but a coastal centre can still sit near the shoreline — it is a
    neighbourhood-level location, not an address.
    """
    if not city:
        return None
    key = _normalise(city)
    centre = TOWNS.get(key)
    if centre is None:
        # "Colombo 7" -> "colombo 07", "Colombo 07, Sri Lanka" -> "colombo 07"
        m = re.match(r"colombo\s*0?(\d{1,2})\b", key)
        if m:
            centre = TOWNS.get(f"colombo {int(m.group(1)):02d}")
    if centre is None:
        return None
    lat, lng = centre
    if seed is not None:
        h = int(uuid.uuid5(uuid.NAMESPACE_OID, str(seed)).hex[:12], 16)
        dlat = ((h % 1000) / 1000 - 0.5) * 0.010   # ±~550 m
        dlng = (((h // 1000) % 1000) / 1000 - 0.5) * 0.010
        lat, lng = lat + dlat, lng + dlng
    return round(lat, 5), round(lng, 5)


# Average urban/inter-city speed used ONLY for the "~N min" estimate; shown with its assumption.
AVG_TRAVEL_KMH = 30.0
ROAD_FACTOR = 1.3  # road distance is typically ~1.3x straight-line


def estimate_travel_minutes(straight_km: float) -> int:
    return max(1, round(straight_km * ROAD_FACTOR / AVG_TRAVEL_KMH * 60))

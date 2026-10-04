import json
import logging
import math
import os
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Optional

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app import models
from app.geo import HOSPITAL_LAT, HOSPITAL_LNG, ROAD_FACTOR, haversine_km

logger = logging.getLogger(__name__)

# Photon throttle & cache
_PHOTON_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_LAST_PHOTON_TIME: float = 0.0


def calculate_distance(lat: float, lng: float) -> tuple[float, str]:
    """Calculate distance to Asiri Central Hospital.
    Returns (distance_km, source), where source is 'road_osrm' or 'estimated'.
    """
    routing_mode = os.getenv("ROUTING", "osrm").strip().lower()

    if routing_mode == "osrm":
        try:
            url = (
                f"http://router.project-osrm.org/route/v1/driving/"
                f"{lng:.6f},{lat:.6f};{HOSPITAL_LNG:.6f},{HOSPITAL_LAT:.6f}?overview=false"
            )
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "SHAI/1.0"},
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    routes = data.get("routes", [])
                    if routes and "distance" in routes[0]:
                        dist_meters = routes[0]["distance"]
                        dist_km = round(dist_meters / 1000.0, 1)
                        return (dist_km, "road_osrm")
        except Exception as exc:
            logger.info("OSRM routing unavailable (%s), falling back to estimate", exc)

    # Fallback: Haversine * 1.3
    straight_km = haversine_km(lat, lng, HOSPITAL_LAT, HOSPITAL_LNG)
    est_km = round(straight_km * ROAD_FACTOR, 1)
    return (est_km, "estimated")


def search_locations(db: Session, q: str, limit: int = 8) -> list[dict[str, Any]]:
    """Search locations by exact match, prefix match, or trigram similarity,
    ordered by relevance and population descending.
    """
    q_clean = q.strip().lower()
    if len(q_clean) < 2:
        return []

    # Check database dialect to safely use pg_trgm similarity if on PostgreSQL
    is_postgres = db.bind.dialect.name == "postgresql" if db.bind else False

    try:
        if is_postgres:
            # PostgreSQL with pg_trgm similarity
            # 1. Exact match on name_norm or in aliases
            # 2. Prefix match
            # 3. Trigram similarity / contains
            query = text("""
                WITH ranked AS (
                    SELECT id, name, district, province, kind, latitude, longitude, population,
                           CASE
                               WHEN name_norm = :q THEN 1
                               WHEN :q = ANY(aliases) THEN 1
                               WHEN name_norm LIKE :prefix THEN 2
                               ELSE 3
                           END AS match_tier,
                           similarity(name_norm, :q) AS sim
                    FROM locations
                    WHERE name_norm = :q
                       OR :q = ANY(aliases)
                       OR name_norm LIKE :prefix
                       OR name_norm % :q
                       OR name_norm ILIKE :contains
                )
                SELECT id, name, district, province, kind, latitude, longitude, population
                FROM ranked
                ORDER BY match_tier ASC,
                         CASE WHEN match_tier = 2 THEN population END DESC NULLS LAST,
                         sim DESC,
                         population DESC NULLS LAST,
                         name ASC
                LIMIT :limit
            """)
            result = db.execute(
                query,
                {
                    "q": q_clean,
                    "prefix": f"{q_clean}%",
                    "contains": f"%{q_clean}%",
                    "limit": limit,
                },
            ).fetchall()
        else:
            query = (
                db.query(models.Location)
                .filter(
                    or_(
                        models.Location.name_norm == q_clean,
                        models.Location.name_norm.like(f"{q_clean}%"),
                        models.Location.name_norm.like(f"%{q_clean}%"),
                    )
                )
                .order_by(
                    models.Location.population.desc().nullslast(),
                    models.Location.name.asc(),
                )
                .limit(limit)
            )
            result = query.all()

        output = []
        for row in result:
            # Handle row whether it's Row or Model
            if hasattr(row, "name"):
                name = row.name
                district = row.district
                province = row.province
                kind = row.kind
                lat = row.latitude
                lng = row.longitude
                pop = row.population
                loc_id = row.id
            else:
                loc_id, name, district, province, kind, lat, lng, pop = row[:8]

            if district:
                label = f"{name} · {district} District"
            elif province:
                label = f"{name} · {province} Province"
            else:
                label = name

            output.append(
                {
                    "id": loc_id,
                    "name": name,
                    "district": district,
                    "province": province,
                    "kind": kind,
                    "latitude": lat,
                    "longitude": lng,
                    "population": pop,
                    "label": label,
                }
            )
        return output
    except Exception as exc:
        logger.warning("Error searching locations: %s", exc)
        return []


def geocode_photon(q: str) -> list[dict[str, Any]]:
    """Server-side proxy to Photon with 1 req/s throttle, 24h in-memory cache,
    3s timeout and Sri Lanka bounding box.
    """
    global _LAST_PHOTON_TIME
    q_clean = q.strip()
    if len(q_clean) < 2:
        return []

    geocoder_mode = os.getenv("GEOCODER", "photon").strip().lower()
    if geocoder_mode == "local":
        return []

    now = time.time()
    # Check 24h cache (86400s)
    cache_key = q_clean.lower()
    if cache_key in _PHOTON_CACHE:
        cached_time, cached_res = _PHOTON_CACHE[cache_key]
        if now - cached_time < 86400:
            return cached_res

    # Throttle to 1 req/sec
    elapsed = now - _LAST_PHOTON_TIME
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)
    _LAST_PHOTON_TIME = time.time()

    url = (
        f"https://photon.komoot.io/api/?q={urllib.parse.quote(q_clean)}"
        f"&limit=6&lang=en&bbox=79.4,5.8,82.0,9.9"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "SHAI/1.0"},
    )

    results = []
    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                features = data.get("features", [])
                for f in features:
                    props = f.get("properties", {})
                    geom = f.get("geometry", {})
                    coords = geom.get("coordinates", [])
                    if len(coords) < 2:
                        continue
                    lng, lat = coords[0], coords[1]
                    name = props.get("name") or q_clean.title()
                    district = props.get("district") or props.get("county") or props.get("city")
                    province = props.get("state")
                    if district:
                        label = f"{name} · {district}"
                    elif province:
                        label = f"{name} · {province}"
                    else:
                        label = f"{name} · Sri Lanka"

                    results.append(
                        {
                            "name": name,
                            "district": district,
                            "province": province,
                            "kind": props.get("osm_value") or "town",
                            "latitude": round(lat, 5),
                            "longitude": round(lng, 5),
                            "population": None,
                            "label": label,
                            "source": "photon",
                        }
                    )
        _PHOTON_CACHE[cache_key] = (now, results)
        return results
    except Exception as exc:
        logger.warning("Photon geocoding failed (%s)", exc)
        return []

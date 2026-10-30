"""Capacity & Smart Overbooking v2: Candidate Ranking Engine for Auto-Fill (Feature C).

Ranks waitlisted patients for freed slots using a multi-attribute utility model:
- Specialty / Doctor match (35%)
- Low no-show risk (25%) -> patient's own predicted probability (lower = better)
- Waiting time priority (15%) -> days since waitlist entry
- Clinical urgency level (15%) -> High (1.0), Normal (0.6), Routine (0.3)
- Travel proximity (10%) -> distance in km (closer = higher score)
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import math


def score_waitlist_candidate(
    target_specialty: str,
    target_doctor_name: Optional[str],
    candidate_specialty: str,
    candidate_doctor_name: Optional[str],
    predicted_no_show_prob: float = 0.15,
    created_at: Optional[datetime] = None,
    urgency_level: str = "Normal",
    distance_km: Optional[float] = None,
    preferred_days: str = "",
) -> Dict[str, Any]:
    """Score a single waitlist entry for an available freed clinic slot.

    Returns:
        Dict containing total_score (0-100) and breakdown components.
    """
    # 1. Specialty / Doctor Match (35 points max)
    specialty_match = 0.0
    if candidate_specialty.lower() == target_specialty.lower():
        specialty_match = 25.0
        if target_doctor_name and candidate_doctor_name:
            if target_doctor_name.lower() in candidate_doctor_name.lower() or candidate_doctor_name.lower() in target_doctor_name.lower():
                specialty_match += 10.0
            else:
                specialty_match += 4.0  # Same specialty, different doctor ok
        else:
            specialty_match += 6.0
    elif target_specialty.lower() in candidate_specialty.lower() or candidate_specialty.lower() in target_specialty.lower():
        specialty_match = 20.0

    # 2. Patient's own no-show risk (25 points max: lower risk = higher score)
    p = max(0.0, min(1.0, float(predicted_no_show_prob)))
    risk_score = (1.0 - p) * 25.0

    # 3. Waiting Time Priority (15 points max)
    # 1 day = 0.5 pts, capped at 30 days = 15 pts
    days_waiting = 7.0
    if created_at is not None:
        now = datetime.now(timezone.utc)
        if created_at.tzinfo is None:
            created_dt = created_at.replace(tzinfo=timezone.utc)
        else:
            created_dt = created_at
        diff = (now - created_dt).total_seconds() / 86400.0
        days_waiting = max(0.0, diff)

    wait_score = min(15.0, days_waiting * 0.5)

    # 4. Clinical Urgency (15 points max)
    urg_upper = (urgency_level or "Normal").strip().capitalize()
    if urg_upper == "High" or urg_upper == "Urgent":
        urgency_score = 15.0
    elif urg_upper == "Normal":
        urgency_score = 9.0
    else:  # Routine / Low
        urgency_score = 4.0

    # 5. Travel Proximity (10 points max)
    # Closer is better for fast fill: < 5km = 10 pts, 10km = 8 pts, 30km = 4 pts, >50km = 2 pts
    if distance_km is not None and distance_km > 0:
        d = float(distance_km)
        if d <= 5.0:
            distance_score = 10.0
        elif d <= 15.0:
            distance_score = 8.0
        elif d <= 30.0:
            distance_score = 6.0
        elif d <= 60.0:
            distance_score = 3.0
        else:
            distance_score = 1.5
    else:
        distance_score = 6.0  # Neutral fallback

    total = round(specialty_match + risk_score + wait_score + urgency_score + distance_score, 1)
    normalized_total = min(100.0, max(0.0, total))

    breakdown = {
        "specialty_doctor_match": round(specialty_match, 1),
        "attendance_reliability": round(risk_score, 1),
        "waiting_time_priority": round(wait_score, 1),
        "clinical_urgency": round(urgency_score, 1),
        "travel_proximity": round(distance_score, 1),
        "days_waiting": round(days_waiting, 1),
        "predicted_no_show_prob": round(p, 3),
    }

    return {
        "total_score": normalized_total,
        "breakdown": breakdown,
    }

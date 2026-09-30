"""SHAI model bundle: XGBoost (native JSON) + isotonic calibration + rank-based tiers.

The bundle is produced by the Colab training notebook (section 12) and lives in
``models/shai_bundle/``. No pickles: ``model.json`` is XGBoost's native format, and
calibration/thresholds/schema are plain JSON, so the files load across library versions.

Risk tiers are capacity-based, not fixed probability cut-offs: High = top 10% and
Medium = next 20% of validation-set *calibrated* risk (see thresholds.json).
"""
import json
import math
import os
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import shap
import xgboost as xgb

BUNDLE_DIR = os.getenv("SHAI_BUNDLE_DIR", "models/shai_bundle")

# Smoothing used by the notebook: prior_no_show_rate = (no_shows + K*BASE) / (appts + K)
PRIOR_RATE_BASE = 0.16
PRIOR_RATE_STRENGTH = 2


def _load_json(bundle_dir: str, name: str) -> dict:
    with open(os.path.join(bundle_dir, name)) as f:
        return json.load(f)


class ShaiModel:
    def __init__(self, bundle_dir: str = BUNDLE_DIR):
        if not os.path.exists(os.path.join(bundle_dir, "model.json")):
            raise FileNotFoundError(
                f"SHAI model bundle not found in {bundle_dir}. "
                "Export it from the Colab notebook (section 12) and unzip it there."
            )
        schema = _load_json(bundle_dir, "feature_schema.json")
        cal = _load_json(bundle_dir, "calibration.json")
        thr = _load_json(bundle_dir, "thresholds.json")

        self.columns: list[str] = schema["columns"]
        self.numeric: list[str] = schema["numeric"]
        self.categorical: dict[str, list[str]] = schema["categorical"]
        self.distance_median: float = schema["distance_median"]
        self.version: str = schema.get("version", "unknown")
        self.cal_x = np.asarray(cal["x"], dtype=float)
        self.cal_y = np.asarray(cal["y"], dtype=float)
        self.high_threshold: float = thr["high"]
        self.medium_threshold: float = thr["medium"]

        self.model = xgb.XGBClassifier()
        self.model.load_model(os.path.join(bundle_dir, "model.json"))
        self.explainer = shap.TreeExplainer(self.model)

    # ---- scoring -------------------------------------------------------
    def calibrate(self, raw: np.ndarray) -> np.ndarray:
        # Isotonic regression predicts by linear interpolation, clipped at the ends.
        return np.interp(raw, self.cal_x, self.cal_y)

    def category(self, score: float) -> str:
        if score >= self.high_threshold:
            return "High"
        if score >= self.medium_threshold:
            return "Medium"
        return "Low"

    def recommendation(self, category: str) -> str:
        return {
            "High": "High risk: Send multiple reminders + offer rescheduling + consider phone call.",
            "Medium": "Medium risk: Send SMS + Email reminder 48 hours before.",
            "Low": "Low risk: Standard SMS reminder is enough.",
        }[category]

    def frame(self, records: list[dict]) -> pd.DataFrame:
        """Turn engineered feature dicts (see ``engineer``) into the model's column order."""
        rows = []
        for r in records:
            row = {c: 0.0 for c in self.columns}
            for c in self.numeric:
                row[c] = float(r[c])
            row["distance_missing"] = float(r["distance_missing"])
            for cat in self.categorical:
                key = f"{cat}_{r[cat]}"
                if key in row:
                    row[key] = 1.0
            rows.append(row)
        return pd.DataFrame(rows, columns=self.columns)

    def score(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        raw = self.model.predict_proba(df)[:, 1]
        return raw, self.calibrate(raw)

    def explain(self, df: pd.DataFrame, top: int = 6) -> list[list[dict]]:
        """Top-N SHAP contributions (log-odds of the raw model) per row."""
        values = self.explainer.shap_values(df)
        out = []
        for i in range(len(df)):
            contribs = [
                {"feature": c, "contribution": round(float(v), 4), "value": float(df.iloc[i][c])}
                for c, v in zip(self.columns, values[i])
            ]
            contribs.sort(key=lambda d: abs(d["contribution"]), reverse=True)
            out.append(contribs[:top])
        return out


# ---- feature engineering ------------------------------------------------
_CHANNEL_MAP = [
    ("doc990", "Doc990"), ("echannel", "eChannelling"), ("myhealth", "MyHealth"),
    ("counter", "Counter"), ("phone", "Phone"),
]


def map_channel(value: str | None) -> str:
    v = (value or "").lower()
    for key, label in _CHANNEL_MAP:
        if key in v:
            return label
    return "Phone"  # most common channel in the training data


def map_payment(value: str | None) -> str:
    v = (value or "").lower()
    if "nsr" in v or "prepaid" in v or "online" in v:
        return "Prepaid_Online"
    if "corporate" in v:
        return "Corporate"
    if "insurance" in v or "scholarship" in v:
        return "Insurance"
    if "card" in v:
        return "Card"
    return "Cash"


def map_department(value: str | None, known: list[str]) -> str:
    v = (value or "").strip().lower().replace("paed", "ped").replace("gynae", "gyne")
    for k in known:
        if k.lower() == v or k.lower().replace("ae", "e") == v.replace("ae", "e"):
            return k
    return "General Medicine"


def parse_hour(scheduled_time: str | None) -> int:
    """'17:30' or '05:30 PM' -> 17. Falls back to the training median (17)."""
    if not scheduled_time:
        return 17
    s = scheduled_time.strip().upper()
    for fmt in ("%H:%M", "%I:%M %p", "%I %p"):
        try:
            return datetime.strptime(s, fmt).hour
        except ValueError:
            continue
    return 17


def smoothed_no_show_rate(prior_no_shows: int, prior_appts: int) -> float:
    return (prior_no_shows + PRIOR_RATE_STRENGTH * PRIOR_RATE_BASE) / (prior_appts + PRIOR_RATE_STRENGTH)


def engineer(
    *,
    model: ShaiModel,
    age: int,
    gender: str | None,
    distance_km: float | None,
    scheduled_day: date,
    appointment_day: date,
    scheduled_time: str | None,
    department: str | None,
    booking_channel: str | None,
    payment_mode: str | None,
    sms_sent: bool,
    hypertension: bool,
    diabetes: bool,
    prior_appts: int,
    prior_no_shows: int,
    heavy_rain: int = 0,
) -> dict:
    lead_days = max((appointment_day - scheduled_day).days, 0)
    g = (gender or "").strip().upper()[:1]
    return {
        "age": age,
        "distance_km": model.distance_median if distance_km is None else float(distance_km),
        "distance_missing": 1 if distance_km is None else 0,
        "lead_days": lead_days,
        "appt_dow": appointment_day.weekday(),
        "appt_hour": parse_hour(scheduled_time),
        "appt_month": appointment_day.month,
        "prior_appts": prior_appts,
        "prior_no_shows": prior_no_shows,
        "prior_no_show_rate": smoothed_no_show_rate(prior_no_shows, prior_appts),
        "is_first_visit": 1 if prior_appts == 0 else 0,
        "chronic_count": int(bool(hypertension)) + int(bool(diabetes)),
        "sms_sent": int(bool(sms_sent)),
        "heavy_rain": int(heavy_rain),
        "is_poya": int(is_poya(appointment_day)),
        "is_weekend": 1 if appointment_day.weekday() >= 5 else 0,
        "gender": "M" if g == "M" else "F",
        "booking_channel": map_channel(booking_channel),
        "payment_mode": map_payment(payment_mode),
        "department": map_department(department, model.categorical["department"]),
    }


# ---- Poya days ----------------------------------------------------------
# Poya = the local (UTC+5:30) date of each full moon. Computed with Meeus,
# "Astronomical Algorithms" ch. 49 (full-moon series, main terms; accurate to
# minutes). Sri Lanka's official calendar occasionally shifts a Poya by a day;
# replace this with the official list if exact dates matter.
_SL_TZ = timezone(timedelta(hours=5, minutes=30))
_poya_cache: dict[int, frozenset[date]] = {}


def _full_moon_jde(k: float) -> float:
    t = k / 1236.85
    jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t**2 - 0.00000015 * t**3 + 0.00000000073 * t**4
    e = 1 - 0.002516 * t - 0.0000074 * t**2
    r = math.radians
    m = r((2.5534 + 29.10535670 * k - 0.0000014 * t**2) % 360)
    mp = r((201.5643 + 385.81693528 * k + 0.0107582 * t**2) % 360)
    f = r((160.7108 + 390.67050284 * k - 0.0016118 * t**2) % 360)
    corr = (
        -0.40614 * math.sin(mp)
        + 0.17302 * e * math.sin(m)
        + 0.01614 * math.sin(2 * mp)
        + 0.01043 * math.sin(2 * f)
        + 0.00734 * e * math.sin(mp - m)
        - 0.00515 * e * math.sin(mp + m)
        + 0.00209 * e * e * math.sin(2 * m)
        - 0.00111 * math.sin(mp - 2 * f)
        - 0.00057 * math.sin(mp + 2 * f)
    )
    return jde + corr


def _jd_to_datetime(jd: float) -> datetime:
    return datetime(2000, 1, 1, 12, tzinfo=timezone.utc) + timedelta(days=jd - 2451545.0)


def _poya_days(year: int) -> frozenset[date]:
    if year not in _poya_cache:
        k0 = math.floor((year - 2000) * 12.3685) - 1
        days = set()
        for n in range(16):
            dt = _jd_to_datetime(_full_moon_jde(k0 + n + 0.5)).astimezone(_SL_TZ)
            if dt.year == year:
                days.add(dt.date())
        _poya_cache[year] = frozenset(days)
    return _poya_cache[year]


def is_poya(day: date) -> bool:
    return day in _poya_days(day.year)

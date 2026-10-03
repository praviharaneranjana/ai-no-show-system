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

# Prevent Matplotlib font scan hang in sandboxed/restricted environments
if "MPLCONFIGDIR" not in os.environ:
    os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib_cache"
_mpl_cache = os.environ["MPLCONFIGDIR"]
os.makedirs(_mpl_cache, exist_ok=True)
_fontlist = os.path.join(_mpl_cache, "fontlist-v3.11.0.json")
if not os.path.exists(_fontlist):
    try:
        with open(_fontlist, "w") as _f:
            _f.write('{"_version": "3.11.0", "default_size": null, "defaultWeight": "normal", "defaultFamily": {"ttf": "DejaVu Sans", "afm": "Helvetica"}, "ttflist": [], "afmlist": [], "__class__": "FontManager"}')
    except OSError:
        pass

import numpy as np
import pandas as pd
import shap
import xgboost as xgb

DEFAULT_BUNDLE_DIR = os.getenv("SHAI_BUNDLE_DIR", "models/shai_bundle")

# Smoothing used by the notebook: prior_no_show_rate = (no_shows + K*BASE) / (appts + K)
PRIOR_RATE_BASE = 0.16
PRIOR_RATE_STRENGTH = 2


def resolve_bundle_dir(bundle_dir: str | None = None) -> str:
    path = bundle_dir or os.getenv("SHAI_BUNDLE_DIR", DEFAULT_BUNDLE_DIR)
    if os.path.exists(os.path.join(path, "model.json")):
        return path
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", path),
        os.path.join(os.path.dirname(__file__), "..", "models", os.path.basename(path)),
        os.path.join("backend", path),
    ]
    for cand in candidates:
        if os.path.exists(os.path.join(cand, "model.json")):
            return os.path.abspath(cand)
    return path


def _load_json(bundle_dir: str, name: str) -> dict:
    with open(os.path.join(bundle_dir, name)) as f:
        return json.load(f)


class ShaiModel:
    def __init__(self, bundle_dir: str | None = None):
        self.bundle_dir = resolve_bundle_dir(bundle_dir)
        if not os.path.exists(os.path.join(self.bundle_dir, "model.json")):
            raise FileNotFoundError(
                f"SHAI model bundle not found in {self.bundle_dir}. "
                "Rebuild it via backend/train_shai.py or set SHAI_BUNDLE_DIR."
            )
        schema = _load_json(self.bundle_dir, "feature_schema.json")
        cal = _load_json(self.bundle_dir, "calibration.json")
        thr = _load_json(self.bundle_dir, "thresholds.json")
        metrics_path = os.path.join(self.bundle_dir, "metrics.json")
        self.metrics: dict = _load_json(self.bundle_dir, "metrics.json") if os.path.exists(metrics_path) else {}

        self.columns: list[str] = schema["columns"]
        self.numeric: list[str] = schema["numeric"]
        self.categorical: dict[str, list[str]] = schema["categorical"]
        self.distance_median: float = schema["distance_median"]
        self.version: str = schema.get("version", "unknown")
        self.cal_x = np.asarray(cal["x"], dtype=float)
        self.cal_y = np.asarray(cal["y"], dtype=float)
        self.high_threshold: float = thr["high"]
        self.medium_threshold: float = thr["medium"]
        self.threshold_rule: str | None = thr.get("rule")

        self.model = xgb.XGBClassifier()
        self.model.load_model(os.path.join(self.bundle_dir, "model.json"))
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

    def info(self) -> dict:
        """Everything the Model Hub shows. Read from the bundle files only (metrics / thresholds / feature_schema)."""
        m = self.metrics
        tm = m.get("test_metrics_tuned") or m.get("test_metrics") or {}
        cis = {k: v for k, v in {**m, **tm}.items() if "ci" in k.lower().split("_") or k.lower().endswith("_ci")}
        return {
            "version": self.version,
            "thresholds": {
                "high": self.high_threshold,
                "medium": self.medium_threshold,
                "rule": self.threshold_rule,
            },
            "metrics": {
                "roc_auc": tm.get("ROC_AUC"),
                "pr_auc": tm.get("PR_AUC"),
                "brier": tm.get("Brier"),
                "lift_top20": tm.get("Lift_top20"),
                "recall_top20": tm.get("Recall_top20"),
                "precision_top20": tm.get("Precision_top20"),
            },
            "recommendations": {t: self.recommendation(t) for t in ("High", "Medium", "Low")},
            "confidence_intervals": cis,
            "comparison_table": m.get("comparison_table", []),
            "oracle_auc": m.get("oracle_auc"),
            "base_rate": m.get("base_rate"),
            "split": m.get("split"),
            "top_shap": m.get("top_shap") or m.get("top_features") or {},
            "optuna_best": m.get("optuna_best"),
            "features": {"numeric": self.numeric, "categorical": self.categorical},
            "data_source": m.get("data_source"),
            "n_rows": m.get("n_rows"),
            "date_range": m.get("date_range") or {},
            "created_at": m.get("created_at"),
            "limitation": LIMITATION,
        }


LIMITATION = (
    "Trained on synthetic Sri Lankan data generated from documented assumptions. "
    "Not validated on real hospital outcomes."
)


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

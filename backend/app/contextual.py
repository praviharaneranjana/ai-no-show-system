"""Contextual Risk Adjustment Layer.

The XGBoost model is trained only on the public Kaggle no-show dataset, which
has no notion of Sri Lankan booking channels, payment commitment, or travel
distance. Those fields exist on our Patient/Appointment records but the model
has never seen a single real labelled outcome for them — so we do NOT retrain
on fabricated labels to make the model "look" locally aware.

Instead, this module applies a small set of transparent, literature-informed
multipliers to the model's raw probability at prediction time. Each factor is
a documented heuristic (not a fitted parameter), and the breakdown is always
returned alongside the raw ML score so nothing here is presented as if the
model learned it. This keeps the ML core honest while still surfacing the
local context a Sri Lankan hospital operator actually cares about.
"""

from __future__ import annotations

# Travel distance is one of the most consistently replicated predictors of
# outpatient non-attendance in scheduling literature (transportation burden).
# Heuristic: +1.5% relative risk per 5km, capped at +20% beyond ~65km.
_DISTANCE_STEP_KM = 5.0
_DISTANCE_STEP_RATE = 0.015
_DISTANCE_CAP = 0.20

# Booking channel proxies for commitment at time of booking: prepaid
# aggregator bookings (Doc990 / eChannelling / MyHealth) require upfront
# payment — a known commitment device — while walk-in counter bookings do not.
_CHANNEL_MULTIPLIERS = {
    "doc990": 0.95,
    "echannelling": 0.95,
    "myhealth": 0.95,
    "counter": 1.08,
}

# Financial commitment / sunk-cost effect: non-refundable prepayment and
# No-Show-Refund (NSR) waiver protection correlate with higher attendance in
# deposit-based outpatient scheduling studies; pay-on-arrival cash does not
# carry that commitment.
_PAYMENT_MULTIPLIERS = {
    "nsr": 0.88,
    "insurance": 1.03,
    "corporate": 1.03,
    "cash": 1.06,
    "credit card": 0.96,
}


def _distance_multiplier(distance_km: float | None) -> float:
    if distance_km is None or distance_km <= 0:
        return 1.0
    return 1.0 + min(distance_km / _DISTANCE_STEP_KM * _DISTANCE_STEP_RATE, _DISTANCE_CAP)


def _match_multiplier(text: str | None, table: dict[str, float]) -> float:
    if not text:
        return 1.0
    lowered = text.lower()
    for keyword, multiplier in table.items():
        if keyword in lowered:
            return multiplier
    return 1.0


def _channel_multiplier(booking_channel: str | None) -> float:
    return _match_multiplier(booking_channel, _CHANNEL_MULTIPLIERS)


def _payment_multiplier(payment_mode: str | None) -> float:
    return _match_multiplier(payment_mode, _PAYMENT_MULTIPLIERS)


def apply_contextual_adjustment(
    ml_risk_score: float,
    *,
    distance_km: float | None,
    booking_channel: str | None,
    payment_mode: str | None,
) -> dict:
    dist_mult = _distance_multiplier(distance_km)
    chan_mult = _channel_multiplier(booking_channel)
    pay_mult = _payment_multiplier(payment_mode)
    combined = dist_mult * chan_mult * pay_mult

    final_score = max(0.01, min(0.99, ml_risk_score * combined))

    return {
        "ml_risk_score": round(ml_risk_score, 4),
        "distance_km": distance_km,
        "distance_multiplier": round(dist_mult, 4),
        "booking_channel": booking_channel,
        "channel_multiplier": round(chan_mult, 4),
        "payment_mode": payment_mode,
        "payment_multiplier": round(pay_mult, 4),
        "combined_multiplier": round(combined, 4),
        "final_risk_score": round(final_score, 4),
        "method": "rule_based_heuristic",
        "note": (
            "Illustrative domain-informed multipliers, not fitted on labelled "
            "local outcomes. The ML component above is the only part trained "
            "on real historical data."
        ),
    }

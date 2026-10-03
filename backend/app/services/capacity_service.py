"""Capacity & overbooking service layer.

Capacity is the real ``max_patients`` of the clinic sessions that run on the target date (a session runs on a date
when it is on the weekly timetable for that weekday and has at least one booking). Expected no-shows are the sum of
the calibrated risk of the booked patients; the overbooking recommendation is the exact Poisson-binomial optimum in
``services/overbooking.py`` (no simulation).

Every query is scoped to ``hospital_id`` when one is given.
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.services import overbooking
from app.services.candidate_ranker import score_waitlist_candidate
from app.services.capacity_math import (
    calculate_poisson_binomial_stats,
    calculate_utilisation_metrics,
)

HEAT_AMBER_EXPECTED_NO_SHOWS = 0.5  # per slot, display thresholds only
HEAT_RED_EXPECTED_NO_SHOWS = 1.0


def _label_for_hour(hour: int) -> str:
    return "Morning" if hour < 12 else "Afternoon" if hour < 17 else "Evening"


def _hour_of(scheduled_time: Optional[str]) -> Optional[int]:
    if not scheduled_time:
        return None
    try:
        return int(scheduled_time.strip()[:2])
    except ValueError:
        return None


def _model_base_rate() -> float:
    """Population no-show rate of the active bundle; used only for bookings that have no stored prediction."""
    from app import shai_model
    from app.main import shai

    rate = (shai.metrics or {}).get("base_rate")
    return float(rate) if rate is not None else shai_model.PRIOR_RATE_BASE


def get_effective_settings(
    db: Session,
    department_id: Optional[int] = None,
    doctor_id: Optional[uuid.UUID] = None,
    hospital_id: Optional[uuid.UUID] = None,
) -> models.CapacitySetting:
    """Most specific capacity settings: doctor -> department -> hospital default."""

    def scoped(q):
        return q.filter(models.CapacitySetting.hospital_id == hospital_id) if hospital_id else q

    if doctor_id:
        row = scoped(db.query(models.CapacitySetting)).filter(
            models.CapacitySetting.doctor_id == doctor_id, models.CapacitySetting.scope == "doctor"
        ).first()
        if row:
            return row
    if department_id:
        row = scoped(db.query(models.CapacitySetting)).filter(
            models.CapacitySetting.department_id == department_id, models.CapacitySetting.scope == "department"
        ).first()
        if row:
            return row

    row = (
        scoped(db.query(models.CapacitySetting))
        .filter(models.CapacitySetting.scope == "global")
        .order_by(models.CapacitySetting.created_at)
        .first()
    )
    if not row:
        row = models.CapacitySetting(hospital_id=hospital_id, scope="global")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def clean_room_name(room: Optional[str]) -> str:
    """Normalise 'Room Room 5' / '5' to 'Room 5'. Empty stays empty (no invented room)."""
    if not room:
        return ""
    r = room.strip()
    while r.lower().startswith("room room"):
        r = r[5:].strip()
    if not r.lower().startswith("room") and not r.lower().startswith("opd"):
        r = f"Room {r}"
    return r


# ---------------------------------------------------------------------------
# Session grouping
# ---------------------------------------------------------------------------
class _Group:
    def __init__(self, session: Optional[models.DoctorClinicSession], doctor: Optional[models.Doctor]):
        self.session = session
        self.doctor = doctor
        self.appts: List[models.Appointment] = []


def _resolve_session(appt: models.Appointment, target: date) -> Optional[models.DoctorClinicSession]:
    if appt.clinic_session is not None:
        return appt.clinic_session
    doc = appt.doctor
    if not doc:
        return None
    same_day = [s for s in doc.sessions if s.weekday == target.weekday() and s.active]
    hr = _hour_of(appt.scheduled_time)
    if hr is not None:
        for s in same_day:
            if s.label == _label_for_hour(hr):
                return s
    return same_day[0] if same_day else None


def _load_groups(
    db: Session,
    target: date,
    hospital_id: Optional[uuid.UUID],
    doctor_id: Optional[uuid.UUID] = None,
    department_id: Optional[int] = None,
) -> tuple[List[_Group], int]:
    q = db.query(models.Appointment).options(
        joinedload(models.Appointment.prediction),
        joinedload(models.Appointment.patient),
        joinedload(models.Appointment.clinic_session),
        joinedload(models.Appointment.doctor).joinedload(models.Doctor.sessions),
        joinedload(models.Appointment.doctor).joinedload(models.Doctor.department),
    ).filter(
        models.Appointment.appointment_day == target,
        models.Appointment.status != "cancelled",
    )
    if hospital_id:
        q = q.filter(models.Appointment.hospital_id == hospital_id)
    if doctor_id:
        q = q.filter(models.Appointment.doctor_id == doctor_id)
    if department_id:
        q = q.join(models.Doctor, models.Doctor.id == models.Appointment.doctor_id).filter(
            models.Doctor.department_id == department_id
        )
    groups: Dict[Any, _Group] = {}
    for a in q.all():
        sess = _resolve_session(a, target)
        key = sess.id if sess else ("none", a.doctor_id, a.doctor_name)
        g = groups.get(key)
        if g is None:
            g = groups[key] = _Group(sess, a.doctor)
        g.appts.append(a)

    # Timetable sessions that exist on this weekday but have no booking (reported, not counted in capacity)
    sq = db.query(models.DoctorClinicSession).join(models.Doctor).filter(
        models.DoctorClinicSession.weekday == target.weekday(),
        models.DoctorClinicSession.active.is_(True),
        models.Doctor.active.is_(True),
    )
    if hospital_id:
        sq = sq.filter(models.Doctor.hospital_id == hospital_id)
    if doctor_id:
        sq = sq.filter(models.Doctor.id == doctor_id)
    if department_id:
        sq = sq.filter(models.Doctor.department_id == department_id)
    idle = sum(1 for s in sq.all() if s.id not in groups)
    return list(groups.values()), idle


def _group_probs(g: _Group, base_rate: float) -> tuple[List[float], int]:
    probs, unscored = [], 0
    for a in g.appts:
        if a.prediction and a.prediction.risk_score is not None:
            probs.append(float(a.prediction.risk_score))
        else:
            probs.append(base_rate)
            unscored += 1
    return probs, unscored


def _group_fee(g: _Group) -> float:
    fees = [a.fee_lkr for a in g.appts if a.fee_lkr]
    if fees:
        return sum(fees) / len(fees)
    return float(g.doctor.consultation_fee_lkr) if g.doctor and g.doctor.consultation_fee_lkr else 0.0


def _evaluate_group(
    g: _Group,
    *,
    base_rate: float,
    wait_cost: float,
    max_overbook: int,
    fee_override: Optional[float] = None,
) -> dict:
    probs, unscored = _group_probs(g, base_rate)
    fee = fee_override if fee_override is not None else _group_fee(g)
    capacity = g.session.max_patients if g.session else None
    exp, var, lo, hi = calculate_poisson_binomial_stats(probs, confidence_level=0.80)
    if capacity is not None:
        rec = overbooking.recommend(probs, capacity, fee, wait_cost, max_overbook, base_rate)
    else:
        rec = None
    return {"probs": probs, "unscored": unscored, "fee": fee, "capacity": capacity,
            "exp": exp, "var": var, "lo": lo, "hi": hi, "rec": rec}


def get_capacity_overview(
    db: Session,
    session_date: Optional[date] = None,
    target_doctor_id: Optional[uuid.UUID] = None,
    max_wait_tolerance: Optional[int] = None,  # kept for API compatibility; the exact method has no wait tolerance
    persist_run: bool = True,
    hospital_id: Optional[uuid.UUID] = None,
    department_id: Optional[int] = None,
    wait_cost_override: Optional[float] = None,
    max_overbook_override: Optional[int] = None,
    fee_override: Optional[float] = None,
) -> schemas.CapacityOptimizeResponse:
    target_date = session_date or date.today()
    groups, idle = _load_groups(db, target_date, hospital_id, target_doctor_id, department_id)
    base_rate = _model_base_rate()
    from app.main import shai

    run_id = uuid.uuid4()
    details: List[schemas.SessionOptimizationDetail] = []
    dept_summaries: Dict[str, Dict[str, Any]] = {}
    tot_cap = tot_booked = tot_rec = 0
    tot_exp = tot_rev = 0.0
    all_probs: List[float] = []

    for g in sorted(groups, key=lambda x: ((x.doctor.full_name if x.doctor else "~"), x.session.start_time if x.session else time(0))):
        settings = get_effective_settings(
            db, department_id=g.doctor.department_id if g.doctor else None,
            doctor_id=g.doctor.id if g.doctor else None, hospital_id=hospital_id,
        )
        wait_cost = wait_cost_override if wait_cost_override is not None else settings.wait_cost_lkr
        max_ob = max_overbook_override if max_overbook_override is not None else settings.max_overbook_per_session
        ev = _evaluate_group(g, base_rate=base_rate, wait_cost=wait_cost, max_overbook=max_ob, fee_override=fee_override)
        booked = len(g.appts)
        cap = ev["capacity"]
        rec = ev["rec"]
        delay = g.session.delay_minutes if g.session else 0
        slot_mins = float(g.session.slot_minutes) if g.session else 0.0
        high = sum(1 for a in g.appts if a.prediction and a.prediction.risk_category == "High")

        if rec:
            k_star, over_if_full = rec["recommended_extra_bookings"], rec["recommended_overbook"]
            free = rec["free_seats"]
            # Overbooking proper starts only when every seat is taken; until then the advice is just "keep booking".
            over = over_if_full if free == 0 else 0
            base_row = rec["curve"][0]
            best_row = rec["curve"][k_star]
            rev_gain = ev["fee"] * (best_row["expected_seen"] - base_row["expected_seen"])
            overflow, p_over = rec["expected_overflow"], rec["p_overflow"]
            value_gain = rec["value_gain_lkr"]
        else:
            k_star = over = over_if_full = free = 0
            rev_gain = overflow = p_over = value_gain = 0.0

        util, attend = calculate_utilisation_metrics(booked, cap or 0, ev["exp"])
        wait_mins = overflow * slot_mins
        if wait_mins <= settings.badge_safe_mins and delay <= 5:
            risk_lvl = "Safe"
        elif wait_mins <= settings.badge_moderate_mins or delay <= 15:
            risk_lvl = "Moderate"
        else:
            risk_lvl = "Caution"

        if cap is None:
            advice = "Booked without a clinic session: capacity unknown, no overbooking advice."
        elif free > 0:
            advice = (f"{free} of {cap} seats free: keep booking. If the session fills, the optimum is to overbook "
                      f"+{over_if_full} (P(overflow) {p_over:.0%} at that point).")
        elif over > 0:
            advice = (f"Full at {cap}: overbook +{over}. P(more arrive than {cap}) = {p_over:.0%}, "
                      f"expected overflow {overflow:.2f} patients.")
        else:
            advice = f"Full at {cap}. Overbooking is not worthwhile at this wait cost."
        if ev["unscored"]:
            advice += f" {ev['unscored']} booking(s) have no stored prediction and use the base rate."

        dept_name = g.doctor.department.name if g.doctor and g.doctor.department else "Unassigned"
        details.append(schemas.SessionOptimizationDetail(
            doctor_id=g.doctor.id if g.doctor else None,
            clinic_session_id=g.session.id if g.session else None,
            session_label=g.session.label if g.session else None,
            session_start=g.session.start_time.strftime("%H:%M") if g.session else None,
            doctor_name=g.doctor.full_name if g.doctor else (g.appts[0].doctor_name or "Unassigned"),
            specialty=dept_name,
            room_number=clean_room_name((g.session.room if g.session else None) or (g.doctor.default_room if g.doctor else None)),
            max_capacity=cap,
            total_booked=booked,
            free_seats=free,
            predicted_no_shows=int(round(ev["exp"])),
            expected_no_shows_float=ev["exp"],
            interval_low=ev["lo"],
            interval_high=ev["hi"],
            high_risk_slots=high,
            unscored_bookings=ev["unscored"],
            recommended_extra_bookings=k_star,
            recommended_overbook_count=over,
            overbook_if_full=over_if_full,
            expected_revenue_gain_lkr=round(rev_gain, 2),
            value_gain_lkr=round(value_gain, 2),
            expected_overflow=round(overflow, 4),
            expected_wait_time_mins=round(wait_mins, 1),
            p_overcrowding=round(p_over, 4),
            booked_utilisation_pct=util,
            expected_attendance_pct=attend,
            consultation_fee_lkr=round(ev["fee"], 2),
            wait_cost_lkr=wait_cost,
            delay_minutes=delay,
            risk_level=risk_lvl,
            status_advice=advice,
        ))

        d = dept_summaries.setdefault(dept_name, {"cap": 0, "booked": 0, "exp": 0.0, "rec": 0, "probs": []})
        d["cap"] += cap or 0
        d["booked"] += booked
        d["exp"] += ev["exp"]
        d["rec"] += over
        d["probs"].extend(ev["probs"])
        tot_cap += cap or 0
        tot_booked += booked
        tot_exp += ev["exp"]
        tot_rec += over
        tot_rev += rev_gain
        all_probs.extend(ev["probs"])

        if persist_run and g.doctor:
            db.add(models.CapacityRecommendation(
                hospital_id=hospital_id,
                run_id=run_id,
                doctor_id=g.doctor.id,
                clinic_session_id=g.session.id if g.session else None,
                target_date=target_date,
                booked_count=booked,
                expected_no_shows=ev["exp"],
                interval_low=ev["lo"],
                interval_high=ev["hi"],
                recommended_overbook=over,
                expected_wait_mins=round(wait_mins, 1),
                expected_revenue_lkr=round(rev_gain, 2),
                p_overcrowding=round(p_over, 4),
                effective_tolerance_mins=0,
                settings_snapshot={"method": "exact_poisson_binomial", "fee": ev["fee"], "wait_cost_lkr": wait_cost,
                                   "max_overbook": max_ob, "capacity": cap},
                model_version=shai.version,
            ))
    if persist_run:
        try:
            db.commit()
        except Exception:
            db.rollback()

    _, _, tot_lo, tot_hi = calculate_poisson_binomial_stats(all_probs, confidence_level=0.80)
    util, attend = calculate_utilisation_metrics(tot_booked, tot_cap, tot_exp)
    dept_out = []
    for name, d in sorted(dept_summaries.items()):
        _, _, lo, hi = calculate_poisson_binomial_stats(d["probs"], confidence_level=0.80)
        dept_out.append(schemas.DepartmentCapacitySummary(
            department=name, total_capacity=d["cap"], total_booked=d["booked"],
            expected_no_shows=round(d["exp"], 1), recommended_overbook=d["rec"], interval_low=lo, interval_high=hi,
        ))
    return schemas.CapacityOptimizeResponse(
        session_date=target_date,
        total_capacity=tot_cap,
        total_booked=tot_booked,
        total_predicted_no_shows=int(round(tot_exp)),
        expected_no_shows_total=round(tot_exp, 1),
        expected_no_shows_interval_low=tot_lo,
        expected_no_shows_interval_high=tot_hi,
        total_recommended_overbooks=tot_rec,
        estimated_revenue_recovery_lkr=round(tot_rev, 2),
        booked_utilisation_pct=util,
        expected_attendance_pct=attend,
        sessions_running=len(details),
        idle_sessions=idle,
        sessions=details,
        departments=dept_out,
    )


# ---------------------------------------------------------------------------
# Slot heat map
# ---------------------------------------------------------------------------
def get_capacity_slots(db: Session, target_date: date, hospital_id: Optional[uuid.UUID] = None) -> schemas.CapacitySlotsResponse:
    """Doctor-session x time grid with booked patients; colours show expected no-shows per slot."""
    groups, _ = _load_groups(db, target_date, hospital_id)
    base_rate = _model_base_rate()
    times = sorted({a.scheduled_time for g in groups for a in g.appts if a.scheduled_time})

    rows: List[schemas.DoctorSlotsOut] = []
    for g in sorted(groups, key=lambda x: ((x.doctor.full_name if x.doctor else "~"), x.session.start_time if x.session else time(0))):
        settings = get_effective_settings(
            db, department_id=g.doctor.department_id if g.doctor else None,
            doctor_id=g.doctor.id if g.doctor else None, hospital_id=hospital_id,
        )
        ev = _evaluate_group(g, base_rate=base_rate, wait_cost=settings.wait_cost_lkr,
                             max_overbook=settings.max_overbook_per_session)
        over = ev["rec"]["recommended_overbook"] if ev["rec"] and ev["rec"]["free_seats"] == 0 else 0
        slots: List[schemas.SlotDetailOut] = []
        for st in times:
            matched = [a for a in g.appts if a.scheduled_time == st]
            patients: List[schemas.SlotPatientOut] = []
            exp = 0.0
            for a in matched:
                p = float(a.prediction.risk_score) if a.prediction else base_rate
                exp += p
                pat = a.patient
                age = None
                if pat and pat.date_of_birth:
                    age = max(a.appointment_day.year - pat.date_of_birth.year
                              - ((a.appointment_day.month, a.appointment_day.day) < (pat.date_of_birth.month, pat.date_of_birth.day)), 0)
                dist = float(pat.distance_km) if pat and pat.distance_km is not None else None
                factors = []
                if dist is not None and dist > 30.0:
                    factors.append(f"Long distance ({dist:.0f} km)")
                if (a.payment_mode or "").lower() == "cash":
                    factors.append("Cash payment on arrival")
                if not a.sms_received:
                    factors.append("SMS unconfirmed")
                patients.append(schemas.SlotPatientOut(
                    appointment_id=a.id,
                    patient_id=a.patient_id,
                    uhid=pat.uhid if pat else "",
                    patient_name=pat.full_name if pat else "",
                    gender=pat.gender if pat else None,
                    age=age,
                    phone=pat.phone if pat else None,
                    city=pat.city if pat else None,
                    distance_km=dist,
                    risk_score=p,
                    risk_category=a.prediction.risk_category if a.prediction else "Unscored",
                    status=a.status,
                    sms_received=a.sms_received,
                    factors=factors,
                ))
            if not matched:
                heat = "grey"
            elif exp >= HEAT_RED_EXPECTED_NO_SHOWS:
                heat = "red"
            elif exp >= HEAT_AMBER_EXPECTED_NO_SHOWS:
                heat = "amber"
            else:
                heat = "green"
            slots.append(schemas.SlotDetailOut(
                slot_time=st, booked_count=len(matched), expected_no_shows=round(exp, 2),
                recommended_overbook=0, heat_color=heat, simulated_wait_mins=0.0, patients=patients,
            ))
        delay = g.session.delay_minutes if g.session else 0
        rows.append(schemas.DoctorSlotsOut(
            doctor_id=g.doctor.id if g.doctor else None,
            clinic_session_id=g.session.id if g.session else None,
            session_label=g.session.label if g.session else None,
            doctor_name=g.doctor.full_name if g.doctor else (g.appts[0].doctor_name or "Unassigned"),
            specialty=g.doctor.department.name if g.doctor and g.doctor.department else "Unassigned",
            room_number=clean_room_name((g.session.room if g.session else None) or (g.doctor.default_room if g.doctor else None)),
            delay_minutes=delay,
            delay_status="delayed" if delay > 0 else "on_time",
            total_booked=len(g.appts),
            total_recommended_overbook=over,  # the recommendation is per session, not per slot
            slots=slots,
        ))
    return schemas.CapacitySlotsResponse(date=target_date, doctors=rows)


# ---------------------------------------------------------------------------
# What-if
# ---------------------------------------------------------------------------
def evaluate_what_if_scenario(db: Session, req: schemas.WhatIfRequest, hospital_id: Optional[uuid.UUID] = None) -> schemas.WhatIfResponse:
    """Current saved policy vs. a different fee / wait cost / overbooking limit, on the real sessions of a date."""
    target = req.target_date or date.today()
    groups, _ = _load_groups(db, target, hospital_id, req.doctor_id, req.department_id)
    base_rate = _model_base_rate()

    def run(wait_cost_o, max_ob_o, fee_o):
        total = {"over": 0, "wait": 0.0, "p": 0.0, "gaps": 0.0, "rev": 0.0, "overflow": 0.0, "net": 0.0}
        curve: Dict[int, Dict[str, float]] = {}
        for g in groups:
            settings = get_effective_settings(
                db, department_id=g.doctor.department_id if g.doctor else None,
                doctor_id=g.doctor.id if g.doctor else None, hospital_id=hospital_id,
            )
            ev = _evaluate_group(
                g, base_rate=base_rate,
                wait_cost=wait_cost_o if wait_cost_o is not None else settings.wait_cost_lkr,
                max_overbook=max_ob_o if max_ob_o is not None else settings.max_overbook_per_session,
                fee_override=fee_o,
            )
            rec = ev["rec"]
            if not rec:
                continue
            k = rec["recommended_extra_bookings"]
            slot_mins = float(g.session.slot_minutes) if g.session else 0.0
            total["over"] += rec["recommended_overbook"] if rec["free_seats"] == 0 else 0
            total["wait"] += rec["expected_overflow"] * slot_mins
            total["p"] = max(total["p"], rec["p_overflow"])
            total["gaps"] += rec["curve"][k]["expected_seen"] - rec["curve"][0]["expected_seen"]
            total["rev"] += ev["fee"] * (rec["curve"][k]["expected_seen"] - rec["curve"][0]["expected_seen"])
            total["overflow"] += rec["expected_overflow"]
            total["net"] += rec["value_gain_lkr"]
            for row in rec["curve"]:
                c = curve.setdefault(row["extra_bookings"], {"extra_bookings": row["extra_bookings"], "value_lkr": 0.0,
                                                           "expected_overflow": 0.0, "p_overflow_max": 0.0})
                c["value_lkr"] += row["value_lkr"]
                c["expected_overflow"] += row["expected_overflow"]
                c["p_overflow_max"] = max(c["p_overflow_max"], row["p_overflow"])
        return total, [curve[k] for k in sorted(curve)]

    cur, _ = run(None, None, None)
    new, curve = run(req.wait_cost_lkr, req.max_overbook_per_session, req.consultation_fee_lkr)

    def stats(t):
        return schemas.WhatIfPolicyStats(
            recommended_overbook=t["over"], expected_wait_mins=round(t["wait"], 1), p_overcrowding=round(t["p"], 4),
            expected_filled_gaps=round(t["gaps"], 2), expected_revenue_lkr=round(t["rev"], 2),
            expected_overflow=round(t["overflow"], 3), net_value_gain_lkr=round(t["net"], 2),
        )

    return schemas.WhatIfResponse(
        current_policy=stats(cur),
        what_if_policy=stats(new),
        delta_overbook=new["over"] - cur["over"],
        delta_wait_mins=round(new["wait"] - cur["wait"], 1),
        delta_revenue_lkr=round(new["rev"] - cur["rev"], 2),
        trade_off_curve=curve,
    )


# ---------------------------------------------------------------------------
# Slot offers (freed slots offered to the waitlist)
# ---------------------------------------------------------------------------
def get_freed_slot_offers(db: Session, hospital_id: Optional[uuid.UUID] = None) -> List[schemas.SlotOfferOut]:
    q = db.query(models.SlotOffer).options(
        joinedload(models.SlotOffer.doctor).joinedload(models.Doctor.department),
        joinedload(models.SlotOffer.waitlist_entry),
        joinedload(models.SlotOffer.clinic_session),
    ).filter(models.SlotOffer.status.in_(["proposed", "approved"]))
    if hospital_id:
        q = q.filter(models.SlotOffer.hospital_id == hospital_id)
    return [_offer_out(o) for o in q.order_by(models.SlotOffer.created_at.desc()).all()]


def _offer_out(o: models.SlotOffer) -> schemas.SlotOfferOut:
    w = o.waitlist_entry
    bd = o.score_breakdown or {}
    breakdown = schemas.CandidateScoreBreakdown(
        specialty_doctor_match=bd.get("specialty_doctor_match", 0.0),
        attendance_reliability=bd.get("attendance_reliability", 0.0),
        waiting_time_priority=bd.get("waiting_time_priority", 0.0),
        clinical_urgency=bd.get("clinical_urgency", 0.0),
        travel_proximity=bd.get("travel_proximity", 0.0),
        days_waiting=bd.get("days_waiting", 0.0),
        predicted_no_show_prob=bd.get("predicted_no_show_prob", 0.0),
    )
    return schemas.SlotOfferOut(
        id=o.id,
        doctor_id=o.doctor_id,
        doctor_name=o.doctor.full_name if o.doctor else "",
        specialty=o.doctor.department.name if o.doctor and o.doctor.department else (w.specialty if w else ""),
        room=clean_room_name(o.clinic_session.room if o.clinic_session else (o.doctor.default_room if o.doctor else None)),
        slot_time=o.slot_time.strftime("%H:%M") if o.slot_time else "",
        slot_date=o.slot_date,
        freed_reason=o.freed_reason,
        waitlist_entry_id=o.waitlist_entry_id,
        candidate_patient_name=w.patient_name if w else "",
        candidate_patient_phone=w.patient_phone if w else "",
        candidate_uhid=None,
        match_score=o.match_score,
        score_breakdown=breakdown,
        status=o.status,
        acted_by=o.acted_by,
        acted_at=o.acted_at,
        created_at=o.created_at,
    )


def act_on_slot_offer(
    db: Session,
    offer_id: uuid.UUID,
    action: str,
    acted_by: str = "Front Desk Staff",
    hospital_id: Optional[uuid.UUID] = None,
) -> schemas.SlotOfferOut:
    offer = db.get(models.SlotOffer, offer_id)
    if not offer or (hospital_id and offer.hospital_id and offer.hospital_id != hospital_id):
        raise ValueError("Slot offer not found")

    if action == "approve":
        offer.status = "approved"
        offer.acted_by = acted_by
        offer.acted_at = datetime.now(timezone.utc)
        if offer.waitlist_entry:
            offer.waitlist_entry.status = "offered"
    elif action == "decline":
        offer.status = "declined"
        offer.acted_by = acted_by
        offer.acted_at = datetime.now(timezone.utc)
    elif action == "undo":
        offer.status = "proposed"
        offer.acted_by = None
        offer.acted_at = None
        if offer.waitlist_entry:
            offer.waitlist_entry.status = "waiting"

    db.commit()
    db.refresh(offer)
    return _offer_out(offer)


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------
def get_capacity_forecast(db: Session, horizon_days: int = 7, hospital_id: Optional[uuid.UUID] = None) -> schemas.ForecastResponse:
    """Forward view over days that already have bookings: expected no-shows and revenue at risk from stored risk and fees."""
    today = date.today()
    base_rate = _model_base_rate()
    days_out: List[schemas.ForecastDayOut] = []
    dept_acc: Dict[str, float] = {}
    tot_booked = 0
    tot_ns = tot_rev = tot_rec = 0.0
    tot_buffer = 0

    for d in range(horizon_days):
        cur = today + timedelta(days=d)
        groups, _ = _load_groups(db, cur, hospital_id)
        probs, rev_risk, overbooks = [], 0.0, 0
        for g in groups:
            p, _unscored = _group_probs(g, base_rate)
            probs.extend(p)
            for a, pi in zip(g.appts, p):
                fee = a.fee_lkr or (a.doctor.consultation_fee_lkr if a.doctor else 0.0) or 0.0
                rev_risk += pi * fee
                dept = a.doctor.department.name if a.doctor and a.doctor.department else (a.department or "Unassigned")
                dept_acc[dept] = dept_acc.get(dept, 0.0) + pi
            settings = get_effective_settings(
                db, department_id=g.doctor.department_id if g.doctor else None,
                doctor_id=g.doctor.id if g.doctor else None, hospital_id=hospital_id,
            )
            ev = _evaluate_group(g, base_rate=base_rate, wait_cost=settings.wait_cost_lkr,
                                 max_overbook=settings.max_overbook_per_session)
            if ev["rec"]:
                overbooks += ev["rec"]["recommended_overbook"] if ev["rec"]["free_seats"] == 0 else 0
        exp, _, lo, hi = calculate_poisson_binomial_stats(probs, confidence_level=0.80)
        days_out.append(schemas.ForecastDayOut(
            date=cur, total_projected_booked=len(probs), expected_no_shows=exp, interval_low=lo, interval_high=hi,
            bufferable_overbooks=overbooks, revenue_at_risk_lkr=round(rev_risk, 2),
            recoverable_revenue_lkr=0.0,
        ))
        tot_booked += len(probs)
        tot_ns += exp
        tot_rev += rev_risk
        tot_buffer += overbooks

    summary = {
        "horizon_days": horizon_days,
        "total_projected_appointments": tot_booked,
        "total_expected_no_shows": round(tot_ns, 1),
        "total_bufferable_overbooks": tot_buffer,
        "total_revenue_at_risk_lkr": round(tot_rev, 2),
        "total_recoverable_revenue_lkr": 0.0,
        "basis": "bookings already in the system; days further out simply have fewer bookings",
    }
    departments = [
        {"department": name, "share_pct": round(100 * v / tot_ns, 1) if tot_ns else 0.0, "expected_no_shows": round(v, 1)}
        for name, v in sorted(dept_acc.items(), key=lambda kv: -kv[1])
    ]
    return schemas.ForecastResponse(horizon_days=horizon_days, summary=summary, days=days_out, departments=departments)


def get_capacity_accuracy(db: Session, hospital_id=None, days: int = 30, department: str | None = None) -> dict:
    """Model accuracy on appointments with recorded outcomes (no fallbacks; ``empty`` when there are none)."""
    from app.services import model_eval

    return model_eval.accuracy_report(db, hospital_id=hospital_id, days=days, department=department)


def get_nav_live_counts(db: Session, hospital_id: Optional[uuid.UUID] = None) -> schemas.NavCountsOut:
    """Sidebar badges (real counts, scoped to the hospital)."""
    wq = db.query(models.WaitlistEntry).filter(models.WaitlistEntry.status == "waiting")
    if hospital_id:
        wq = wq.filter(models.WaitlistEntry.hospital_id == hospital_id)

    today = date.today()
    hq = db.query(models.Appointment).join(
        models.Prediction, models.Appointment.id == models.Prediction.appointment_id
    ).filter(
        models.Appointment.appointment_day == today,
        models.Prediction.risk_category == "High",
        models.Appointment.status == "scheduled",
    )
    iq = db.query(models.Intervention).filter(
        models.Intervention.patient_reply.isnot(None),
        models.Intervention.status != "confirmed",
    )
    if hospital_id:
        hq = hq.filter(models.Appointment.hospital_id == hospital_id)
        iq = iq.filter(models.Intervention.hospital_id == hospital_id)

    return schemas.NavCountsOut(
        waitlist_waiting=wq.count(),
        high_risk_open=hq.count(),
        unscored_today=iq.count(),  # field name kept for the API: it counts unanswered outreach replies
    )

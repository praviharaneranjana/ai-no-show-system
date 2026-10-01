"""Read-only endpoints that power the dashboard drill-down screens.

Everything here is computed from the database (appointments, predictions, doctor
sessions, interventions) — nothing is hard-coded. Mounted by app.main.
"""
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, joinedload

from app import geo, models, schemas
from app.database import get_db

router = APIRouter()

# Same revenue assumptions as the ROI simulator (frontend/lib/roi.ts).
CONSULTATION_FEE_LKR = 4500.0
ANCILLARY_MULTIPLIER = 1.6
SLOT_VALUE_LKR = CONSULTATION_FEE_LKR * ANCILLARY_MULTIPLIER

RISK_ORDER = case(
    (models.Prediction.risk_category == "High", 0),
    (models.Prediction.risk_category == "Medium", 1),
    else_=2,
)


def _upcoming(q):
    return q.filter(models.Appointment.appointment_day >= date.today(), models.Appointment.no_show.is_(None))


# ======================================================================
# No-show trend
# ======================================================================
class TrendPoint(BaseModel):
    period: str  # ISO date of the period start
    label: str
    total: int
    no_shows: int
    rate: float  # percent
    partial: bool = False  # the still-running current period; excluded from headline figures


class TrendResponse(BaseModel):
    granularity: str
    points: list[TrendPoint]
    baseline_rate: float | None  # overall observed rate for the filtered set, percent
    sample_size: int  # appointments with a recorded outcome in the filtered set
    latest_rate: float | None
    previous_rate: float | None
    departments: list[str]
    doctors: list[str]


_TRUNC = {"day": "day", "week": "week", "month": "month", "year": "year"}
_WINDOW_DAYS = {"day": 30, "week": 7 * 12, "month": 366, "year": 365 * 5}


def _label(d: date, granularity: str) -> str:
    if granularity == "day":
        return f"{d:%d %b}"
    if granularity == "week":
        return f"{d:%d %b}"
    if granularity == "month":
        return f"{d:%b %y}"
    return f"{d:%Y}"


@router.get("/analytics/trend", response_model=TrendResponse)
def no_show_trend(
    granularity: Literal["day", "week", "month", "year"] = "month",
    department: Optional[str] = None,
    doctor: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Observed no-show rate per period, from appointments whose outcome is recorded."""
    today = date.today()
    since = today - timedelta(days=_WINDOW_DAYS[granularity])

    def filt(q):
        q = q.filter(models.Appointment.no_show.is_not(None))
        if department:
            q = q.filter(models.Appointment.department == department)
        if doctor:
            q = q.filter(models.Appointment.doctor_name == doctor)
        return q

    current_start = db.query(func.date_trunc(_TRUNC[granularity], func.current_date())).scalar()
    current_start = current_start.date() if isinstance(current_start, datetime) else current_start
    period = func.date_trunc(_TRUNC[granularity], models.Appointment.appointment_day).label("period")
    rows = (
        filt(db.query(period, func.count(), func.sum(case((models.Appointment.no_show.is_(True), 1), else_=0))))
        .filter(models.Appointment.appointment_day >= since, models.Appointment.appointment_day <= today)
        .group_by(period)
        .order_by(period)
        .all()
    )
    points = []
    for p, total, ns in rows:
        d = p.date() if isinstance(p, datetime) else p
        points.append(TrendPoint(
            period=d.isoformat(), label=_label(d, granularity),
            total=int(total), no_shows=int(ns or 0), rate=round(100 * (ns or 0) / total, 1),
            partial=(d == current_start),
        ))

    overall = filt(db.query(func.count(), func.sum(case((models.Appointment.no_show.is_(True), 1), else_=0)))).one()
    n, ns_all = int(overall[0]), int(overall[1] or 0)

    # Headline figures use completed periods only (the running one is still filling up).
    usable = [p for p in points if p.total >= 10 and not p.partial] or [p for p in points if not p.partial]
    latest = usable[-1].rate if usable else None
    previous = usable[-2].rate if len(usable) > 1 else None

    departments = [r[0] for r in db.query(models.Appointment.department).filter(models.Appointment.department.is_not(None)).distinct().order_by(models.Appointment.department)]
    doctors_q = db.query(models.Appointment.doctor_name).filter(models.Appointment.doctor_name.is_not(None))
    if department:
        doctors_q = doctors_q.filter(models.Appointment.department == department)
    doctors = [r[0] for r in doctors_q.distinct().order_by(models.Appointment.doctor_name)]

    return TrendResponse(
        granularity=granularity, points=points,
        baseline_rate=round(100 * ns_all / n, 1) if n else None,
        sample_size=n, latest_rate=latest, previous_rate=previous,
        departments=departments, doctors=doctors,
    )


# ======================================================================
# Revenue at risk
# ======================================================================
class RevenueBucket(BaseModel):
    key: str
    appointments: int
    expected_no_shows: float
    revenue_at_risk_lkr: float


class RevenueAtRiskResponse(BaseModel):
    days: int
    total_appointments: int
    expected_no_shows: float
    revenue_at_risk_lkr: float
    by_department: list[RevenueBucket]
    by_doctor: list[RevenueBucket]
    by_day: list[RevenueBucket]
    consultation_fee_lkr: float
    ancillary_multiplier: float


@router.get("/analytics/revenue-at-risk", response_model=RevenueAtRiskResponse)
def revenue_at_risk(days: int = Query(7, ge=1, le=90), db: Session = Depends(get_db)):
    """Expected revenue loss = sum of calibrated no-show risk over upcoming appointments x slot value."""
    today = date.today()
    rows = (
        db.query(models.Appointment, models.Prediction.risk_score)
        .join(models.Prediction, models.Prediction.appointment_id == models.Appointment.id)
        .filter(
            models.Appointment.appointment_day >= today,
            models.Appointment.appointment_day < today + timedelta(days=days),
            models.Appointment.no_show.is_(None),
        )
        .all()
    )

    def bucketise(keyfn) -> list[RevenueBucket]:
        acc: dict[str, list[float]] = defaultdict(lambda: [0, 0.0])
        for appt, risk in rows:
            k = keyfn(appt) or "Unassigned"
            acc[k][0] += 1
            acc[k][1] += float(risk)
        out = [
            RevenueBucket(key=k, appointments=int(v[0]), expected_no_shows=round(v[1], 2),
                          revenue_at_risk_lkr=round(v[1] * SLOT_VALUE_LKR))
            for k, v in acc.items()
        ]
        return out

    expected = sum(float(r) for _, r in rows)
    by_day = sorted(bucketise(lambda a: a.appointment_day.isoformat()), key=lambda b: b.key)
    # include empty days so the chart is a continuous window
    have = {b.key for b in by_day}
    for i in range(days):
        k = (today + timedelta(days=i)).isoformat()
        if k not in have:
            by_day.append(RevenueBucket(key=k, appointments=0, expected_no_shows=0, revenue_at_risk_lkr=0))
    by_day.sort(key=lambda b: b.key)

    return RevenueAtRiskResponse(
        days=days, total_appointments=len(rows), expected_no_shows=round(expected, 2),
        revenue_at_risk_lkr=round(expected * SLOT_VALUE_LKR),
        by_department=sorted(bucketise(lambda a: a.department), key=lambda b: -b.revenue_at_risk_lkr),
        by_doctor=sorted(bucketise(lambda a: a.doctor_name), key=lambda b: -b.revenue_at_risk_lkr)[:15],
        by_day=by_day,
        consultation_fee_lkr=CONSULTATION_FEE_LKR, ancillary_multiplier=ANCILLARY_MULTIPLIER,
    )


# ======================================================================
# Appointment register (server-side paging / filtering)
# ======================================================================
class RegisterCounts(BaseModel):
    all: int
    high_risk: int
    today: int
    pending_outcome: int


class RegisterResponse(BaseModel):
    items: list[schemas.AppointmentOverviewRow]
    total: int
    page: int
    page_size: int
    counts: RegisterCounts
    departments: list[str]


def _overview_row(a: models.Appointment) -> schemas.AppointmentOverviewRow:
    from app.main import _prediction_out  # local import avoids a circular import at load time

    return schemas.AppointmentOverviewRow(
        appointment=schemas.AppointmentOut.model_validate(a),
        patient=schemas.PatientOut.model_validate(a.patient) if a.patient else None,
        prediction=_prediction_out(a.prediction) if a.prediction else None,
    )


@router.get("/appointments/register", response_model=RegisterResponse)
def appointment_register(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    view: Literal["all", "today", "high_risk", "pending_outcome", "upcoming"] = "all",
    risk: Optional[Literal["High", "Medium", "Low"]] = None,
    window_days: Optional[int] = Query(None, ge=1, le=365, description="Only upcoming appointments within N days"),
    q: Optional[str] = None,
    department: Optional[str] = None,
    doctor: Optional[str] = None,
    status: Optional[str] = None,
    sort: Literal["risk", "date_desc", "date_asc", "name"] = "risk",
    db: Session = Depends(get_db),
):
    today = date.today()
    A, P, Pt = models.Appointment, models.Prediction, models.Patient

    base = (
        db.query(A)
        .join(Pt, A.patient_id == Pt.id)
        .outerjoin(P, P.appointment_id == A.id)
    )

    # Counts for the tab strip (respect search/department filters, not the view itself)
    def common(query):
        if q:
            like = f"%{q.strip()}%"
            query = query.filter(or_(Pt.full_name.ilike(like), Pt.phone.ilike(like), Pt.uhid.ilike(like),
                                     A.department.ilike(like), A.doctor_name.ilike(like)))
        if department:
            query = query.filter(A.department == department)
        if doctor:
            query = query.filter(A.doctor_name == doctor)
        return query

    cq = common(base)
    counts = RegisterCounts(
        all=cq.count(),
        high_risk=cq.filter(P.risk_category == "High", A.no_show.is_(None), A.appointment_day >= today).count(),
        today=cq.filter(A.appointment_day == today).count(),
        pending_outcome=cq.filter(A.appointment_day < today, A.no_show.is_(None)).count(),
    )

    query = common(base)
    if view == "today":
        query = query.filter(A.appointment_day == today)
    elif view == "high_risk":
        query = query.filter(P.risk_category == "High", A.no_show.is_(None), A.appointment_day >= today)
    elif view == "pending_outcome":
        query = query.filter(A.appointment_day < today, A.no_show.is_(None))
    elif view == "upcoming":
        query = query.filter(A.appointment_day >= today, A.no_show.is_(None))
    if risk:
        query = query.filter(P.risk_category == risk)
    if window_days:
        query = query.filter(A.appointment_day >= today, A.appointment_day < today + timedelta(days=window_days), A.no_show.is_(None))
    if status:
        query = query.filter(A.status == status)

    total = query.count()
    if sort == "risk":
        query = query.order_by(RISK_ORDER, P.risk_score.desc().nullslast(), A.appointment_day, A.id)
    elif sort == "date_asc":
        query = query.order_by(A.appointment_day.asc(), A.id)
    elif sort == "name":
        query = query.order_by(Pt.full_name, A.id)
    else:
        query = query.order_by(A.appointment_day.desc(), A.id)

    rows = (
        query.options(joinedload(A.patient), joinedload(A.prediction))
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    departments = [r[0] for r in db.query(A.department).filter(A.department.is_not(None)).distinct().order_by(A.department)]
    return RegisterResponse(
        items=[_overview_row(a) for a in rows], total=total, page=page, page_size=page_size,
        counts=counts, departments=departments,
    )


# ======================================================================
# Outreach activity
# ======================================================================
class ActivityItem(BaseModel):
    id: uuid.UUID
    appointment_id: uuid.UUID
    patient_name: str
    channel: str
    language: str
    status: str
    intent_detected: str | None
    patient_reply: str | None
    created_at: datetime


class ActivityResponse(BaseModel):
    items: list[ActivityItem]
    total: int
    resolution_rate: float | None  # % of conversations ending confirmed/rescheduled/telehealth


@router.get("/outreach/activity", response_model=ActivityResponse)
def outreach_activity(limit: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)):
    I = models.Intervention
    rows = (
        db.query(I, models.Patient.full_name)
        .join(models.Appointment, I.appointment_id == models.Appointment.id)
        .join(models.Patient, models.Appointment.patient_id == models.Patient.id)
        .order_by(I.created_at.desc())
        .limit(limit)
        .all()
    )
    total = db.query(func.count(I.id)).scalar() or 0
    resolved = db.query(func.count(I.id)).filter(I.status.in_(["confirmed", "rescheduled", "telehealth_requested"])).scalar() or 0
    return ActivityResponse(
        items=[
            ActivityItem(id=i.id, appointment_id=i.appointment_id, patient_name=name, channel=i.channel,
                         language=i.language, status=i.status, intent_detected=i.intent_detected,
                         patient_reply=i.patient_reply, created_at=i.created_at)
            for i, name in rows
        ],
        total=int(total),
        resolution_rate=round(100 * resolved / total, 1) if total else None,
    )


# ======================================================================
# Notifications
# ======================================================================
class NotificationItem(BaseModel):
    id: str  # stable id so "read" state can be kept client-side
    type: Literal["high_risk", "delay", "reply", "waitlist"]
    title: str
    detail: str
    href: str
    at: datetime


class NotificationsResponse(BaseModel):
    items: list[NotificationItem]


@router.get("/notifications", response_model=NotificationsResponse)
def notifications(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    today = date.today()
    now = datetime.now()
    items: list[NotificationItem] = []

    high = (
        db.query(models.Appointment)
        .join(models.Prediction, models.Prediction.appointment_id == models.Appointment.id)
        .options(joinedload(models.Appointment.patient), joinedload(models.Appointment.prediction))
        .filter(models.Prediction.risk_category == "High", models.Appointment.appointment_day == today,
                models.Appointment.no_show.is_(None))
        .order_by(models.Prediction.risk_score.desc())
        .limit(15).all()
    )
    for a in high:
        pct = round(float(a.prediction.risk_score) * 100)
        items.append(NotificationItem(
            id=f"high:{a.id}", type="high_risk", title=f"High-risk appointment today: {a.patient.full_name}",
            detail=f"{pct}% no-show risk · {a.department or 'General'} · {a.scheduled_time or ''}".strip(" ·"),
            href=f"/appointments/{a.id}", at=now,
        ))

    for s in db.query(models.DoctorSession).filter(models.DoctorSession.session_date == today,
                                                   models.DoctorSession.delay_minutes > 0).all():
        items.append(NotificationItem(
            id=f"delay:{s.id}:{s.delay_minutes}", type="delay",
            title=f"{s.doctor_name} running {s.delay_minutes} min late",
            detail=f"{s.specialty} · scheduled {s.scheduled_start_time} · {s.room_number}",
            href=f"/sessions/{s.id}", at=now,
        ))

    replies = (
        db.query(models.Intervention, models.Patient.full_name)
        .join(models.Appointment, models.Intervention.appointment_id == models.Appointment.id)
        .join(models.Patient, models.Appointment.patient_id == models.Patient.id)
        .filter(models.Intervention.patient_reply.is_not(None))
        .order_by(models.Intervention.created_at.desc()).limit(15).all()
    )
    for i, name in replies:
        items.append(NotificationItem(
            id=f"reply:{i.id}", type="reply", title=f"{name} replied via {i.channel}",
            detail=(i.intent_detected or i.status.replace("_", " ")), href=f"/appointments/{i.appointment_id}",
            at=i.created_at,
        ))

    for w in db.query(models.WaitlistEntry).filter(models.WaitlistEntry.status == "waiting") \
            .order_by(models.WaitlistEntry.created_at.desc()).limit(10).all():
        items.append(NotificationItem(
            id=f"wait:{w.id}", type="waitlist", title=f"{w.patient_name} is waiting for {w.doctor_name}",
            detail=f"{w.specialty} · {w.urgency_level} urgency", href="/capacity", at=w.created_at,
        ))

    items.sort(key=lambda n: n.at, reverse=True)
    return NotificationsResponse(items=items[:limit])


# ======================================================================
# Global search
# ======================================================================
class SearchHit(BaseModel):
    kind: Literal["patient", "appointment"]
    title: str
    subtitle: str
    href: str


@router.get("/search", response_model=list[SearchHit])
def search(q: str = Query(..., min_length=2, max_length=80), db: Session = Depends(get_db)):
    like = f"%{q.strip()}%"
    A, Pt = models.Appointment, models.Patient
    rows = (
        db.query(A)
        .join(Pt, A.patient_id == Pt.id)
        .options(joinedload(A.patient))
        .filter(or_(Pt.full_name.ilike(like), Pt.phone.ilike(like), Pt.uhid.ilike(like), Pt.city.ilike(like)))
        .order_by(A.appointment_day.desc())
        .limit(12).all()
    )
    return [
        SearchHit(kind="appointment", title=a.patient.full_name,
                  subtitle=f"{a.appointment_day:%d %b %Y} · {a.department or 'General'} · {a.patient.phone or ''}".strip(" ·"),
                  href=f"/appointments/{a.id}")
        for a in rows
    ]


# ======================================================================
# Patient geography
# ======================================================================
class GeoPoint(BaseModel):
    appointment_id: uuid.UUID
    patient_name: str
    city: str | None
    latitude: float
    longitude: float
    distance_km: float
    department: str | None
    appointment_day: date
    risk_category: str | None
    risk_score: float | None
    no_show: bool | None


class DistanceBin(BaseModel):
    label: str
    patients: int
    no_show_rate: float | None  # percent, over appointments with recorded outcome


class GeoResponse(BaseModel):
    hospital_name: str
    hospital_lat: float
    hospital_lng: float
    points: list[GeoPoint]
    bins: list[DistanceBin]
    avg_km_no_show: float | None
    avg_km_attended: float | None
    truncated: bool
    departments: list[str]


@router.get("/geo/patients", response_model=GeoResponse)
def geo_patients(
    risk: Optional[Literal["High", "Medium", "Low"]] = None,
    department: Optional[str] = None,
    days_back: int = Query(45, ge=0, le=3650),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    A, P, Pt = models.Appointment, models.Prediction, models.Patient
    since = date.today() - timedelta(days=days_back)
    q = (
        db.query(A, Pt, P)
        .join(Pt, A.patient_id == Pt.id)
        .outerjoin(P, P.appointment_id == A.id)
        .filter(Pt.latitude.is_not(None), Pt.longitude.is_not(None), A.appointment_day >= since)
    )
    if risk:
        q = q.filter(P.risk_category == risk)
    if department:
        q = q.filter(A.department == department)
    total = q.count()
    rows = q.order_by(RISK_ORDER, A.appointment_day).limit(limit).all()

    points = [
        GeoPoint(appointment_id=a.id, patient_name=pt.full_name, city=pt.city, latitude=pt.latitude,
                 longitude=pt.longitude, distance_km=float(pt.distance_km or 0), department=a.department,
                 appointment_day=a.appointment_day, risk_category=p.risk_category if p else None,
                 risk_score=float(p.risk_score) if p else None, no_show=a.no_show)
        for a, pt, p in rows
    ]

    # Distance vs no-show across ALL recorded outcomes (not just the displayed window)
    edges = [(0, 10), (10, 25), (25, 50), (50, 100), (100, 1e9)]
    bins = []
    for lo, hi in edges:
        cond = and_(Pt.distance_km >= lo, Pt.distance_km < hi)
        n = db.query(func.count(A.id)).join(Pt, A.patient_id == Pt.id).filter(cond).scalar() or 0
        known, ns = (
            db.query(func.count(A.id), func.sum(case((A.no_show.is_(True), 1), else_=0)))
            .join(Pt, A.patient_id == Pt.id).filter(cond, A.no_show.is_not(None)).one()
        )
        label = f"{lo}–{hi} km" if hi < 1e9 else f"{lo}+ km"
        bins.append(DistanceBin(label=label, patients=int(n), no_show_rate=round(100 * (ns or 0) / known, 1) if known else None))

    def avg_km(flag: bool):
        v = db.query(func.avg(Pt.distance_km)).join(A, A.patient_id == Pt.id).filter(A.no_show.is_(flag)).scalar()
        return round(float(v), 1) if v is not None else None

    return GeoResponse(
        hospital_name=geo.HOSPITAL_NAME, hospital_lat=geo.HOSPITAL_LAT, hospital_lng=geo.HOSPITAL_LNG,
        points=points, bins=bins, avg_km_no_show=avg_km(True), avg_km_attended=avg_km(False),
        truncated=total > limit,
        departments=[r[0] for r in db.query(A.department).filter(A.department.is_not(None)).distinct().order_by(A.department)],
    )


# ======================================================================
# Doctor session detail
# ======================================================================
class SessionQueueItem(BaseModel):
    appointment_id: uuid.UUID
    patient_name: str
    queue_number: int | None
    scheduled_time: str | None
    risk_category: str | None
    risk_score: float | None
    status: str


class SessionDetail(BaseModel):
    session: schemas.DoctorSessionOut
    booked: int
    predicted_no_shows: float
    high_risk: int
    queue: list[SessionQueueItem]


@router.get("/doctors/sessions/{session_id}/detail", response_model=SessionDetail)
def session_detail(session_id: uuid.UUID, db: Session = Depends(get_db)):
    s = db.get(models.DoctorSession, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Doctor session not found")
    rows = (
        db.query(models.Appointment)
        .options(joinedload(models.Appointment.patient), joinedload(models.Appointment.prediction))
        .filter(models.Appointment.doctor_name == s.doctor_name,
                models.Appointment.appointment_day == s.session_date)
        .order_by(models.Appointment.queue_number, models.Appointment.scheduled_time)
        .all()
    )
    queue = [
        SessionQueueItem(
            appointment_id=a.id, patient_name=a.patient.full_name, queue_number=a.queue_number,
            scheduled_time=a.scheduled_time,
            risk_category=a.prediction.risk_category if a.prediction else None,
            risk_score=float(a.prediction.risk_score) if a.prediction else None, status=a.status,
        )
        for a in rows
    ]
    return SessionDetail(
        session=schemas.DoctorSessionOut.model_validate(s), booked=len(queue),
        predicted_no_shows=round(sum(i.risk_score or 0 for i in queue), 1),
        high_risk=sum(1 for i in queue if i.risk_category == "High"), queue=queue,
    )

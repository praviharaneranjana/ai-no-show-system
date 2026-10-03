"""Hospital profile, financial summary, contacts, partners, and governance endpoints."""
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app import auth, models, security
from app.database import get_db

logger = logging.getLogger("noshow_api")
router = APIRouter(prefix="/hospital", tags=["hospital"])



# ---- Schemas ----------------------------------------------------------------
class HospitalFinancialSummary(BaseModel):
    total_appointments: int
    no_shows_recorded: int
    observed_no_show_rate_pct: Optional[float] = None
    revenue_recovered_lkr: float
    revenue_at_risk_lkr: float
    avoided_loss_lkr: float
    active_doctors_count: int
    departments_count: int
    registered_staff_count: int


class HospitalContactOut(BaseModel):
    id: uuid.UUID
    kind: str
    name: str
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool

    model_config = {"from_attributes": True}


class HospitalContactCreate(BaseModel):
    kind: str = "general"
    name: str
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool = False


class HospitalPartnerOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    website: Optional[str] = None
    since_date: Optional[date] = None
    description: Optional[str] = None
    is_official: bool

    model_config = {"from_attributes": True}


class HospitalPartnerCreate(BaseModel):
    name: str
    kind: str = "insurance"
    website: Optional[str] = None
    since_date: Optional[date] = None
    description: Optional[str] = None
    is_official: bool = True


class HospitalManagementOut(BaseModel):
    id: uuid.UUID
    full_name: str
    position: str
    bio: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    display_order: int
    is_public: bool

    model_config = {"from_attributes": True}


class HospitalManagementCreate(BaseModel):
    full_name: str
    position: str
    bio: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    display_order: int = 0
    is_public: bool = True


class HospitalAuditOut(BaseModel):
    id: uuid.UUID
    actor_email: Optional[str] = None
    action: str
    details: dict
    created_at: datetime


class HospitalDetailOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    short_name: str
    legal_name: Optional[str] = None
    logo_url: Optional[str] = None
    brand_color: str
    established_date: Optional[date] = None
    hospital_type: str
    registration_number: Optional[str] = None
    bed_count: int
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: str
    district: str
    province: str
    postal_code: str
    country: str
    latitude: float
    longitude: float
    timezone: str
    currency: str
    website: Optional[str] = None
    main_phone: Optional[str] = None
    main_email: Optional[str] = None
    emergency_phone: Optional[str] = None
    about: Optional[str] = None
    accreditations: list[str]
    go_live_date: Optional[date] = None
    is_active: bool
    financial_summary: HospitalFinancialSummary
    contacts: list[HospitalContactOut]
    partners: list[HospitalPartnerOut]
    management_members: list[HospitalManagementOut]

    model_config = {"from_attributes": True}


class HospitalUpdateRequest(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    legal_name: Optional[str] = None
    logo_url: Optional[str] = None
    brand_color: Optional[str] = None
    bed_count: Optional[int] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    website: Optional[str] = None
    main_phone: Optional[str] = None
    main_email: Optional[str] = None
    emergency_phone: Optional[str] = None
    about: Optional[str] = None
    accreditations: Optional[list[str]] = None


# ---- Helpers ----------------------------------------------------------------
def _calculate_hospital_metrics(db: Session, hospital_id: uuid.UUID) -> HospitalFinancialSummary:
    total_appts = db.query(models.Appointment).filter_by(hospital_id=hospital_id).count()
    no_shows = (
        db.query(models.Appointment)
        .filter_by(hospital_id=hospital_id)
        .filter(models.Appointment.no_show.is_(True))
        .count()
    )
    observed_rate = round(100.0 * no_shows / max(total_appts, 1), 1) if total_appts > 0 else None

    # Revenue recovered from interventions (e.g. WhatsApp/SMS confirmation or rescheduling)
    confirmed_interventions = (
        db.query(models.Intervention)
        .join(models.Appointment, models.Intervention.appointment_id == models.Appointment.id)
        .filter(models.Appointment.hospital_id == hospital_id)
        .filter(models.Intervention.status.in_(["confirmed", "rescheduled"]))
        .count()
    )
    slot_value = (
        db.query(func.coalesce(func.avg(models.Appointment.fee_lkr), func.avg(models.Doctor.consultation_fee_lkr), 0.0))
        .select_from(models.Appointment)
        .outerjoin(models.Doctor, models.Doctor.id == models.Appointment.doctor_id)
        .filter(models.Appointment.hospital_id == hospital_id)
        .scalar()
    )
    slot_value = float(slot_value or 0.0)  # average fee recorded for this hospital's appointments
    revenue_recovered = confirmed_interventions * slot_value

    # Revenue at risk: upcoming appointments with calibrated risk
    today = date.today()
    upcoming_risks = (
        db.query(models.Prediction.risk_score)
        .join(models.Appointment, models.Prediction.appointment_id == models.Appointment.id)
        .filter(
            models.Appointment.hospital_id == hospital_id,
            models.Appointment.appointment_day >= today,
            models.Appointment.no_show.is_(None),
        )
        .all()
    )
    risk_sum = sum(float(r[0]) for r in upcoming_risks) if upcoming_risks else 0.0
    revenue_at_risk = round(risk_sum * slot_value, 2)

    # Avoided loss: estimated from recovered appointments and reallocated slots
    avoided_loss = round(revenue_recovered * 0.85, 2)

    doctors_count = db.query(models.Doctor).filter_by(hospital_id=hospital_id, active=True).count()
    depts_count = db.query(models.Department).filter_by(hospital_id=hospital_id, active=True).count()
    staff_count = db.query(models.HospitalMembership).filter_by(hospital_id=hospital_id, status="active").count()

    return HospitalFinancialSummary(
        total_appointments=total_appts,
        no_shows_recorded=no_shows,
        observed_no_show_rate_pct=observed_rate,
        revenue_recovered_lkr=revenue_recovered,
        revenue_at_risk_lkr=revenue_at_risk,
        avoided_loss_lkr=avoided_loss,
        active_doctors_count=doctors_count,
        departments_count=depts_count,
        registered_staff_count=staff_count,
    )


# ---- Endpoints --------------------------------------------------------------
@router.get("", response_model=HospitalDetailOut)
def get_hospital_profile(request: Request, db: Session = Depends(get_db)):
    """Fetch active hospital profile, financial summary, contacts, partners, and leadership."""
    hospital = getattr(request.state, "hospital", None)
    if not hospital:
        # Fallback to first active hospital
        hospital = db.query(models.Hospital).filter(models.Hospital.is_active.is_(True)).order_by(models.Hospital.created_at.asc()).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="No hospital profile configured.")

    financial_summary = _calculate_hospital_metrics(db, hospital.id)
    contacts = db.query(models.HospitalContact).filter_by(hospital_id=hospital.id).all()
    partners = db.query(models.HospitalPartner).filter_by(hospital_id=hospital.id).all()
    leadership = (
        db.query(models.HospitalManagementMember)
        .filter_by(hospital_id=hospital.id)
        .order_by(models.HospitalManagementMember.display_order.asc())
        .all()
    )

    return HospitalDetailOut(
        id=hospital.id,
        slug=hospital.slug,
        name=hospital.name,
        short_name=hospital.short_name,
        legal_name=hospital.legal_name,
        logo_url=hospital.logo_url,
        brand_color=hospital.brand_color,
        established_date=hospital.established_date,
        hospital_type=hospital.hospital_type,
        registration_number=hospital.registration_number,
        bed_count=hospital.bed_count,
        address_line1=hospital.address_line1,
        address_line2=hospital.address_line2,
        city=hospital.city,
        district=hospital.district,
        province=hospital.province,
        postal_code=hospital.postal_code,
        country=hospital.country,
        latitude=hospital.latitude,
        longitude=hospital.longitude,
        timezone=hospital.timezone,
        currency=hospital.currency,
        website=hospital.website,
        main_phone=hospital.main_phone,
        main_email=hospital.main_email,
        emergency_phone=hospital.emergency_phone,
        about=hospital.about,
        accreditations=hospital.accreditations or [],
        go_live_date=hospital.go_live_date,
        is_active=hospital.is_active,
        financial_summary=financial_summary,
        contacts=[HospitalContactOut.model_validate(c) for c in contacts],
        partners=[HospitalPartnerOut.model_validate(p) for p in partners],
        management_members=[HospitalManagementOut.model_validate(m) for m in leadership],
    )


@router.patch("", response_model=HospitalDetailOut)
def update_hospital_profile(
    req: HospitalUpdateRequest,
    request: Request,
    admin: models.User = Depends(auth.require_role("manager")),
    db: Session = Depends(get_db),
):
    """Update hospital profile details (restricted to manager, admin, or platform owner)."""
    hospital = getattr(request.state, "hospital", None)
    if not hospital:
        raise HTTPException(status_code=404, detail="Active hospital context not found.")

    changed = {}
    for field, val in req.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(hospital, field, val)
            changed[field] = val

    db.add(
        models.HospitalAuditLog(
            hospital_id=hospital.id,
            actor_user_id=admin.id,
            action="hospital_profile_updated",
            details=changed,
        )
    )
    db.commit()
    db.refresh(hospital)

    return get_hospital_profile(request=request, db=db)


@router.get("/contacts", response_model=list[HospitalContactOut])
def list_contacts(request: Request, db: Session = Depends(get_db)):
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        return []
    return db.query(models.HospitalContact).filter_by(hospital_id=hospital_id).all()


@router.post("/contacts", response_model=HospitalContactOut, status_code=201)
def add_contact(
    req: HospitalContactCreate,
    request: Request,
    _: models.User = Depends(auth.require_role("manager")),
    db: Session = Depends(get_db),
):
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        raise HTTPException(status_code=400, detail="Active hospital context required.")

    contact = models.HospitalContact(
        hospital_id=hospital_id,
        kind=req.kind,
        name=req.name,
        title=req.title,
        email=req.email,
        phone=req.phone,
        is_primary=req.is_primary,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(
    contact_id: uuid.UUID,
    request: Request,
    _: models.User = Depends(auth.require_role("manager")),
    db: Session = Depends(get_db),
):
    hospital_id = getattr(request.state, "hospital_id", None)
    contact = db.get(models.HospitalContact, contact_id)
    if not contact or (hospital_id and contact.hospital_id != hospital_id):
        raise HTTPException(status_code=404, detail="Contact not found.")
    db.delete(contact)
    db.commit()


@router.get("/partners", response_model=list[HospitalPartnerOut])
def list_partners(request: Request, db: Session = Depends(get_db)):
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        return []
    return db.query(models.HospitalPartner).filter_by(hospital_id=hospital_id).all()


@router.post("/partners", response_model=HospitalPartnerOut, status_code=201)
def add_partner(
    req: HospitalPartnerCreate,
    request: Request,
    _: models.User = Depends(auth.require_role("manager")),
    db: Session = Depends(get_db),
):
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        raise HTTPException(status_code=400, detail="Active hospital context required.")

    partner = models.HospitalPartner(
        hospital_id=hospital_id,
        name=req.name,
        kind=req.kind,
        website=req.website,
        since_date=req.since_date,
        description=req.description,
        is_official=req.is_official,
    )
    db.add(partner)
    db.commit()
    db.refresh(partner)
    return partner


@router.get("/management", response_model=list[HospitalManagementOut])
def list_management(request: Request, db: Session = Depends(get_db)):
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        return []
    return (
        db.query(models.HospitalManagementMember)
        .filter_by(hospital_id=hospital_id)
        .order_by(models.HospitalManagementMember.display_order.asc())
        .all()
    )


@router.post("/management", response_model=HospitalManagementOut, status_code=201)
def add_management_member(
    req: HospitalManagementCreate,
    request: Request,
    _: models.User = Depends(auth.require_role("manager")),
    db: Session = Depends(get_db),
):
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        raise HTTPException(status_code=400, detail="Active hospital context required.")

    member = models.HospitalManagementMember(
        hospital_id=hospital_id,
        full_name=req.full_name,
        position=req.position,
        bio=req.bio,
        email=req.email,
        phone=req.phone,
        display_order=req.display_order,
        is_public=req.is_public,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get("/audit", response_model=list[HospitalAuditOut])
def list_hospital_audit(
    request: Request,
    _: models.User = Depends(auth.require_role("admin")),
    db: Session = Depends(get_db),
):
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        return []
    logs = (
        db.query(models.HospitalAuditLog)
        .filter_by(hospital_id=hospital_id)
        .order_by(models.HospitalAuditLog.created_at.desc())
        .limit(100)
        .all()
    )
    results = []
    for log in logs:
        actor = db.get(models.User, log.actor_user_id) if log.actor_user_id else None
        results.append(
            HospitalAuditOut(
                id=log.id,
                actor_email=actor.email if actor else None,
                action=log.action,
                details=log.details or {},
                created_at=log.created_at,
            )
        )
    return results

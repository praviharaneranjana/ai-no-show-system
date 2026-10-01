"""Authentication and authorisation: login, sessions, multi-hospital tenancy, roles and staff accounts.

Every route requires a valid signed bearer token (``Authorization: Bearer <token>``)
except the public ones in ``PUBLIC_PATHS``. The token is verified, then the user row is
re-read so a deactivated account or a role change takes effect on the next request.
Roles: front_desk, analyst, manager, admin, platform_owner.
"""
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import models, security
from app.database import SessionLocal, get_db

logger = logging.getLogger("noshow_api")

PUBLIC_PATHS = {
    "/",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/auth/login",
    "/auth/register",
    "/auth/resolve-email",
    "/auth/hospitals",
}
# A user who must change their password may only reach these until they do.
PASSWORD_CHANGE_PATHS = {"/auth/me", "/auth/change-password"}

MAX_FAILED_ATTEMPTS = int(os.getenv("MAX_FAILED_LOGINS", "5"))
LOCKOUT_MINUTES = int(os.getenv("LOCKOUT_MINUTES", "15"))

router = APIRouter()


# ---- dependencies ---------------------------------------------------------
def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def require_user(request: Request, db: Session = Depends(get_db)) -> models.User | None:
    """Global dependency: authenticate every non-public request and set tenant context."""
    if request.url.path in PUBLIC_PATHS:
        return None

    token = _bearer(request)
    payload = security.verify_token(token) if token else None
    if payload is None:
        raise HTTPException(status_code=401, detail="Authentication required.", headers={"WWW-Authenticate": "Bearer"})

    try:
        user = db.get(models.User, uuid.UUID(payload["sub"]))
    except (ValueError, KeyError):
        user = None
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Authentication required.", headers={"WWW-Authenticate": "Bearer"})

    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_PATHS:
        raise HTTPException(status_code=403, detail="Password change required.")

    # Multi-hospital tenant resolution
    hospital_id_str = payload.get("hospital_id")
    hospital: models.Hospital | None = None
    membership: models.HospitalMembership | None = None
    active_role = user.role

    if user.role == "platform_owner":
        # Platform owner can scope to any hospital or defaults to first active
        if hospital_id_str:
            try:
                hospital = db.get(models.Hospital, uuid.UUID(hospital_id_str))
            except (ValueError, TypeError):
                pass
        if not hospital:
            hospital = db.query(models.Hospital).filter(models.Hospital.is_active.is_(True)).order_by(models.Hospital.created_at.asc()).first()
    else:
        # User membership resolution
        if hospital_id_str:
            try:
                h_uuid = uuid.UUID(hospital_id_str)
                membership = (
                    db.query(models.HospitalMembership)
                    .filter(
                        models.HospitalMembership.user_id == user.id,
                        models.HospitalMembership.hospital_id == h_uuid,
                        models.HospitalMembership.status == "active",
                    )
                    .first()
                )
            except (ValueError, TypeError):
                membership = None

        if not membership:
            # Fallback to user's first active hospital membership
            membership = (
                db.query(models.HospitalMembership)
                .filter(
                    models.HospitalMembership.user_id == user.id,
                    models.HospitalMembership.status == "active",
                )
                .first()
            )

        if membership:
            hospital = db.get(models.Hospital, membership.hospital_id)
            active_role = membership.role
        else:
            # Check if user has a pending membership (registered, waiting for admin approval)
            pending_mem = (
                db.query(models.HospitalMembership)
                .filter(
                    models.HospitalMembership.user_id == user.id,
                    models.HospitalMembership.status == "pending",
                )
                .first()
            )
            if pending_mem:
                hospital = db.get(models.Hospital, pending_mem.hospital_id)
                membership = pending_mem
                active_role = pending_mem.role
                # If requesting anything outside /auth/*, block with 403
                if not request.url.path.startswith("/auth/"):
                    raise HTTPException(
                        status_code=403,
                        detail="Your hospital staff account is pending administrator approval.",
                    )
            else:
                if not request.url.path.startswith("/auth/"):
                    raise HTTPException(
                        status_code=403,
                        detail="No hospital membership found. Please contact your hospital administrator.",
                    )

    request.state.user = user
    request.state.hospital = hospital
    request.state.hospital_id = hospital.id if hospital else None
    request.state.membership = membership
    request.state.role = active_role

    return user


def require_role(minimum: str):
    """Dependency factory: allow users whose active role ranks at least ``minimum``."""
    needed = security.ROLE_RANK.get(minimum, 99)

    def dependency(request: Request, user: models.User | None = Depends(require_user)) -> models.User:
        role = getattr(request.state, "role", getattr(user, "role", "front_desk"))
        if security.ROLE_RANK.get(role, 0) < needed:
            raise HTTPException(status_code=403, detail=f"This action requires the {minimum} role or higher.")
        return user

    return dependency


def require_permission(permission: str):
    """Dependency factory: verify active role possesses the required permission."""
    def dependency(request: Request, user: models.User | None = Depends(require_user)) -> models.User:
        role = getattr(request.state, "role", getattr(user, "role", "front_desk"))
        perms = security.get_role_permissions(role)
        if permission not in perms:
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: action requires '{permission}' permission for role '{role}'."
            )
        return user

    return dependency


# ---- schemas --------------------------------------------------------------
class HospitalBasicOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    code: str | None = None
    district: str | None = None
    city: str | None = None
    logo_url: str | None = None
    is_active: bool = True

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: str
    password: str
    hospital_id: uuid.UUID | None = None


class LoginResponse(BaseModel):
    role: str
    name: str
    mustChangePassword: bool = False
    access_token: str
    hospital_id: uuid.UUID | None = None
    hospital_name: str | None = None
    membership_status: str = "active"


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    mustChangePassword: bool = False
    phone: str | None = None
    hospital_id: uuid.UUID | None = None
    hospital: HospitalBasicOut | None = None
    membership_status: str = "active"
    permissions: list[str] = []
    available_hospitals: list[HospitalBasicOut] = []


class ResolveEmailRequest(BaseModel):
    email: str


class ResolveEmailResponse(BaseModel):
    domain: str | None = None
    is_registered_domain: bool = False
    hospital: HospitalBasicOut | None = None
    requires_manual_hospital_selection: bool = True
    hospitals_available: list[HospitalBasicOut] = []


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5)
    full_name: str = Field(..., min_length=2)
    password: str
    hospital_id: uuid.UUID | None = None
    phone: str | None = None
    department: str | None = None


class SwitchHospitalRequest(BaseModel):
    hospital_id: uuid.UUID


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    must_change_password: bool
    phone: str | None = None
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3)
    full_name: str = Field(..., min_length=1)
    role: str = "front_desk"
    password: str
    phone: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    phone: str | None = None
    new_password: str | None = None


class StaffMemberOut(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str
    phone: str | None = None
    role: str
    status: str
    created_at: datetime
    approved_at: datetime | None = None
    approved_by: str | None = None

    model_config = {"from_attributes": True}


class StaffApprovalAction(BaseModel):
    role: str = "front_desk"


# ---- endpoints ------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/auth/hospitals", response_model=list[HospitalBasicOut])
def list_active_hospitals(db: Session = Depends(get_db)):
    """Public endpoint to list registered hospitals in Sri Lanka for registration."""
    return db.query(models.Hospital).filter(models.Hospital.is_active.is_(True)).order_by(models.Hospital.name.asc()).all()


@router.post("/auth/resolve-email", response_model=ResolveEmailResponse)
def resolve_email_domain(req: ResolveEmailRequest, db: Session = Depends(get_db)):
    """Check if the provided email domain maps to an existing hospital."""
    email_clean = req.email.strip().lower()
    if "@" not in email_clean:
        return ResolveEmailResponse(
            domain=None,
            is_registered_domain=False,
            hospital=None,
            requires_manual_hospital_selection=True,
            hospitals_available=db.query(models.Hospital).filter(models.Hospital.is_active.is_(True)).order_by(models.Hospital.name.asc()).all(),
        )

    domain = email_clean.split("@")[-1].strip().lower()
    mapping = (
        db.query(models.HospitalEmailDomain)
        .filter(models.HospitalEmailDomain.domain == domain, models.HospitalEmailDomain.is_verified.is_(True))
        .first()
    )

    all_hospitals = db.query(models.Hospital).filter(models.Hospital.is_active.is_(True)).order_by(models.Hospital.name.asc()).all()

    if mapping and mapping.hospital and mapping.hospital.is_active:
        return ResolveEmailResponse(
            domain=domain,
            is_registered_domain=True,
            hospital=HospitalBasicOut.model_validate(mapping.hospital),
            requires_manual_hospital_selection=False,
            hospitals_available=all_hospitals,
        )

    return ResolveEmailResponse(
        domain=domain,
        is_registered_domain=False,
        hospital=None,
        requires_manual_hospital_selection=True,
        hospitals_available=all_hospitals,
    )


@router.post("/auth/register", response_model=LoginResponse, status_code=201)
def auth_register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Sign up a new hospital staff member.
    If the email domain matches a registered hospital, it links automatically.
    Otherwise, the user selects their hospital from the directory.
    The account starts in 'pending' status until hospital admin approval.
    """
    email = req.email.lower().strip()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    problem = security.password_problem(req.password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)

    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    domain = email.split("@")[-1].strip().lower()
    target_hospital: models.Hospital | None = None

    # Check registered email domain
    mapping = (
        db.query(models.HospitalEmailDomain)
        .filter(models.HospitalEmailDomain.domain == domain, models.HospitalEmailDomain.is_verified.is_(True))
        .first()
    )
    if mapping and mapping.hospital and mapping.hospital.is_active:
        target_hospital = mapping.hospital
    elif req.hospital_id:
        target_hospital = db.get(models.Hospital, req.hospital_id)
        if not target_hospital or not target_hospital.is_active:
            raise HTTPException(status_code=404, detail="Selected hospital is not active or found.")
    else:
        raise HTTPException(
            status_code=422,
            detail="Your email domain is not registered. Please select your hospital from the directory.",
        )

    # Create user
    user = models.User(
        email=email,
        full_name=req.full_name.strip(),
        phone=req.phone.strip() if req.phone else None,
        role="front_desk",  # Default base role; assigned officially by hospital admin
        password_hash=security.hash_password(req.password),
        must_change_password=False,
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Create pending membership
    membership = models.HospitalMembership(
        hospital_id=target_hospital.id,
        user_id=user.id,
        role="front_desk",
        status="pending",
        invited_or_requested_role="front_desk",
    )
    db.add(membership)

    # Log audit event
    audit = models.HospitalAuditLog(
        hospital_id=target_hospital.id,
        user_id=user.id,
        action="staff_registered",
        entity_type="hospital_memberships",
        entity_id=str(membership.id),
        details={"email": email, "full_name": req.full_name, "domain": domain},
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    # Issue token with pending membership status
    token = security.create_token(
        user_id=str(user.id),
        email=user.email,
        name=user.full_name,
        role="front_desk",
        hospital_id=str(target_hospital.id),
    )

    return LoginResponse(
        role="front_desk",
        name=user.full_name,
        mustChangePassword=False,
        access_token=token,
        hospital_id=target_hospital.id,
        hospital_name=target_hospital.name,
        membership_status="pending",
    )


@router.post("/auth/login", response_model=LoginResponse)
def auth_login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()

    # Always run a hash verification so unknown emails cost the same time as wrong passwords.
    stored = user.password_hash if user else security.DUMMY_HASH

    if user and user.locked_until and user.locked_until > _now():
        raise HTTPException(
            status_code=423,
            detail="Too many failed attempts. This account is temporarily locked. Contact IT if you need urgent access.",
        )

    if not security.verify_password(req.password, stored) or user is None:
        if user is not None:
            user.failed_attempts += 1
            if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
                user.locked_until = _now() + timedelta(minutes=LOCKOUT_MINUTES)
                user.failed_attempts = 0
                logger.warning("Account locked after repeated failed logins: %s", user.email)
            db.commit()
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account is inactive. Contact your administrator.")

    user.failed_attempts = 0
    user.locked_until = None
    user.last_login_at = _now()
    db.commit()

    # Multi-hospital membership resolution
    active_hospital_id = req.hospital_id
    membership = None
    hospital = None
    effective_role = user.role
    membership_status = "active"

    if user.role == "platform_owner":
        if active_hospital_id:
            hospital = db.get(models.Hospital, active_hospital_id)
        if not hospital:
            hospital = db.query(models.Hospital).filter(models.Hospital.is_active.is_(True)).order_by(models.Hospital.created_at.asc()).first()
        active_hospital_id = hospital.id if hospital else None
    else:
        # Check requested or active membership
        if active_hospital_id:
            membership = (
                db.query(models.HospitalMembership)
                .filter(
                    models.HospitalMembership.user_id == user.id,
                    models.HospitalMembership.hospital_id == active_hospital_id,
                    models.HospitalMembership.status == "active",
                )
                .first()
            )

        if not membership:
            membership = (
                db.query(models.HospitalMembership)
                .filter(
                    models.HospitalMembership.user_id == user.id,
                    models.HospitalMembership.status == "active",
                )
                .first()
            )

        if membership:
            hospital = db.get(models.Hospital, membership.hospital_id)
            active_hospital_id = membership.hospital_id
            effective_role = membership.role
            membership_status = "active"
        else:
            # Check for pending membership
            pending = (
                db.query(models.HospitalMembership)
                .filter(
                    models.HospitalMembership.user_id == user.id,
                    models.HospitalMembership.status == "pending",
                )
                .first()
            )
            if pending:
                hospital = db.get(models.Hospital, pending.hospital_id)
                active_hospital_id = pending.hospital_id
                effective_role = pending.role
                membership_status = "pending"
            else:
                membership_status = "none"

    return LoginResponse(
        role=effective_role,
        name=user.full_name,
        mustChangePassword=user.must_change_password,
        access_token=security.create_token(
            user_id=str(user.id),
            email=user.email,
            name=user.full_name,
            role=effective_role,
            hospital_id=str(active_hospital_id) if active_hospital_id else None,
        ),
        hospital_id=active_hospital_id,
        hospital_name=hospital.name if hospital else None,
        membership_status=membership_status,
    )


@router.get("/auth/me", response_model=MeResponse)
def auth_me(request: Request, user: models.User = Depends(require_user), db: Session = Depends(get_db)):
    active_hospital = getattr(request.state, "hospital", None)
    active_hospital_id = getattr(request.state, "hospital_id", None)
    active_role = getattr(request.state, "role", user.role)
    active_membership = getattr(request.state, "membership", None)

    # Available hospitals for switching
    available_hospitals: list[models.Hospital] = []
    if user.role == "platform_owner":
        available_hospitals = db.query(models.Hospital).filter(models.Hospital.is_active.is_(True)).order_by(models.Hospital.name.asc()).all()
    else:
        memberships = (
            db.query(models.HospitalMembership)
            .filter(models.HospitalMembership.user_id == user.id, models.HospitalMembership.status == "active")
            .all()
        )
        hids = [m.hospital_id for m in memberships]
        if hids:
            available_hospitals = db.query(models.Hospital).filter(models.Hospital.id.in_(hids), models.Hospital.is_active.is_(True)).all()

    mem_status = "active"
    if active_membership:
        mem_status = active_membership.status
    elif user.role == "platform_owner":
        mem_status = "active"
    else:
        mem_status = "none"

    permissions = list(security.get_role_permissions(active_role))

    return MeResponse(
        id=user.id,
        email=user.email,
        name=user.full_name,
        role=active_role,
        mustChangePassword=user.must_change_password,
        phone=user.phone,
        hospital_id=active_hospital_id,
        hospital=HospitalBasicOut.model_validate(active_hospital) if active_hospital else None,
        membership_status=mem_status,
        permissions=permissions,
        available_hospitals=[HospitalBasicOut.model_validate(h) for h in available_hospitals],
    )


@router.post("/auth/switch-hospital", response_model=LoginResponse)
def switch_hospital(
    req: SwitchHospitalRequest,
    request: Request,
    user: models.User = Depends(require_user),
    db: Session = Depends(get_db),
):
    target_hospital = db.get(models.Hospital, req.hospital_id)
    if not target_hospital or not target_hospital.is_active:
        raise HTTPException(status_code=404, detail="Hospital not found or inactive.")

    effective_role = user.role
    if user.role != "platform_owner":
        membership = (
            db.query(models.HospitalMembership)
            .filter(
                models.HospitalMembership.user_id == user.id,
                models.HospitalMembership.hospital_id == req.hospital_id,
                models.HospitalMembership.status == "active",
            )
            .first()
        )
        if not membership:
            raise HTTPException(status_code=403, detail="You do not have an active membership in this hospital.")
        effective_role = membership.role

    token = security.create_token(
        user_id=str(user.id),
        email=user.email,
        name=user.full_name,
        role=effective_role,
        hospital_id=str(target_hospital.id),
    )

    return LoginResponse(
        role=effective_role,
        name=user.full_name,
        mustChangePassword=user.must_change_password,
        access_token=token,
        hospital_id=target_hospital.id,
        hospital_name=target_hospital.name,
        membership_status="active",
    )


@router.post("/auth/change-password", status_code=204)
def change_password(
    req: ChangePasswordRequest,
    user: models.User = Depends(require_role("front_desk")),
    db: Session = Depends(get_db),
):
    if not security.verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    problem = security.password_problem(req.new_password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    if req.new_password == req.current_password:
        raise HTTPException(status_code=422, detail="Choose a password different from the current one.")
    user.password_hash = security.hash_password(req.new_password)
    user.must_change_password = False
    db.commit()


# ---- Staff Management & Approval Queue --------------------------------------
@router.get("/admin/staff/pending", response_model=list[StaffMemberOut])
def list_pending_staff(
    request: Request,
    _: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """List staff registrations awaiting administrator approval for the active hospital."""
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        raise HTTPException(status_code=400, detail="No active hospital context.")

    memberships = (
        db.query(models.HospitalMembership)
        .filter(
            models.HospitalMembership.hospital_id == hospital_id,
            models.HospitalMembership.status == "pending",
        )
        .order_by(models.HospitalMembership.joined_at.asc())
        .all()
    )

    results = []
    for m in memberships:
        user = db.get(models.User, m.user_id)
        if not user:
            continue
        results.append(
            StaffMemberOut(
                membership_id=m.id,
                user_id=user.id,
                email=user.email,
                full_name=user.full_name,
                phone=user.phone,
                role=m.role,
                status=m.status,
                created_at=m.joined_at,
                approved_at=m.approved_at,
                approved_by=None,
            )
        )
    return results


@router.post("/admin/staff/{membership_id}/approve", response_model=StaffMemberOut)
def approve_staff_registration(
    membership_id: uuid.UUID,
    req: StaffApprovalAction,
    request: Request,
    admin: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Approve a pending staff registration and assign their hospital role."""
    hospital_id = getattr(request.state, "hospital_id", None)
    membership = db.get(models.HospitalMembership, membership_id)
    if not membership or (hospital_id and membership.hospital_id != hospital_id and admin.role != "platform_owner"):
        raise HTTPException(status_code=404, detail="Pending registration not found.")

    if req.role not in security.ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(security.ROLES)}")

    membership.status = "active"
    membership.role = req.role
    membership.approved_at = _now()
    membership.approved_by_user_id = admin.id

    user = db.get(models.User, membership.user_id)
    if user:
        user.role = req.role

    # Audit log
    db.add(
        models.HospitalAuditLog(
            hospital_id=membership.hospital_id,
            user_id=admin.id,
            action="staff_approved",
            entity_type="hospital_memberships",
            entity_id=str(membership.id),
            details={"approved_user_id": str(user.id) if user else None, "role": req.role},
        )
    )
    db.commit()

    return StaffMemberOut(
        membership_id=membership.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=membership.role,
        status=membership.status,
        created_at=membership.joined_at,
        approved_at=membership.approved_at,
        approved_by=admin.full_name,
    )


@router.post("/admin/staff/{membership_id}/reject", response_model=StaffMemberOut)
def reject_staff_registration(
    membership_id: uuid.UUID,
    request: Request,
    admin: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Reject a pending staff registration."""
    hospital_id = getattr(request.state, "hospital_id", None)
    membership = db.get(models.HospitalMembership, membership_id)
    if not membership or (hospital_id and membership.hospital_id != hospital_id and admin.role != "platform_owner"):
        raise HTTPException(status_code=404, detail="Pending registration not found.")

    membership.status = "rejected"

    user = db.get(models.User, membership.user_id)

    db.add(
        models.HospitalAuditLog(
            hospital_id=membership.hospital_id,
            user_id=admin.id,
            action="staff_rejected",
            entity_type="hospital_memberships",
            entity_id=str(membership.id),
            details={"rejected_user_id": str(user.id) if user else None},
        )
    )
    db.commit()

    return StaffMemberOut(
        membership_id=membership.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=membership.role,
        status=membership.status,
        created_at=membership.joined_at,
        approved_at=None,
        approved_by=admin.full_name,
    )


@router.get("/admin/staff", response_model=list[StaffMemberOut])
def list_hospital_staff(
    request: Request,
    _: models.User = Depends(require_role("manager")),
    db: Session = Depends(get_db),
):
    """List all staff members for the current hospital."""
    hospital_id = getattr(request.state, "hospital_id", None)
    if not hospital_id:
        raise HTTPException(status_code=400, detail="No active hospital context.")

    memberships = (
        db.query(models.HospitalMembership)
        .filter(models.HospitalMembership.hospital_id == hospital_id)
        .order_by(models.HospitalMembership.joined_at.desc())
        .all()
    )

    results = []
    for m in memberships:
        user = db.get(models.User, m.user_id)
        if not user:
            continue
        approver = db.get(models.User, m.approved_by_user_id) if m.approved_by_user_id else None
        results.append(
            StaffMemberOut(
                membership_id=m.id,
                user_id=user.id,
                email=user.email,
                full_name=user.full_name,
                phone=user.phone,
                role=m.role,
                status=m.status,
                created_at=m.joined_at,
                approved_at=m.approved_at,
                approved_by=approver.full_name if approver else None,
            )
        )
    return results


# ---- Global user management (admin only) -----------------------------------
@router.get("/admin/users", response_model=list[UserOut])
def list_users(_: models.User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.email).all()


@router.post("/admin/users", response_model=UserOut, status_code=201)
def create_user(
    req: UserCreate,
    request: Request,
    admin: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    email = req.email.lower().strip()
    if req.role not in security.ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(security.ROLES)}.")
    problem = security.password_problem(req.password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=409, detail="A user with that email already exists.")
    user = models.User(
        email=email,
        full_name=req.full_name.strip(),
        phone=req.phone.strip() if req.phone else None,
        role=req.role,
        password_hash=security.hash_password(req.password),
        must_change_password=True,
    )
    db.add(user)
    db.flush()

    hospital_id = getattr(request.state, "hospital_id", None)
    if hospital_id:
        membership = models.HospitalMembership(
            hospital_id=hospital_id,
            user_id=user.id,
            role=req.role,
            status="active",
            approved_at=_now(),
            approved_by_user_id=admin.id,
        )
        db.add(membership)

    db.commit()
    db.refresh(user)
    return user


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    req: UserUpdate,
    admin: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == admin.id and (req.is_active is False or (req.role and req.role != "admin" and req.role != "platform_owner")):
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account.")
    if req.role is not None:
        if req.role not in security.ROLES:
            raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(security.ROLES)}.")
        user.role = req.role
    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.phone is not None:
        user.phone = req.phone.strip()
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.new_password is not None:
        problem = security.password_problem(req.new_password)
        if problem:
            raise HTTPException(status_code=422, detail=problem)
        user.password_hash = security.hash_password(req.new_password)
        user.must_change_password = True
        user.failed_attempts = 0
        user.locked_until = None
    db.commit()
    db.refresh(user)
    return user


# ---- bootstrap ------------------------------------------------------------
def bootstrap_admin() -> None:
    """Create the first admin from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD when no users exist."""
    email = (os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "").lower().strip()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or ""
    if not email or not password:
        return
    problem = security.password_problem(password)
    if problem:
        logger.error("BOOTSTRAP_ADMIN_PASSWORD rejected: %s", problem)
        return
    db = SessionLocal()
    try:
        if db.query(models.User).count() > 0:
            return
        user = models.User(
            email=email,
            full_name=os.getenv("BOOTSTRAP_ADMIN_NAME", "Administrator"),
            role="platform_owner",
            password_hash=security.hash_password(password),
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        logger.warning("Created bootstrap platform owner %s (password change required at first login).", email)
    except Exception:
        db.rollback()
        logger.exception("Could not create the bootstrap admin (has `alembic upgrade head` been run?)")
    finally:
        db.close()

"""Authentication and authorisation: login, sessions, roles and staff accounts.

Every route requires a valid signed bearer token (``Authorization: Bearer <token>``)
except the public ones in ``PUBLIC_PATHS``. The token is verified, then the user row is
re-read so a deactivated account or a role change takes effect on the next request.
Roles are ordered front_desk < manager < admin; ``require_role("manager")`` lets managers
and admins through.
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

PUBLIC_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/auth/login"}
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
    """Global dependency: authenticate every non-public request."""
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

    request.state.user = user
    return user


def require_role(minimum: str):
    """Dependency factory: allow users whose role ranks at least ``minimum``."""
    needed = security.ROLE_RANK[minimum]

    def dependency(user: models.User | None = Depends(require_user)) -> models.User:
        if user is None or security.ROLE_RANK.get(user.role, 0) < needed:
            raise HTTPException(status_code=403, detail=f"This action requires the {minimum} role or higher.")
        return user

    return dependency


# ---- schemas --------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    role: str
    name: str
    mustChangePassword: bool = False
    access_token: str


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    mustChangePassword: bool = False


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
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3)
    full_name: str = Field(..., min_length=1)
    role: str = "front_desk"
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    new_password: str | None = None  # admin reset; forces a change at next login


# ---- endpoints ------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


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

    return LoginResponse(
        role=user.role,
        name=user.full_name,
        mustChangePassword=user.must_change_password,
        access_token=security.create_token(
            user_id=str(user.id), email=user.email, name=user.full_name, role=user.role
        ),
    )


@router.get("/auth/me", response_model=MeResponse)
def auth_me(user: models.User = Depends(require_role("front_desk"))):
    return MeResponse(
        id=user.id, email=user.email, name=user.full_name, role=user.role,
        mustChangePassword=user.must_change_password,
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


# ---- staff management (admin only) ----------------------------------------
@router.get("/admin/users", response_model=list[UserOut])
def list_users(_: models.User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.email).all()


@router.post("/admin/users", response_model=UserOut, status_code=201)
def create_user(req: UserCreate, _: models.User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    if req.role not in security.ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(security.ROLES)}.")
    problem = security.password_problem(req.password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=409, detail="A user with that email already exists.")
    user = models.User(
        email=email, full_name=req.full_name.strip(), role=req.role,
        password_hash=security.hash_password(req.password), must_change_password=True,
    )
    db.add(user)
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
    if user.id == admin.id and (req.is_active is False or (req.role and req.role != "admin")):
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account.")
    if req.role is not None:
        if req.role not in security.ROLES:
            raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(security.ROLES)}.")
        user.role = req.role
    if req.full_name is not None:
        user.full_name = req.full_name.strip()
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
        db.add(models.User(
            email=email,
            full_name=os.getenv("BOOTSTRAP_ADMIN_NAME", "Administrator"),
            role="admin",
            password_hash=security.hash_password(password),
            must_change_password=True,
        ))
        db.commit()
        logger.warning("Created bootstrap admin %s (password change required at first login).", email)
    except Exception:
        db.rollback()
        logger.exception("Could not create the bootstrap admin (has `alembic upgrade head` been run?)")
    finally:
        db.close()

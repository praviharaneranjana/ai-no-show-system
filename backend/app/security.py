"""Password hashing and signed session tokens (stdlib only).

- Passwords: scrypt with a per-password random salt, stored as
  ``scrypt$<n>$<r>$<p>$<salt_b64>$<hash_b64>``. Comparison is constant-time.
- Tokens: ``<payload_b64>.<signature_b64>`` where the payload is JSON
  ``{sub, email, name, role, iat, exp}`` and the signature is HMAC-SHA256 over the payload
  with ``SECRET_KEY``. A token only proves who the user was when it was issued; the API
  re-reads the user row on every request, so deactivating an account takes effect at once.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time

logger = logging.getLogger("noshow_api")

# ---- roles and permissions ------------------------------------------------
ROLE_RANK = {
    "front_desk": 1,
    "analyst": 2,
    "manager": 3,
    "admin": 4,
    "platform_owner": 5,
}
ROLES = ("front_desk", "analyst", "manager", "admin", "platform_owner")

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "front_desk": {
        "patients.read",
        "patients.write",
        "appointments.read",
        "appointments.write",
        "sessions.read",
        "waitlist.read",
        "waitlist.write",
        "outreach.read",
        "outreach.send",
        "hospital.profile.read",
    },
    "analyst": {
        "patients.read",
        "appointments.read",
        "predictions.read",
        "predictions.batch",
        "analytics.read",
        "capacity.read",
        "capacity.simulate",
        "model.read",
        "hospital.profile.read",
    },
    "manager": {
        "patients.read",
        "patients.write",
        "appointments.read",
        "appointments.write",
        "sessions.read",
        "waitlist.read",
        "waitlist.write",
        "outreach.read",
        "outreach.send",
        "predictions.read",
        "predictions.batch",
        "analytics.read",
        "capacity.read",
        "capacity.simulate",
        "capacity.settings.write",
        "model.read",
        "simulator.read",
        "simulator.write",
        "expenses.read",
        "expenses.write",
        "hospital.finance.read",
        "hospital.profile.read",
        "staff.read",
    },
    "admin": {
        "patients.read",
        "patients.write",
        "appointments.read",
        "appointments.write",
        "sessions.read",
        "waitlist.read",
        "waitlist.write",
        "outreach.read",
        "outreach.send",
        "predictions.read",
        "predictions.batch",
        "analytics.read",
        "capacity.read",
        "capacity.simulate",
        "capacity.settings.write",
        "model.read",
        "simulator.read",
        "simulator.write",
        "expenses.read",
        "expenses.write",
        "hospital.finance.read",
        "hospital.profile.read",
        "hospital.profile.write",
        "hospital.domains.manage",
        "staff.read",
        "staff.manage",
        "audit.read",
        "his.sync",
    },
    "platform_owner": {
        "platform.all",
        "platform.hospitals.manage",
        "patients.read",
        "patients.write",
        "appointments.read",
        "appointments.write",
        "sessions.read",
        "waitlist.read",
        "waitlist.write",
        "outreach.read",
        "outreach.send",
        "predictions.read",
        "predictions.batch",
        "analytics.read",
        "capacity.read",
        "capacity.simulate",
        "capacity.settings.write",
        "model.read",
        "simulator.read",
        "simulator.write",
        "expenses.read",
        "expenses.write",
        "hospital.finance.read",
        "hospital.profile.read",
        "hospital.profile.write",
        "hospital.domains.manage",
        "staff.read",
        "staff.manage",
        "audit.read",
        "his.sync",
    },
}


def get_role_permissions(role: str) -> list[str]:
    return sorted(list(ROLE_PERMISSIONS.get(role, set())))

MIN_PASSWORD_LENGTH = 10
TOKEN_TTL_SECONDS = int(float(os.getenv("TOKEN_TTL_HOURS", "8")) * 3600)

# ---- secret key -----------------------------------------------------------
_secret = os.getenv("SECRET_KEY")
if not _secret:
    _secret = secrets.token_urlsafe(48)
    logger.warning(
        "SECRET_KEY is not set: using a random key for this process. Sessions will be invalidated "
        "on every restart and will not work across multiple workers. Set SECRET_KEY before deploying."
    )
elif len(_secret) < 32:
    logger.warning("SECRET_KEY is shorter than 32 characters; use a long random value.")
SECRET_KEY = _secret.encode()

# ---- passwords ------------------------------------------------------------
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = _unb64(hash_b64)
        actual = hashlib.scrypt(
            password.encode(), salt=_unb64(salt_b64), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


# Verified against when the email is unknown, so "no such user" and "wrong password"
# take the same time and don't reveal which accounts exist.
DUMMY_HASH = hash_password("not-a-real-password")


def password_problem(password: str) -> str | None:
    """Return a human-readable reason the password is unacceptable, or None."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if password.lower() in {"password123", "password1234", "1234567890", "qwertyuiop"}:
        return "That password is too common."
    return None


# ---- tokens ---------------------------------------------------------------
def _sign(payload_b64: str) -> str:
    return _b64(hmac.new(SECRET_KEY, payload_b64.encode(), hashlib.sha256).digest())


def create_token(
    *,
    user_id: str,
    email: str,
    name: str,
    role: str,
    hospital_id: str | None = None,
    ttl_seconds: int | None = None,
) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "role": role,
        "hospital_id": hospital_id,
        "iat": now,
        "exp": now + (TOKEN_TTL_SECONDS if ttl_seconds is None else ttl_seconds),
    }
    payload_b64 = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{payload_b64}.{_sign(payload_b64)}"


def verify_token(token: str) -> dict | None:
    """Return the payload if the signature is valid and the token has not expired."""
    try:
        payload_b64, signature = token.split(".")
        if not hmac.compare_digest(signature, _sign(payload_b64)):
            return None
        payload = json.loads(_unb64(payload_b64))
        if int(payload["exp"]) < time.time():
            return None
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None

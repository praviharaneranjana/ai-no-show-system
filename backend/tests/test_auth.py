import time
from datetime import datetime, timedelta, timezone

import pytest

from app import security
from tests.conftest import TEST_PASSWORD, make_user, token_for


def login(client, email, password=TEST_PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


# ---- password hashing and tokens -------------------------------------------------
def test_password_hash_roundtrip_and_salting():
    a, b = security.hash_password("correct horse battery"), security.hash_password("correct horse battery")
    assert a != b and a.startswith("scrypt$")
    assert security.verify_password("correct horse battery", a)
    assert not security.verify_password("wrong", a)
    assert not security.verify_password("x", "not-a-hash")


def test_token_roundtrip_tamper_and_expiry():
    token = security.create_token(user_id="u1", email="a@b.c", name="A", role="manager")
    assert security.verify_token(token)["role"] == "manager"

    payload_b64, sig = token.split(".")
    forged = security.create_token(user_id="u1", email="a@b.c", name="A", role="admin").split(".")[0]
    assert security.verify_token(f"{forged}.{sig}") is None  # signature belongs to a different payload
    assert security.verify_token(token + "x") is None
    assert security.verify_token("garbage") is None

    expired = security.create_token(user_id="u1", email="a@b.c", name="A", role="admin", ttl_seconds=-1)
    assert security.verify_token(expired) is None


# ---- login -----------------------------------------------------------------------
def test_old_demo_credentials_no_longer_work(raw_client):
    assert login(raw_client, "nurse.perera@hospital.org", "ClinicPassword123!").status_code == 401
    assert login(raw_client, "anyone@hospital.org", "whatever123").status_code == 401


def test_login_success_returns_signed_token_and_role(raw_client, db_session):
    user = make_user(db_session, "manager")
    resp = login(raw_client, user.email)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["role"] == "manager" and body["mustChangePassword"] is False
    assert security.verify_token(body["access_token"])["email"] == user.email


def test_login_is_case_insensitive_on_email(raw_client, db_session):
    user = make_user(db_session, "front_desk")
    assert login(raw_client, user.email.upper()).status_code == 200


def test_wrong_password_and_unknown_user_are_indistinguishable(raw_client, db_session):
    user = make_user(db_session, "front_desk")
    wrong = login(raw_client, user.email, "nope-nope-nope")
    unknown = login(raw_client, "nobody@test.local", "nope-nope-nope")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_lockout_after_repeated_failures_and_recovery(raw_client, db_session):
    user = make_user(db_session, "front_desk")
    for _ in range(5):
        assert login(raw_client, user.email, "bad-password-1").status_code == 401
    assert login(raw_client, user.email).status_code == 423  # even the right password is refused

    user.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)  # lock expires
    db_session.flush()
    assert login(raw_client, user.email).status_code == 200


def test_inactive_account_is_refused_only_with_the_right_password(raw_client, db_session):
    user = make_user(db_session, "front_desk", is_active=False)
    assert login(raw_client, user.email).status_code == 403
    assert login(raw_client, user.email, "bad-password-1").status_code == 401


# ---- who can call what -----------------------------------------------------------
def test_routes_require_a_session_token(raw_client):
    assert raw_client.get("/patients").status_code == 401
    raw_client.headers["Authorization"] = "Bearer not-a-token"
    assert raw_client.get("/patients").status_code == 401
    assert raw_client.get("/health").status_code == 200  # public


def test_deactivated_user_loses_access_immediately(raw_client, db_session):
    user = make_user(db_session, "front_desk")
    raw_client.headers["Authorization"] = f"Bearer {token_for(user)}"
    assert raw_client.get("/patients").status_code == 200
    user.is_active = False
    db_session.flush()
    assert raw_client.get("/patients").status_code == 401


def test_expired_token_is_rejected(raw_client, db_session):
    user = make_user(db_session, "admin")
    token = security.create_token(user_id=str(user.id), email=user.email, name="x", role="admin", ttl_seconds=-5)
    raw_client.headers["Authorization"] = f"Bearer {token}"
    assert raw_client.get("/patients").status_code == 401


def test_role_is_read_from_the_database_not_the_token(raw_client, db_session):
    user = make_user(db_session, "front_desk")
    # A token that *claims* admin for a front_desk user must not grant admin rights.
    token = security.create_token(user_id=str(user.id), email=user.email, name="x", role="admin")
    raw_client.headers["Authorization"] = f"Bearer {token}"
    assert raw_client.get("/admin/users").status_code == 403


@pytest.mark.parametrize("role,expected", [("front_desk", 403), ("manager", 200), ("admin", 200)])
def test_manager_only_routes(raw_client, db_session, role, expected):
    raw_client.headers["Authorization"] = f"Bearer {token_for(make_user(db_session, role))}"
    assert raw_client.post("/simulator/evaluate", json={}).status_code != 401
    resp = raw_client.post("/capacity/optimize", json={})
    assert (resp.status_code == 403) == (expected == 403)


@pytest.mark.parametrize("role,expected", [("front_desk", 403), ("manager", 403), ("admin", 200)])
def test_user_management_is_admin_only(raw_client, db_session, role, expected):
    raw_client.headers["Authorization"] = f"Bearer {token_for(make_user(db_session, role))}"
    assert raw_client.get("/admin/users").status_code == expected


# ---- password change and admin management ----------------------------------------
def test_must_change_password_blocks_other_routes_until_changed(raw_client, db_session):
    user = make_user(db_session, "front_desk", must_change_password=True)
    raw_client.headers["Authorization"] = f"Bearer {token_for(user)}"
    assert raw_client.get("/patients").status_code == 403
    assert raw_client.get("/auth/me").json()["mustChangePassword"] is True

    bad = raw_client.post("/auth/change-password", json={"current_password": TEST_PASSWORD, "new_password": "short"})
    assert bad.status_code == 422
    same = raw_client.post("/auth/change-password", json={"current_password": TEST_PASSWORD, "new_password": TEST_PASSWORD})
    assert same.status_code == 422
    ok = raw_client.post("/auth/change-password", json={"current_password": TEST_PASSWORD, "new_password": "A-new-strong-pass-9"})
    assert ok.status_code == 204

    assert raw_client.get("/patients").status_code == 200
    assert login(raw_client, user.email, "A-new-strong-pass-9").status_code == 200
    assert login(raw_client, user.email, TEST_PASSWORD).status_code == 401


def test_change_password_requires_the_current_password(client):
    resp = client.post("/auth/change-password", json={"current_password": "wrong-current-1", "new_password": "A-new-strong-pass-9"})
    assert resp.status_code == 400


def test_admin_can_create_update_and_deactivate_users(client, raw_client, db_session):
    created = client.post("/admin/users", json={
        "email": "New.Nurse@Test.Local", "full_name": "New Nurse", "role": "front_desk", "password": "Initial-Pass-123",
    })
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["email"] == "new.nurse@test.local" and body["must_change_password"] is True

    assert client.post("/admin/users", json={
        "email": "new.nurse@test.local", "full_name": "Dup", "role": "front_desk", "password": "Initial-Pass-123",
    }).status_code == 409
    assert client.post("/admin/users", json={
        "email": "x@test.local", "full_name": "X", "role": "superuser", "password": "Initial-Pass-123",
    }).status_code == 422
    assert client.post("/admin/users", json={
        "email": "y@test.local", "full_name": "Y", "role": "manager", "password": "short",
    }).status_code == 422

    patched = client.patch(f"/admin/users/{body['id']}", json={"role": "manager", "is_active": False})
    assert patched.status_code == 200 and patched.json()["role"] == "manager" and patched.json()["is_active"] is False
    assert login(raw_client, "new.nurse@test.local", "Initial-Pass-123").status_code == 403


def test_admin_cannot_lock_themselves_out(client, db_session):
    me = client.get("/auth/me").json()
    assert client.patch(f"/admin/users/{me['id']}", json={"is_active": False}).status_code == 400
    assert client.patch(f"/admin/users/{me['id']}", json={"role": "front_desk"}).status_code == 400

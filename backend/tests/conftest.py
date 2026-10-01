import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("API_KEY", "test-api-key")

from app import models, security
from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql+psycopg://localhost/noshow_test_db"
)

engine = create_engine(TEST_DATABASE_URL)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def create_test_schema():
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto;"))
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))
            conn.execute(text("CREATE SEQUENCE IF NOT EXISTS patient_uhid_seq START 1;"))
            conn.commit()
        Base.metadata.create_all(bind=engine)
    except Exception:
        yield
        return
    yield
    try:
        Base.metadata.drop_all(bind=engine)
    except Exception:
        pass


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


TEST_PASSWORD = "Test-Password-123"


def make_user(db_session, role="admin", email=None, password=TEST_PASSWORD, **overrides):
    user = models.User(
        email=email or f"{role}-{os.urandom(3).hex()}@test.local",
        full_name=f"Test {role.title()}",
        role=role,
        password_hash=security.hash_password(password),
        **overrides,
    )
    db_session.add(user)
    db_session.flush()
    return user


def token_for(user) -> str:
    return security.create_token(user_id=str(user.id), email=user.email, name=user.full_name, role=user.role)


@pytest.fixture
def raw_client(db_session):
    """Client with the service API key but NO user session (for auth tests)."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        test_client.headers.update({"X-API-Key": os.environ["API_KEY"]})
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def client(raw_client, db_session):
    """Default client: signed in as an admin, so feature tests can reach every route."""
    raw_client.headers["Authorization"] = f"Bearer {token_for(make_user(db_session, 'admin'))}"
    return raw_client

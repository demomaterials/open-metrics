import os

import psycopg
import pytest

PORT = os.environ.get("TEST_PG_PORT", "55432")
ADMIN_DSN = f"host=localhost port={PORT} user=postgres password=postgres dbname=postgres"
TEST_DB = "om_test"

os.environ.update(
    DATABASE_URL=f"postgresql+psycopg://postgres:postgres@localhost:{PORT}/{TEST_DB}",
    SECRET_ENCRYPTION_KEY="test-encryption-key",
    COOKIE_SECURE="false",
    ADMIN_PASSWORD="admin-password-1",
    SAMPLE_SOURCE_HOST="localhost",
    SAMPLE_SOURCE_PORT=PORT,
    SAMPLE_SOURCE_PASSWORD="reader-pass",
)

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()


@pytest.fixture(scope="session")
def database():
    with psycopg.connect(ADMIN_DSN, autocommit=True) as c:
        c.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        c.execute(f"CREATE DATABASE {TEST_DB}")
    from app.cli import bootstrap, migrate
    from app.db import reset_engine

    reset_engine()
    migrate()
    bootstrap()  # admin + demo content (incl. sample warehouse source)
    yield
    reset_engine()


@pytest.fixture()
def client(database):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, headers={"X-Requested-With": "open-metrics"}) as c:
        yield c


@pytest.fixture()
def admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin-password-1"})
    assert r.status_code == 200, r.text
    return client

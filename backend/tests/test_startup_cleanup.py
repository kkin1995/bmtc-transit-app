"""Tests for startup idempotency-key cleanup (BUGFIX-07).

Verifies that `cleanup_expired_keys()` is invoked during the FastAPI `lifespan`
startup handler, so expired idempotency rows never survive a fresh server start.
"""

import time

import pytest
from fastapi.testclient import TestClient

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


def test_expired_idempotency_key_purged_on_startup(temp_db, test_settings):
    """A pre-seeded expired row is deleted once the app starts (lifespan runs).

    Seeds an idempotency_keys row with submitted_at well beyond the 24h TTL
    directly into the isolated temp DB, then boots the app via TestClient
    (which triggers the lifespan startup handler), and asserts the row is gone.
    """
    from app.config import get_settings
    from app.db import get_connection

    db_path, _ = temp_db
    settings = get_settings()

    # Pre-seed an expired row (25 hours ago, past the 24h TTL) directly into
    # the isolated temp DB — bypassing the API so no lifespan has run yet.
    expired_timestamp = int(time.time()) - (25 * 3600)
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
            ("startup-cleanup-expired-key", expired_timestamp, "hash-expired"),
        )
        conn.commit()

    # Sanity check: row exists before startup.
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM idempotency_keys WHERE key = ?",
            ("startup-cleanup-expired-key",),
        )
        assert cursor.fetchone()[0] == 1

    # Also seed a recent (non-expired) row to prove cleanup is selective, not a
    # blanket wipe.
    now = int(time.time())
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
            ("startup-cleanup-recent-key", now, "hash-recent"),
        )
        conn.commit()

    # Instantiating the client via `with` triggers the lifespan startup
    # handler, which must call cleanup_expired_keys() after init_db().
    from app.main import app

    get_settings.cache_clear()
    with TestClient(app) as _client:
        pass
    get_settings.cache_clear()

    # Expired row must be gone after startup.
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM idempotency_keys WHERE key = ?",
            ("startup-cleanup-expired-key",),
        )
        assert cursor.fetchone()[0] == 0

    # Recent row must survive.
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM idempotency_keys WHERE key = ?",
            ("startup-cleanup-recent-key",),
        )
        assert cursor.fetchone()[0] == 1

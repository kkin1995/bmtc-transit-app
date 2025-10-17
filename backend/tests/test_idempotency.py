"""Unit tests for idempotency handling."""

import os
import tempfile
import time
import pytest

# Set test env vars before imports
TEST_DB = tempfile.mktemp(suffix=".db")
os.environ["BMTC_API_KEY"] = "test-key"
os.environ["BMTC_DB_PATH"] = TEST_DB
os.environ["BMTC_IDEMPOTENCY_TTL_HOURS"] = "1"

from app.db import init_db  # noqa: E402
from app.idempotency import (  # noqa: E402
    compute_response_hash,
    check_idempotency_key,
    store_idempotency_key,
    cleanup_expired_keys,
)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    """Initialize test database once."""
    # Remove old test DB if it exists to ensure fresh schema
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)


def test_compute_response_hash():
    """Test response hash computation is deterministic."""
    response1 = {"accepted": True, "rejected_count": 0}
    response2 = {"rejected_count": 0, "accepted": True}  # Different order

    hash1 = compute_response_hash(response1)
    hash2 = compute_response_hash(response2)

    # Should produce same hash regardless of dict key order
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA256 hex digest


def test_idempotency_key_not_found():
    """Test checking non-existent key returns None."""
    result = check_idempotency_key("non-existent-key-123")
    assert result is None


def test_idempotency_key_store_and_retrieve():
    """Test storing and retrieving idempotency key."""
    key = "test-key-456"
    response_data = {"accepted": True, "rejected_count": 2}

    # Store key
    store_idempotency_key(key, response_data)

    # Retrieve key
    cached = check_idempotency_key(key)
    assert cached is not None
    assert cached["_cached"] is True
    assert "response_hash" in cached

    # Verify hash matches
    expected_hash = compute_response_hash(response_data)
    assert cached["response_hash"] == expected_hash


def test_idempotency_key_ttl():
    """Test TTL expiration of idempotency keys."""
    key = "test-key-ttl-789"
    response_data = {"accepted": True, "rejected_count": 0}

    # Manually insert with old timestamp (2 hours ago)
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    old_timestamp = int(time.time()) - (2 * 3600)  # 2 hours ago
    response_hash = compute_response_hash(response_data)

    cursor.execute(
        "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
        (key, old_timestamp, response_hash),
    )
    conn.commit()
    conn.close()

    # Should not find expired key (TTL is 1 hour)
    cached = check_idempotency_key(key)
    assert cached is None


def test_cleanup_expired_keys():
    """Test cleanup of expired idempotency keys."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()

    # Clean all existing keys first
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM idempotency_keys")
    conn.commit()
    conn.close()

    # Insert 3 keys: 1 recent, 2 expired
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    now = int(time.time())
    old_timestamp = now - (2 * 3600)  # 2 hours ago

    cursor.execute(
        "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
        ("recent-key-cleanup", now, "hash1"),
    )
    cursor.execute(
        "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
        ("expired-key-cleanup-1", old_timestamp, "hash2"),
    )
    cursor.execute(
        "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
        ("expired-key-cleanup-2", old_timestamp, "hash3"),
    )
    conn.commit()
    conn.close()

    # Run cleanup
    deleted_count = cleanup_expired_keys()

    # Should have deleted 2 expired keys
    assert deleted_count == 2

    # Recent key should still exist
    cached = check_idempotency_key("recent-key-cleanup")
    assert cached is not None


def test_idempotency_key_replace():
    """Test replacing existing idempotency key updates timestamp."""
    key = "replace-key-123"
    response1 = {"accepted": True, "rejected_count": 1}
    response2 = {"accepted": True, "rejected_count": 2}

    # Store first time
    store_idempotency_key(key, response1)
    cached1 = check_idempotency_key(key)
    hash1 = cached1["response_hash"]

    # Store again with different response (simulates retry with different result)
    time.sleep(0.1)
    store_idempotency_key(key, response2)
    cached2 = check_idempotency_key(key)
    hash2 = cached2["response_hash"]

    # Hash should be different
    assert hash1 != hash2

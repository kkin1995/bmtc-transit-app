"""Unit tests for idempotency handling.

Tests the idempotency key system that prevents duplicate ride submissions.
Uses isolated fixtures from conftest.py.
"""

import time
import pytest

# Mark all tests in this module as unit tests
pytestmark = pytest.mark.unit


@pytest.fixture
def idempotency_db(temp_db):
    """Provide database for idempotency tests."""
    from app.db import init_db
    db_path, conn = temp_db
    yield db_path, conn


def test_compute_response_hash():
    """Test response hash computation is deterministic."""
    from app.idempotency import compute_response_hash

    response1 = {"accepted": True, "rejected_count": 0}
    response2 = {"rejected_count": 0, "accepted": True}  # Different order

    hash1 = compute_response_hash(response1)
    hash2 = compute_response_hash(response2)

    # Should produce same hash regardless of dict key order
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA256 hex digest


def test_idempotency_key_not_found(idempotency_db):
    """Test checking non-existent key returns None."""
    from app.idempotency import check_idempotency_key

    result = check_idempotency_key("non-existent-key-123")
    assert result is None


def test_idempotency_key_store_and_retrieve(idempotency_db):
    """Test storing and retrieving idempotency key."""
    from app.idempotency import store_idempotency_key, check_idempotency_key, compute_response_hash

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


def test_idempotency_key_ttl(idempotency_db):
    """Test TTL expiration of idempotency keys."""
    from app.idempotency import check_idempotency_key, compute_response_hash
    from app.config import get_settings
    from app.db import get_connection

    db_path, _ = idempotency_db
    key = "test-key-ttl-789"
    response_data = {"accepted": True, "rejected_count": 0}

    # Manually insert with old timestamp (2 hours ago)
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

    # Should not find expired key (TTL is 24 hours by default in test_env)
    # But if TTL is 1 hour, this should be expired
    # Let's test with a very old key (25 hours ago)
    key_old = "test-key-very-old"
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    very_old_timestamp = int(time.time()) - (25 * 3600)
    cursor.execute(
        "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
        (key_old, very_old_timestamp, response_hash),
    )
    conn.commit()
    conn.close()

    # This should be expired
    cached = check_idempotency_key(key_old)
    assert cached is None


def test_cleanup_expired_keys(idempotency_db):
    """Test cleanup of expired idempotency keys."""
    from app.idempotency import cleanup_expired_keys, check_idempotency_key
    from app.config import get_settings
    from app.db import get_connection

    db_path, _ = idempotency_db
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
    old_timestamp = now - (25 * 3600)  # 25 hours ago (past 24h TTL)

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


def test_idempotency_key_replace(idempotency_db):
    """Test replacing existing idempotency key updates timestamp."""
    from app.idempotency import store_idempotency_key, check_idempotency_key

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

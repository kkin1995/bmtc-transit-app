"""Comprehensive tests for idempotency body hash verification (H1 security fix).

Tests the security enhancement that prevents replay attacks with modified payloads
by computing and verifying SHA256 hashes of request bodies.

Security Context: STRIDE Threat Model - Tampering (H1)
"""

import time
import pytest
from uuid import uuid4

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


@pytest.fixture
def setup_segment_for_bodyhash(client):
    """Setup test segment for body hash tests."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Insert test segment
    cursor.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("TEST_ROUTE", 0, "STOP1", "STOP2"),
    )
    conn.commit()

    # Get segment_id and insert baseline stats
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
        ("TEST_ROUTE", 0, "STOP1", "STOP2"),
    )
    segment_id = cursor.fetchone()[0]

    # Insert baseline stats for bin 0
    cursor.execute(
        """
        INSERT OR IGNORE INTO segment_stats
        (segment_id, bin_id, n, welford_mean, welford_m2, ema_mean, schedule_mean, last_update)
        VALUES (?, 0, 0, 0, 0, 0, 300, ?)
        """,
        (segment_id, int(time.time())),
    )
    conn.commit()
    conn.close()

    yield client


def create_ride_request(device_bucket: str = None, route_id: str = "TEST_ROUTE", stop_from: str = "STOP1", stop_to: str = "STOP2") -> dict:
    """Create a test ride summary request with configurable parameters."""
    if device_bucket is None:
        device_bucket = "a" * 64  # Default 64-char hex hash

    return {
        "route_id": route_id,
        "direction_id": 0,
        "device_bucket": device_bucket,
        "segments": [
            {
                "from_stop_id": stop_from,
                "to_stop_id": stop_to,
                "duration_sec": 300.0,
                "timestamp_utc": int(time.time()),
                "mapmatch_conf": 0.9,
            }
        ],
    }


# Core body hash functionality tests


def test_compute_body_hash_deterministic():
    """Test that body hash computation is deterministic."""
    from app.idempotency import compute_body_hash

    body1 = {"route_id": "335E", "direction_id": 0, "segments": [{"duration_sec": 300.0}]}
    body2 = {"segments": [{"duration_sec": 300.0}], "route_id": "335E", "direction_id": 0}  # Different key order

    hash1 = compute_body_hash(body1)
    hash2 = compute_body_hash(body2)

    # Should produce same hash regardless of dict key order
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA256 hex digest


def test_compute_body_hash_different_bodies():
    """Test that different bodies produce different hashes."""
    from app.idempotency import compute_body_hash

    body1 = {"route_id": "335E", "direction_id": 0}
    body2 = {"route_id": "500C", "direction_id": 1}

    hash1 = compute_body_hash(body1)
    hash2 = compute_body_hash(body2)

    assert hash1 != hash2


def test_compute_body_hash_unicode_stability():
    """Test that Unicode characters are handled consistently."""
    from app.idempotency import compute_body_hash

    body1 = {"stop_name": "Majestic"}
    body2 = {"stop_name": "Majestic"}  # Same content

    hash1 = compute_body_hash(body1)
    hash2 = compute_body_hash(body2)

    assert hash1 == hash2


# Idempotency key storage with body hash


def test_store_idempotency_key_with_body_hash(temp_db):
    """Test storing idempotency key stores both response and body hashes."""
    from app.idempotency import store_idempotency_key
    from app.db import get_connection
    from app.config import get_settings

    key = "test-key-123"
    body_data = {"route_id": "335E", "direction_id": 0}
    response_data = {"accepted_segments": 1, "rejected_segments": 0}

    store_idempotency_key(key, body_data, response_data)

    # Verify database storage
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT response_hash, body_hash FROM idempotency_keys WHERE key = ?",
        (key,)
    )
    row = cursor.fetchone()
    conn.close()

    assert row is not None
    assert row[0] is not None  # response_hash
    assert row[1] is not None  # body_hash
    assert len(row[1]) == 64  # SHA256 hex digest


# Integration tests with FastAPI endpoint


def test_first_submission_stores_body_hash(setup_segment_for_bodyhash, auth_headers):
    """Test that first submission with idempotency key stores body hash."""
    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    request_data = create_ride_request()

    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )

    assert response.status_code == 200

    # Verify body_hash was stored in database
    from app.db import get_connection
    from app.config import get_settings

    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT body_hash FROM idempotency_keys WHERE key = ?",
        (idempotency_key,)
    )
    row = cursor.fetchone()
    conn.close()

    assert row is not None
    assert row[0] is not None
    assert len(row[0]) == 64


def test_replay_with_same_body_succeeds(setup_segment_for_bodyhash, auth_headers):
    """Test that replaying with identical body returns cached response (200)."""
    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    request_data = create_ride_request()

    # First submission
    response1 = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )
    assert response1.status_code == 200

    # Replay with SAME body
    response2 = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )
    assert response2.status_code == 200
    # Should return cached response


def test_replay_with_different_body_returns_409(setup_segment_for_bodyhash, auth_headers):
    """Test that replaying with different body returns 409 Conflict (H1 fix)."""
    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    # First submission
    request_data1 = create_ride_request(device_bucket="a" * 64)
    response1 = client.post(
        "/v1/ride_summary",
        json=request_data1,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )
    assert response1.status_code == 200

    # Replay with DIFFERENT body (different device_bucket)
    request_data2 = create_ride_request(device_bucket="b" * 64)
    response2 = client.post(
        "/v1/ride_summary",
        json=request_data2,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )

    # Should return 409 Conflict
    assert response2.status_code == 409
    data = response2.json()
    assert data["detail"]["error"] == "conflict"
    assert "different request body" in data["detail"]["message"]
    assert data["detail"]["details"]["idempotency_key"] == idempotency_key


def test_replay_with_modified_segment_data_returns_409(setup_segment_for_bodyhash, auth_headers):
    """Test that modifying segment data (duration_sec) triggers 409."""
    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    # First submission
    request_data1 = create_ride_request()
    request_data1["segments"][0]["duration_sec"] = 300.0

    response1 = client.post(
        "/v1/ride_summary",
        json=request_data1,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )
    assert response1.status_code == 200

    # Replay with modified duration_sec
    request_data2 = create_ride_request()
    request_data2["segments"][0]["duration_sec"] = 400.0  # CHANGED

    response2 = client.post(
        "/v1/ride_summary",
        json=request_data2,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )

    assert response2.status_code == 409
    data = response2.json()
    assert data["detail"]["error"] == "conflict"


def test_replay_with_reordered_json_keys_succeeds(setup_segment_for_bodyhash, auth_headers):
    """Test that reordered JSON keys (semantically identical) don't trigger 409."""
    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    # First submission (key order: route_id, direction_id, device_bucket)
    request_data1 = {
        "route_id": "TEST_ROUTE",
        "direction_id": 0,
        "device_bucket": "a" * 64,
        "segments": [
            {
                "from_stop_id": "STOP1",
                "to_stop_id": "STOP2",
                "duration_sec": 300.0,
                "timestamp_utc": 1729615200,  # Fixed timestamp
                "mapmatch_conf": 0.9,
            }
        ],
    }

    response1 = client.post(
        "/v1/ride_summary",
        json=request_data1,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )
    assert response1.status_code == 200

    # Replay with REORDERED keys (key order: device_bucket, direction_id, route_id)
    request_data2 = {
        "device_bucket": "a" * 64,
        "direction_id": 0,
        "route_id": "TEST_ROUTE",
        "segments": [
            {
                "mapmatch_conf": 0.9,
                "timestamp_utc": 1729615200,
                "duration_sec": 300.0,
                "to_stop_id": "STOP2",
                "from_stop_id": "STOP1",
            }
        ],
    }

    response2 = client.post(
        "/v1/ride_summary",
        json=request_data2,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )

    # Should succeed (hash should match despite reordering)
    assert response2.status_code == 200


def test_expired_key_allows_new_submission(setup_segment_for_bodyhash, auth_headers):
    """Test that expired idempotency key allows new submission with different body."""
    from app.db import get_connection
    from app.config import get_settings

    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    # Manually insert expired key with old body hash
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    old_timestamp = int(time.time()) - (25 * 3600)  # 25 hours ago (past 24h TTL)
    from app.idempotency import compute_body_hash

    old_body = {"route_id": "OLD_ROUTE", "direction_id": 0}
    old_body_hash = compute_body_hash(old_body)

    cursor.execute(
        "INSERT INTO idempotency_keys (key, submitted_at, response_hash, body_hash) VALUES (?, ?, ?, ?)",
        (idempotency_key, old_timestamp, "dummy_response_hash", old_body_hash),
    )
    conn.commit()
    conn.close()

    # Submit with DIFFERENT body - should succeed because key is expired
    new_request = create_ride_request(device_bucket="new_bucket_" + "x" * 53)

    response = client.post(
        "/v1/ride_summary",
        json=new_request,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )

    # Should succeed (key expired, new submission accepted)
    assert response.status_code == 200


def test_body_hash_verification_with_null_stored_hash(setup_segment_for_bodyhash, auth_headers):
    """Test backward compatibility when stored body_hash is NULL (pre-migration data)."""
    from app.db import get_connection
    from app.config import get_settings

    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    # Manually insert key WITHOUT body_hash (simulates pre-migration data)
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    cursor.execute(
        "INSERT INTO idempotency_keys (key, submitted_at, response_hash) VALUES (?, ?, ?)",
        (idempotency_key, int(time.time()), "dummy_response_hash"),
    )
    conn.commit()
    conn.close()

    # Replay with ANY body - should succeed (backward compat: NULL body_hash means no verification)
    request_data = create_ride_request()

    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )

    # Should succeed (no body_hash verification for legacy data)
    assert response.status_code == 200


# Edge cases


def test_body_hash_with_empty_segments(setup_segment_for_bodyhash, auth_headers):
    """Test body hash computation with minimal/empty segments list."""
    from app.idempotency import compute_body_hash

    body1 = {"route_id": "TEST", "direction_id": 0, "device_bucket": "abc", "segments": []}
    body2 = {"route_id": "TEST", "direction_id": 0, "device_bucket": "abc", "segments": []}

    hash1 = compute_body_hash(body1)
    hash2 = compute_body_hash(body2)

    assert hash1 == hash2


def test_body_hash_with_float_precision():
    """Test that float values with different precision produce different hashes."""
    from app.idempotency import compute_body_hash

    body1 = {"duration_sec": 300.0}
    body2 = {"duration_sec": 300.000001}

    hash1 = compute_body_hash(body1)
    hash2 = compute_body_hash(body2)

    # Different float values should produce different hashes
    assert hash1 != hash2


def test_concurrent_submissions_with_same_key_different_bodies(setup_segment_for_bodyhash, auth_headers):
    """Test that concurrent submissions with same key but different bodies are handled correctly."""
    from concurrent.futures import ThreadPoolExecutor

    client = setup_segment_for_bodyhash
    idempotency_key = str(uuid4())

    def submit_request(device_bucket: str):
        request_data = create_ride_request(device_bucket=device_bucket)
        response = client.post(
            "/v1/ride_summary",
            json=request_data,
            headers={
                **auth_headers,
                "Idempotency-Key": idempotency_key,
            },
        )
        return response.status_code

    # Submit 3 requests concurrently with different device_buckets
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(submit_request, "a" * 64),
            executor.submit(submit_request, "b" * 64),
            executor.submit(submit_request, "c" * 64),
        ]
        results = [f.result() for f in futures]

    # One should succeed (200), others should get 409 (or also 200 if same body)
    # At least one should be 200 (first submission)
    assert 200 in results

    # At least one should be 409 (different body with same key)
    assert 409 in results

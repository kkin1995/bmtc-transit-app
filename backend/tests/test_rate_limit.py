"""Unit and integration tests for rate limiting middleware.

Tests the token bucket rate limiting system including:
- Token bucket logic (first request, subsequent, exhaustion)
- Rate limit headers (X-RateLimit-*)
- 429 responses when limits exceeded
- Idempotency interaction (idempotent requests don't spend tokens)
- Feature flag (rate_limit_enabled)
- Concurrent request handling

All tests use isolated fixtures from conftest.py.
"""

import time
import pytest
from concurrent.futures import ThreadPoolExecutor

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


@pytest.fixture
def rate_limit_env(test_env, monkeypatch):
    """Provide environment with rate limiting enabled and low limit for faster tests."""
    # Override specific settings for rate limit tests
    monkeypatch.setenv("BMTC_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("BMTC_RATE_LIMIT_PER_HOUR", "5")  # Low limit for faster tests
    return test_env


@pytest.fixture
def rate_limit_client(temp_db, rate_limit_env):
    """Provide FastAPI TestClient with rate limiting enabled."""
    from app.main import app
    from app.config import get_settings
    from fastapi.testclient import TestClient

    # Clear settings cache to pick up rate limit environment
    get_settings.cache_clear()

    # Create test client
    with TestClient(app) as test_client:
        yield test_client

    # Clear cache after test
    get_settings.cache_clear()


@pytest.fixture
def setup_rate_limit_segment(rate_limit_client):
    """Setup test segment for rate limit tests."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Insert test segment
    cursor.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
    )
    conn.commit()

    # Get segment_id and insert baseline stats
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
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

    yield rate_limit_client


def create_test_request(device_bucket: str = None) -> dict:
    """Create a test ride summary request."""
    return {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "timestamp_utc": int(time.time()),
                "device_bucket": device_bucket,
                "mapmatch_conf": 0.9,
            }
        ],
    }


# Unit Tests for Token Bucket Logic


def test_check_and_spend_token_first_request(temp_db):
    """Test first request creates bucket with limit-1 tokens."""
    from app.rate_limit import check_and_spend_token

    db_path, _ = temp_db
    bucket_id = "test_bucket_1"
    allowed, remaining, reset_time = check_and_spend_token(bucket_id, db_path, limit=5)

    assert allowed is True
    assert remaining == 4  # 5 - 1 = 4
    assert reset_time > int(time.time())


def test_check_and_spend_token_subsequent_requests(temp_db):
    """Test multiple requests decrement tokens correctly."""
    from app.rate_limit import check_and_spend_token

    db_path, _ = temp_db
    bucket_id = "test_bucket_2"

    # First request: 5 -> 4
    allowed, remaining, _ = check_and_spend_token(bucket_id, db_path, limit=5)
    assert allowed is True
    assert remaining == 4

    # Second request: 4 -> 3
    allowed, remaining, _ = check_and_spend_token(bucket_id, db_path, limit=5)
    assert allowed is True
    assert remaining == 3

    # Third request: 3 -> 2
    allowed, remaining, _ = check_and_spend_token(bucket_id, db_path, limit=5)
    assert allowed is True
    assert remaining == 2


def test_check_and_spend_token_exhaustion(temp_db):
    """Test rate limit enforcement when tokens exhausted."""
    from app.rate_limit import check_and_spend_token

    db_path, _ = temp_db
    bucket_id = "test_bucket_3"

    # Exhaust tokens: 5 requests allowed (5 -> 4 -> 3 -> 2 -> 1 -> 0)
    for i in range(5):
        allowed, remaining, _ = check_and_spend_token(bucket_id, db_path, limit=5)
        assert allowed is True
        assert remaining == 4 - i

    # 6th request should be denied
    allowed, remaining, _ = check_and_spend_token(bucket_id, db_path, limit=5)
    assert allowed is False
    assert remaining == 0


def test_get_current_limit_state(temp_db):
    """Test getting limit state without spending tokens."""
    from app.rate_limit import get_current_limit_state, check_and_spend_token

    db_path, _ = temp_db
    bucket_id = "test_bucket_4"

    # First check: bucket doesn't exist, should return full limit
    remaining, reset_time = get_current_limit_state(bucket_id, db_path, limit=5)
    assert remaining == 5
    assert reset_time > int(time.time())

    # Create bucket by spending token
    check_and_spend_token(bucket_id, db_path, limit=5)

    # Check state again
    remaining, reset_time = get_current_limit_state(bucket_id, db_path, limit=5)
    assert remaining == 4  # One token spent


def test_refill_bucket_after_hour(temp_db):
    """Test bucket refill after hour boundary (simulated)."""
    from app.rate_limit import check_and_spend_token
    from app.db import get_connection

    db_path, _ = temp_db
    bucket_id = "test_bucket_5"

    # Spend all tokens
    for _ in range(5):
        check_and_spend_token(bucket_id, db_path, limit=5)

    # Verify exhausted
    allowed, remaining, _ = check_and_spend_token(bucket_id, db_path, limit=5)
    assert allowed is False
    assert remaining == 0

    # Simulate hour passing by manipulating last_refill
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE rate_limit_buckets
        SET last_refill = datetime('now', '-2 hours')
        WHERE bucket_id = ?
        """,
        (bucket_id,),
    )
    conn.commit()
    conn.close()

    # Next request should refill and allow
    allowed, remaining, _ = check_and_spend_token(bucket_id, db_path, limit=5)
    assert allowed is True
    assert remaining == 4  # Refilled to 5, then spent 1


# Integration Tests with FastAPI


def test_rate_limit_headers_on_success(setup_rate_limit_segment, auth_headers):
    """Test rate limit headers present on successful request."""
    client = setup_rate_limit_segment
    request_data = create_test_request(device_bucket="a" * 64)

    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert "X-RateLimit-Limit" in response.headers
    assert "X-RateLimit-Remaining" in response.headers
    assert "X-RateLimit-Reset" in response.headers
    assert response.headers["X-RateLimit-Limit"] == "5"


def test_rate_limit_headers_on_429(setup_rate_limit_segment, auth_headers):
    """Test rate limit headers present on 429 response."""
    client = setup_rate_limit_segment
    bucket_id = "b" * 64

    # Exhaust quota
    for i in range(5):
        request_data = create_test_request(device_bucket=bucket_id)
        response = client.post(
            "/v1/ride_summary",
            json=request_data,
            headers={
                **auth_headers,
                "Idempotency-Key": f"key-{i}",
            },
        )
        assert response.status_code == 200
        assert int(response.headers["X-RateLimit-Remaining"]) == 4 - i

    # Next request should be rate limited
    request_data = create_test_request(device_bucket=bucket_id)
    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers={
            **auth_headers,
            "Idempotency-Key": "key-overflow",
        },
    )

    assert response.status_code == 429
    assert response.headers["X-RateLimit-Limit"] == "5"
    assert response.headers["X-RateLimit-Remaining"] == "0"
    assert "X-RateLimit-Reset" in response.headers
    assert "Retry-After" in response.headers

    # Check error response structure
    data = response.json()
    assert data["error"] == "rate_limited"
    assert "limit" in data["details"]
    assert data["details"]["limit"] == 5


def test_fallback_to_ip_when_no_device_bucket(setup_rate_limit_segment, auth_headers):
    """Test rate limiting falls back to IP when device_bucket missing."""
    client = setup_rate_limit_segment

    # Request without device_bucket
    request_data = create_test_request(device_bucket=None)

    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert "X-RateLimit-Limit" in response.headers

    # Exhaust IP-based quota
    for _ in range(4):
        response = client.post(
            "/v1/ride_summary",
            json=request_data,
            headers=auth_headers,
        )

    # Should be rate limited now
    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers=auth_headers,
    )

    assert response.status_code == 429
    data = response.json()
    assert data["details"]["bucket_id_type"] == "ip"


def test_idempotency_does_not_spend_tokens(setup_rate_limit_segment, auth_headers):
    """Test repeated idempotent requests don't spend additional tokens."""
    client = setup_rate_limit_segment
    bucket_id = "c" * 64
    idempotency_key = "test-idempotency-key-123"

    request_data = create_test_request(device_bucket=bucket_id)

    # First request with idempotency key
    response1 = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )
    assert response1.status_code == 200
    remaining_after_first = int(response1.headers["X-RateLimit-Remaining"])

    # Repeat with same idempotency key - should NOT spend token
    response2 = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers={
            **auth_headers,
            "Idempotency-Key": idempotency_key,
        },
    )
    assert response2.status_code == 200
    remaining_after_second = int(response2.headers["X-RateLimit-Remaining"])

    # Remaining should be same or higher (if refill happened)
    assert remaining_after_second >= remaining_after_first


def test_feature_flag_disabled(client, auth_headers):
    """Test rate limiting bypassed when feature flag disabled.

    Note: This test uses the regular client fixture which has rate limiting disabled by default.
    """
    from app.config import get_settings

    # Verify rate limiting is disabled
    settings = get_settings()
    assert settings.rate_limit_enabled is False

    # Setup segment
    from app.db import get_connection
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
    )
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
    )
    segment_id = cursor.fetchone()[0]
    cursor.execute(
        "INSERT OR IGNORE INTO segment_stats (segment_id, bin_id, schedule_mean) VALUES (?, 0, 300.0)",
        (segment_id,),
    )
    conn.commit()
    conn.close()

    bucket_id = "d" * 64
    request_data = create_test_request(device_bucket=bucket_id)

    # Should allow unlimited requests (more than limit of 5)
    for _ in range(10):
        response = client.post(
            "/v1/ride_summary",
            json=request_data,
            headers=auth_headers,
        )
        assert response.status_code == 200


def test_concurrent_requests_no_overspend(setup_rate_limit_segment, auth_headers):
    """Test atomic operations prevent overspending under concurrent load."""
    client = setup_rate_limit_segment
    bucket_id = "e" * 64

    def make_request():
        request_data = create_test_request(device_bucket=bucket_id)
        response = client.post(
            "/v1/ride_summary",
            json=request_data,
            headers=auth_headers,
        )
        return response.status_code

    # Make 10 concurrent requests (limit is 5)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(make_request) for _ in range(10)]
        results = [f.result() for f in futures]

    # Should have exactly 5 successes and 5 rate limited
    success_count = results.count(200)
    rate_limited_count = results.count(429)

    assert success_count == 5
    assert rate_limited_count == 5


def test_get_endpoints_not_rate_limited(rate_limit_client):
    """Test GET endpoints are not rate limited."""
    client = rate_limit_client

    # Make many GET requests - should all succeed
    for _ in range(10):
        response = client.get("/v1/health")
        assert response.status_code == 200

    response = client.get("/v1/config")
    assert response.status_code == 200


def test_different_buckets_independent_quotas(setup_rate_limit_segment, auth_headers):
    """Test different device buckets have independent rate limits."""
    client = setup_rate_limit_segment
    bucket1 = "f" * 64
    bucket2 = "0" * 64

    # Exhaust bucket1
    for _ in range(5):
        request_data = create_test_request(device_bucket=bucket1)
        response = client.post(
            "/v1/ride_summary",
            json=request_data,
            headers=auth_headers,
        )
        assert response.status_code == 200

    # Bucket1 should be exhausted
    request_data = create_test_request(device_bucket=bucket1)
    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers=auth_headers,
    )
    assert response.status_code == 429

    # Bucket2 should still have full quota
    request_data = create_test_request(device_bucket=bucket2)
    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert int(response.headers["X-RateLimit-Remaining"]) == 4


def test_rate_limit_error_structure(setup_rate_limit_segment, auth_headers):
    """Test 429 error response has correct structure."""
    client = setup_rate_limit_segment
    bucket_id = "g" * 64

    # Exhaust quota
    for _ in range(5):
        request_data = create_test_request(device_bucket=bucket_id)
        client.post(
            "/v1/ride_summary",
            json=request_data,
            headers=auth_headers,
        )

    # Get rate limited response
    request_data = create_test_request(device_bucket=bucket_id)
    response = client.post(
        "/v1/ride_summary",
        json=request_data,
        headers=auth_headers,
    )

    assert response.status_code == 429
    data = response.json()

    # Validate error structure
    assert "error" in data
    assert data["error"] == "rate_limited"
    assert "message" in data
    assert "details" in data
    assert "limit" in data["details"]
    assert "reset" in data["details"]
    assert "bucket_id_type" in data["details"]
    assert data["details"]["bucket_id_type"] in ["device", "ip"]

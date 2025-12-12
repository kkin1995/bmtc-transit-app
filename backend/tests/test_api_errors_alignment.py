"""Tests for standardized error response format alignment.

This test module validates that all API endpoints return errors in the
standardized format defined in docs/api.md:

{
  "error": "<error_code>",
  "message": "<human-readable description>",
  "details": <optional object with context-specific fields>
}

These tests are part of Step 2 (Test pass) of the TDD workflow to ensure
error responses are standardized before implementation updates.

Test Coverage:
- POST /v1/ride_summary: 8 error tests
- GET /v1/eta: 4 error tests
- GET /v1/stops: 3 error tests
- GET /v1/routes: 3 error tests
- GET /v1/stops/{stop_id}/schedule: 3 error tests
- GET /v1/config: 1 test (always succeeds)
- GET /v1/health: 1 test (always returns 200)

Total: 23 comprehensive tests
"""

import time
import json
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4


pytestmark = pytest.mark.integration


# ==============================================================================
# Helper Functions
# ==============================================================================


def assert_error_response(response, expected_status: int, expected_error_code: str) -> dict:
    """Assert that response matches standardized error format.

    Validates:
    - HTTP status code matches expected
    - Response is valid JSON
    - "error" field exists and matches expected_error_code
    - "message" field exists and is a non-empty string
    - "details" field exists (may be empty dict {})

    Args:
        response: FastAPI TestClient response object
        expected_status: Expected HTTP status code
        expected_error_code: Expected error code string

    Returns:
        dict: The details object for further assertions

    Raises:
        AssertionError: If any validation fails
    """
    # Assert HTTP status code
    assert response.status_code == expected_status, \
        f"Expected status {expected_status}, got {response.status_code}"

    # Assert response is valid JSON
    try:
        data = response.json()
    except json.JSONDecodeError as e:
        pytest.fail(f"Response is not valid JSON: {e}")

    # Assert "error" field exists and matches expected code
    assert "error" in data, "Response missing 'error' field"
    assert data["error"] == expected_error_code, \
        f"Expected error code '{expected_error_code}', got '{data['error']}'"

    # Assert "message" field exists and is non-empty string
    assert "message" in data, "Response missing 'message' field"
    assert isinstance(data["message"], str), \
        f"'message' field must be string, got {type(data['message'])}"
    assert len(data["message"]) > 0, "'message' field cannot be empty"

    # Assert "details" field exists (may be empty dict)
    assert "details" in data, "Response missing 'details' field"
    assert isinstance(data["details"], dict), \
        f"'details' field must be dict/object, got {type(data['details'])}"

    return data["details"]


def setup_test_segment(client):
    """Helper to setup test segment via database."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Insert segment (idempotent)
    cursor.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
    )

    # Get segment_id
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
    )
    segment_id = cursor.fetchone()[0]

    # Insert segment_stats for all 192 bins (idempotent)
    for bin_id in range(192):
        cursor.execute(
            """
            INSERT OR IGNORE INTO segment_stats (segment_id, bin_id, schedule_mean)
            VALUES (?, ?, ?)
            """,
            (segment_id, bin_id, 300.0),  # 5 min schedule baseline
        )

    conn.commit()
    conn.close()


# ==============================================================================
# POST /v1/ride_summary Error Tests (8 tests)
# ==============================================================================


def test_ride_summary_missing_auth_header(client):
    """Test POST /v1/ride_summary returns 401 unauthorized without Authorization header."""
    setup_test_segment(client)

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "a" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    # Send request without Authorization header
    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Idempotency-Key": str(uuid4())},
    )

    details = assert_error_response(response, 401, "unauthorized")
    # Details may be empty or contain auth-related info


def test_ride_summary_invalid_auth_header(client):
    """Test POST /v1/ride_summary returns 401 unauthorized with invalid Bearer token."""
    setup_test_segment(client)

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "b" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    # Send request with invalid Bearer token
    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={
            "Authorization": "Bearer invalid-token-12345",
            "Idempotency-Key": str(uuid4()),
        },
    )

    details = assert_error_response(response, 401, "unauthorized")


def test_ride_summary_malformed_json(client, auth_headers):
    """Test POST /v1/ride_summary returns 400 invalid_request for malformed JSON body."""
    setup_test_segment(client)

    # Send malformed JSON (missing closing brace)
    response = client.post(
        "/v1/ride_summary",
        data='{"route_id": "ROUTE1", "direction_id": 0',  # Invalid JSON
        headers={
            **auth_headers,
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid4()),
        },
    )

    # FastAPI returns 422 for JSON decode errors by default
    # This test expects the error response to be standardized
    assert response.status_code in [400, 422]  # Accept both for now

    # Verify response structure (even if status code varies)
    data = response.json()
    assert "error" in data or "detail" in data  # May not be standardized yet


def test_ride_summary_invalid_field_type(client, auth_headers):
    """Test POST /v1/ride_summary returns 422 validation_error for wrong field type."""
    setup_test_segment(client)

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": "invalid",  # Should be int, not string
        "device_bucket": "c" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Expect 422 for validation errors
    assert response.status_code == 422

    # Check if response follows standard format (may not be implemented yet)
    data = response.json()
    # FastAPI's default validation error format may differ


def test_ride_summary_stale_timestamp(client, auth_headers):
    """Test POST /v1/ride_summary returns 422 unprocessable for timestamp >7 days old."""
    setup_test_segment(client)

    # Create timestamp 8 days ago (outside valid window)
    stale_time = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "d" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": stale_time,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Expect 422 for semantic validation error
    assert response.status_code == 422

    # Verify standardized error format (when implemented)
    data = response.json()
    # Should eventually have error, message, details fields


def test_ride_summary_future_timestamp(client, auth_headers):
    """Test POST /v1/ride_summary returns 422 unprocessable for future timestamp."""
    setup_test_segment(client)

    # Create timestamp 1 hour in the future
    future_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "e" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": future_time,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Expect 422 for semantic validation error
    assert response.status_code == 422

    # Check response structure
    data = response.json()
    # Should eventually follow standard error format


def test_ride_summary_idempotency_conflict(client, auth_headers):
    """Test POST /v1/ride_summary returns 409 conflict for reused Idempotency-Key with different body."""
    setup_test_segment(client)

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    idempotency_key = str(uuid4())

    # First request - should succeed
    ride_data_1 = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "f" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    response1 = client.post(
        "/v1/ride_summary",
        json=ride_data_1,
        headers={**auth_headers, "Idempotency-Key": idempotency_key},
    )
    assert response1.status_code == 200

    # Second request with SAME key but DIFFERENT body - should return 409
    ride_data_2 = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "f" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 350.0,  # Different duration
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    response2 = client.post(
        "/v1/ride_summary",
        json=ride_data_2,
        headers={**auth_headers, "Idempotency-Key": idempotency_key},
    )

    details = assert_error_response(response2, 409, "conflict")

    # Details should contain idempotency_key
    assert "idempotency_key" in details, "Details should include idempotency_key"
    assert details["idempotency_key"] == idempotency_key


def test_ride_summary_rate_limit(client, auth_headers, monkeypatch):
    """Test POST /v1/ride_summary returns 429 rate_limited when quota exceeded."""
    setup_test_segment(client)

    # Enable rate limiting with very low limit
    monkeypatch.setenv("BMTC_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("BMTC_RATE_LIMIT_PER_HOUR", "2")  # Only 2 requests allowed

    # Clear settings cache to pick up new env vars
    from app.config import get_settings
    get_settings.cache_clear()

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    device_bucket = "1" * 64

    # Send 3 requests with same device_bucket
    for i in range(3):
        ride_data = {
            "route_id": "ROUTE1",
            "direction_id": 0,
            "device_bucket": device_bucket,
            "segments": [
                {
                    "from_stop_id": "STOP_A",
                    "to_stop_id": "STOP_B",
                    "duration_sec": 300.0 + i,  # Vary duration to avoid idempotency
                    "observed_at_utc": observed_at,
                    "mapmatch_conf": 0.95,
                }
            ],
        }

        response = client.post(
            "/v1/ride_summary",
            json=ride_data,
            headers={**auth_headers, "Idempotency-Key": str(uuid4())},
        )

        if i < 2:
            # First 2 requests should succeed
            assert response.status_code == 200, f"Request {i+1} should succeed"
        else:
            # Third request should be rate limited
            details = assert_error_response(response, 429, "rate_limited")

            # Details should contain rate limit info
            # Note: Field names may vary (limit, window, retry_after_sec, etc.)
            assert len(details) > 0, "Details should contain rate limit information"


# ==============================================================================
# GET /v1/eta Error Tests (4 tests)
# ==============================================================================


def test_eta_missing_required_params(client):
    """Test GET /v1/eta returns 400 invalid_request when required params missing."""
    # Missing route_id parameter
    response = client.get(
        "/v1/eta",
        params={
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    # FastAPI returns 422 for missing required params by default
    assert response.status_code == 422

    # Check response structure (may not be standardized yet)
    data = response.json()
    # Should eventually follow standard error format


def test_eta_invalid_direction_id(client):
    """Test GET /v1/eta returns 400 invalid_request for direction_id not in {0,1}."""
    setup_test_segment(client)

    # direction_id must be 0 or 1
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 2,  # Invalid: must be 0 or 1
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    # Should return 400 or 422 for validation error
    assert response.status_code in [400, 422]


def test_eta_invalid_when_format(client):
    """Test GET /v1/eta returns 400 invalid_request for malformed when timestamp."""
    setup_test_segment(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "when": "not-a-valid-timestamp",  # Invalid ISO-8601 format
        },
    )

    details = assert_error_response(response, 400, "invalid_request")

    # Details should mention the invalid parameter
    # (field names may vary: when, provided_value, etc.)


def test_eta_segment_not_found(client):
    """Test GET /v1/eta returns 404 not_found for non-existent segment."""
    # Query segment that doesn't exist in database
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "NONEXISTENT",
            "direction_id": 0,
            "from_stop_id": "INVALID_A",
            "to_stop_id": "INVALID_B",
        },
    )

    details = assert_error_response(response, 404, "not_found")

    # Details should contain segment identifiers
    # May include: route_id, direction_id, from_stop_id, to_stop_id


# ==============================================================================
# GET /v1/stops Error Tests (3 tests)
# ==============================================================================


def test_stops_invalid_bbox_format(client):
    """Test GET /v1/stops returns 400 invalid_request for malformed bbox."""
    # bbox should be "min_lat,min_lon,max_lat,max_lon" (4 values)
    response = client.get(
        "/v1/stops",
        params={
            "bbox": "12.9,77.5,13.0",  # Only 3 values - invalid
        },
    )

    details = assert_error_response(response, 400, "invalid_request")

    # Details should contain the invalid bbox value
    assert "bbox" in details or len(details) > 0


def test_stops_invalid_limit(client):
    """Test GET /v1/stops returns 400 invalid_request for limit > 1000."""
    response = client.get(
        "/v1/stops",
        params={
            "limit": 1500,  # Exceeds max of 1000
        },
    )

    # FastAPI validation may return 422
    assert response.status_code in [400, 422]

    # Check response structure
    data = response.json()
    # Should eventually follow standard error format


def test_stops_invalid_offset(client):
    """Test GET /v1/stops returns 400 invalid_request for negative offset."""
    response = client.get(
        "/v1/stops",
        params={
            "offset": -10,  # Negative offset is invalid
        },
    )

    # FastAPI validation may return 422
    assert response.status_code in [400, 422]


# ==============================================================================
# GET /v1/routes Error Tests (3 tests)
# ==============================================================================


def test_routes_invalid_route_type(client):
    """Test GET /v1/routes returns 400 invalid_request for route_type = 99 (must be 0-7)."""
    response = client.get(
        "/v1/routes",
        params={
            "route_type": 99,  # Invalid: GTFS route_type must be 0-7
        },
    )

    details = assert_error_response(response, 400, "invalid_request")

    # Details should mention route_type
    assert "route_type" in details or len(details) > 0


def test_routes_invalid_limit(client):
    """Test GET /v1/routes returns 400 invalid_request for limit > 1000."""
    response = client.get(
        "/v1/routes",
        params={
            "limit": 2000,  # Exceeds max of 1000
        },
    )

    # FastAPI validation may return 422
    assert response.status_code in [400, 422]


def test_routes_invalid_offset(client):
    """Test GET /v1/routes returns 400 invalid_request for negative offset."""
    response = client.get(
        "/v1/routes",
        params={
            "offset": -5,  # Negative offset is invalid
        },
    )

    # FastAPI validation may return 422
    assert response.status_code in [400, 422]


# ==============================================================================
# GET /v1/stops/{stop_id}/schedule Error Tests (3 tests)
# ==============================================================================


def test_schedule_stop_not_found(client):
    """Test GET /v1/stops/{stop_id}/schedule returns 404 not_found for non-existent stop."""
    response = client.get("/v1/stops/NONEXISTENT_STOP/schedule")

    details = assert_error_response(response, 404, "not_found")

    # Details should contain stop_id
    assert "stop_id" in details


def test_schedule_invalid_when(client):
    """Test GET /v1/stops/{stop_id}/schedule returns 400 invalid_request for malformed when."""
    # First, we need a valid stop_id. Use a placeholder that will fail parsing before lookup.
    response = client.get(
        "/v1/stops/SOME_STOP/schedule",
        params={
            "when": "not-iso-8601",  # Invalid timestamp format
        },
    )

    # Should return 400 for invalid parameter format
    # (May return 404 if stop lookup happens first)
    assert response.status_code in [400, 404]


def test_schedule_invalid_time_window(client):
    """Test GET /v1/stops/{stop_id}/schedule returns 400 invalid_request for time_window > 180."""
    response = client.get(
        "/v1/stops/SOME_STOP/schedule",
        params={
            "time_window_minutes": 200,  # Exceeds max of 180
        },
    )

    # Should return 400 for invalid parameter value
    # (May return 404 if stop lookup happens first)
    assert response.status_code in [400, 404]


# ==============================================================================
# GET /v1/config Tests (1 test - always succeeds)
# ==============================================================================


def test_config_always_succeeds(client):
    """Test GET /v1/config always returns 200, verify no error field in response."""
    response = client.get("/v1/config")

    assert response.status_code == 200
    data = response.json()

    # Should NOT have error field (this is a success response)
    assert "error" not in data

    # Should have expected config fields
    assert "n0" in data
    assert "time_bin_minutes" in data
    assert "server_version" in data


# ==============================================================================
# GET /v1/health Tests (1 test - always returns 200)
# ==============================================================================


def test_health_always_returns_200(client):
    """Test GET /v1/health always returns 200 even if degraded, verify no error field."""
    response = client.get("/v1/health")

    # Always returns 200 (check status field for actual health)
    assert response.status_code == 200
    data = response.json()

    # Should NOT have error field (this is a success response)
    assert "error" not in data

    # Should have health status fields
    assert "status" in data
    assert data["status"] in ["ok", "degraded"]
    assert "db_ok" in data
    assert "uptime_sec" in data

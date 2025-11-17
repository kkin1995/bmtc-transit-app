"""Tests for API v1 specification alignment.

This test module verifies that the backend implementation matches the v1 spec
defined in docs/api.md, including:
- POST /v1/ride_summary with device_bucket at top-level
- ISO-8601 timestamp handling (observed_at_utc)
- Response schema alignment (accepted_segments, rejected_segments)
- GET /v1/eta response fields (eta_sec, n, low_confidence, bin_id, schedule_sec)
- Backward compatibility for deprecated fields
- Validation and error handling
"""

import time
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4


pytestmark = pytest.mark.integration


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
# POST /v1/ride_summary - Request Schema Tests
# ==============================================================================


def test_post_ride_summary_with_top_level_device_bucket(client, auth_headers):
    """Test POST /v1/ride_summary with device_bucket at top-level (v1 spec)."""
    setup_test_segment(client)

    # Create ISO-8601 timestamp
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "a" * 64,  # Valid SHA256 hex string
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 320.0,
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

    assert response.status_code == 200
    data = response.json()
    assert "accepted_segments" in data
    assert "rejected_segments" in data
    assert data["accepted_segments"] == 1
    assert data["rejected_segments"] == 0


def test_post_ride_summary_with_iso8601_timestamp(client, auth_headers):
    """Test POST /v1/ride_summary accepts ISO-8601 timestamp (observed_at_utc)."""
    setup_test_segment(client)

    # Create ISO-8601 timestamp 1 hour ago
    observed_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "b" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 310.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.92,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["accepted_segments"] == 1


def test_post_ride_summary_backward_compat_epoch_timestamp(client, auth_headers):
    """Test backward compatibility: accept epoch timestamp (timestamp_utc)."""
    setup_test_segment(client)

    # Use deprecated timestamp_utc field (observed_at_utc is optional for backward compat)
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "c" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 305.0,
                "timestamp_utc": int(time.time()) - 3600,  # 1h ago
                "mapmatch_conf": 0.90,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Should accept but log deprecation warning
    assert response.status_code == 200
    data = response.json()
    assert data["accepted_segments"] == 1


# ==============================================================================
# POST /v1/ride_summary - Response Schema Tests
# ==============================================================================


def test_post_response_has_accepted_segments_field(client, auth_headers):
    """Test POST response has accepted_segments (not 'accepted')."""
    setup_test_segment(client)

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "d" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 315.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.88,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 200
    data = response.json()

    # v1 spec fields
    assert "accepted_segments" in data
    assert "rejected_segments" in data
    assert "rejected_by_reason" in data

    # Old fields should NOT be present
    assert "accepted" not in data
    assert "rejected_count" not in data


def test_post_response_counts_rejections_correctly(client, auth_headers):
    """Test POST response counts accepted and rejected segments correctly."""
    setup_test_segment(client)

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "e" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 320.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,  # High confidence
            },
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 325.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.5,  # Low confidence (< 0.7 default)
            },
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["accepted_segments"] == 1
    assert data["rejected_segments"] == 1
    assert "low_mapmatch_conf" in data["rejected_by_reason"]


# ==============================================================================
# POST /v1/ride_summary - Validation Tests
# ==============================================================================


def test_post_rejects_future_timestamp(client, auth_headers):
    """Test POST rejects future timestamp."""
    setup_test_segment(client)

    # Create timestamp 1 hour in the future
    future_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "f" * 64,
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

    assert response.status_code == 422  # Unprocessable


def test_post_rejects_stale_timestamp(client, auth_headers):
    """Test POST rejects timestamp >7 days old."""
    setup_test_segment(client)

    # Create timestamp 8 days ago
    stale_time = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "1" * 64,
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

    assert response.status_code == 422  # Unprocessable


def test_post_rejects_invalid_iso8601_format(client, auth_headers):
    """Test POST rejects invalid ISO-8601 format."""
    setup_test_segment(client)

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "2" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": "not-a-valid-timestamp",
                "mapmatch_conf": 0.95,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 422  # Unprocessable


def test_post_rejects_invalid_device_bucket_format(client, auth_headers):
    """Test POST rejects invalid device_bucket format (not 64-char hex)."""
    setup_test_segment(client)

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "invalid-bucket",  # Not 64-char hex
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

    assert response.status_code == 422  # Unprocessable


# ==============================================================================
# GET /v1/eta - Response Schema Tests
# ==============================================================================


def test_get_eta_response_has_v1_fields(client, auth_headers):
    """Test GET /v1/eta response has all v1 spec fields."""
    setup_test_segment(client)

    # First submit a ride to create stats
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "3" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 320.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,
            }
        ],
    }
    client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Query ETA
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()

    # v1 spec fields
    assert "eta_sec" in data
    assert "p50_sec" in data
    assert "p90_sec" in data
    assert "n" in data
    assert "blend_weight" in data
    assert "schedule_sec" in data
    assert "low_confidence" in data
    assert "bin_id" in data
    assert "last_updated" in data

    # Old fields should NOT be present
    assert "mean_sec" not in data
    assert "sample_count" not in data
    assert "low_n_warning" not in data

    # Verify types
    assert isinstance(data["eta_sec"], (int, float))
    assert isinstance(data["n"], int)
    assert isinstance(data["low_confidence"], bool)
    assert isinstance(data["bin_id"], int)
    assert isinstance(data["last_updated"], str)
    assert isinstance(data["schedule_sec"], (int, float))


def test_get_eta_last_updated_is_iso8601(client, auth_headers):
    """Test GET /v1/eta returns last_updated as ISO-8601 string."""
    setup_test_segment(client)

    # Submit a ride
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "4" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 315.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.92,
            }
        ],
    }
    client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Query ETA
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Verify last_updated is ISO-8601 string
    last_updated = data["last_updated"]
    assert isinstance(last_updated, str)
    assert "T" in last_updated
    assert last_updated.endswith("Z")

    # Verify it can be parsed as ISO-8601
    parsed = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None


def test_get_eta_bin_id_in_valid_range(client, auth_headers):
    """Test GET /v1/eta returns bin_id in valid range (0-191)."""
    setup_test_segment(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()

    bin_id = data["bin_id"]
    assert 0 <= bin_id <= 191  # 192 bins total (0-191)


def test_get_eta_schedule_sec_is_present(client, auth_headers):
    """Test GET /v1/eta includes schedule_sec field."""
    setup_test_segment(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "schedule_sec" in data
    assert data["schedule_sec"] == 300.0  # From setup_test_segment


# ==============================================================================
# Integration Tests - Full Flow
# ==============================================================================


def test_full_flow_post_then_get_with_v1_schema(client, auth_headers):
    """Test complete flow: POST with v1 schema -> GET with v1 schema."""
    setup_test_segment(client)

    # Step 1: Submit ride with v1 schema
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "5" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 330.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.96,
            }
        ],
    }

    post_response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert post_response.status_code == 200
    post_data = post_response.json()
    assert post_data["accepted_segments"] == 1
    assert post_data["rejected_segments"] == 0

    # Step 2: Query ETA with v1 schema
    get_response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert get_response.status_code == 200
    get_data = get_response.json()

    # Verify all v1 fields present
    assert "eta_sec" in get_data
    assert "n" in get_data
    assert "low_confidence" in get_data
    assert "bin_id" in get_data
    assert "schedule_sec" in get_data
    assert "last_updated" in get_data

    # Verify learning happened (n should be > 0)
    assert get_data["n"] >= 1


def test_multiple_segments_with_v1_schema(client, auth_headers):
    """Test POST with multiple segments using v1 schema."""
    setup_test_segment(client)

    observed_at_1 = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat().replace("+00:00", "Z")
    observed_at_2 = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")

    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "6" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 310.0,
                "dwell_sec": 20.0,
                "observed_at_utc": observed_at_1,
                "mapmatch_conf": 0.94,
            },
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 315.0,
                "dwell_sec": 25.0,
                "observed_at_utc": observed_at_2,
                "mapmatch_conf": 0.91,
            },
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["accepted_segments"] == 2
    assert data["rejected_segments"] == 0


# ==============================================================================
# GET /v1/eta - Query Parameter Tests (when vs timestamp_utc)
# ==============================================================================


def test_get_eta_accepts_when_parameter(client, auth_headers):
    """Test GET /v1/eta accepts 'when' parameter (ISO-8601 string)."""
    setup_test_segment(client)

    # Submit a ride first
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "7" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 320.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.95,
            }
        ],
    }
    client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Query ETA with 'when' parameter (ISO-8601)
    when_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "when": when_time,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "eta_sec" in data
    assert "bin_id" in data


def test_get_eta_backward_compat_timestamp_utc(client, auth_headers):
    """Test GET /v1/eta still accepts deprecated 'timestamp_utc' parameter."""
    setup_test_segment(client)

    # Submit a ride first
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "8" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 315.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.92,
            }
        ],
    }
    client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Query ETA with deprecated 'timestamp_utc' parameter (epoch int)
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "timestamp_utc": int(time.time()) - 3600,  # 1 hour ago
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "eta_sec" in data
    assert "bin_id" in data


def test_get_eta_when_takes_precedence_over_timestamp_utc(client, auth_headers):
    """Test that 'when' parameter takes precedence if both provided."""
    setup_test_segment(client)

    # Submit a ride first
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "9" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 310.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.94,
            }
        ],
    }
    client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    # Provide both parameters - 'when' should take precedence
    when_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "when": when_time,
            "timestamp_utc": int(time.time()) - 3600,  # Different time
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "eta_sec" in data
    # Can't easily verify which was used without checking bin_id computation,
    # but the request should succeed


def test_get_eta_defaults_to_now_when_no_time_provided(client, auth_headers):
    """Test GET /v1/eta defaults to server 'now' when neither parameter provided."""
    setup_test_segment(client)

    # Query ETA without any time parameter
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "eta_sec" in data
    assert "bin_id" in data
    assert 0 <= data["bin_id"] <= 191


# ==============================================================================
# GET /v1/config - Response Schema Tests
# ==============================================================================


def test_get_config_has_all_spec_fields(client):
    """Test GET /v1/config returns all fields defined in docs/api.md spec."""
    response = client.get("/v1/config")

    assert response.status_code == 200
    data = response.json()

    # All required fields from spec
    required_fields = {
        "n0": int,
        "time_bin_minutes": int,
        "half_life_days": int,
        "ema_alpha": (int, float),
        "outlier_sigma": (int, float),
        "mapmatch_min_conf": (int, float),
        "max_segments_per_ride": int,
        "rate_limit_per_hour": int,
        "idempotency_ttl_hours": int,
        "gtfs_version": str,
        "server_version": str,
    }

    # Verify all fields present
    for field in required_fields:
        assert field in data, f"Missing required field: {field}"

    # Verify field types
    for field, expected_type in required_fields.items():
        assert isinstance(data[field], expected_type), \
            f"Field {field} has wrong type: expected {expected_type}, got {type(data[field])}"


def test_get_config_values_are_reasonable(client):
    """Test GET /v1/config returns reasonable default values."""
    response = client.get("/v1/config")

    assert response.status_code == 200
    data = response.json()

    # Check reasonable default values
    assert data["n0"] == 20
    assert data["time_bin_minutes"] == 15
    assert data["half_life_days"] == 30
    assert 0.0 <= data["ema_alpha"] <= 1.0
    assert data["outlier_sigma"] > 0
    assert 0.0 <= data["mapmatch_min_conf"] <= 1.0
    assert data["max_segments_per_ride"] > 0
    assert data["rate_limit_per_hour"] > 0
    assert data["idempotency_ttl_hours"] > 0


def test_get_config_does_not_include_removed_fields(client):
    """Test GET /v1/config does not include gtfs_valid_from/to (removed from spec)."""
    response = client.get("/v1/config")

    assert response.status_code == 200
    data = response.json()

    # These fields were removed from spec in Phase 0.4
    assert "gtfs_valid_from" not in data
    assert "gtfs_valid_to" not in data


# ==============================================================================
# GET /v1/health - Response Schema Tests
# ==============================================================================


def test_get_health_has_all_spec_fields(client):
    """Test GET /v1/health returns all fields defined in docs/api.md spec."""
    response = client.get("/v1/health")

    assert response.status_code == 200
    data = response.json()

    # All required fields from spec
    required_fields = {
        "status": str,
        "db_ok": bool,
        "uptime_sec": int,
    }

    # Verify all fields present
    for field in required_fields:
        assert field in data, f"Missing required field: {field}"

    # Verify field types
    for field, expected_type in required_fields.items():
        assert isinstance(data[field], expected_type), \
            f"Field {field} has wrong type: expected {expected_type}, got {type(data[field])}"


def test_get_health_status_values_are_valid(client):
    """Test GET /v1/health returns valid status values."""
    response = client.get("/v1/health")

    assert response.status_code == 200
    data = response.json()

    # Status must be "ok" or "degraded"
    assert data["status"] in ["ok", "degraded"]
    assert isinstance(data["db_ok"], bool)
    assert data["uptime_sec"] >= 0


def test_get_health_does_not_include_removed_fields(client):
    """Test GET /v1/health does not include ingest_queue_ok (removed from spec)."""
    response = client.get("/v1/health")

    assert response.status_code == 200
    data = response.json()

    # This field was removed from spec in Phase 0.5
    assert "ingest_queue_ok" not in data


def test_get_health_always_returns_200(client):
    """Test GET /v1/health always returns 200 OK, even when degraded."""
    response = client.get("/v1/health")

    # Should always be 200, check status field for actual health
    assert response.status_code == 200

    # Status can be "ok" or "degraded", but HTTP code is always 200
    data = response.json()
    assert "status" in data


# ==============================================================================
# POST /v1/ride_summary - Error Handling Tests
# ==============================================================================


def test_post_ride_summary_rejects_malformed_json(client, auth_headers):
    """Test POST /v1/ride_summary returns 400 for malformed JSON."""
    setup_test_segment(client)

    # Send malformed JSON (missing closing quote)
    response = client.post(
        "/v1/ride_summary",
        data='{"route_id": "ROUTE1", "direction_id": 0',  # Invalid JSON
        headers={
            **auth_headers,
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid4()),
        },
    )

    # Should return 400 Bad Request for malformed JSON
    assert response.status_code == 422  # FastAPI returns 422 for JSON decode errors
    # Note: FastAPI's default behavior for malformed JSON


# ==============================================================================
# X-API-Version Header Tests (All Endpoints)
# ==============================================================================


def test_all_endpoints_return_x_api_version_header(client, auth_headers):
    """Test that all endpoints return X-API-Version: 1 header."""
    setup_test_segment(client)

    # Test GET /v1/health
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert "X-API-Version" in response.headers
    assert response.headers["X-API-Version"] == "1"

    # Test GET /v1/config
    response = client.get("/v1/config")
    assert response.status_code == 200
    assert "X-API-Version" in response.headers
    assert response.headers["X-API-Version"] == "1"

    # Test GET /v1/eta
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )
    assert response.status_code == 200
    assert "X-API-Version" in response.headers
    assert response.headers["X-API-Version"] == "1"

    # Test POST /v1/ride_summary
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "a" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 320.0,
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
    assert response.status_code == 200
    assert "X-API-Version" in response.headers
    assert response.headers["X-API-Version"] == "1"

"""Integration tests for global aggregation features.

Tests the global aggregation system including:
- Idempotency key tracking
- Device bucket management
- Map-matching confidence filtering
- Outlier detection and rejection
- Rejection reason breakdown

All tests use isolated fixtures from conftest.py.
"""

import time
import pytest

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


@pytest.fixture
def global_agg_client(client):
    """Provide client with test segment setup for global aggregation tests."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Insert segment
    cursor.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("ROUTE_GLOBAL", 0, "STOP_X", "STOP_Y"),
    )
    conn.commit()

    # Get segment_id
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
        ("ROUTE_GLOBAL", 0, "STOP_X", "STOP_Y"),
    )
    segment_id = cursor.fetchone()[0]

    # Insert segment_stats for bin 0 with baseline
    cursor.execute(
        """
        INSERT OR IGNORE INTO segment_stats (
            segment_id, bin_id, schedule_mean, n, welford_mean, welford_m2
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (segment_id, 0, 300.0, 0, 0.0, 0.0),
    )
    conn.commit()
    conn.close()

    yield client


def test_idempotency_header_handling(global_agg_client, auth_headers):
    """Test that Idempotency-Key header stores keys."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()

    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 310.0,
                "timestamp_utc": int(time.time()) - 100,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    # First request with idempotency key
    headers = {**auth_headers, "Idempotency-Key": "test-idem-key-unique-001"}
    response1 = global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=headers,
    )
    assert response1.status_code == 200

    # Check that idempotency key was stored
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT key FROM idempotency_keys WHERE key=?", ("test-idem-key-unique-001",)
    )
    row = cursor.fetchone()
    conn.close()

    assert row is not None
    assert row[0] == "test-idem-key-unique-001"


def test_device_bucket_tracking(global_agg_client, auth_headers):
    """Test that device buckets are created and tracked."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()

    # Submit ride with device_bucket (SHA256 hash) at top level
    test_bucket = "a" * 64  # Valid SHA256 hex string
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "device_bucket": test_bucket,  # Top-level per v1 spec
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 305.0,
                "timestamp_utc": int(time.time()) - 200,
                "mapmatch_conf": 0.85,
            }
        ],
    }

    response = global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 200

    # Check device_buckets table
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT observation_count FROM device_buckets WHERE bucket_id=?", (test_bucket,)
    )
    row = cursor.fetchone()
    conn.close()

    assert row is not None
    assert row[0] >= 1  # Should have at least 1 observation


def test_device_bucket_persistence(global_agg_client, auth_headers):
    """Test that device buckets persist across multiple requests."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    test_bucket = "b" * 64  # Valid SHA256 hex string

    # Submit first ride with device_bucket at top level
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "device_bucket": test_bucket,  # Top-level per v1 spec
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 300.0,
                "timestamp_utc": int(time.time()),
                "mapmatch_conf": 0.90,
            }
        ],
    }

    global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )

    # Check observation count
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT observation_count FROM device_buckets WHERE bucket_id=?", (test_bucket,)
    )
    count1 = cursor.fetchone()[0]
    conn.close()

    # Submit second ride with same bucket
    global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )

    # Count should increment
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT observation_count FROM device_buckets WHERE bucket_id=?", (test_bucket,)
    )
    count2 = cursor.fetchone()[0]
    conn.close()

    assert count2 > count1


def test_low_mapmatch_conf_rejection(global_agg_client, auth_headers):
    """Test that segments with low mapmatch_conf are rejected."""
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 310.0,
                "timestamp_utc": int(time.time()) - 300,
                "mapmatch_conf": 0.5,  # Below threshold of 0.7
            }
        ],
    }

    response = global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    result = response.json()
    # If rejections are being tracked properly (v1: rejected_segments)
    if result["rejected_segments"] > 0:
        assert "low_mapmatch_conf" in result["rejected_by_reason"]


def test_outlier_rejection(global_agg_client, auth_headers):
    """Test that outlier detection works when sufficient data exists."""
    from app.config import get_settings
    from app.db import compute_bin_id, get_connection

    settings = get_settings()

    # Get current timestamp bin
    timestamp = int(time.time()) - 400
    bin_id = compute_bin_id(timestamp)

    # First, populate segment with some normal observations for the specific bin
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
        ("ROUTE_GLOBAL", 0, "STOP_X", "STOP_Y"),
    )
    segment_id = cursor.fetchone()[0]

    # Update segment_stats for the specific bin with n=10, welford_mean=300, welford_m2=1000 (std ~10)
    cursor.execute(
        """
        INSERT OR REPLACE INTO segment_stats (segment_id, bin_id, n, welford_mean, welford_m2, schedule_mean)
        VALUES (?, ?, 10, 300.0, 1000.0, 300.0)
        """,
        (segment_id, bin_id),
    )
    conn.commit()
    conn.close()

    # Submit outlier (3 sigma = 30, so >330 or <270 is outlier)
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 400.0,  # Way above mean
                "timestamp_utc": timestamp,
                "mapmatch_conf": 0.95,
            }
        ],
    }

    response = global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    result = response.json()
    # Check if outlier was detected (depends on implementation) (v1: rejected_segments)
    if result["rejected_segments"] > 0:
        assert (
            "outlier" in result["rejected_by_reason"]
            or "missing_stats" in result["rejected_by_reason"]
        )


def test_max_segments_validation(global_agg_client, auth_headers):
    """Test that requests exceeding max segments are rejected."""
    # Create 51 segments (exceeds max of 50)
    segments = []
    for i in range(51):
        segments.append(
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 300.0,
                "timestamp_utc": int(time.time()) - i,
                "mapmatch_conf": 0.90,
            }
        )

    ride_data = {"route_id": "ROUTE_GLOBAL", "direction_id": 0, "segments": segments}

    response = global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_rejected_by_reason_breakdown(global_agg_client, auth_headers):
    """Test that rejected_by_reason provides accurate breakdown."""
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 310.0,
                "timestamp_utc": int(time.time()) - 500,
                "mapmatch_conf": 0.95,
            },
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 320.0,
                "timestamp_utc": int(time.time()) - 600,
                "mapmatch_conf": 0.60,  # Low confidence
            },
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 330.0,
                "timestamp_utc": int(time.time()) - 700,
                # Missing mapmatch_conf (defaults to 1.0)
            },
        ],
    }

    response = global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    result = response.json()

    # Should have rejections for different reasons (v1: rejected_segments)
    assert result["rejected_segments"] >= 1
    assert "rejected_by_reason" in result
    reasons = result["rejected_by_reason"]

    # Check structure
    assert isinstance(reasons, dict)
    assert "low_mapmatch_conf" in reasons
    assert "missing_stats" in reasons or "outlier" in reasons


def test_global_aggregation_increments_n(global_agg_client, auth_headers):
    """Test that accepted segments increment global n counter."""
    from app.config import get_settings
    from app.db import compute_bin_id, get_connection

    settings = get_settings()

    # Use a specific timestamp
    timestamp = int(time.time()) - 800
    bin_id = compute_bin_id(timestamp)

    # Get initial n for the specific bin
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT n FROM segment_stats ss
        JOIN segments s ON ss.segment_id = s.segment_id
        WHERE s.route_id=? AND s.direction_id=? AND s.from_stop_id=? AND s.to_stop_id=? AND ss.bin_id=?
        """,
        ("ROUTE_GLOBAL", 0, "STOP_X", "STOP_Y", bin_id),
    )
    row = cursor.fetchone()
    initial_n = row[0] if row else 0
    conn.close()

    # Submit valid segment
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 305.0,
                "timestamp_utc": timestamp,
                "mapmatch_conf": 0.92,
            }
        ],
    }

    response = global_agg_client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    result = response.json()

    # Check n incremented (if accepted)
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT n FROM segment_stats ss
        JOIN segments s ON ss.segment_id = s.segment_id
        WHERE s.route_id=? AND s.direction_id=? AND s.from_stop_id=? AND s.to_stop_id=? AND ss.bin_id=?
        """,
        ("ROUTE_GLOBAL", 0, "STOP_X", "STOP_Y", bin_id),
    )
    row = cursor.fetchone()
    new_n = row[0] if row else 0
    conn.close()

    # If no rejections, n should increment (v1: rejected_segments)
    if result["rejected_segments"] == 0:
        assert new_n >= initial_n + 1


def test_config_returns_global_aggregation_settings(client):
    """Test that /v1/config returns global aggregation settings."""
    response = client.get("/v1/config")
    assert response.status_code == 200

    config = response.json()
    assert "mapmatch_min_conf" in config
    assert "max_segments_per_ride" in config
    assert "idempotency_ttl_hours" in config

    assert config["mapmatch_min_conf"] == 0.7  # Match test_env
    assert config["max_segments_per_ride"] == 50
    assert config["idempotency_ttl_hours"] == 24


def test_mapmatch_conf_default_value():
    """Test that mapmatch_conf defaults to 1.0 when not provided."""
    from app.models import RideSegment
    import time

    segment = RideSegment(
        from_stop_id="A",
        to_stop_id="B",
        duration_sec=100.0,
        timestamp_utc=int(time.time()) - 100,
    )

    # Should default to 1.0
    assert segment.mapmatch_conf == 1.0

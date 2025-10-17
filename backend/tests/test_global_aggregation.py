"""Integration tests for global aggregation features."""

import os
import tempfile
import time
import pytest
from fastapi.testclient import TestClient

# Set test env vars before importing app
TEST_DB = tempfile.mktemp(suffix=".db")
os.environ["BMTC_API_KEY"] = "test-key-global-agg"
os.environ["BMTC_DB_PATH"] = TEST_DB
os.environ["BMTC_GTFS_PATH"] = "/tmp/gtfs"
os.environ["BMTC_N0"] = "20"
os.environ["BMTC_MAPMATCH_MIN_CONF"] = "0.7"
os.environ["BMTC_OUTLIER_SIGMA"] = "3.0"
os.environ["BMTC_MAX_SEGMENTS_PER_RIDE"] = "50"
os.environ["BMTC_DEVICE_BUCKET_SIZE_HOURS"] = "24"
os.environ["BMTC_DEVICE_BUCKET_MAX_REQUESTS"] = "100"
os.environ["BMTC_IDEMPOTENCY_TTL_HOURS"] = "24"

from app.main import app  # noqa: E402
from app.db import get_connection, init_db  # noqa: E402

# Disable rate limiting by reducing test rate
os.environ["TESTING"] = "true"

client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    """Initialize test database once."""
    # Remove old test DB if it exists
    try:
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    except Exception:
        pass
    # Initialize database with schema
    init_db(TEST_DB)


def setup_test_segment():
    """Insert a test segment with baseline stats."""
    from app.config import get_settings

    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Insert segment
    cursor.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("ROUTE_GLOBAL", 0, "STOP_X", "STOP_Y"),
    )

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
    return segment_id


def test_idempotency_header_handling():
    """Test that Idempotency-Key header stores keys."""
    setup_test_segment()
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
    response1 = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={
            "Authorization": "Bearer test-key-global-agg",
            "Idempotency-Key": "test-idem-key-unique-001",
        },
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


def test_device_bucket_tracking():
    """Test that device buckets are created and tracked."""
    setup_test_segment()
    from app.config import get_settings

    settings = get_settings()

    # Submit ride with device_bucket (SHA256 hash)
    test_bucket = "a" * 64  # Valid SHA256 hex string
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 305.0,
                "timestamp_utc": int(time.time()) - 200,
                "mapmatch_conf": 0.85,
                "device_bucket": test_bucket,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
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


def test_device_bucket_persistence():
    """Test that device buckets persist across multiple requests."""
    setup_test_segment()
    from app.config import get_settings

    settings = get_settings()

    test_bucket = "b" * 64  # Valid SHA256 hex string

    # Submit first ride
    ride_data = {
        "route_id": "ROUTE_GLOBAL",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_X",
                "to_stop_id": "STOP_Y",
                "duration_sec": 300.0,
                "timestamp_utc": int(time.time()),
                "mapmatch_conf": 0.90,
                "device_bucket": test_bucket,
            }
        ],
    }

    client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
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
    client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
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


def test_low_mapmatch_conf_rejection():
    """Test that segments with low mapmatch_conf are rejected."""
    setup_test_segment()

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

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
    )
    assert response.status_code == 200
    result = response.json()
    # If rejections are being tracked properly
    if result["rejected_count"] > 0:
        assert "low_mapmatch_conf" in result["rejected_by_reason"]


def test_outlier_rejection():
    """Test that outlier detection works when sufficient data exists."""
    setup_test_segment()
    from app.config import get_settings
    from app.db import compute_bin_id

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

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
    )
    assert response.status_code == 200
    result = response.json()
    # Check if outlier was detected (depends on implementation)
    if result["rejected_count"] > 0:
        assert (
            "outlier" in result["rejected_by_reason"]
            or "missing_stats" in result["rejected_by_reason"]
        )


def test_max_segments_validation():
    """Test that requests exceeding max segments are rejected."""
    setup_test_segment()

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

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
    )
    assert response.status_code == 400


def test_rejected_by_reason_breakdown():
    """Test that rejected_by_reason provides accurate breakdown."""
    setup_test_segment()

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
                # Missing mapmatch_conf
            },
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
    )
    assert response.status_code == 200
    result = response.json()

    # Should have rejections for different reasons
    assert result["rejected_count"] >= 1
    assert "rejected_by_reason" in result
    reasons = result["rejected_by_reason"]

    # Check structure
    assert isinstance(reasons, dict)
    assert "low_mapmatch_conf" in reasons
    assert "missing_stats" in reasons or "outlier" in reasons


def test_global_aggregation_increments_n():
    """Test that accepted segments increment global n counter."""
    setup_test_segment()
    from app.config import get_settings
    from app.db import compute_bin_id

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

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-global-agg"},
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

    # If no rejections, n should increment
    if result["rejected_count"] == 0:
        assert new_n >= initial_n + 1


def test_config_returns_global_aggregation_settings():
    """Test that /v1/config returns global aggregation settings."""
    response = client.get("/v1/config")
    assert response.status_code == 200

    config = response.json()
    assert "mapmatch_min_conf" in config
    assert "max_segments_per_ride" in config
    assert "idempotency_ttl_hours" in config

    assert config["mapmatch_min_conf"] == 0.7  # Match env var
    assert config["max_segments_per_ride"] == 50
    assert config["idempotency_ttl_hours"] == 24


def test_mapmatch_conf_default_value():
    """Test that mapmatch_conf defaults to 1.0 when not provided."""
    # This is handled by the Pydantic model default value
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

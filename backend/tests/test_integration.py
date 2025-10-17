"""Integration tests for POST→GET flow."""

import os
import tempfile
import time
import pytest
from fastapi.testclient import TestClient

# Set test env vars before importing app
TEST_DB = tempfile.mktemp(suffix=".db")
os.environ["BMTC_API_KEY"] = "test-key-12345678901234567890"
os.environ["BMTC_DB_PATH"] = TEST_DB
os.environ["BMTC_GTFS_PATH"] = "/tmp/gtfs"
os.environ["BMTC_N0"] = "20"

from app.main import app  # noqa: E402
from app.db import get_connection, init_db  # noqa: E402


client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    """Initialize test database once for all tests."""
    # Always initialize, but remove old DB first to ensure fresh schema
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)


def setup_test_segment():
    """Insert a test segment with schedule baseline for all bins."""
    from app.config import get_settings

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


def test_health_check():
    """Test /v1/health endpoint."""
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db_ok"] is True


def test_config_endpoint():
    """Test /v1/config endpoint."""
    response = client.get("/v1/config")
    assert response.status_code == 200
    data = response.json()
    assert data["n0"] == 20
    assert data["time_bin_minutes"] == 15


def test_auth_required():
    """Test that POST requires auth."""
    response = client.post("/v1/ride_summary", json={})
    assert response.status_code == 403  # No auth header


def test_ride_submission_and_eta():
    """Test POST ride→GET eta integration."""
    setup_test_segment()

    # Submit ride
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 320.0,
                "timestamp_utc": int(time.time()) - 3600,  # 1h ago, Mon-Fri 00:00 bin
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-12345678901234567890"},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["accepted"] is True
    assert result["rejected_count"] == 0

    # Query ETA
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "timestamp_utc": int(time.time()) - 3600,
        },
    )
    assert response.status_code == 200
    eta = response.json()

    # Should have n=1 now
    assert eta["sample_count"] == 1

    # Mean should be blended: w=1/(1+20)=0.048, blend=0.048*320 + 0.952*300 ≈ 300.96
    assert 300 < eta["mean_sec"] < 310

    # Blend weight should be small
    assert 0 < eta["blend_weight"] < 0.1


def test_unknown_segment_rejection():
    """Test that unknown segments are rejected with 422."""
    ride_data = {
        "route_id": "UNKNOWN",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "X",
                "to_stop_id": "Y",
                "duration_sec": 100.0,
                "timestamp_utc": int(time.time()),
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-12345678901234567890"},
    )
    assert response.status_code == 422


def test_holiday_flag_routing():
    """Test that is_holiday routes weekday to weekend bins."""
    setup_test_segment()
    from app.db import compute_bin_id
    from datetime import datetime
    from zoneinfo import ZoneInfo

    # Create Monday 9:00 AM IST timestamp
    tz = ZoneInfo("Asia/Kolkata")
    dt = datetime(2025, 10, 13, 9, 0, 0, tzinfo=tz)  # Monday
    timestamp = int(dt.timestamp())

    # Verify bin mapping
    weekday_bin = compute_bin_id(timestamp, is_holiday=False)
    weekend_bin = compute_bin_id(timestamp, is_holiday=True)
    assert weekday_bin == 36  # Mon-Fri 9:00 AM
    assert weekend_bin == 132  # Sat-Sun 9:00 AM (96 + 36)

    # Submit ride with is_holiday=true
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 310.0,
                "timestamp_utc": timestamp,
                "is_holiday": True,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-12345678901234567890"},
    )
    assert response.status_code == 200


def test_low_n_warning_in_eta():
    """Test that low_n_warning is returned when n < 8."""
    setup_test_segment()

    # Query ETA (may have some observations from previous tests, but should be < 8)
    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "timestamp_utc": int(time.time()) - 3600,  # Some bin with low n
        },
    )
    assert response.status_code == 200
    eta = response.json()

    # With n < 8, should have low_n_warning=True
    assert eta["sample_count"] < 8
    assert eta["low_n_warning"] is True
    assert "p50_sec" in eta
    assert "p90_sec" in eta


def test_timezone_bin_mapping():
    """Test that timestamps are correctly mapped using Asia/Kolkata timezone."""
    from app.db import compute_bin_id
    from datetime import datetime
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("Asia/Kolkata")

    # Monday 9:00 AM IST
    dt = datetime(2025, 10, 13, 9, 0, 0, tzinfo=tz)
    bin_id = compute_bin_id(int(dt.timestamp()))
    assert bin_id == 36  # weekday_type=0, hour=9, minute_slot=0

    # Saturday 10:00 AM IST
    dt = datetime(2025, 10, 18, 10, 0, 0, tzinfo=tz)
    bin_id = compute_bin_id(int(dt.timestamp()))
    assert bin_id == 136  # weekday_type=1, hour=10, minute_slot=0 → 96 + 40

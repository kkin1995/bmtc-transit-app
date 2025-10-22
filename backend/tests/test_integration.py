"""Integration tests for POST->GET flow.

These tests verify end-to-end API functionality including:
- POST /v1/ride_summary (learning data ingestion)
- GET /v1/eta (learned predictions)
- GET /v1/config (configuration)
- GET /v1/health (health check)

All tests use isolated fixtures from conftest.py for proper test isolation.
"""

import time
import pytest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


def setup_test_segment(client):
    """Helper to setup test segment via database.

    Note: This helper accesses the database directly rather than via API
    because we need segments to exist before submitting rides.
    """
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


def test_health_check(client):
    """Test /v1/health endpoint returns ok status."""
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db_ok"] is True


def test_config_endpoint(client):
    """Test /v1/config endpoint returns correct configuration."""
    response = client.get("/v1/config")
    assert response.status_code == 200
    data = response.json()
    assert data["n0"] == 20
    assert data["time_bin_minutes"] == 15


def test_auth_required(client):
    """Test that POST /v1/ride_summary requires authentication."""
    response = client.post("/v1/ride_summary", json={})
    assert response.status_code == 403  # No auth header


def test_ride_submission_and_eta(client, auth_headers):
    """Test complete POST ride -> GET eta integration flow."""
    setup_test_segment(client)

    # Submit ride with v1 schema
    observed_at = (datetime.now(ZoneInfo("UTC")) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
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
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    result = response.json()
    assert result["accepted_segments"] == 1
    assert result["rejected_segments"] == 0

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
    assert eta["n"] == 1

    # Mean should be blended: w=1/(1+20)=0.048, blend=0.048*320 + 0.952*300 ≈ 300.96
    assert 300 < eta["eta_sec"] < 310

    # Blend weight should be small
    assert 0 < eta["blend_weight"] < 0.1


def test_unknown_segment_rejection(client, auth_headers):
    """Test that unknown segments are rejected with 422."""
    observed_at = datetime.now(ZoneInfo("UTC")).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "UNKNOWN",
        "direction_id": 0,
        "device_bucket": "b" * 64,
        "segments": [
            {
                "from_stop_id": "X",
                "to_stop_id": "Y",
                "duration_sec": 100.0,
                "observed_at_utc": observed_at,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_holiday_flag_routing(client, auth_headers):
    """Test that is_holiday routes weekday to weekend bins."""
    setup_test_segment(client)
    from app.db import compute_bin_id

    # Create a recent Monday 9:00 AM IST timestamp (within 7-day validation window)
    # Use a fixed offset from now to ensure it's always within the validation window
    tz = ZoneInfo("Asia/Kolkata")
    now = datetime.now(tz)
    # Find the most recent Monday at 9:00 AM (within last 7 days)
    days_since_monday = (now.weekday() - 0) % 7  # 0 = Monday
    if days_since_monday == 0 and now.hour >= 9:
        # Today is Monday after 9 AM, use today
        dt = now.replace(hour=9, minute=0, second=0, microsecond=0)
    else:
        # Use previous Monday
        days_ago = days_since_monday if days_since_monday > 0 else 7
        dt = (now - timedelta(days=days_ago)).replace(hour=9, minute=0, second=0, microsecond=0)
    timestamp = int(dt.timestamp())

    # Verify bin mapping
    weekday_bin = compute_bin_id(timestamp, is_holiday=False)
    weekend_bin = compute_bin_id(timestamp, is_holiday=True)
    assert weekday_bin == 36  # Mon-Fri 9:00 AM
    assert weekend_bin == 132  # Sat-Sun 9:00 AM (96 + 36)

    # Submit ride with is_holiday=true (use ISO-8601 format)
    observed_at_iso = datetime.fromtimestamp(timestamp, tz=ZoneInfo("UTC")).isoformat().replace("+00:00", "Z")
    ride_data = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "c" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 310.0,
                "observed_at_utc": observed_at_iso,
                "is_holiday": True,
            }
        ],
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_low_n_warning_in_eta(client):
    """Test that low_confidence is returned when n < 8."""
    setup_test_segment(client)

    # Query ETA for a bin with low n
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

    # With n < 8, should have low_confidence=True
    assert eta["n"] < 8
    assert eta["low_confidence"] is True
    assert "p50_sec" in eta
    assert "p90_sec" in eta


def test_timezone_bin_mapping():
    """Test that timestamps are correctly mapped using Asia/Kolkata timezone."""
    from app.db import compute_bin_id

    tz = ZoneInfo("Asia/Kolkata")

    # Monday 9:00 AM IST
    dt = datetime(2025, 10, 13, 9, 0, 0, tzinfo=tz)
    bin_id = compute_bin_id(int(dt.timestamp()))
    assert bin_id == 36  # weekday_type=0, hour=9, minute_slot=0

    # Saturday 10:00 AM IST
    dt = datetime(2025, 10, 18, 10, 0, 0, tzinfo=tz)
    bin_id = compute_bin_id(int(dt.timestamp()))
    assert bin_id == 136  # weekday_type=1, hour=10, minute_slot=0 -> 96 + 40

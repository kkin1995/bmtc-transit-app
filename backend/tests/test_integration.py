"""Integration tests for POST→GET flow."""
import os
import tempfile
import time
from fastapi.testclient import TestClient

# Set test env vars before importing app
os.environ["BMTC_API_KEY"] = "test-key-12345678901234567890"
os.environ["BMTC_DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["BMTC_GTFS_PATH"] = "/tmp/gtfs"
os.environ["BMTC_N0"] = "20"

from app.main import app
from app.db import get_connection


client = TestClient(app)


def setup_test_segment():
    """Insert a test segment with schedule baseline."""
    from app.config import get_settings
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Insert segment
    cursor.execute(
        "INSERT INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("ROUTE1", 0, "STOP_A", "STOP_B")
    )
    segment_id = cursor.lastrowid

    # Insert segment_stats for bin 0 (Mon-Fri 00:00-00:15)
    cursor.execute(
        """
        INSERT INTO segment_stats (segment_id, bin_id, schedule_mean)
        VALUES (?, ?, ?)
        """,
        (segment_id, 0, 300.0)  # 5 min schedule baseline
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
                "timestamp_utc": int(time.time()) - 3600  # 1h ago, Mon-Fri 00:00 bin
            }
        ]
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-12345678901234567890"}
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
            "timestamp_utc": int(time.time()) - 3600
        }
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
                "timestamp_utc": int(time.time())
            }
        ]
    }

    response = client.post(
        "/v1/ride_summary",
        json=ride_data,
        headers={"Authorization": "Bearer test-key-12345678901234567890"}
    )
    assert response.status_code == 422

"""Tests for the X-Deprecation-Warning response header (API-05).

Verifies that POST /v1/ride_summary and GET /v1/eta emit an
X-Deprecation-Warning header when the deprecated timestamp_utc field/param
is used, and that the header is absent when the current field is used.
"""

import time
import pytest
from uuid import uuid4

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


@pytest.fixture
def setup_segment_for_deprecation(client):
    """Set up a test segment + baseline stats using the running client's DB."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()

        cursor.execute(
            "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
            ("ROUTE1", 0, "STOP_A", "STOP_B"),
        )
        conn.commit()

        cursor.execute(
            "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
            ("ROUTE1", 0, "STOP_A", "STOP_B"),
        )
        segment_id = cursor.fetchone()[0]

        for bin_id in range(192):
            cursor.execute(
                """
                INSERT OR IGNORE INTO segment_stats
                (segment_id, bin_id, n, welford_mean, welford_m2, ema_mean, schedule_mean, last_update)
                VALUES (?, ?, 0, 0, 0, 0, 300, ?)
                """,
                (segment_id, bin_id, int(time.time())),
            )
        conn.commit()

    yield client


def _ride_request_with_timestamp_utc() -> dict:
    """Ride summary request using the deprecated per-segment timestamp_utc."""
    return {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "a" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "timestamp_utc": int(time.time()),
                "mapmatch_conf": 0.9,
            }
        ],
    }


def _ride_request_with_observed_at_utc() -> dict:
    """Ride summary request using the current observed_at_utc field."""
    from datetime import datetime, timezone

    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "b" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": observed_at,
                "mapmatch_conf": 0.9,
            }
        ],
    }


def test_post_ride_summary_with_timestamp_utc_has_deprecation_header(setup_segment_for_deprecation, auth_headers):
    """POST /v1/ride_summary using deprecated timestamp_utc emits X-Deprecation-Warning."""
    client = setup_segment_for_deprecation

    response = client.post(
        "/v1/ride_summary",
        json=_ride_request_with_timestamp_utc(),
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 200
    assert "X-Deprecation-Warning" in response.headers
    assert response.headers["X-Deprecation-Warning"]  # non-empty


def test_post_ride_summary_with_observed_at_utc_has_no_deprecation_header(setup_segment_for_deprecation, auth_headers):
    """POST /v1/ride_summary using observed_at_utc has NO X-Deprecation-Warning header."""
    client = setup_segment_for_deprecation

    response = client.post(
        "/v1/ride_summary",
        json=_ride_request_with_observed_at_utc(),
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 200
    assert "X-Deprecation-Warning" not in response.headers


def test_get_eta_with_timestamp_utc_has_deprecation_header(setup_segment_for_deprecation):
    """GET /v1/eta using deprecated timestamp_utc query param emits X-Deprecation-Warning."""
    client = setup_segment_for_deprecation

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "timestamp_utc": int(time.time()),
        },
    )

    assert response.status_code == 200
    assert "X-Deprecation-Warning" in response.headers
    assert response.headers["X-Deprecation-Warning"]  # non-empty


def test_get_eta_with_when_has_no_deprecation_header(setup_segment_for_deprecation):
    """GET /v1/eta using the current 'when' query param has NO X-Deprecation-Warning header."""
    from datetime import datetime, timezone

    client = setup_segment_for_deprecation
    when = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "when": when,
        },
    )

    assert response.status_code == 200
    assert "X-Deprecation-Warning" not in response.headers

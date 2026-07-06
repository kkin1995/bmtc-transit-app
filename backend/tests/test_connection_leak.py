"""Connection-leak regression tests for BUGFIX-01.

These tests prove that `get_connection()` releases its SQLite file
descriptor on every exit path, including a mid-handler exception raised
deep inside `POST /v1/ride_summary` (via the imported `update_segment_stats`
symbol). Before the `@contextmanager` conversion in `app/db.py`, a forced
exception between `get_connection()` and the handler's manual `conn.close()`
would leak the connection — repeated forced failures would eventually
exhaust file descriptors / hold WAL locks and cause `database is locked`
errors on subsequent requests.
"""

from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.integration


def _recent_observed_at() -> str:
    """ISO-8601 UTC timestamp 1 hour ago (passes the 7-day-old/future validator)."""
    return (
        (datetime.now(timezone.utc) - timedelta(hours=1))
        .isoformat()
        .replace("+00:00", "Z")
    )


def _raiser(*args, **kwargs):
    raise RuntimeError("forced")


def _post_forced_failure(client, payload, headers):
    """POST a ride expecting the forced RuntimeError to surface.

    Starlette's TestClient (`raise_server_exceptions=True`, the default used
    by the `client` fixture) re-raises unhandled server exceptions rather
    than returning them as a 500 response — there is no generic
    `Exception` handler registered in `app/main.py`. This wraps that
    re-raise so the test can assert the forced failure happened without
    treating it as a genuine test error.
    """
    with pytest.raises(RuntimeError, match="forced"):
        client.post("/v1/ride_summary", json=payload, headers=headers)


def _setup_test_segment(client):
    """Insert a test segment directly via the app's own DB connection.

    Mirrors `test_integration.py::setup_test_segment` — uses the app-level
    `get_connection()` (which does not enforce foreign keys) rather than the
    `db_with_test_segment` fixture's `temp_db` connection (which enables
    `PRAGMA foreign_keys = ON` and would reject a bare segment insert without
    matching `routes`/`stops` rows).
    """
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    with get_connection(settings.db_path) as conn:
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

        for bin_id in range(192):
            cursor.execute(
                """
                INSERT OR IGNORE INTO segment_stats (segment_id, bin_id, schedule_mean)
                VALUES (?, ?, ?)
                """,
                (segment_id, bin_id, 300.0),
            )

        conn.commit()


def test_forced_exception_does_not_leak_connection(
    client, auth_headers, monkeypatch
):
    """A forced mid-handler exception must not leave the connection open.

    Monkeypatches `update_segment_stats` (as imported into `app.routes`) to
    raise, submits a valid ride, expects a 500, then verifies a subsequent
    normal request against the same isolated DB succeeds — proving the
    connection opened during the failed request was closed.
    """
    _setup_test_segment(client)
    monkeypatch.setattr("app.routes.update_segment_stats", _raiser)

    payload = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "a" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": _recent_observed_at(),
                "mapmatch_conf": 0.95,
            }
        ],
    }

    _post_forced_failure(client, payload, auth_headers)

    # A subsequent normal request must succeed — if the prior request's
    # connection leaked (and, worse, held a write lock), this would fail
    # with sqlite3.OperationalError: database is locked.
    eta_response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )
    assert eta_response.status_code == 200


def test_repeated_forced_failures_do_not_exhaust_connections(
    client, auth_headers, monkeypatch
):
    """Repeated forced failures must not exhaust the connection pool.

    This is the strongest leak signal: if `get_connection()` failed to
    close the connection on every exit path, 25 consecutive forced
    exceptions would accumulate 25 leaked file descriptors / WAL locks,
    and the final normal GET would fail.
    """
    _setup_test_segment(client)
    monkeypatch.setattr("app.routes.update_segment_stats", _raiser)

    payload = {
        "route_id": "ROUTE1",
        "direction_id": 0,
        "device_bucket": "b" * 64,
        "segments": [
            {
                "from_stop_id": "STOP_A",
                "to_stop_id": "STOP_B",
                "duration_sec": 300.0,
                "observed_at_utc": _recent_observed_at(),
                "mapmatch_conf": 0.95,
            }
        ],
    }

    for _ in range(25):
        _post_forced_failure(client, payload, auth_headers)

    # After 25 forced failures, a normal GET must still succeed without
    # hitting "database is locked".
    eta_response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )
    assert eta_response.status_code == 200

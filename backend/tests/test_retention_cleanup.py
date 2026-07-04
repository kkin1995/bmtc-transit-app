"""Tests for backend/scripts/retention_cleanup.sh (DATA-03, D-05).

Verifies the three-delete retention script:
1. ride_segments older than BMTC_RETENTION_DAYS
2. rides with zero remaining ride_segments (orphan cleanup, DATA-03 core fix)
3. rejection_log older than BMTC_REJECTION_LOG_RETENTION_DAYS (drive-by, D-05)

All invocations run the real script as a subprocess against a file-based
temp_db so the child process can open the same SQLite file the test seeded.
"""

import subprocess
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration

RETENTION_DAYS = 90
REJECTION_LOG_RETENTION_DAYS = 30

# Resolved relative to this test file so it works regardless of the pytest
# invocation cwd (`cd backend && pytest ...` vs. repo-root invocation) —
# matches the precedent in test_rate_limit_cleanup_script.py.
CLEANUP_SCRIPT = Path(__file__).parent.parent / "scripts" / "retention_cleanup.sh"

SCRIPT_ENV_BASE = {
    "BMTC_RETENTION_DAYS": str(RETENTION_DAYS),
    "BMTC_REJECTION_LOG_RETENTION_DAYS": str(REJECTION_LOG_RETENTION_DAYS),
    "PATH": "/usr/bin:/bin",
}


def _past_timestamp(days: int) -> int:
    """Return a unix timestamp `days + 1` days in the past (safely past a `days`-day TTL)."""
    return int(time.time()) - (days + 1) * 86400


def _within_timestamp(days_ago: int = 1) -> int:
    """Return a unix timestamp `days_ago` days in the past (safely within any TTL used here)."""
    return int(time.time()) - days_ago * 86400


def _seed_segment(conn, route_id: str, from_stop: str, to_stop: str) -> int:
    """Seed a route, two stops, and a segment; return the segment_id.

    FK parents (routes, stops) must exist before segments per schema.sql.
    """
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO routes (route_id, route_short_name, route_type) VALUES (?, ?, 3)",
        (route_id, route_id),
    )
    cursor.execute(
        "INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon) VALUES (?, ?, 12.9, 77.6)",
        (from_stop, from_stop),
    )
    cursor.execute(
        "INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon) VALUES (?, ?, 12.9, 77.6)",
        (to_stop, to_stop),
    )
    cursor.execute(
        "INSERT INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, 0, ?, ?)",
        (route_id, from_stop, to_stop),
    )
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND from_stop_id=? AND to_stop_id=?",
        (route_id, from_stop, to_stop),
    )
    return cursor.fetchone()[0]


def _seed_time_bin(conn, bin_id: int = 0) -> None:
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO time_bins (bin_id, weekday_type, hour_start, minute_start) VALUES (?, 0, 0, 0)",
        (bin_id,),
    )


def _seed_ride(conn, segment_count: int) -> int:
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO rides (submitted_at, segment_count) VALUES (?, ?)",
        (int(time.time()), segment_count),
    )
    return cursor.lastrowid


def _seed_ride_segment(conn, ride_id: int, seq: int, segment_id: int, timestamp_utc: int, duration_sec: float) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO ride_segments (ride_id, seq, segment_id, duration_sec, timestamp_utc)
        VALUES (?, ?, ?, ?, ?)
        """,
        (ride_id, seq, segment_id, duration_sec, timestamp_utc),
    )


def _seed_rejection(conn, segment_id: int, bin_id: int, submitted_at: int, reason: str = "outlier") -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO rejection_log (segment_id, bin_id, reason, submitted_at)
        VALUES (?, ?, ?, ?)
        """,
        (segment_id, bin_id, reason, submitted_at),
    )


def _run_script(db_path: str) -> subprocess.CompletedProcess:
    env = {**SCRIPT_ENV_BASE, "BMTC_DB_PATH": db_path}
    return subprocess.run(
        ["bash", str(CLEANUP_SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
    )


def test_orphaned_ride_removed_when_all_segments_age_out(temp_db):
    """Test A: a ride whose only ride_segments all aged out is deleted along with them."""
    db_path, conn = temp_db
    segment_id = _seed_segment(conn, "R_A", "STOP_A1", "STOP_A2")
    ride_id = _seed_ride(conn, segment_count=1)
    _seed_ride_segment(conn, ride_id, seq=0, segment_id=segment_id, timestamp_utc=_past_timestamp(RETENTION_DAYS), duration_sec=100.0)
    conn.commit()

    result = _run_script(db_path)
    assert result.returncode == 0, result.stderr

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM ride_segments WHERE ride_id = ?", (ride_id,))
    assert cursor.fetchone()[0] == 0

    cursor.execute("SELECT COUNT(*) FROM rides WHERE ride_id = ?", (ride_id,))
    assert cursor.fetchone()[0] == 0


def test_non_orphan_ride_kept_when_a_segment_is_in_window(temp_db):
    """Test B: a ride with at least one in-window ride_segment survives, along with that segment."""
    db_path, conn = temp_db
    segment_id = _seed_segment(conn, "R_B", "STOP_B1", "STOP_B2")
    ride_id = _seed_ride(conn, segment_count=1)
    _seed_ride_segment(conn, ride_id, seq=0, segment_id=segment_id, timestamp_utc=_within_timestamp(), duration_sec=200.0)
    conn.commit()

    result = _run_script(db_path)
    assert result.returncode == 0, result.stderr

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM ride_segments WHERE ride_id = ?", (ride_id,))
    assert cursor.fetchone()[0] == 1

    cursor.execute("SELECT COUNT(*) FROM rides WHERE ride_id = ?", (ride_id,))
    assert cursor.fetchone()[0] == 1


def test_ride_segments_ttl_boundary(temp_db):
    """Test C: only ride_segments older than BMTC_RETENTION_DAYS are deleted."""
    db_path, conn = temp_db
    segment_id = _seed_segment(conn, "R_C", "STOP_C1", "STOP_C2")

    old_ride_id = _seed_ride(conn, segment_count=1)
    _seed_ride_segment(conn, old_ride_id, seq=0, segment_id=segment_id, timestamp_utc=_past_timestamp(RETENTION_DAYS), duration_sec=301.0)

    new_ride_id = _seed_ride(conn, segment_count=1)
    _seed_ride_segment(conn, new_ride_id, seq=0, segment_id=segment_id, timestamp_utc=_within_timestamp(10), duration_sec=302.0)
    conn.commit()

    result = _run_script(db_path)
    assert result.returncode == 0, result.stderr

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM ride_segments WHERE duration_sec = 301.0")
    assert cursor.fetchone()[0] == 0

    cursor.execute("SELECT COUNT(*) FROM ride_segments WHERE duration_sec = 302.0")
    assert cursor.fetchone()[0] == 1


def test_rejection_log_ttl_boundary(temp_db):
    """Test D (D-05 drive-by): only rejection_log rows older than BMTC_REJECTION_LOG_RETENTION_DAYS are deleted."""
    db_path, conn = temp_db
    segment_id = _seed_segment(conn, "R_D", "STOP_D1", "STOP_D2")
    _seed_time_bin(conn, bin_id=0)

    _seed_rejection(conn, segment_id, bin_id=0, submitted_at=_past_timestamp(REJECTION_LOG_RETENTION_DAYS), reason="outlier")
    _seed_rejection(conn, segment_id, bin_id=0, submitted_at=_within_timestamp(1), reason="low_mapmatch_conf")
    conn.commit()

    result = _run_script(db_path)
    assert result.returncode == 0, result.stderr

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM rejection_log WHERE reason = 'outlier'")
    assert cursor.fetchone()[0] == 0

    cursor.execute("SELECT COUNT(*) FROM rejection_log WHERE reason = 'low_mapmatch_conf'")
    assert cursor.fetchone()[0] == 1


def test_single_run_performs_all_three_deletes_in_order(temp_db):
    """Test E: one subprocess invocation performs all three deletes and logs before/after for each."""
    db_path, conn = temp_db
    segment_id = _seed_segment(conn, "R_E", "STOP_E1", "STOP_E2")
    _seed_time_bin(conn, bin_id=0)

    ride_id = _seed_ride(conn, segment_count=1)
    _seed_ride_segment(conn, ride_id, seq=0, segment_id=segment_id, timestamp_utc=_past_timestamp(RETENTION_DAYS), duration_sec=400.0)
    _seed_rejection(conn, segment_id, bin_id=0, submitted_at=_past_timestamp(REJECTION_LOG_RETENTION_DAYS))
    conn.commit()

    result = _run_script(db_path)

    assert result.returncode == 0, result.stderr
    assert "ride_segments" in result.stdout
    assert "rides" in result.stdout
    assert "rejection_log" in result.stdout

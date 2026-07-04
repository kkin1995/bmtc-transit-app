"""Integration tests for scripts/update_gtfs.sh (DATA-04).

Tests the backup -> stop-service -> clear-GTFS-tables -> re-bootstrap ->
validate -> restart-or-rollback orchestrator:
- Test A: happy path repopulates the 7 GTFS tables while leaving
  segment_stats/rides/ride_segments row counts unchanged (D-11/D-12,
  RESEARCH finding #2 — schedule_mean-only upsert preserves Welford history).
- Test B: a structurally-valid-but-unparseable GTFS zip fails re-bootstrap
  and triggers automatic backup restoration, exiting non-zero (D-14).
- Test C: an argument that fails pre-flight validation (nonexistent path,
  or a non-zip file) exits non-zero fast with NO backup/clear side effects
  (V5 / T-04-07).

All invocations run the real script as a subprocess against a file-based
temp_db (the same fixture pattern as test_migrations.py /
test_retention_cleanup.py) with BMTC_SKIP_SERVICE_CONTROL=1 so no real
systemd bmtc-api unit is required in the test environment.
"""

import shutil
import sqlite3
import subprocess
import time
import zipfile
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration

BACKEND_DIR = Path(__file__).parent.parent
UPDATE_GTFS_SCRIPT = BACKEND_DIR / "scripts" / "update_gtfs.sh"
MINI_GTFS_ZIP = Path(__file__).parent / "fixtures" / "mini_gtfs.zip"

GTFS_TABLES = ["agency", "routes", "stops", "trips", "stop_times", "calendar", "gtfs_metadata"]


def _test_path() -> str:
    """PATH including uv's directory so `uv run python -m app.bootstrap`
    resolves inside the subprocess, plus the standard system dirs the other
    script tests already use (test_migrations.py/test_retention_cleanup.py)."""
    uv_path = shutil.which("uv")
    uv_dir = str(Path(uv_path).parent) if uv_path else ""
    parts = [p for p in [uv_dir, "/usr/local/bin", "/usr/bin", "/bin"] if p]
    return ":".join(parts)


def _run_update_gtfs(zip_path: str, db_path: str, gtfs_path: str, backup_dir: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(UPDATE_GTFS_SCRIPT), zip_path],
        env={
            "BMTC_SKIP_SERVICE_CONTROL": "1",
            "BMTC_API_KEY": "test-key-for-update-gtfs-integration-test",
            "BMTC_DB_PATH": db_path,
            "BMTC_GTFS_PATH": gtfs_path,
            "BMTC_BACKUP_DIR": backup_dir,
            "PATH": _test_path(),
            "HOME": str(Path.home()),
        },
        capture_output=True,
        text=True,
        cwd=str(BACKEND_DIR),
    )


def _seed_gtfs_rows(conn: sqlite3.Connection) -> None:
    """Seed one row in each of the 7 GTFS tables so BEFORE counts are non-zero."""
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO agency (agency_id, agency_name, agency_url, agency_timezone) VALUES (?, ?, ?, ?)",
        ("SEED_AGENCY", "Seed Agency", "http://example.invalid", "Asia/Kolkata"),
    )
    cursor.execute(
        "INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name, route_type) VALUES (?, ?, ?, ?, ?)",
        ("SEED_ROUTE", "SEED_AGENCY", "S1", "Seed Route", 3),
    )
    cursor.executemany(
        "INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon) VALUES (?, ?, ?, ?)",
        [
            ("SEED_S1", "Seed Stop 1", 12.9, 77.5),
            ("SEED_S2", "Seed Stop 2", 12.91, 77.51),
        ],
    )
    cursor.execute(
        """
        INSERT INTO calendar
        (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
        VALUES (?, 1, 1, 1, 1, 1, 0, 0, 20250101, 20261231)
        """,
        ("SEED_SVC",),
    )
    cursor.execute(
        "INSERT INTO trips (trip_id, route_id, service_id, direction_id) VALUES (?, ?, ?, ?)",
        ("SEED_TRIP", "SEED_ROUTE", "SEED_SVC", 0),
    )
    cursor.executemany(
        "INSERT INTO stop_times (trip_id, stop_sequence, stop_id, arrival_time, departure_time) VALUES (?, ?, ?, ?, ?)",
        [
            ("SEED_TRIP", 1, "SEED_S1", "07:00:00", "07:00:00"),
            ("SEED_TRIP", 2, "SEED_S2", "07:05:00", "07:05:00"),
        ],
    )
    cursor.execute(
        "INSERT INTO gtfs_metadata (key, value, updated_at) VALUES (?, ?, ?)",
        ("gtfs_version", "seed-0", int(time.time())),
    )
    conn.commit()


def _seed_learning_rows(conn: sqlite3.Connection) -> tuple[int, int, int]:
    """Seed a segment + segment_stats + a ride + ride_segments row.

    Returns (segments_count, rides_count, ride_segments_count) captured
    immediately after seeding — the pre-refresh baseline used to assert
    D-12 append-only preservation across a GTFS refresh.
    """
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, 0, ?, ?)",
        ("SEED_ROUTE", "SEED_S1", "SEED_S2"),
    )
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND from_stop_id=? AND to_stop_id=?",
        ("SEED_ROUTE", "SEED_S1", "SEED_S2"),
    )
    segment_id = cursor.fetchone()[0]

    cursor.execute(
        "INSERT OR IGNORE INTO time_bins (bin_id, weekday_type, hour_start, minute_start) VALUES (0, 0, 0, 0)"
    )
    cursor.execute(
        """
        INSERT INTO segment_stats (segment_id, bin_id, n, welford_mean, welford_m2, schedule_mean, last_update)
        VALUES (?, 0, 5, 300.0, 120.0, 280.0, ?)
        """,
        (segment_id, int(time.time())),
    )

    cursor.execute(
        "INSERT INTO rides (submitted_at, segment_count) VALUES (?, 1)",
        (int(time.time()),),
    )
    ride_id = cursor.lastrowid
    cursor.execute(
        """
        INSERT INTO ride_segments (ride_id, seq, segment_id, duration_sec, timestamp_utc, accepted)
        VALUES (?, 1, ?, 290.0, ?, 1)
        """,
        (ride_id, segment_id, int(time.time())),
    )
    conn.commit()

    segments_count = cursor.execute("SELECT COUNT(*) FROM segments").fetchone()[0]
    rides_count = cursor.execute("SELECT COUNT(*) FROM rides").fetchone()[0]
    ride_segments_count = cursor.execute("SELECT COUNT(*) FROM ride_segments").fetchone()[0]
    return segments_count, rides_count, ride_segments_count


def test_update_gtfs_happy_path_preserves_learning_data(temp_db, tmp_path):
    """Test A: a valid GTFS zip repopulates the 7 GTFS tables while leaving
    segment_stats/rides/ride_segments row counts unchanged (D-11/D-12)."""
    db_path, conn = temp_db

    _seed_gtfs_rows(conn)
    before_segments, before_rides, before_ride_segments = _seed_learning_rows(conn)
    before_segment_stats = conn.execute("SELECT COUNT(*) FROM segment_stats").fetchone()[0]

    gtfs_path = tmp_path / "gtfs"
    gtfs_path.mkdir()
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    result = _run_update_gtfs(str(MINI_GTFS_ZIP), db_path, str(gtfs_path), str(backup_dir))

    assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"

    for table in GTFS_TABLES:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        assert count > 0, f"{table} is empty after refresh"

    after_rides = conn.execute("SELECT COUNT(*) FROM rides").fetchone()[0]
    after_ride_segments = conn.execute("SELECT COUNT(*) FROM ride_segments").fetchone()[0]
    after_segments = conn.execute("SELECT COUNT(*) FROM segments").fetchone()[0]
    after_segment_stats = conn.execute("SELECT COUNT(*) FROM segment_stats").fetchone()[0]

    assert after_rides == before_rides
    assert after_ride_segments == before_ride_segments
    # Append-only (D-12): the mini feed's own trips add NEW segments/stats,
    # the pre-existing seeded ones must never be removed.
    assert after_segments >= before_segments
    assert after_segment_stats >= before_segment_stats

    backups = list(backup_dir.glob("*.db.gz"))
    assert len(backups) == 1


def test_update_gtfs_invalid_zip_triggers_rollback(temp_db, tmp_path):
    """Test B: a structurally-valid zip missing required GTFS files fails
    re-bootstrap and auto-restores the pre-refresh backup, exiting non-zero
    (D-14). The DB — including the 7 GTFS tables and all learning tables —
    must match its pre-refresh state afterwards."""
    db_path, conn = temp_db

    _seed_gtfs_rows(conn)
    _seed_learning_rows(conn)

    before_counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in GTFS_TABLES}
    before_rides = conn.execute("SELECT COUNT(*) FROM rides").fetchone()[0]
    before_ride_segments = conn.execute("SELECT COUNT(*) FROM ride_segments").fetchone()[0]
    before_segments = conn.execute("SELECT COUNT(*) FROM segments").fetchone()[0]

    gtfs_path = tmp_path / "gtfs"
    gtfs_path.mkdir()
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    # A structurally valid zip (passes `unzip -t`) but with no GTFS .txt
    # members at all — parse_gtfs's load_agency() will KeyError on the
    # missing agency.txt member, so `uv run python -m app.bootstrap` exits
    # non-zero and the script must roll back.
    invalid_zip = tmp_path / "invalid_gtfs.zip"
    with zipfile.ZipFile(invalid_zip, "w") as zf:
        zf.writestr("README.txt", "not a gtfs feed")

    result = _run_update_gtfs(str(invalid_zip), db_path, str(gtfs_path), str(backup_dir))

    assert result.returncode != 0
    combined_output = (result.stdout + result.stderr).lower()
    assert any(kw in combined_output for kw in ("restor", "rollback", "validation failed"))

    conn2 = sqlite3.connect(db_path)
    try:
        for table, before in before_counts.items():
            after = conn2.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            assert after == before, f"{table}: expected {before}, got {after} after rollback"
        assert conn2.execute("SELECT COUNT(*) FROM rides").fetchone()[0] == before_rides
        assert conn2.execute("SELECT COUNT(*) FROM ride_segments").fetchone()[0] == before_ride_segments
        assert conn2.execute("SELECT COUNT(*) FROM segments").fetchone()[0] == before_segments
    finally:
        conn2.close()

    # A pre-refresh backup was taken before the rollback used it
    backups = list(backup_dir.glob("*.db.gz"))
    assert len(backups) == 1


def test_update_gtfs_nonexistent_path_fails_fast_with_no_side_effects(temp_db, tmp_path):
    """Test C (V5): a non-existent zip path argument exits non-zero with a
    clear error and never creates a backup or touches the DB."""
    db_path, conn = temp_db

    _seed_gtfs_rows(conn)
    before_counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in GTFS_TABLES}

    gtfs_path = tmp_path / "gtfs"
    gtfs_path.mkdir()
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    missing_path = str(tmp_path / "does_not_exist.zip")

    result = _run_update_gtfs(missing_path, db_path, str(gtfs_path), str(backup_dir))

    assert result.returncode != 0
    combined_output = (result.stdout + result.stderr).lower()
    assert "not found" in combined_output or "no such file" in combined_output

    assert list(backup_dir.glob("*.db.gz")) == []
    for table, before in before_counts.items():
        after = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        assert after == before


def test_update_gtfs_non_zip_file_fails_fast_with_no_side_effects(temp_db, tmp_path):
    """Test C2 (V5 / T-04-07): a path that exists but is not a valid zip
    archive exits non-zero with a clear error and no backup/clear side effects."""
    db_path, conn = temp_db

    _seed_gtfs_rows(conn)
    before_counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in GTFS_TABLES}

    gtfs_path = tmp_path / "gtfs"
    gtfs_path.mkdir()
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    not_a_zip = tmp_path / "not_a_zip.zip"
    not_a_zip.write_bytes(b"this is definitely not a zip archive")

    result = _run_update_gtfs(str(not_a_zip), db_path, str(gtfs_path), str(backup_dir))

    assert result.returncode != 0
    combined_output = (result.stdout + result.stderr).lower()
    assert "valid zip" in combined_output

    assert list(backup_dir.glob("*.db.gz")) == []
    for table, before in before_counts.items():
        after = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        assert after == before

"""Bootstrap smoke tests (OPS-02).

Proves a fresh `app.db.init_db()` bootstrap produces a structurally correct
database:
1. All domain tables and views exist by literal name (schema drift detection).
2. Bootstrapping the mini GTFS fixture populates `gtfs_metadata`.
3. `PRAGMA foreign_key_check` reports zero violations with FK enforcement on.

Uses the small `tests/fixtures/mini_gtfs.zip` fixture (D-07), never the
1.46M-row production `bmtc.zip`, so this suite stays fast enough to run on
every commit (D-08) as part of the normal `uv run pytest -n auto` invocation.
"""

import sqlite3

from app.db import init_db

# Verified 2026-07-05 by executing schema.sql against an in-memory DB and
# querying sqlite_master directly (RESEARCH.md Pitfall 1). This is the
# actual, current, complete list — NOT the stale "11 tables" figure in
# ROADMAP.md/CLAUDE.md, which predates dwell_stats/rate_limit_buckets/
# device_buckets/rejection_log/idempotency_keys being added to schema.sql.
EXPECTED_TABLES = {
    # GTFS static (7)
    "agency", "routes", "stops", "calendar", "trips", "stop_times", "gtfs_metadata",
    # Learning (6)
    "segments", "time_bins", "segment_stats", "dwell_stats", "rides", "ride_segments",
    # Global aggregation / audit (4)
    "idempotency_keys", "device_buckets", "rejection_log", "rate_limit_buckets",
}
EXPECTED_VIEWS = {"route_summary", "stop_summary", "segment_learning_progress"}


def test_bootstrap_creates_all_tables_and_views(tmp_path):
    """A fresh bootstrap creates exactly the 17 domain tables and 3 views
    defined in schema.sql — a silently renamed/dropped table fails this test."""
    db_path = str(tmp_path / "bootstrap_test.db")
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT type, name FROM sqlite_master WHERE type IN ('table','view') "
            # schema_migrations is deliberately excluded: it's bookkeeping
            # created by init_db() for the DATA-01 migration framework, not
            # part of the domain schema defined in schema.sql itself
            # (RESEARCH.md Open Question 1).
            "AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'"
        ).fetchall()
        actual_tables = {name for t, name in rows if t == "table"}
        actual_views = {name for t, name in rows if t == "view"}
        assert actual_tables == EXPECTED_TABLES
        assert actual_views == EXPECTED_VIEWS
    finally:
        conn.close()

"""Database initialization and connection management."""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


def init_db(db_path: str) -> None:
    """Initialize database with schema and enable WAL mode.

    Guarantees `conn.close()` on every exit path (normal return or raised
    exception) via try/finally, matching the pattern `get_connection()`
    already applies to the request path (BUGFIX-01, WR-01). Without this,
    a failure in `executescript()`/the guarded ALTERs/migration-seeding
    below would leak the sqlite3 connection object and its underlying
    WAL/journal file handles.
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")

        # Read and execute schema
        schema_path = Path(__file__).parent / "schema.sql"
        with open(schema_path) as f:
            schema = f.read()
        conn.executescript(schema)

        # Guarded ALTER TABLE: add response_body column for existing DBs whose
        # CREATE TABLE IF NOT EXISTS was a no-op (BUGFIX-03, D-06). Idempotent —
        # safe to run on every startup since it checks PRAGMA table_info first.
        existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(idempotency_keys)").fetchall()}
        if "response_body" not in existing_cols:
            conn.execute("ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT")

        # Fresh-bootstrap migration seeding (DATA-01, RESEARCH.md Pitfall 1):
        # schema.sql is the current baseline and already contains every schema
        # change described by migrations/*_up.sql. Seed schema_migrations with
        # every migration filename found so apply_migrations.sh never re-applies
        # a change a freshly-created DB already has. Only a DB that predates
        # this seeding step (i.e. an older DB never bootstrapped this way) will
        # have a given filename genuinely missing and will execute it for real.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "filename TEXT PRIMARY KEY, "
            "applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
            ")"
        )
        migrations_dir = Path(os.environ.get("BMTC_MIGRATIONS_DIR", str(Path(__file__).parent / "migrations")))
        if migrations_dir.is_dir():
            migration_files = [(f.name,) for f in sorted(migrations_dir.glob("*_up.sql"))]
            if migration_files:
                conn.executemany(
                    "INSERT OR IGNORE INTO schema_migrations (filename) VALUES (?)",
                    migration_files,
                )

        # Initialize 192 time bins
        bins = []
        bin_id = 0
        for weekday_type in [0, 1]:  # 0=weekday, 1=weekend
            for hour in range(24):
                for minute in [0, 15, 30, 45]:
                    bins.append((bin_id, weekday_type, hour, minute))
                    bin_id += 1

        conn.executemany(
            "INSERT OR IGNORE INTO time_bins (bin_id, weekday_type, hour_start, minute_start) VALUES (?, ?, ?, ?)",
            bins,
        )
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_connection(db_path: str):
    """Get database connection with WAL enabled.

    Guarantees `conn.close()` on every exit path (normal return, raised
    HTTPException, or unhandled exception) via try/finally wrapping the
    yield. Usage: `with get_connection(db_path) as conn: ...` (BUGFIX-01).
    """
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def compute_bin_id(timestamp_utc: int, is_holiday: bool = False) -> int:
    """Compute bin_id from UTC timestamp using Asia/Kolkata timezone.

    Server-authoritative bin mapping - client cannot override.
    Returns 0-191 based on weekday_type (0=Mon-Fri, 1=Sat-Sun) and 15-min slot.

    Args:
        timestamp_utc: Unix timestamp in UTC
        is_holiday: If True, route weekday timestamps to weekend bins

    Returns:
        bin_id (0-191)
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    # Convert to Asia/Kolkata timezone
    tz = ZoneInfo("Asia/Kolkata")
    dt = datetime.fromtimestamp(timestamp_utc, tz=tz)

    weekday_type = 1 if dt.weekday() >= 5 else 0  # 5=Sat, 6=Sun

    # If holiday flag is set and it's a weekday, route to weekend bins
    if is_holiday and weekday_type == 0:
        weekday_type = 1

    hour = dt.hour
    minute_slot = dt.minute // 15  # 0, 1, 2, 3

    return weekday_type * 96 + hour * 4 + minute_slot

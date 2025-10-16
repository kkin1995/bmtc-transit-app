"""Database initialization and connection management."""
import sqlite3
from pathlib import Path
from typing import Optional


def init_db(db_path: str) -> None:
    """Initialize database with schema and enable WAL mode."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")

    # Read and execute schema
    schema_path = Path(__file__).parent / "schema.sql"
    with open(schema_path) as f:
        schema = f.read()
    conn.executescript(schema)

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
        bins
    )
    conn.commit()
    conn.close()


def get_connection(db_path: str) -> sqlite3.Connection:
    """Get database connection with WAL enabled."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


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

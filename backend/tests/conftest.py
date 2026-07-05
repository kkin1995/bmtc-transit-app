"""Pytest configuration and fixtures for test isolation."""

import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient

# `Settings.api_key` has no default (BMTC_API_KEY is required). Tests that don't
# request the `test_env`/`test_settings` fixtures were silently relying on a
# developer's local, gitignored `backend/.env` to supply it — passing locally but
# failing in CI, which has no `.env` (surfaced by adding CI in OPS-03). Set a
# process-wide fallback once, before any test imports Settings; monkeypatch-based
# per-test overrides in `test_env` still take precedence and unwind to this value.
os.environ.setdefault("BMTC_API_KEY", "test-key-conftest-default-00000000000000")


# ==============================================================================
# Settings Isolation Fixtures
# ==============================================================================


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Clear settings cache before and after each test for complete isolation.

    This fixture runs automatically for ALL tests to prevent settings cache
    contamination between tests, which was causing the test suite to fail
    when run together.
    """
    from app.config import get_settings

    # Clear cache before test
    get_settings.cache_clear()

    yield

    # Clear cache after test
    get_settings.cache_clear()


@pytest.fixture
def test_env(monkeypatch) -> dict[str, str]:
    """Provide isolated test environment variables.

    Returns a dict of test environment variables that were set.
    Tests can override specific values after using this fixture.
    """
    env_vars = {
        "BMTC_API_KEY": "test-key-isolated-12345678901234567890",
        "BMTC_GTFS_PATH": "/tmp/gtfs",
        "BMTC_N0": "20",
        "BMTC_EMA_ALPHA": "0.1",
        "BMTC_HALF_LIFE_DAYS": "30",
        "BMTC_OUTLIER_SIGMA": "3.0",
        "BMTC_MAPMATCH_MIN_CONF": "0.7",
        "BMTC_MAX_SEGMENTS_PER_RIDE": "50",
        "BMTC_IDEMPOTENCY_TTL_HOURS": "24",
        "BMTC_RATE_LIMIT_ENABLED": "false",  # Disabled by default for faster tests
        "BMTC_RATE_LIMIT_PER_HOUR": "500",
    }

    for key, value in env_vars.items():
        monkeypatch.setenv(key, value)

    return env_vars


@pytest.fixture
def test_settings(test_env):
    """Provide fresh Settings instance with test environment variables.

    This fixture ensures settings are loaded from the test environment
    and the cache is cleared before and after.
    """
    from app.config import get_settings, Settings

    # Clear cache to force reload with test env vars
    get_settings.cache_clear()

    # Get fresh settings
    settings = Settings()

    yield settings

    # Clear cache after test
    get_settings.cache_clear()


# ==============================================================================
# Database Fixtures
# ==============================================================================


@pytest.fixture
def in_memory_db() -> Generator[sqlite3.Connection, None, None]:
    """Provide in-memory SQLite database for unit tests.

    This is the fastest database option and should be used for:
    - Pure unit tests
    - Tests that don't need persistence
    - Tests of learning algorithms (Welford, EMA, etc.)

    The database is automatically cleaned up after the test.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")

    # Load schema
    schema_path = Path(__file__).parent.parent / "app" / "schema.sql"
    with open(schema_path) as f:
        conn.executescript(f.read())

    yield conn

    conn.close()


@pytest.fixture
def temp_db(test_env, monkeypatch) -> Generator[tuple[str, sqlite3.Connection], None, None]:
    """Provide temporary file-based database for integration tests.

    This fixture:
    1. Creates a temp file database
    2. Loads the full schema
    3. Updates BMTC_DB_PATH environment variable
    4. Returns both the path and connection
    5. Cleans up the file after the test

    Use this for:
    - Integration tests
    - Tests that need FastAPI TestClient
    - Tests that verify database persistence
    """
    # Create temp file
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)  # Close file descriptor, sqlite will open it

    # Set environment variable for app to use
    monkeypatch.setenv("BMTC_DB_PATH", db_path)

    # Create connection and load schema
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

    schema_path = Path(__file__).parent.parent / "app" / "schema.sql"
    with open(schema_path) as f:
        conn.executescript(f.read())

    yield db_path, conn

    # Cleanup
    conn.close()
    try:
        os.unlink(db_path)
    except OSError:
        pass  # File may already be deleted


@pytest.fixture
def db_with_test_segment(temp_db) -> Generator[tuple[str, sqlite3.Connection, int], None, None]:
    """Provide database with a pre-populated test segment for integration tests.

    This fixture builds on temp_db and adds:
    - A test segment (ROUTE1, direction 0, STOP_A -> STOP_B)
    - Baseline segment_stats for all 192 time bins (schedule_mean=300.0)

    Returns: (db_path, connection, segment_id)

    Use this for tests that need a valid segment to work with.
    """
    db_path, conn = temp_db
    cursor = conn.cursor()

    # Insert test segment
    cursor.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
    )
    conn.commit()

    # Get segment_id
    cursor.execute(
        "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
        ("ROUTE1", 0, "STOP_A", "STOP_B"),
    )
    segment_id = cursor.fetchone()[0]

    # Insert baseline stats for all 192 bins
    for bin_id in range(192):
        cursor.execute(
            """
            INSERT OR IGNORE INTO segment_stats (segment_id, bin_id, schedule_mean, n, welford_mean, welford_m2)
            VALUES (?, ?, 300.0, 0, 0.0, 0.0)
            """,
            (segment_id, bin_id),
        )
    conn.commit()

    yield db_path, conn, segment_id

    # Cleanup handled by temp_db fixture


# ==============================================================================
# FastAPI Client Fixtures
# ==============================================================================


@pytest.fixture
def client(temp_db, test_settings) -> Generator[TestClient, None, None]:
    """Provide FastAPI TestClient with isolated database and settings.

    This is the main fixture for integration tests. It provides:
    - Fresh TestClient instance
    - Isolated temp database
    - Test settings loaded
    - Settings cache cleared before and after

    The client automatically handles:
    - App startup/shutdown
    - Database initialization (via lifespan)
    - Middleware loading

    Use this for testing API endpoints.
    """
    from app.main import app
    from app.config import get_settings

    # Clear settings cache to pick up test environment
    get_settings.cache_clear()

    # Create test client (lifespan will init DB)
    with TestClient(app) as test_client:
        yield test_client

    # Clear cache after test
    get_settings.cache_clear()


@pytest.fixture
def auth_headers(test_settings) -> dict[str, str]:
    """Provide authentication headers for protected endpoints.

    Returns headers dict with valid Bearer token from test settings.
    """
    return {"Authorization": f"Bearer {test_settings.api_key}"}


@pytest.fixture
def idempotency_headers(auth_headers) -> dict[str, str]:
    """Provide headers with both auth and idempotency key.

    Returns headers dict with Bearer token and unique idempotency key.
    Each call generates a new unique key.
    """
    import uuid
    return {
        **auth_headers,
        "Idempotency-Key": str(uuid.uuid4()),
    }


# ==============================================================================
# Test Data Factories
# ==============================================================================


@pytest.fixture
def sample_ride_data():
    """Provide factory function for creating test ride data.

    Returns a function that creates ride_summary POST payload with v1 schema.

    Usage:
        ride = sample_ride_data(
            route_id="335E",
            segments=[{"from_stop_id": "A", "to_stop_id": "B", "duration_sec": 300}]
        )
    """
    from datetime import datetime, timedelta, timezone

    def _factory(
        route_id: str = "ROUTE1",
        direction_id: int = 0,
        device_bucket: str | None = None,
        segments: list[dict] | None = None,
    ) -> dict:
        if segments is None:
            # Default: 1 hour ago in ISO-8601 format
            observed_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
            segments = [
                {
                    "from_stop_id": "STOP_A",
                    "to_stop_id": "STOP_B",
                    "duration_sec": 300.0,
                    "observed_at_utc": observed_at,
                    "mapmatch_conf": 0.95,
                }
            ]

        # Default device_bucket if not provided
        if device_bucket is None:
            device_bucket = "a" * 64  # Valid SHA256 hex string

        return {
            "route_id": route_id,
            "direction_id": direction_id,
            "device_bucket": device_bucket,
            "segments": segments,
        }

    return _factory


# ==============================================================================
# GTFS Test Data Fixtures
# ==============================================================================


@pytest.fixture
def db_with_test_routes(temp_db) -> Generator[tuple[str, sqlite3.Connection], None, None]:
    """Provide database with sample GTFS routes for route search tests.

    This fixture adds test routes that match the patterns expected by route search tests:
    - Hyphenated route names (335-E, 13-C)
    - Routes with "Kengeri" and "HAL" in long names
    - Various numeric prefixes (1, 13, 335, etc.)

    Use this for testing GTFS route discovery endpoints.
    """
    db_path, conn = temp_db
    cursor = conn.cursor()

    # Insert test agency
    cursor.execute(
        "INSERT OR IGNORE INTO agency (agency_id, agency_name, agency_url, agency_timezone) VALUES (?, ?, ?, ?)",
        ("BMTC", "Bangalore Metropolitan Transport Corporation", "http://mybmtc.com", "Asia/Kolkata")
    )

    # Insert test routes with patterns expected by tests
    test_routes = [
        # Hyphenated routes for normalization tests
        ("4715", "335-E", "Kengeri to Electronic City", 3, "BMTC"),
        ("4716", "335-A", "Kengeri to Banashankari", 3, "BMTC"),
        ("8821", "13-C", "City Market to HSR Layout", 3, "BMTC"),
        ("8822", "13-D", "HAL Airport to Whitefield", 3, "BMTC"),

        # Numeric routes for prefix matching
        ("1001", "1", "Majestic to Jayanagar", 3, "BMTC"),
        ("1010", "10", "Shivajinagar to Yeshwanthpur", 3, "BMTC"),
        ("1100", "100", "KR Market to Electronic City", 3, "BMTC"),
        ("2130", "213", "Marathahalli to HAL Layout", 3, "BMTC"),

        # Routes with "HAL" for partial match tests
        ("5001", "500A", "HAL Airport Express", 3, "BMTC"),
        ("5002", "501", "Indiranagar to HAL Stage", 3, "BMTC"),

        # Additional variety for pagination tests
        ("6001", "600", "Hebbal to Silk Board", 3, "BMTC"),
        ("7001", "700", "Yelahanka to Bannerghatta", 3, "BMTC"),
    ]

    cursor.executemany(
        "INSERT OR IGNORE INTO routes (route_id, route_short_name, route_long_name, route_type, agency_id) VALUES (?, ?, ?, ?, ?)",
        test_routes
    )
    conn.commit()

    yield db_path, conn

    # Cleanup handled by temp_db fixture


@pytest.fixture
def db_with_test_stop_routes(temp_db) -> Generator[tuple[str, sqlite3.Connection], None, None]:
    """Provide database with a served stop, an orphan stop, and 2 routes serving the stop.

    Used for GET /v1/stops/{stop_id} tests (API-01):
    - STOP_X: served by ROUTE_A1 and ROUTE_A2, which share `route_short_name` ("285")
      to exercise D-08 (routes list must NOT dedupe by short_name)
    - STOP_ORPHAN: exists in `stops` but has no trips/stop_times referencing it,
      to exercise D-10 (200 + routes: [], never 404)

    Use this for testing GET /v1/stops/{stop_id}.
    """
    db_path, conn = temp_db
    cursor = conn.cursor()

    # Insert test agency
    cursor.execute(
        "INSERT OR IGNORE INTO agency (agency_id, agency_name, agency_url, agency_timezone) VALUES (?, ?, ?, ?)",
        ("BMTC", "Bangalore Metropolitan Transport Corporation", "http://mybmtc.com", "Asia/Kolkata")
    )

    # Insert test calendar (service_id FK required by trips)
    cursor.execute(
        """
        INSERT OR IGNORE INTO calendar
        (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
        VALUES (?, 1, 1, 1, 1, 1, 0, 0, 20250101, 20261231)
        """,
        ("WEEKDAY",)
    )

    # Insert stops: STOP_X (served) and STOP_ORPHAN (no serving routes)
    cursor.executemany(
        "INSERT OR IGNORE INTO stops (stop_id, stop_name, stop_lat, stop_lon, zone_id) VALUES (?, ?, ?, ?, ?)",
        [
            ("STOP_X", "Test Junction", 12.9716, 77.5946, "ZONE_A"),
            ("STOP_ORPHAN", "Orphan Layout Stop", 12.9800, 77.6000, None),
        ]
    )

    # Insert 2 routes that share route_short_name "285" (D-08: not unique per route_id)
    cursor.executemany(
        "INSERT OR IGNORE INTO routes (route_id, route_short_name, route_long_name, route_type, agency_id) VALUES (?, ?, ?, ?, ?)",
        [
            ("ROUTE_A1", "285", "Route A1 Long Name", 3, "BMTC"),
            ("ROUTE_A2", "285", "Route A2 Variant Long Name", 3, "BMTC"),
        ]
    )

    # Insert trips: one per route, both serving STOP_X
    cursor.executemany(
        "INSERT OR IGNORE INTO trips (trip_id, route_id, service_id, trip_headsign, direction_id) VALUES (?, ?, ?, ?, ?)",
        [
            ("TRIP_A1", "ROUTE_A1", "WEEKDAY", "Headsign A1", 0),
            ("TRIP_A2", "ROUTE_A2", "WEEKDAY", "Headsign A2", 0),
        ]
    )

    # Insert stop_times linking both trips through STOP_X
    cursor.executemany(
        "INSERT OR IGNORE INTO stop_times (trip_id, stop_sequence, stop_id, arrival_time, departure_time) VALUES (?, ?, ?, ?, ?)",
        [
            ("TRIP_A1", 1, "STOP_X", "10:00:00", "10:00:00"),
            ("TRIP_A2", 1, "STOP_X", "10:05:00", "10:05:00"),
        ]
    )

    conn.commit()

    yield db_path, conn

    # Cleanup handled by temp_db fixture


@pytest.fixture
def db_with_test_route_branches(temp_db) -> Generator[tuple[str, sqlite3.Connection], None, None]:
    """Provide database with routes exercising GET /v1/routes/{route_id} (API-02).

    This fixture adds three routes:
    - ROUTE_M: two directions, one shape each (3 stops per direction) — the
      "normal" success-path case (D-01..D-03).
    - ROUTE_EMPTY: a route row with ZERO trips — exercises D-05 (200 +
      directions: [], never 404).
    - ROUTE_BRANCH: direction 0 has TWO shape_id variants — shape A used by
      3 trips (stops M_S1, M_S2, M_S3) and shape B used by 1 trip (stops
      M_S1, BR_S4) — exercises D-04 (most-common-shape selection). It has
      NO direction-1 trips, exercising D-23 (omit the zero-trip direction
      entirely rather than including it with stops: []).

    Use this for testing GET /v1/routes/{route_id}.
    """
    db_path, conn = temp_db
    cursor = conn.cursor()

    # Insert test agency
    cursor.execute(
        "INSERT OR IGNORE INTO agency (agency_id, agency_name, agency_url, agency_timezone) VALUES (?, ?, ?, ?)",
        ("BMTC", "Bangalore Metropolitan Transport Corporation", "http://mybmtc.com", "Asia/Kolkata")
    )

    # Insert test calendar (service_id FK required by trips)
    cursor.execute(
        """
        INSERT OR IGNORE INTO calendar
        (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
        VALUES (?, 1, 1, 1, 1, 1, 0, 0, 20250101, 20261231)
        """,
        ("WEEKDAY",)
    )

    # Insert routes: ROUTE_M (2 directions), ROUTE_EMPTY (0 trips), ROUTE_BRANCH (branch variants)
    cursor.executemany(
        "INSERT OR IGNORE INTO routes (route_id, route_short_name, route_long_name, route_type, agency_id) VALUES (?, ?, ?, ?, ?)",
        [
            ("ROUTE_M", "M", "Route M Test Line", 3, "BMTC"),
            ("ROUTE_EMPTY", "EMPTY", "Route Empty Test Line", 3, "BMTC"),
            ("ROUTE_BRANCH", "BRANCH", "Route Branch Test Line", 3, "BMTC"),
        ]
    )

    # Insert stops used by ROUTE_M and ROUTE_BRANCH
    cursor.executemany(
        "INSERT OR IGNORE INTO stops (stop_id, stop_name, stop_lat, stop_lon, zone_id) VALUES (?, ?, ?, ?, ?)",
        [
            ("M_S1", "M Stop 1", 12.90, 77.48, None),
            ("M_S2", "M Stop 2", 12.93, 77.52, None),
            ("M_S3", "M Stop 3", 12.97, 77.57, None),
            ("BR_S4", "Branch Stop 4", 12.99, 77.60, None),
        ]
    )

    # ROUTE_M: direction 0 (M_S1 -> M_S2 -> M_S3), direction 1 (M_S3 -> M_S2 -> M_S1)
    cursor.executemany(
        "INSERT OR IGNORE INTO trips (trip_id, route_id, service_id, trip_headsign, direction_id, shape_id) VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("TRIP_M_D0", "ROUTE_M", "WEEKDAY", "M Direction 0", 0, "M_SHAPE_0"),
            ("TRIP_M_D1", "ROUTE_M", "WEEKDAY", "M Direction 1", 1, "M_SHAPE_1"),
        ]
    )
    cursor.executemany(
        "INSERT OR IGNORE INTO stop_times (trip_id, stop_sequence, stop_id, arrival_time, departure_time) VALUES (?, ?, ?, ?, ?)",
        [
            ("TRIP_M_D0", 1, "M_S1", "08:00:00", "08:00:00"),
            ("TRIP_M_D0", 2, "M_S2", "08:10:00", "08:10:00"),
            ("TRIP_M_D0", 3, "M_S3", "08:20:00", "08:20:00"),
            ("TRIP_M_D1", 1, "M_S3", "09:00:00", "09:00:00"),
            ("TRIP_M_D1", 2, "M_S2", "09:10:00", "09:10:00"),
            ("TRIP_M_D1", 3, "M_S1", "09:20:00", "09:20:00"),
        ]
    )

    # ROUTE_BRANCH: direction 0 only. Shape A (3 trips: M_S1, M_S2, M_S3) is the
    # most-common shape; shape B (1 trip: M_S1, BR_S4) is the minority variant.
    cursor.executemany(
        "INSERT OR IGNORE INTO trips (trip_id, route_id, service_id, trip_headsign, direction_id, shape_id) VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("TRIP_BR_A1", "ROUTE_BRANCH", "WEEKDAY", "Branch Shape A", 0, "BRANCH_SHAPE_A"),
            ("TRIP_BR_A2", "ROUTE_BRANCH", "WEEKDAY", "Branch Shape A", 0, "BRANCH_SHAPE_A"),
            ("TRIP_BR_A3", "ROUTE_BRANCH", "WEEKDAY", "Branch Shape A", 0, "BRANCH_SHAPE_A"),
            ("TRIP_BR_B1", "ROUTE_BRANCH", "WEEKDAY", "Branch Shape B", 0, "BRANCH_SHAPE_B"),
        ]
    )
    cursor.executemany(
        "INSERT OR IGNORE INTO stop_times (trip_id, stop_sequence, stop_id, arrival_time, departure_time) VALUES (?, ?, ?, ?, ?)",
        [
            ("TRIP_BR_A1", 1, "M_S1", "10:00:00", "10:00:00"),
            ("TRIP_BR_A1", 2, "M_S2", "10:10:00", "10:10:00"),
            ("TRIP_BR_A1", 3, "M_S3", "10:20:00", "10:20:00"),
            ("TRIP_BR_A2", 1, "M_S1", "11:00:00", "11:00:00"),
            ("TRIP_BR_A2", 2, "M_S2", "11:10:00", "11:10:00"),
            ("TRIP_BR_A2", 3, "M_S3", "11:20:00", "11:20:00"),
            ("TRIP_BR_A3", 1, "M_S1", "12:00:00", "12:00:00"),
            ("TRIP_BR_A3", 2, "M_S2", "12:10:00", "12:10:00"),
            ("TRIP_BR_A3", 3, "M_S3", "12:20:00", "12:20:00"),
            ("TRIP_BR_B1", 1, "M_S1", "13:00:00", "13:00:00"),
            ("TRIP_BR_B1", 2, "BR_S4", "13:10:00", "13:10:00"),
        ]
    )

    conn.commit()

    yield db_path, conn

    # Cleanup handled by temp_db fixture


@pytest.fixture
def client_with_routes(db_with_test_routes, test_settings) -> Generator[TestClient, None, None]:
    """Provide FastAPI TestClient with GTFS route data loaded.

    This fixture combines db_with_test_routes and test_settings to provide
    a client ready for testing route discovery endpoints.

    Use this for testing:
    - GET /v1/routes
    - GET /v1/routes/search
    - Any endpoint that queries GTFS routes table
    """
    from app.main import app
    from app.config import get_settings

    # Clear settings cache to pick up test environment
    get_settings.cache_clear()

    # Create test client (lifespan will init DB)
    with TestClient(app) as test_client:
        yield test_client

    # Clear cache after test
    get_settings.cache_clear()


# ==============================================================================
# Test Isolation Verification
# ==============================================================================


@pytest.fixture(scope="session", autouse=True)
def verify_test_isolation():
    """Session-scoped fixture that runs once to verify isolation setup.

    This fixture prints diagnostic information about the test environment
    to help debug isolation issues.
    """
    print("\n" + "=" * 70)
    print("Test Isolation Configuration")
    print("=" * 70)
    print(f"pytest-xdist: installed")
    print(f"pytest-randomly: installed")
    print(f"Distribution strategy: loadfile (tests per-file in same worker)")
    print(f"Settings cache: cleared before/after each test")
    print(f"Database: temp file per test (integration) or :memory: (unit)")
    print("=" * 70 + "\n")

    yield

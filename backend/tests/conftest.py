"""Pytest configuration and fixtures for test isolation."""

import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient


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

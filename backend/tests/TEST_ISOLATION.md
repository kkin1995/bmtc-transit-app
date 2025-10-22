# Test Isolation Strategy

This document describes the test isolation strategy implemented for the BMTC Transit API test suite to ensure all 47 tests can run reliably in parallel without flakiness.

## Problem Statement

Prior to implementing this strategy, tests would:
- ✅ Pass individually per module
- ❌ Fail when run together in the full suite

**Root Cause**: Settings cache contamination from `@lru_cache` on `get_settings()` in `app/config.py` created a global singleton that persisted across tests.

## Solution Overview

The isolation strategy uses three layers:

1. **Settings Isolation** - Clear settings cache before/after each test
2. **Database Isolation** - Separate in-memory or temp file DBs per test
3. **Environment Isolation** - Use monkeypatch for environment variables

## Implementation Details

### 1. Settings Isolation

**File**: `tests/conftest.py`

```python
@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Clear settings cache before and after each test for complete isolation."""
    from app.config import get_settings

    # Clear cache before test
    get_settings.cache_clear()

    yield

    # Clear cache after test
    get_settings.cache_clear()
```

**Key Points**:
- `autouse=True` ensures this runs for ALL tests automatically
- Clears cache both before and after test execution
- Prevents settings from one test affecting another

### 2. Database Isolation

**Strategy**: Different database fixtures for different test types

#### Unit Tests - In-Memory Database

```python
@pytest.fixture
def in_memory_db() -> Generator[sqlite3.Connection, None, None]:
    """Provide in-memory SQLite database for unit tests."""
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")

    # Load schema
    schema_path = Path(__file__).parent.parent / "app" / "schema.sql"
    with open(schema_path) as f:
        conn.executescript(f.read())

    yield conn
    conn.close()
```

**Use for**:
- Pure unit tests (learning algorithms, validators)
- Tests that don't need persistence
- Fastest execution time

#### Integration Tests - Temp File Database

```python
@pytest.fixture
def temp_db(test_env, monkeypatch) -> Generator[tuple[str, sqlite3.Connection], None, None]:
    """Provide temporary file-based database for integration tests."""
    # Create temp file
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)

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
        pass
```

**Use for**:
- Integration tests with FastAPI TestClient
- Tests that verify database persistence
- API endpoint tests

### 3. Environment Isolation

```python
@pytest.fixture
def test_env(monkeypatch) -> dict[str, str]:
    """Provide isolated test environment variables."""
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
```

**Key Points**:
- Uses pytest's `monkeypatch` fixture (automatic cleanup)
- Sets consistent test environment for all tests
- Individual tests can override specific values if needed

## Parallel Execution Configuration

**File**: `pytest.ini`

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*

# Pytest-xdist configuration for parallel execution
# --dist loadfile: All tests in a file run in the same worker (avoids cross-file contamination)
# -n auto: Use number of CPU cores
addopts =
    -v
    --strict-markers
    --tb=short
    --dist=loadfile
    -n=auto

# Test markers
markers =
    unit: Unit tests (fast, in-memory DB, no I/O)
    integration: Integration tests (temp DB, FastAPI client, slower)
    slow: Tests that take longer than 1 second

# Logging
log_cli = false
log_cli_level = ERROR
```

**Critical Settings**:
- `--dist=loadfile`: All tests in one file run in the same worker process
  - Prevents cross-file contamination
  - Maintains test execution order within files
  - Better for tests with shared fixtures
- `-n=auto`: Uses all available CPU cores (16 workers on typical dev machine)

## Dependencies

**File**: `pyproject.toml`

```toml
[dependency-groups]
dev = [
    "pytest>=7.4.3",
    "httpx>=0.25.2",
    "pytest-cov>=7.0.0",
    "coverage>=7.10.7",
    "pytest-xdist>=3.5.0",
    "pytest-randomly>=3.15.0",
]
```

**Key packages**:
- `pytest-xdist`: Enables parallel test execution
- `pytest-randomly`: Randomizes test order to catch order-dependent bugs

## Test Suite Structure

```
backend/tests/
├── conftest.py                     # Isolation fixtures (settings, DB, client)
├── test_learning.py                # Unit tests (9 tests)
│   └── Uses: Pure functions, no DB
├── test_integration.py             # Integration tests (8 tests)
│   └── Uses: client fixture, temp_db
├── test_idempotency.py             # Unit/Integration tests (6 tests)
│   └── Uses: temp_db fixture
├── test_global_aggregation.py      # Integration tests (10 tests)
│   └── Uses: client fixture, temp_db
└── test_rate_limit.py              # Integration tests (14 tests)
    └── Uses: rate_limit_client fixture (custom config)
```

## Running Tests

### Full Suite (Recommended)

```bash
cd backend
uv run pytest -n auto --dist loadfile -q
```

**Expected output**:
```
47 passed in ~9-10 seconds
```

### Individual Module

```bash
uv run pytest tests/test_learning.py -v          # Unit tests only
uv run pytest tests/test_integration.py -v       # Integration tests
```

### Single Test

```bash
uv run pytest tests/test_integration.py::test_health_check -v
```

### With Coverage

```bash
uv run pytest -n auto --dist loadfile --cov=app --cov-report=term-missing
```

## Verification

To verify isolation is working:

```bash
# Run suite 3 times consecutively - should have zero flakes
uv run pytest -n auto --dist loadfile -q
uv run pytest -n auto --dist loadfile -q
uv run pytest -n auto --dist loadfile -q
```

**Success criteria**:
- All three runs show `47 passed`
- No intermittent failures
- Consistent execution time (~9-10 seconds)

## Common Pitfalls to Avoid

### 1. Hardcoded Timestamps

❌ **Bad** (fails after Oct 22, 2025):
```python
dt = datetime(2025, 10, 13, 9, 0, 0, tzinfo=tz)
timestamp = int(dt.timestamp())
```

✅ **Good** (always within 7-day validation window):
```python
tz = ZoneInfo("Asia/Kolkata")
now = datetime.now(tz)
dt = now.replace(hour=9, minute=0, second=0, microsecond=0)
timestamp = int(dt.timestamp())
```

### 2. Shared State Without Cleanup

❌ **Bad**:
```python
def test_example():
    settings = get_settings()
    # No cache clear - affects next test
```

✅ **Good** (handled automatically by `clear_settings_cache` fixture):
```python
def test_example(test_settings):
    # Settings automatically isolated
    pass
```

### 3. Database Connection Reuse

❌ **Bad**:
```python
# Reusing same connection across tests
conn = sqlite3.connect("shared.db")
```

✅ **Good**:
```python
def test_example(temp_db):
    db_path, conn = temp_db
    # Fresh DB per test
```

### 4. Environment Variable Leaks

❌ **Bad**:
```python
os.environ["BMTC_API_KEY"] = "test-key"
# Leaks to other tests
```

✅ **Good**:
```python
def test_example(monkeypatch):
    monkeypatch.setenv("BMTC_API_KEY", "test-key")
    # Automatically cleaned up
```

## Debugging Flaky Tests

If a test fails intermittently:

1. **Run it multiple times**:
   ```bash
   uv run pytest tests/test_module.py::test_flaky -v --count=10
   ```

2. **Check for shared state**:
   - Look for module-level variables
   - Check if test modifies global state
   - Verify fixtures have proper cleanup

3. **Isolate the test**:
   ```bash
   # Run test in complete isolation
   uv run pytest tests/test_module.py::test_flaky -v --forked
   ```

4. **Check settings cache**:
   ```python
   # Add to test
   from app.config import get_settings
   print(f"Settings API key: {get_settings().api_key}")
   # Should always be test key, never prod
   ```

## Test Performance

**Current performance** (16 workers, loadfile distribution):
- Total tests: 47
- Execution time: ~9-10 seconds
- Average per test: ~200ms
- Workers: 16 (auto-detected CPU cores)

**Breakdown by module**:
- `test_learning.py`: 9 tests (unit, fastest)
- `test_integration.py`: 8 tests (integration, medium)
- `test_idempotency.py`: 6 tests (integration, medium)
- `test_global_aggregation.py`: 10 tests (integration, medium)
- `test_rate_limit.py`: 14 tests (integration, slowest due to concurrency tests)

## Future Improvements

1. **Test markers for selective execution**:
   ```bash
   uv run pytest -m unit        # Only unit tests
   uv run pytest -m integration  # Only integration tests
   ```

2. **Coverage enforcement**:
   ```bash
   uv run pytest --cov=app --cov-fail-under=85
   ```

3. **Mutation testing**:
   - Add `mutmut` to verify test quality
   - Ensure tests actually catch bugs

4. **Property-based testing**:
   - Add `hypothesis` for fuzz testing
   - Test edge cases automatically

## References

- [pytest-xdist documentation](https://pytest-xdist.readthedocs.io/)
- [pytest fixtures](https://docs.pytest.org/en/stable/fixture.html)
- [Test isolation patterns](https://docs.pytest.org/en/stable/goodpractices.html)
- [BMTC API Test Suite](../tests/)

## Maintenance

This isolation strategy should be maintained by:

1. **Always using fixtures** from `conftest.py`
2. **Never sharing state** between tests
3. **Testing isolation** by running suite 3+ times
4. **Updating this doc** when changing isolation strategy

Last updated: 2025-10-22

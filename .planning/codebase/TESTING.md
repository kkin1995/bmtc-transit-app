# Testing Strategy

**Analysis Date:** 2026-07-01

## Test Architecture

Tests live in `backend/tests/` and are co-located with the backend package, not inside `app/`. All configuration is in `backend/pytest.ini`. Fixtures are centralized in `backend/tests/conftest.py`.

Test types:
- **Unit tests** — pure Python functions, no DB, no network (marked `unit`)
- **Integration tests** — FastAPI `TestClient` + temp file SQLite DB (marked `integration`)
- **Alignment tests** — spec/contract verification against API behaviour

## Test Modules

| File | Tests | What it covers |
|------|-------|----------------|
| `tests/test_learning.py` | 9 | Welford/EMA algorithm correctness, outlier detection, blend weight computation |
| `tests/test_integration.py` | 8 | End-to-end POST → GET flow: `ride_summary` → `eta`; health and config endpoints |
| `tests/test_idempotency.py` | 6 | Idempotency key storage, replay detection, TTL expiry |
| `tests/test_idempotency_bodyhash.py` | 14 | Body hash verification (H1 security fix): 409 on tampered body |
| `tests/test_global_aggregation.py` | 10 | Outlier rejection, mapmatch_conf filtering, device bucket tracking, rejection_log |
| `tests/test_rate_limit.py` | 14 | Rate limiting: per-device bucket cap, header presence, enabled/disabled toggle |
| `tests/test_routes_search.py` | 31 | `GET /v1/routes/search`: normalized matching, hyphen/space handling, pagination, edge cases |
| `tests/test_api_v1_alignment.py` | 28 | V1.1 ETA response schema alignment: structured `segment`/`scheduled`/`prediction` fields |
| `tests/test_api_gtfs_alignment.py` | 39 | GTFS endpoints alignment: `/stops`, `/routes`, `/stops/{id}/schedule` |
| `tests/test_api_errors_alignment.py` | 23 | Error response format alignment: error/message/details shape, correct HTTP status codes |

**Total: 182 tests** across 10 files.

## Test Isolation Strategy

Three-layer isolation implemented in `backend/tests/conftest.py`:

### Layer 1: Settings Isolation

`clear_settings_cache` fixture is `autouse=True` — runs for every test automatically:

```python
@pytest.fixture(autouse=True)
def clear_settings_cache():
    from app.config import get_settings
    get_settings.cache_clear()   # before
    yield
    get_settings.cache_clear()   # after
```

Root cause this fixes: `@lru_cache` on `get_settings()` created a global singleton that leaked between tests when run together.

### Layer 2: Database Isolation

Two fixture variants depending on test type:

**Unit tests** — `in_memory_db` fixture:
```python
conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys = ON")
# schema.sql loaded from disk
```

**Integration tests** — `temp_db` fixture:
```python
fd, db_path = tempfile.mkstemp(suffix=".db")
monkeypatch.setenv("BMTC_DB_PATH", db_path)
conn = sqlite3.connect(db_path)
conn.execute("PRAGMA journal_mode = WAL")
# schema.sql loaded from disk
# cleanup: os.unlink(db_path) in teardown
```

**Pre-populated fixtures** built on top of `temp_db`:
- `db_with_test_segment` — adds a segment + 192 baseline bins (schedule_mean=300.0)
- `db_with_test_routes` — adds GTFS agency and 12 test routes for search tests

### Layer 3: Environment Isolation

`test_env` fixture uses `monkeypatch.setenv()` (auto-reverted on teardown):

```python
env_vars = {
    "BMTC_API_KEY": "test-key-isolated-12345678901234567890",
    "BMTC_RATE_LIMIT_ENABLED": "false",  # disabled for speed
    "BMTC_N0": "20",
    ...
}
```

Rate limiting is **disabled by default** in `test_env` for test speed. `test_rate_limit.py` uses a custom client fixture that re-enables it.

## Parallel Execution

Configuration in `backend/pytest.ini`:

```ini
addopts =
    -v
    --strict-markers
    --tb=short
    --dist=loadfile
    -n=auto
```

- `--dist=loadfile`: all tests within the same file run in the same worker process — prevents cross-file contamination, maintains intra-file order
- `-n=auto`: uses all available CPU cores (16 workers on a typical dev machine)
- `pytest-randomly`: randomizes test order within workers to catch order-dependent bugs

Expected execution time: ~9–10 seconds for full suite.

## Coverage

Coverage by area (from `CLAUDE.md` and test structure):

| Area | Coverage | Notes |
|------|----------|-------|
| Learning algorithms (Welford, EMA, blend, percentiles) | ~100% | `test_learning.py` covers all branches |
| API endpoints (ride_summary, eta, config, health) | ~90%+ | `test_integration.py` + alignment tests |
| DB operations (bin computation, stats UPSERT) | ~85%+ | Integration tests exercise DB layer |
| Idempotency handling | ~95%+ | Dedicated `test_idempotency.py` + `test_idempotency_bodyhash.py` |
| Rate limiting | ~95%+ | `test_rate_limit.py` with 14 cases |
| GTFS endpoints (stops, routes, schedule) | ~85%+ | `test_api_gtfs_alignment.py` (39 tests) |
| Error response format | ~90%+ | `test_api_errors_alignment.py` (23 tests) |

**Run coverage report:**
```bash
cd backend
uv run pytest -n auto --dist loadfile --cov=app --cov-report=term-missing
```

**Enforce minimum (not yet configured in CI, but recommended):**
```bash
uv run pytest --cov=app --cov-fail-under=85
```

## Key Fixtures

All fixtures defined in `backend/tests/conftest.py`:

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `clear_settings_cache` | function, autouse | Clears `@lru_cache` on `get_settings` before and after every test |
| `test_env` | function | Sets `BMTC_*` env vars via monkeypatch; returns dict of vars set |
| `test_settings` | function | Returns fresh `Settings()` instance after clearing cache; depends on `test_env` |
| `in_memory_db` | function | In-memory SQLite with schema loaded; for unit tests |
| `temp_db` | function | Temp file SQLite with WAL + schema; sets `BMTC_DB_PATH`; for integration tests |
| `db_with_test_segment` | function | Builds on `temp_db`; adds ROUTE1/STOP_A→STOP_B segment + 192 bins |
| `db_with_test_routes` | function | Builds on `temp_db`; adds 12 GTFS test routes for search tests |
| `client` | function | `TestClient(app)` using `temp_db` + `test_settings`; clears settings cache |
| `client_with_routes` | function | `TestClient(app)` using `db_with_test_routes`; for route search endpoint tests |
| `auth_headers` | function | `{"Authorization": "Bearer <test_key>"}` from `test_settings` |
| `idempotency_headers` | function | Auth headers + unique `Idempotency-Key: <uuid>` per call |
| `sample_ride_data` | function | Factory function returning `POST /v1/ride_summary` payload dict |
| `verify_test_isolation` | session, autouse | Prints isolation config diagnostics once per session |

**Factory fixture usage pattern:**
```python
def test_something(client, auth_headers, sample_ride_data):
    ride = sample_ride_data(route_id="335E", segments=[...])
    response = client.post("/v1/ride_summary", json=ride, headers=auth_headers)
```

## Running Tests

```bash
# Full suite (recommended — parallel, loadfile distribution)
cd backend
uv run pytest -n auto --dist loadfile -q

# Full suite with verbose output
uv run pytest -n auto --dist loadfile -v

# Individual module
uv run pytest tests/test_learning.py -v             # Unit tests (9)
uv run pytest tests/test_integration.py -v          # Integration tests (8)
uv run pytest tests/test_idempotency.py -v          # Idempotency (6)
uv run pytest tests/test_global_aggregation.py -v   # Outlier/device (10)
uv run pytest tests/test_rate_limit.py -v           # Rate limiting (14)
uv run pytest tests/test_routes_search.py -v        # Route search (31)
uv run pytest tests/test_api_v1_alignment.py -v     # V1.1 alignment (28)
uv run pytest tests/test_api_gtfs_alignment.py -v   # GTFS alignment (39)
uv run pytest tests/test_api_errors_alignment.py -v # Error format (23)

# Single test
uv run pytest tests/test_integration.py::test_health_check -v

# With coverage
uv run pytest -n auto --dist loadfile --cov=app --cov-report=term-missing

# By marker
uv run pytest -m unit        # Only unit tests
uv run pytest -m integration # Only integration tests
```

## Known Gaps

**Timestamp anti-pattern fixed:** Hardcoded datetime literals would fail after their date passed. Current tests use `datetime.now(tz) - timedelta(hours=1)` to stay within the 7-day validation window. See `backend/tests/TEST_ISOLATION.md` for the pattern to follow.

**Schedule endpoint coverage:** `GET /v1/stops/{stop_id}/schedule` involves complex GTFS 24h+ time handling; filtering is done in Python. Test coverage depends on the GTFS fixture data having `stop_times` rows, which `db_with_test_routes` does not populate.

**No property-based testing:** No `hypothesis` integration for fuzz testing edge cases in Welford/EMA algorithms or timestamp validation.

**No mutation testing:** `mutmut` is not configured; test quality is not verified by checking whether tests catch injected bugs.

**CI integration:** `pytest.ini` defines the configuration, but no CI pipeline (GitHub Actions, etc.) is present in the repository. Tests are run locally only.

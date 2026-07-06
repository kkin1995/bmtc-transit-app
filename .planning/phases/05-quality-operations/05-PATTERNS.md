# Phase 5: Quality & Operations - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 6 new files, 1 modified file
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/app/logging_config.py` | config/utility | transform (log record → JSON) | `backend/app/rate_limit.py` (module shape, logger usage) | role-match |
| `backend/app/main.py` (modified — add `TimingMiddleware` + `configure_logging()` call) | middleware/config | request-response | `backend/app/main.py:22-29` `APIVersionMiddleware` (existing middleware in same file) | exact |
| `backend/tests/test_bootstrap.py` | test | CRUD (schema/FK verification) | `backend/tests/test_gtfs_update.py` + `backend/tests/conftest.py` (`temp_db`/`in_memory_db` fixtures) | role-match |
| `backend/tests/test_timing_middleware.py` | test | request-response | `backend/tests/conftest.py` `client` fixture + existing middleware tests pattern | role-match |
| `backend/tests/perf/load_test.py` | utility/script (standalone, not pytest) | streaming/batch (concurrent HTTP load) | `backend/scripts/generate_sample_data.py` (standalone script shape) + `backend/tests/conftest.py` `db_with_test_segment` (seeding pattern) | role-match |
| `backend/tests/perf/results.txt` | data artifact | file-I/O | — (new, no analog — plain text output file) | no analog needed |
| `.github/workflows/ci.yml` | config | event-driven (push/PR trigger) | — (greenfield, no existing CI workflow in repo) | no analog |

## Pattern Assignments

### `backend/app/logging_config.py` (config/utility, transform)

**Analog:** `backend/app/rate_limit.py` (module docstring + top-of-file logger pattern), and `backend/app/main.py:19` for the module-logger convention.

**Imports pattern** (mirror `rate_limit.py` lines 1-16):
```python
"""Structured JSON logging configuration (OPS-04)."""

import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
```

**Core pattern — JsonFormatter + configure_logging()** (new; no direct analog exists in repo since no logging.Formatter subclass exists yet — synthesized from stdlib docs and RESEARCH.md Pattern 4):
```python
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {"message", "asctime"}

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.handlers.clear()
    root.addHandler(handler)
```

**Error handling pattern:** None needed — a formatter must not raise; use `default=str` in `json.dumps()` to avoid `TypeError` on non-serializable `extra=` values (mirrors defensive `try/except` style seen in `rate_limit.py:138-142`'s "fail open" philosophy — here the equivalent is "never fail the log line, never raise from `format()`").

---

### `backend/app/main.py` (modified — add `TimingMiddleware`)

**Analog:** `backend/app/main.py:22-29` (`APIVersionMiddleware`) — same file, same `BaseHTTPMiddleware` subclass shape.

**Existing pattern to mirror** (lines 22-29):
```python
class APIVersionMiddleware(BaseHTTPMiddleware):
    """Middleware to add X-API-Version header to all responses."""

    async def dispatch(self, request: Request, call_next):
        """Add X-API-Version header to response."""
        response = await call_next(request)
        response.headers["X-API-Version"] = "1"
        return response
```

**New `TimingMiddleware` (structurally same shape, but wraps `call_next` in try/finally** — required because it must log even on unhandled exceptions, unlike `APIVersionMiddleware`):
```python
class TimingMiddleware(BaseHTTPMiddleware):
    """Logs one JSON line per request (OPS-04). Must be app.add_middleware()'d
    LAST — after RateLimitMiddleware — to be truly outermost (Starlette
    reverses add_middleware() call order when building the stack)."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            access_logger.info(
                "request",
                extra={
                    "request_latency_ms": round(duration_ms, 2),
                    "method": request.method,
                    "path": request.url.path,
                    "status": status_code,
                },
            )
```

**Middleware registration pattern** (existing lines 90-105 show `add_middleware()` call order — CRITICAL: append `TimingMiddleware` AFTER the existing `RateLimitMiddleware` line, not before `CORSMiddleware`):
```python
app.add_middleware(CORSMiddleware, ...)
app.add_middleware(APIVersionMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(TimingMiddleware)   # added LAST = outermost (see RESEARCH.md Pitfall 2)
```

**Startup pattern** — `configure_logging()` must run at import time before first request, mirroring how `settings = get_settings()` (line 61) already runs at module level before `app = FastAPI(...)`:
```python
from app.logging_config import configure_logging
configure_logging()
```

**Existing `logger.info()` call to reuse as reference for `extra=` semantics** (line 51):
```python
logger.info(f"Startup cleanup: removed {deleted} expired idempotency keys")
```
Note: per RESEARCH.md Pitfall 3, this existing call currently emits nothing because the root logger has no handler — `configure_logging()` fixes this project-wide, not just for the new middleware.

---

### `backend/tests/test_bootstrap.py` (test, CRUD/schema verification)

**Analog:** `backend/tests/conftest.py` `in_memory_db`/`temp_db` fixtures (lines ~102-160) for the schema-loading + `PRAGMA foreign_keys = ON` pattern; `backend/tests/test_gtfs_update.py` for the "list of expected table names" + subprocess/fixture style used for GTFS-related verification.

**Fixture pattern to reuse directly** (`conftest.py` `in_memory_db`, lines 102-113):
```python
@pytest.fixture
def in_memory_db() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    schema_path = Path(__file__).parent.parent / "app" / "schema.sql"
    with open(schema_path) as f:
        conn.executescript(f.read())
    yield conn
    conn.close()
```

**Core pattern — literal table/view list against `sqlite_master`** (from RESEARCH.md Pattern 6, cross-referenced against `test_gtfs_update.py:34` `GTFS_TABLES` literal-list style):
```python
GTFS_TABLES = ["agency", "routes", "stops", "trips", "stop_times", "calendar", "gtfs_metadata"]
```
mirror this literal-list style for the full 17-table + 3-view set (see RESEARCH.md Pitfall 1 for the verified list — do NOT use the stale "11 tables" figure from CLAUDE.md/ROADMAP.md).

**FK-check pattern** (RESEARCH.md Pattern 5, matches `conftest.py`'s existing `PRAGMA foreign_keys = ON` precedent at lines 102, 139):
```python
def test_bootstrap_foreign_keys_valid(tmp_path):
    db_path = str(tmp_path / "bootstrap_test.db")
    from app.db import init_db
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")  # REQUIRED — no-op without this
        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        assert violations == []
    finally:
        conn.close()
```

**GTFS bootstrap fixture reuse:** `backend/tests/fixtures/mini_gtfs.zip` is already loaded via a pattern in `test_gtfs_update.py` (`_seed_all_time_bins` helper, lines 34-49) — `test_bootstrap.py` should call `app.gtfs_bootstrap.parse_gtfs()`/`app.bootstrap` against this same fixture rather than inventing new GTFS test data.

---

### `backend/tests/test_timing_middleware.py` (test, request-response)

**Analog:** `backend/tests/conftest.py` `client` fixture (lines ~204-230) — the standard `TestClient` + isolated-DB pattern used by all integration tests.

**Pattern to reuse** (`conftest.py` `client` fixture):
```python
@pytest.fixture
def client(temp_db, test_settings) -> Generator[TestClient, None, None]:
    from app.main import app
    from app.config import get_settings
    get_settings.cache_clear()
    with TestClient(app) as test_client:
        yield test_client
```

**Core test pattern** — use `caplog` (pytest's built-in log capture) against the `TestClient` fixture to assert the JSON line's shape and presence, including the 429 case (RESEARCH.md Pitfall 2's own regression check):
```python
def test_timing_middleware_logs_json_line(client, caplog):
    with caplog.at_level(logging.INFO, logger="app.access"):
        response = client.get("/v1/health")
    assert response.status_code == 200
    # assert a log record with request_latency_ms/method/path/status extras exists
```

**No analog for asserting rate-limit-short-circuit visibility** — this is new territory (RESEARCH.md Pitfall 2); write directly against the `RateLimitMiddleware` 429 path documented in `backend/app/rate_limit.py:286-310`.

---

### `backend/tests/perf/load_test.py` (utility/script, streaming/batch — NOT a pytest test)

**Analog 1 (script shape):** `backend/scripts/generate_sample_data.py` — standalone `if __name__ == "__main__":` script structure, argparse-free but demonstrates the "generate synthetic route/stop data" domain this load test also needs.

**Imports/structure pattern to mirror** (`generate_sample_data.py` lines 1-9, 66-71):
```python
#!/usr/bin/env python3
"""Generate sample ride data for testing."""

import random
import time
import json
...
if __name__ == "__main__":
    ...
```

**Analog 2 (DB seeding):** `backend/tests/conftest.py` `db_with_test_segment` fixture (lines 160-197) — the authoritative pattern for inserting a `segments` row + all-192-bin `segment_stats` rows, which `load_test.py`'s `seed_scratch_db()` must replicate directly against `sqlite3.connect()` (not through the fixture itself, since this runs outside pytest):
```python
cursor.execute(
    "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
    ("ROUTE1", 0, "STOP_A", "STOP_B"),
)
...
for bin_id in range(192):
    cursor.execute(
        "INSERT OR IGNORE INTO segment_stats (segment_id, bin_id, schedule_mean, n, welford_mean, welford_m2) VALUES (?, ?, 300.0, 0, 0.0, 0.0)",
        (segment_id, bin_id),
    )
```

**Critical divergence from `generate_sample_data.py` (do NOT copy as-is):** its route/stop IDs (`"ROUTE_335E"`, `"STOP_KR_PURAM"`) and `timestamp_utc` field will 422/be rejected — see RESEARCH.md Pitfalls 4 and 5. Use `observed_at_utc` ISO-8601 strings and segments pre-inserted directly into the scratch DB (Analog 2 above), not `generate_sample_data.py`'s output as-is.

**Auth pattern** (Bearer header, mirrors any authenticated POST call — see `backend/app/auth.py` convention referenced in CLAUDE.md "POSTs Bearer + Idempotency"):
```python
headers={"Authorization": f"Bearer {API_KEY}"}
```

---

## Shared Patterns

### Middleware shape (`BaseHTTPMiddleware` subclass)
**Source:** `backend/app/main.py:22-29` (`APIVersionMiddleware`), `backend/app/rate_limit.py:226-320` (`RateLimitMiddleware`)
**Apply to:** `TimingMiddleware` in `backend/app/main.py`
```python
class SomeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        return response
```
Note the registration-order subtlety: Starlette builds the stack in *reverse* of `add_middleware()` call order, so the middleware that must see every request first/last (`TimingMiddleware`) must be added *last*, not first (contradicts CONTEXT.md's own D-17 rationale text — see RESEARCH.md Pitfall 2).

### Test isolation via `conftest.py` fixtures
**Source:** `backend/tests/conftest.py` (`clear_settings_cache` autouse fixture, `temp_db`, `in_memory_db`, `db_with_test_segment`, `client`)
**Apply to:** `test_bootstrap.py`, `test_timing_middleware.py`
All new tests should use these existing fixtures rather than hand-rolling DB setup — this is the single most load-bearing shared pattern in the test suite (per `backend/tests/TEST_ISOLATION.md`).

### `PRAGMA foreign_keys = ON` explicit-per-connection pattern
**Source:** `backend/tests/conftest.py:102,139` (`in_memory_db`, `temp_db` fixtures)
**Apply to:** `test_bootstrap.py`'s FK-check test, since `app.db.get_connection()` (production path) never sets this pragma itself.

### Literal-list assertions over bare counts
**Source:** `backend/tests/test_gtfs_update.py:34` (`GTFS_TABLES = [...]`)
**Apply to:** `test_bootstrap.py`'s table/view existence check (D-09) — use the verified 17-table/3-view literal list from RESEARCH.md Pitfall 1/Pattern 6, not the stale "11" figure in CLAUDE.md/ROADMAP.md.

### Module-level logger convention
**Source:** `backend/app/main.py:19`, `backend/app/rate_limit.py:16` — `logger = logging.getLogger(__name__)`
**Apply to:** `logging_config.py` (module logger) and the new `TimingMiddleware`'s access logger (use a dedicated name like `"app.access"` per RESEARCH.md Pattern 3, distinct from `__name__`-based module loggers, so operators can filter access logs separately).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.github/workflows/ci.yml` | config | event-driven | No GitHub Actions workflow exists in this repo yet (confirmed: `.github/` directory absent) — greenfield; follow RESEARCH.md's verified `astral-sh/setup-uv` YAML pattern instead of a codebase analog. |
| `backend/tests/perf/results.txt` | data artifact | file-I/O | Plain-text output file with no existing analog format in the repo; format is whatever `load_test.py` writes (RESEARCH.md Code Examples shows the line format: `timestamp endpoint=... p50_ms=... p99_ms=... PASS=...`). |

## Metadata

**Analog search scope:** `backend/app/` (main.py, rate_limit.py, db.py, config.py), `backend/tests/` (conftest.py, test_gtfs_update.py), `backend/scripts/` (generate_sample_data.py), `.github/` (confirmed absent)
**Files scanned:** 7 (main.py, rate_limit.py, conftest.py, test_gtfs_update.py, generate_sample_data.py, pyproject.toml, schema.sql referenced via RESEARCH.md)
**Pattern extraction date:** 2026-07-04

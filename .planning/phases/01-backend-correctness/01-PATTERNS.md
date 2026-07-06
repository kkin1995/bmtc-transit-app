# Phase 1: Backend Correctness - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 6 (all in-place edits, no new files)
**Analogs found:** 6 / 6 (self-referential — this phase edits existing patterns in place; each file's "analog" is its own current code, since these are mechanical bug fixes, not new capability)

## File Classification

| File (modified) | Role | Data Flow | Closest Analog | Match Quality |
|------------------|------|-----------|-----------------|----------------|
| `backend/app/db.py` | utility (connection factory) | request-response | itself — `get_connection()` at line 37 | exact (in-place refactor) |
| `backend/app/main.py` | config/middleware (app bootstrap) | request-response | itself — CORS block lines 90-97, lifespan lines 34-54 | exact (in-place refactor) |
| `backend/app/config.py` | config | CRUD (settings read) | itself — existing `BMTC_*` field pattern (e.g. `mapmatch_min_conf`, `hmac_secret_key`) | exact (additive field) |
| `backend/app/routes.py` | controller | request-response | itself — `ride_summary()` (52-227), `get_eta()` (240-401) | exact (in-place refactor) |
| `backend/app/idempotency.py` | service | CRUD (key-value cache) | itself — `check_idempotency_key()`/`store_idempotency_key()` (43-125) | exact (in-place refactor) |
| `backend/app/schema.sql` | migration/schema | batch (DDL) | itself — `idempotency_keys` table def (lines 206-214) | exact (additive column) |

No files outside this set need touching: `backend/app/learning.py` and `backend/app/gtfs_bootstrap.py` contain **zero** `get_connection(` call sites (verified via grep), so the D-15/Open-Question-2 concern in RESEARCH.md does not apply — no mechanical `with` syntax swap needed there.

## Pattern Assignments

### `backend/app/db.py` (utility, request-response) — BUGFIX-01

**Analog:** itself, current `get_connection()` (lines 37-42)

**Current pattern (bug):**
```python
def get_connection(db_path: str) -> sqlite3.Connection:
    """Get database connection with WAL enabled."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn
```

**Target pattern (contextmanager, from RESEARCH.md Pattern 1, verified against Python contextlib docs):**
```python
from contextlib import contextmanager

@contextmanager
def get_connection(db_path: str):
    """Get database connection with WAL enabled. Guarantees close() on any exit path."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
```

**Critical correctness detail:** the `try/finally` MUST wrap `yield conn` inside the generator body — NOT at call sites. Omitting `try/finally` reproduces the exact leak this fix is meant to close (verified: `@contextmanager` does not provide implicit exception-safety; on exception, Python `.throw()`s into the generator at the `yield` point, and code after a bare `yield` with no enclosing `try` never runs).

**Call sites requiring `with` syntax update (grep-verified in `routes.py`):** lines 108, 265, 412, 445, 474, 559, 653, 824 (each was `conn = get_connection(...)` → becomes `with get_connection(...) as conn:`). Also 3 call sites in `idempotency.py` (lines 61, 111, 135) — syntax-only, same mechanical change, no logic touch (D-15 scope).

**Early-return `conn.close()` calls to DELETE (not merely leave) in `routes.py`:** lines 146 (unknown segment 422), 278 (segment not found 404), 303 (bad `when` param 400), 491 (bad bbox 400), 564 (bad route_type 400), 661 (stop not found 404), 676 (bad `when` param 400 in schedule endpoint). Grep check after fix: `grep -n "conn.close()" backend/app/routes.py` should return **zero** matches.

---

### `backend/app/main.py` (config/middleware, request-response) — BUGFIX-02, BUGFIX-07, LEARN-03

**Analog:** itself, current CORS block (lines 90-97) and lifespan (34-54) and slowapi wiring (lines 10-12, 57, 66-67)

**Current CORS pattern (bug — D-01 through D-05 target this exact block):**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)
```

**Target pattern:**
```python
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
    # allow_credentials intentionally absent (D-01) — Bearer-header auth only, no cookies
)
```
Note: `settings = get_settings()` is already called once at module level for `server_version` (line 61) — reuse that binding rather than calling `get_settings()` a second time.

**Current slowapi wiring to DELETE entirely (LEARN-03):**
```python
from slowapi import Limiter, _rate_limit_exceeded_handler   # line 10 — DELETE
from slowapi.util import get_remote_address                  # line 11 — DELETE
from slowapi.errors import RateLimitExceeded                 # line 12 — DELETE
...
limiter = Limiter(key_func=get_remote_address)                # line 57 — DELETE
...
app.state.limiter = limiter                                    # line 66 — DELETE
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # line 67 — DELETE
```
Same 3-line import block pattern repeats in `routes.py` lines 9-10 (`from slowapi import Limiter` / `from slowapi.util import get_remote_address`) and the unused `limiter = Limiter(...)` at `routes.py:49` — DELETE both. Also remove `slowapi==0.1.9` from `backend/pyproject.toml` `[project.dependencies]` (RESEARCH.md's optional-but-recommended cleanup) and run `uv sync`/`uv lock`.

**Lifespan pattern to extend (BUGFIX-07, D- locked, no discussion needed):**
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.rate_limit_enabled:
        logger.warning(...)
    init_db(settings.db_path)
    deleted = cleanup_expired_keys()          # NEW — BUGFIX-07
    logger.info(f"Startup cleanup: removed {deleted} expired idempotency keys")  # NEW
    state.set_startup_time(int(time.time()))
    yield
```
New import needed: `from app.idempotency import cleanup_expired_keys`.

---

### `backend/app/config.py` (config, CRUD) — BUGFIX-02 (D-02/D-03)

**Analog:** itself — existing `BMTC_*` field pattern, e.g. `mapmatch_min_conf: float = 0.7` (line 22), `hmac_secret_key: Optional[str] = None` (line 34)

**Pattern to add (matches existing inline-default convention exactly):**
```python
class Settings(BaseSettings):
    ...
    cors_origins: str = "http://localhost:8081,http://localhost:19006"
    ...
```
No custom parsing/validator needed — plain `str` field, split on `,` at the call site in `main.py` (`settings.cors_origins.split(",")`), consistent with how every other `BMTC_*` setting is a plain scalar with an inline default and no `Field(...)` wrapper unless it needs `Optional`.

---

### `backend/app/routes.py` (controller, request-response) — BUGFIX-01, BUGFIX-03, API-05

**Analog:** itself — `ride_summary()` handler (lines 52-227) and `get_eta()` handler (lines 240-401)

**Current idempotency-replay bug (BUGFIX-03, lines 93-99):**
```python
# Body hash matches or not verified (backward compat) - return cached response
logger.info(f"Idempotent replay detected: {idempotency_key}")
# For now, return success with zero rejected count (client should cache response)
response = RideSummaryResponse(
    accepted_segments=0, rejected_segments=0, rejected_by_reason={}
)
return response
```

**Target pattern** — read `response_body` from the cached row (requires `check_idempotency_key` to also return `response_body`, see idempotency.py section below), null-check per D-09:
```python
if cached_response:
    body_hash_match = cached_response.get("body_hash_match")
    if body_hash_match is False:
        raise HTTPException(status_code=409, detail={...})  # unchanged, existing pattern

    response_body = cached_response.get("response_body")
    if response_body is not None:
        # Genuine replay — return byte-for-byte identical cached response (D-08)
        cached_data = json.loads(response_body)
        response = RideSummaryResponse(**cached_data)
        if deprecation_warning:
            return JSONResponse(content=response.model_dump(), headers={"X-Deprecation-Warning": deprecation_warning})
        return response
    # else: response_body IS NULL (legacy row, D-09) — fall through to reprocess fresh,
    # do NOT return early here; treat exactly like "no cached key at all"
```
Requires `import json` at top of `routes.py` (not currently imported — verify before use).

**Current deprecation-header dead-end (API-05, lines 220-227 in POST; lines 312-315 in GET):**
```python
# Add deprecation header if needed
if deprecation_warning:
    # Note: FastAPI doesn't easily allow adding headers to response_model responses
    # This will be handled in middleware or by returning Response object
    # For now, log the warning
    logger.warning(f"Deprecated field used: {deprecation_warning}")

return response
```

**Target pattern (D-12, RESEARCH.md Pattern 2 — construct model first for validation, then `.model_dump()` into `JSONResponse`):**
```python
response = RideSummaryResponse(**response_data)
if deprecation_warning:
    return JSONResponse(
        content=response.model_dump(),
        headers={"X-Deprecation-Warning": deprecation_warning},
    )
return response
```
Verified safe: `RideSummaryResponse` fields are `int`/`int`/`dict[str, int]` only — no `datetime`/`Decimal`, `.model_dump()` (not `mode="json"`) is sufficient. Same treatment applies to `ETAResponseV11` in `get_eta()` — verified all timestamp fields (`query_time`, `last_updated`) are already `str` (ISO-8601, converted at lines 357-363 before model construction), so `.model_dump()` is safe there too.

**Connection-manager conversion at each handler** (BUGFIX-01) — apply the `with get_connection(...) as conn:` wrap from the db.py section above to every one of the 6 route handlers that call `get_connection`: `ride_summary` (108), `get_eta` (265), `get_config` (412, inside try/except — keep the try/except, just wrap the `get_connection` call), `health_check` (445, same try/except caveat), `get_stops` (474), `get_routes` (559), `get_stop_schedule` (653), `search_routes` (824, inside its own outer try/except for 500 handling).

---

### `backend/app/idempotency.py` (service, CRUD) — BUGFIX-03 (D-06/D-07)

**Analog:** itself — `check_idempotency_key()` (43-97) and `store_idempotency_key()` (100-125)

**Current `check_idempotency_key` SELECT (line 68-74) — needs `response_body` added:**
```python
cursor.execute(
    """
    SELECT response_hash, body_hash FROM idempotency_keys
    WHERE key = ? AND submitted_at >= ?
    """,
    (idempotency_key, min_timestamp),
)
row = cursor.fetchone()
```
**Target:**
```python
cursor.execute(
    """
    SELECT response_hash, body_hash, response_body FROM idempotency_keys
    WHERE key = ? AND submitted_at >= ?
    """,
    (idempotency_key, min_timestamp),
)
row = cursor.fetchone()
...
result = {
    "_cached": True,
    "response_hash": stored_response_hash,
    "body_hash": stored_body_hash,
    "response_body": row[2],   # NEW — may be None for legacy rows (D-09)
}
```

**Current `store_idempotency_key` INSERT (lines 117-122) — needs `response_body` added:**
```python
cursor.execute(
    """
    INSERT OR REPLACE INTO idempotency_keys (key, submitted_at, response_hash, body_hash)
    VALUES (?, ?, ?, ?)
    """,
    (idempotency_key, int(time.time()), response_hash, body_hash),
)
```
**Target (D-07 — store full serialized JSON):**
```python
response_body = json.dumps(response_data)
cursor.execute(
    """
    INSERT OR REPLACE INTO idempotency_keys (key, submitted_at, response_hash, body_hash, response_body)
    VALUES (?, ?, ?, ?, ?)
    """,
    (idempotency_key, int(time.time()), response_hash, body_hash, response_body),
)
```
`json` is already imported at the top of this file (line 4) — no new import needed here (unlike `routes.py`).

**`with get_connection(...)` syntax swap** applies to all 3 functions in this file (lines 61, 111, 135) — mechanical only, per D-15's scope note; no logic change to these functions beyond the response_body additions above.

---

### `backend/app/schema.sql` (migration, batch) — BUGFIX-03 (D-06)

**Analog:** itself — `idempotency_keys` table definition (lines 206-214), which already uses the `CREATE TABLE IF NOT EXISTS` idempotent-DDL convention used throughout this file

**Current:**
```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,                -- UUID provided by client
    submitted_at INTEGER NOT NULL,       -- Unix timestamp
    response_hash TEXT NOT NULL,         -- SHA256 of response for verification
    body_hash TEXT                       -- SHA256 of request body (H1 security fix)
);
```

**Target — add column via guarded `ALTER TABLE` in the `init_db()` bootstrap path (`backend/app/db.py`, NOT inside `schema.sql` itself, since `schema.sql` is executed via `executescript()` and `ALTER TABLE ADD COLUMN` isn't naturally idempotent via `IF NOT EXISTS`).** Recommended approach (RESEARCH.md Option B, preferred over try/except string-matching):
```python
# Inside init_db(), after conn.executescript(schema):
existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(idempotency_keys)").fetchall()}
if "response_body" not in existing_cols:
    conn.execute("ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT")
```
This runs on every startup (per `main.py`'s lifespan calling `init_db()` unconditionally), is nullable-by-necessity for legacy rows, and requires no new migration framework (Phase 4 territory, out of scope here).

---

## Shared Patterns

### Structured Error Responses
**Source:** `backend/app/errors.py` (all convenience functions: `invalid_request`, `not_found`, `conflict`, `unprocessable`, `server_error`)
**Apply to:** No new error paths are introduced by this phase, but any handler touched for BUGFIX-01/BUGFIX-03 should continue raising `HTTPException(status_code=..., detail={"error": ..., "message": ..., "details": {...}})` in the existing dict shape (see `routes.py:82-91`, `256-263`) rather than switching to `errors.py`'s helper functions mid-refactor — RESEARCH.md/CONTEXT.md do not ask for this migration, keep the diff additive.

### JSONResponse-as-escape-hatch (D-12)
**Source:** `backend/app/routes.py:492-499` (`get_stops`'s existing bbox-error `JSONResponse` return) and `backend/app/errors.py` — this codebase already has an established convention of returning `JSONResponse(status_code=..., content={...})` directly from route handlers whose `response_model` doesn't fit the error/edge case.
**Apply to:** The new deprecation-header returns in `ride_summary()` and `get_eta()` — same `JSONResponse` escape-hatch mechanism, just used for the success path with headers instead of an error path.

### Context-manager connection pattern (D-13)
**Source:** `backend/app/db.py:37` (single point of change)
**Apply to:** Every call site across `routes.py` (8 sites) and `idempotency.py` (3 sites) — mechanical, behavior-preserving except at the 7 `routes.py` early-return sites where dead `conn.close()` calls must be deleted.

### Settings pattern for new config
**Source:** `backend/app/config.py:8-38` (`Settings(BaseSettings)` class body — every field is a bare scalar with an inline default, `env_prefix = "BMTC_"` in `Config` handles the `BMTC_CORS_ORIGINS` env var mapping automatically)
**Apply to:** `cors_origins: str = "http://localhost:8081,http://localhost:19006"` — no new pattern needed, follows the exact convention already used by every other field in this class.

## No Analog Found

None. All six files in this phase's scope are existing files being edited in place — every "pattern to follow" is the file's own current code being corrected, not a pattern borrowed from an unrelated file. `backend/app/learning.py` and `backend/app/gtfs_bootstrap.py` were checked (per RESEARCH.md's Open Question 2 / Assumption A2) and confirmed to contain **zero** `get_connection(` call sites — they require no changes in this phase.

## New Test Files (Wave 0 gaps, from RESEARCH.md — no analog exists yet, use existing test conventions)

| File | Analog for test structure | Covers |
|------|---------------------------|--------|
| `backend/tests/test_cors.py` (new) | `backend/tests/test_integration.py` — `TestClient` + `app` import pattern, existing header-assertion style | BUGFIX-02 |
| New test in `backend/tests/test_integration.py` or new `test_connection_leak.py` | `backend/tests/test_integration.py`'s existing `monkeypatch`/fixture usage | BUGFIX-01 |
| New test(s) in `backend/tests/test_idempotency_bodyhash.py` | Existing tests in same file (hash/conflict assertions) — extend with a replay-value assertion | BUGFIX-03 |
| New startup test | `backend/tests/test_idempotency.py::test_cleanup_expired_keys` (existing, passes) — extend to assert invocation at `TestClient` app startup, not just standalone function behavior | BUGFIX-07 |
| New header-assertion test(s) | `backend/tests/test_integration.py` conventions | API-05 |

**Baseline test note (critical for verification):** current tree is `174 passed, 8 failed`, NOT the `182/182` CLAUDE.md claims. The 8 pre-existing failures (2 in `test_idempotency.py` due to a stale 2-arg `store_idempotency_key()` call signature; 4 in `test_idempotency_bodyhash.py`; 2 in `test_rate_limit.py`) are unrelated to Phase 1's scope — do not misattribute new failures vs. this baseline. Record the baseline failure list before implementation; diff after.

## Metadata

**Analog search scope:** `backend/app/` (db.py, main.py, config.py, routes.py, idempotency.py, schema.sql, errors.py, models.py) — all read directly, no analog files outside this directory needed since every change is an in-place edit.
**Files scanned:** 8 source files + grep verification of `learning.py`/`gtfs_bootstrap.py` (0 matches for `get_connection`)
**Pattern extraction date:** 2026-07-01

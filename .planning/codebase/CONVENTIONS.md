# Code Conventions

**Analysis Date:** 2026-07-01

## Naming Conventions

**Files:**
- Snake_case for all Python modules: `route_id`, `ride_summary`, `gtfs_bootstrap.py`
- Test files prefixed with `test_`: `test_learning.py`, `test_integration.py`
- Config/schema files use descriptive names: `schema.sql`, `pytest.ini`

**Functions:**
- Snake_case: `compute_bin_id()`, `update_segment_stats()`, `get_connection()`
- Async route handlers use snake_case verb-noun form: `ride_summary()`, `get_eta()`, `health_check()`
- Helper functions prefixed with underscore: `_compute_confidence(n)`
- Factory fixtures prefixed with `_factory` in closures: `_factory(route_id=...)`

**Variables:**
- Snake_case throughout: `accepted_count`, `rejection_reason`, `segment_id`
- Constants use ALL_CAPS in environment variable names: `BMTC_API_KEY`, `BMTC_N0`
- Pydantic model fields use snake_case: `from_stop_id`, `observed_at_utc`, `mapmatch_conf`

**Classes:**
- PascalCase: `RideSegment`, `RideSummary`, `Settings`, `ETAResponseV11`
- Pydantic response models suffixed with `Response`: `RideSummaryResponse`, `ETAResponse`, `HealthResponse`
- Pydantic list responses suffixed with `ListResponse`: `RoutesListResponse`, `StopsListResponse`

## API Design Patterns

**URL structure:** `/v1/<resource>` — all endpoints under versioned prefix
- POST `/v1/ride_summary` — data ingestion
- GET `/v1/eta` — query with query parameters
- GET `/v1/routes` — GTFS list with pagination
- GET `/v1/routes/search` — dedicated search endpoint
- GET `/v1/stops/{stop_id}/schedule` — path parameter for resource ID

**Authentication:**
- POST endpoints require `Authorization: Bearer <token>` via `Depends(verify_token)`
- GET endpoints are open (no auth)

**Idempotency:**
- POST `/v1/ride_summary` accepts optional `Idempotency-Key` header
- Duplicate key + same body → replay cached response (200)
- Duplicate key + different body → 409 with `body_hash_match: false`

**Response format for errors:**
```python
# Structured error with error/message/details keys
{
    "error": "not_found",
    "message": "Segment not found in GTFS data",
    "details": {"route_id": route_id, ...}
}
```

**Error codes used:**
- 400: Invalid request parameters (bad bbox, bad direction_id)
- 404: Resource not found (segment, stop)
- 409: Idempotency key conflict
- 422: Validation error (empty query, bad schema)
- 500: Unexpected server error

**Pagination pattern:**
```python
# All list endpoints use limit/offset with total count
return RoutesListResponse(routes=routes, total=total, limit=limit, offset=offset)
```
Default `limit=100`, max `le=1000` enforced via `Query(..., le=1000)`.

**Backward compatibility:**
- Deprecated fields kept with comment: `timestamp_utc: Optional[int] = None  # DEPRECATED: use observed_at_utc`
- Deprecation warnings logged at `logger.warning()` level, not raised as errors
- Response models include both new structured fields and old flat fields (`ETAResponseV11`)

## Code Organization

**Module responsibilities** (single responsibility per file):
- `backend/app/routes.py` — FastAPI route handlers only; delegates to `learning.py`, `db.py`
- `backend/app/models.py` — Pydantic request/response schemas only
- `backend/app/learning.py` — Welford/EMA algorithms, stat updates
- `backend/app/db.py` — SQLite connection management and `compute_bin_id()`
- `backend/app/config.py` — Settings class and `get_settings()` singleton
- `backend/app/auth.py` — Bearer token verification middleware
- `backend/app/idempotency.py` — Idempotency key storage and lookup
- `backend/app/state.py` — App startup time tracking

**Import style:**
- Standard library → third-party → internal (`app.*`) — in that order
- Deferred imports inside functions when used rarely: `from datetime import datetime` placed inside function body for `get_eta()`
- All internal imports use `app.` package prefix: `from app.config import get_settings`

**Module-level logger in every module that logs:**
```python
logger = logging.getLogger(__name__)
```

**APIRouter vs app:** Routes defined on `router = APIRouter()` in `routes.py`, mounted on `app` in `main.py`.

## Configuration Patterns

**Settings class:** `pydantic_settings.BaseSettings` with `env_prefix = "BMTC_"` — all env vars prefixed `BMTC_`
- File: `backend/app/config.py`
- Defaults defined inline: `n0: int = 20`, `half_life_days: int = 30`
- Optional secrets use `Optional[str] = None`: `hmac_secret_key`

**Singleton access via cached function:**
```python
@lru_cache
def get_settings() -> Settings:
    return Settings()
```
Cache is cleared in tests via `get_settings.cache_clear()`.

**Env file fallback:** `env_file = ".env"` (dev only; prod uses systemd `EnvironmentFile=/etc/bmtc-api/env`)

**In routes:** Settings always fetched via `settings = get_settings()` at the top of the handler, not injected via `Depends`.

## Database Patterns

**Connection management:** Open connection per request, close before returning:
```python
conn = get_connection(settings.db_path)
cursor = conn.cursor()
# ... work ...
conn.close()
```
No connection pooling; SQLite WAL mode handles concurrency.

**Parameterized queries everywhere** — no string interpolation into SQL:
```python
cursor.execute("SELECT segment_id FROM segments WHERE route_id = ? AND ...", (route_id, ...))
```

**Dynamic WHERE clause building:**
```python
where_clauses = []
params = []
if route_type is not None:
    where_clauses.append("route_type = ?")
    params.append(route_type)
where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
cursor.execute(f"SELECT ... FROM routes {where_sql}", params)
```

**UPSERT pattern:**
```python
cursor.execute("INSERT OR IGNORE INTO segments (...) VALUES (...)", (...))
```

**Single transaction per POST:** All segment stat updates committed in one `conn.commit()` at the end of `ride_summary`.

**WAL mode enabled:** `PRAGMA journal_mode = WAL` set on test temp databases; production uses WAL by default via bootstrap.

## Error Handling Patterns

**Route-level errors raise HTTPException:**
```python
raise HTTPException(
    status_code=404,
    detail={"error": "not_found", "message": "...", "details": {...}}
)
```

**Non-critical paths return JSONResponse directly** (avoids Pydantic validation on error path):
```python
return JSONResponse(status_code=400, content={"error": "...", "message": "...", "details": {...}})
```

**DB connection closed before raising:**
```python
if row is None:
    conn.close()
    raise HTTPException(...)
```

**Catch-all in search endpoint:**
```python
except Exception as e:
    logger.error(f"Error in route search: {e}")
    return JSONResponse(status_code=500, content={"error": "server_error", ...})
```

**Health check swallows exceptions gracefully:**
```python
try:
    conn = get_connection(...)
    ...
    db_ok = True
except Exception as e:
    logger.error(f"Health check DB error: {e}")
# Returns degraded status, not 500
```

## Commit Message Convention

Conventional Commits format: `<type>(<scope>): <description>`

Types used: `feat`, `fix`, `docs`, `refactor`
Scopes used: `api`, `mobile`, `rate-limit`

Examples from git log:
- `feat(api,mobile): add server-side route search endpoint`
- `fix(mobile): add 300ms debounce to route search input`
- `feat(mobile): integrate stop detection and three-outcome model`
- `docs(api): update examples and error model`
- `fix(rate-limit): enforce per-device_bucket cap with headers`

## Spec-First Development

The project enforces a mandatory **Spec → Tests → Code** workflow:

1. `docs/api.md` is the canonical API specification — updated first for any endpoint/behavior change
2. Tests encoding the required behavior are written or modified next
3. Implementation is changed only after tests fail for the expected reason

This is documented in `CLAUDE.md` as a global workflow rule overriding all other guidance. Violations require explicit justification and approval before editing implementation files.

**Agent routing:** Changes are classified into agents A1–A8 (Product → API Design → Schema → Implementation → Security → Testing → Observability → Release). The swimlane A1 → A2 → (A3) → A4 → A5 → A6 → A7 → A8 determines what artifacts must exist before the next step.

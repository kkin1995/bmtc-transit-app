<!-- GSD:project-start source:PROJECT.md -->

## Project

**BMTC Transit App**

A crowd-sourced ETA learning system for Bengaluru Metropolitan Transport Corporation (BMTC) buses. The backend API ingests ride observations from a mobile app, learns travel time statistics per segment×time-bin using Welford+EMA algorithms, and returns blended ETAs (incorporating GTFS schedule data). A React Native mobile app provides real-time ETA lookup, stop scheduling, and trip tracking with stop detection.

**Core Value:** Riders get progressively more accurate bus ETAs as more trips are observed — even when the GTFS schedule is wrong or stale.

### Constraints

- **Tech Stack**: SQLite only (no external DB) — keeps deployment simple; single server
- **Privacy**: Never persist raw device IDs; use device_bucket (SHA256 daily hash) everywhere
- **Single writer**: SQLite WAL pattern — one transaction per POST request; no concurrent writers
- **Backward compatibility**: v1 API contract must not break existing mobile clients
- **Performance**: GET /v1/eta p99 < 200ms (CF Tunnel); all writes in a single transaction

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Python 3.9+ (backend) — all API, learning algorithms, DB access; `backend/app/`
- TypeScript 5.9 (mobile) — React Native app; `mobile/`
- SQL — SQLite schema at `backend/app/schema.sql`
- Bash — operational scripts at `backend/scripts/`

## Frameworks & Runtime

- FastAPI 0.109.0 — async REST API framework; `backend/app/main.py`, `backend/app/routes.py`
- Uvicorn 0.27.0 (with `[standard]` extras, i.e., uvloop + httptools) — ASGI server
- React Native 0.81.5 — cross-platform mobile runtime
- Expo 54.0.24 — managed workflow; `mobile/`
- Expo Router 6.0.15 — file-based navigation; entry point `expo-router/entry`

## Key Libraries

- Pydantic 2.5.3 — request/response schema validation; `backend/app/models.py`
- pydantic-settings 2.1.0 — env-var config with `BMTC_` prefix; `backend/app/config.py`
- slowapi 0.1.9 — rate limiting (wraps limits library); `backend/app/main.py`, `backend/app/rate_limit.py`
- python-multipart 0.0.6 — form data support (required by FastAPI)
- sqlite3 (stdlib) — all DB access; `backend/app/db.py`
- zoneinfo (stdlib) — timezone handling for time bins
- Tamagui 1.138.0 — UI component library and design system
- expo-location 19.0.8 — GPS/location access for trip tracking
- expo-crypto 15.0.8 — cryptographic utilities
- react-native-reanimated 4.1.1 — animation library
- @react-navigation/native 7.1.8 — navigation primitives

## Build & Package Management

- `uv` 0.11.8 — Python package manager and runner (replaces pip/venv)
- hatchling — build backend (declared in `backend/pyproject.toml`)
- Lockfile: `backend/uv.lock` (present)
- Config: `backend/pyproject.toml`
- npm / yarn — standard React Native package manager
- Lockfile: `mobile/package.json` (private package)
- TypeScript compiler via `typescript` 5.9 devDependency

## Infrastructure & Deployment

- Runs as dedicated `bmtc` user/group (non-root)
- Code deployed to `/opt/bmtc-api`
- `backend/deploy/bmtc-api.service` — main API process
- `backend/deploy/bmtc-backup.{service,timer}` — hourly SQLite backup
- `backend/deploy/bmtc-retention.{service,timer}` — daily data retention sweep
- SQLite with WAL mode — single file at `/var/lib/bmtc-api/bmtc.db` (prod) or `backend/bmtc_dev.db` (dev)
- 11 tables, 3 views; schema at `backend/app/schema.sql`
- Bound to `127.0.0.1:8000` (loopback only)
- Exposed externally via Cloudflare Tunnel (CF Tunnel) — no direct public port
- `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`

## Development Tools

- pytest 7.4.3 — test runner
- httpx 0.25.2 — async HTTP client for `TestClient` integration tests
- pytest-cov / coverage — code coverage
- pytest-xdist 3.5.0 — parallel test execution (`-n auto --dist loadfile`)
- pytest-randomly 3.15.0 — randomized test ordering for isolation verification
- Tests: `backend/tests/` (4 modules, 47 tests)
- Jest 29.7.0 — test runner
- jest-expo 52.0.1 — Expo-aware Jest preset
- @testing-library/react-native 12.4.3 — component testing utilities

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Conventions

- Snake_case for all Python modules: `route_id`, `ride_summary`, `gtfs_bootstrap.py`
- Test files prefixed with `test_`: `test_learning.py`, `test_integration.py`
- Config/schema files use descriptive names: `schema.sql`, `pytest.ini`
- Snake_case: `compute_bin_id()`, `update_segment_stats()`, `get_connection()`
- Async route handlers use snake_case verb-noun form: `ride_summary()`, `get_eta()`, `health_check()`
- Helper functions prefixed with underscore: `_compute_confidence(n)`
- Factory fixtures prefixed with `_factory` in closures: `_factory(route_id=...)`
- Snake_case throughout: `accepted_count`, `rejection_reason`, `segment_id`
- Constants use ALL_CAPS in environment variable names: `BMTC_API_KEY`, `BMTC_N0`
- Pydantic model fields use snake_case: `from_stop_id`, `observed_at_utc`, `mapmatch_conf`
- PascalCase: `RideSegment`, `RideSummary`, `Settings`, `ETAResponseV11`
- Pydantic response models suffixed with `Response`: `RideSummaryResponse`, `ETAResponse`, `HealthResponse`
- Pydantic list responses suffixed with `ListResponse`: `RoutesListResponse`, `StopsListResponse`

## API Design Patterns

- POST `/v1/ride_summary` — data ingestion
- GET `/v1/eta` — query with query parameters
- GET `/v1/routes` — GTFS list with pagination
- GET `/v1/routes/search` — dedicated search endpoint
- GET `/v1/stops/{stop_id}/schedule` — path parameter for resource ID
- POST endpoints require `Authorization: Bearer <token>` via `Depends(verify_token)`
- GET endpoints are open (no auth)
- POST `/v1/ride_summary` accepts optional `Idempotency-Key` header
- Duplicate key + same body → replay cached response (200)
- Duplicate key + different body → 409 with `body_hash_match: false`
- 400: Invalid request parameters (bad bbox, bad direction_id)
- 404: Resource not found (segment, stop)
- 409: Idempotency key conflict
- 422: Validation error (empty query, bad schema)
- 500: Unexpected server error
- Deprecated fields kept with comment: `timestamp_utc: Optional[int] = None  # DEPRECATED: use observed_at_utc`
- Deprecation warnings logged at `logger.warning()` level, not raised as errors
- Response models include both new structured fields and old flat fields (`ETAResponseV11`)

## Code Organization

- `backend/app/routes.py` — FastAPI route handlers only; delegates to `learning.py`, `db.py`
- `backend/app/models.py` — Pydantic request/response schemas only
- `backend/app/learning.py` — Welford/EMA algorithms, stat updates
- `backend/app/db.py` — SQLite connection management and `compute_bin_id()`
- `backend/app/config.py` — Settings class and `get_settings()` singleton
- `backend/app/auth.py` — Bearer token verification middleware
- `backend/app/idempotency.py` — Idempotency key storage and lookup
- `backend/app/state.py` — App startup time tracking
- Standard library → third-party → internal (`app.*`) — in that order
- Deferred imports inside functions when used rarely: `from datetime import datetime` placed inside function body for `get_eta()`
- All internal imports use `app.` package prefix: `from app.config import get_settings`

## Configuration Patterns

- File: `backend/app/config.py`
- Defaults defined inline: `n0: int = 20`, `half_life_days: int = 30`
- Optional secrets use `Optional[str] = None`: `hmac_secret_key`

## Database Patterns

## Error Handling Patterns

## Commit Message Convention

- `feat(api,mobile): add server-side route search endpoint`
- `fix(mobile): add 300ms debounce to route search input`
- `feat(mobile): integrate stop detection and three-outcome model`
- `docs(api): update examples and error model`
- `fix(rate-limit): enforce per-device_bucket cap with headers`

## Spec-First Development

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| FastAPI App | Startup, middleware, routing | `backend/app/main.py` |
| Route Handlers | 9 API endpoint implementations | `backend/app/routes.py` |
| Learning Engine | Welford, EMA, outlier detection, blend | `backend/app/learning.py` |
| DB Layer | SQLite connections, bin computation | `backend/app/db.py` |
| Auth | Bearer token verification | `backend/app/auth.py` |
| Idempotency | UUID key check + body-hash storage | `backend/app/idempotency.py` |
| Rate Limiting | Token-bucket middleware per device/IP | `backend/app/rate_limit.py` |
| Config | `BMTC_*` env-var settings (cached) | `backend/app/config.py` |
| Models | Pydantic request/response schemas | `backend/app/models.py` |
| State | Startup time tracking | `backend/app/state.py` |
| GTFS Bootstrap | Load `bmtc.zip` into SQLite | `backend/app/gtfs_bootstrap.py` |
| Bootstrap CLI | DB init + GTFS load entry point | `backend/app/bootstrap.py` |
| Errors | Structured error helpers | `backend/app/errors.py` |
| Mobile App | Expo/React Native transit UI | `mobile/` |

## Data Flow

### Ride Submission (Learning Path)

### ETA Query Path

### GTFS Discovery Path

- `GET /v1/stops` and `GET /v1/routes` query GTFS tables directly with bbox/filter params
- `GET /v1/routes/search` loads all routes and filters in Python using normalized matching (`normalize_for_search()` at `backend/app/routes.py:745`)
- `GET /v1/stops/{stop_id}/schedule` joins `stop_times` + `trips` for scheduled departures

## Database Design

### GTFS Static Tables (6)

| Table | Purpose | Approx Rows |
|-------|---------|-------------|
| `agency` | Transit agency info | 1 |
| `routes` | Bus route definitions | ~2k |
| `stops` | Bus stop locations + coords | ~8k |
| `trips` | Individual scheduled trips | ~10k |
| `stop_times` | Arrival/departure per stop per trip | ~1.46M |
| `calendar` | Weekday/weekend service patterns | ~100s |
| `gtfs_metadata` | GTFS version tracking | few |

### Learning Tables (5)

| Table | Purpose |
|-------|---------|
| `segments` | Unique (route, direction, from_stop, to_stop) — ~110k rows |
| `segment_stats` | Welford + EMA stats per `(segment_id, bin_id)` — 3-5M rows (sparse) |
| `dwell_stats` | Per-stop dwell time stats per bin |
| `rides` | Ride submission metadata |
| `ride_segments` | Per-segment observations with acceptance flag |
| `time_bins` | 192 bins (96 × 2 day-types, 15-min granularity) |

### Global Aggregation / Audit Tables (4)

| Table | Purpose | TTL |
|-------|---------|-----|
| `idempotency_keys` | Dedup ride submissions by UUID | 24h |
| `device_buckets` | Privacy-preserving device tracking (SHA256 hash) | rolling |
| `rejection_log` | Outlier + quality rejection audit trail | 30d |
| `rate_limit_buckets` | Token-bucket counters per device/IP | rolling |

### Views (3)

- `route_summary` — routes with trip/stop counts
- `stop_summary` — stops with route/trip counts
- `segment_learning_progress` — segments with bin coverage and sample counts

### Key Indexes

```sql

```

## Key Algorithms

### Welford Online Mean + Variance (`backend/app/learning.py:14`)

```python

```

### Exponential Moving Average (`backend/app/learning.py:36`)

```python

```

### Schedule Blend (`backend/app/learning.py:75`)

```python

```

### Outlier Detection (`backend/app/learning.py:60`)

```python

```

### Percentile Estimation (`backend/app/learning.py:91`)

```python

```

### Time Binning (`backend/app/db.py`)

## API Layer

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| POST | `/v1/ride_summary` | Bearer | 10/min | Submit ride segments for learning |
| GET | `/v1/eta` | None | — | Query blended ETA (P50/P90) |
| GET | `/v1/config` | None | — | Server learning parameters |
| GET | `/v1/health` | None | — | DB liveness + uptime |
| GET | `/v1/stops` | None | — | Discover GTFS stops (bbox/route filter) |
| GET | `/v1/routes` | None | — | Discover GTFS routes |
| GET | `/v1/routes/search` | None | — | Full-text route search (normalized) |
| GET | `/v1/stops/{stop_id}/schedule` | None | — | Scheduled departures for a stop |

## Concurrency & Consistency

- **SQLite WAL mode** — readers don't block writers; multiple readers can proceed concurrently.
- **Single DB writer pattern** — all POST writes are batched in one `conn.commit()` call per request (`backend/app/routes.py:204`). No concurrent writers by design.
- **Connection-per-request** — each handler calls `get_connection()` and closes before returning. No connection pooling.
- **Atomic rate limit** — `rate_limit_buckets` uses `STRICT` table with `CHECK` constraints and SQLite's atomic UPSERT to prevent race conditions on token-bucket decrements.
- **Idempotency** — body SHA256 stored alongside UUID key; mismatch raises 409 before any state mutation.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

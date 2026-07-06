# Codebase Structure

**Analysis Date:** 2026-07-01

## Top-Level Layout

```
bmtc-transit-app/
├── backend/                # FastAPI Python backend (uv)
│   ├── app/                # Application source code
│   ├── tests/              # pytest test suite
│   ├── scripts/            # Operational shell/Python scripts
│   ├── deploy/             # systemd unit files
│   ├── migrations/         # DB migration scripts
│   └── pyproject.toml      # uv project manifest + dependencies
├── mobile/                 # Expo/React Native mobile app
│   ├── app/                # Expo Router file-based routes
│   ├── components/         # Shared React components
│   ├── src/                # Business logic (api, domain, hooks, utils)
│   └── package.json        # Node dependencies
├── docs/                   # Project documentation
├── gtfs/                   # GTFS static data (bmtc.zip)
├── CLAUDE.md               # AI agent context + workflow rules
└── NEXT_STEPS.md           # Roadmap + planned enhancements
```

## Backend Application (`backend/app/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app factory, lifespan hooks, middleware registration |
| `routes.py` | All 9 API endpoint handlers (ride_summary, eta, config, health, stops, routes, schedule, search) |
| `learning.py` | Welford, EMA, blend, outlier detection, `update_segment_stats()` |
| `db.py` | `get_connection()`, `init_db()`, `compute_bin_id()` |
| `models.py` | Pydantic schemas: `RideSummary`, `ETAResponseV11`, `RideSummaryResponse`, GTFS response types |
| `config.py` | `get_settings()` — cached `Settings` from `BMTC_*` env vars |
| `auth.py` | `verify_token` FastAPI dependency (Bearer token check) |
| `idempotency.py` | `check_idempotency_key()`, `store_idempotency_key()` with body-hash |
| `rate_limit.py` | `RateLimitMiddleware` — token-bucket rate limiting via SQLite |
| `state.py` | Module-level startup time storage (`set_startup_time`, `get_startup_time`) |
| `gtfs_bootstrap.py` | Loads `bmtc.zip` GTFS feed into SQLite (1.46M stop_times) |
| `bootstrap.py` | CLI entry point: `python -m app.bootstrap` |
| `schema.sql` | Full DB schema: 11 tables + 3 views + all indexes |
| `errors.py` | Structured error response helpers |
| `__init__.py` | Package marker |
| `conftest.py` | App-level pytest fixtures (note: also in `tests/`) |
| `migrations/` | SQL migration scripts for schema evolution |

## Tests (`backend/tests/`)

| File | Covers |
|------|--------|
| `test_learning.py` | Welford/EMA algorithm unit tests (9 tests) |
| `test_integration.py` | End-to-end POST→GET flow (8 tests) |
| `test_idempotency.py` | Idempotency key handling (6 tests) |
| `test_idempotency_bodyhash.py` | Body-hash mismatch / 409 behavior |
| `test_global_aggregation.py` | Outlier rejection, device bucket, map-match (10 tests) |
| `test_rate_limit.py` | Token-bucket rate limiting (14 tests) |
| `test_routes_search.py` | `/v1/routes/search` normalized matching |
| `test_api_errors_alignment.py` | Error response format alignment checks |
| `test_api_gtfs_alignment.py` | GTFS endpoint behavior alignment |
| `test_api_v1_alignment.py` | v1 API contract alignment |
| `TEST_ISOLATION.md` | Documents test isolation strategy + parallel execution |
| `TEST_ROUTES_SEARCH_COVERAGE.md` | Coverage notes for route search tests |
| `ALIGNMENT_STATUS.md` | API alignment audit status |
| `ALIGNMENT_SUMMARY.md` | Summary of API alignment work |

**Test isolation:** All tests use in-memory or temp-file SQLite; `get_settings()` cache cleared before/after each test. Run with `uv run pytest -n auto --dist loadfile -q` for parallel execution.

## Scripts & Deploy

### `backend/scripts/`

| File | Purpose |
|------|---------|
| `backup.sh` | SQLite backup + gzip (called by systemd timer) |
| `restore.sh` | Restore from backup file |
| `generate_sample_data.py` | Synthetic ride data for testing/seeding |
| `health_check.sh` | Curl-based health check for monitoring |
| `rate_limit_cleanup.sh` | Manual rate limit bucket cleanup |

### `backend/deploy/`

| File | Purpose |
|------|---------|
| `bmtc-api.service` | systemd unit for FastAPI server (uvicorn) |
| `bmtc-backup.service` | systemd unit for backup run |
| `bmtc-backup.timer` | systemd timer: hourly backup |
| `bmtc-retention.service` | systemd unit for TTL cleanup (idempotency, rejection_log) |
| `bmtc-retention.timer` | systemd timer: daily cleanup |

## Mobile App (`mobile/`)

### Expo Router Routes (`mobile/app/`)

| Path | Purpose |
|------|---------|
| `_layout.tsx` | Root layout, navigation shell |
| `(tabs)/` | Tab-based navigation screens |
| `eta/` | ETA query screen |
| `stop/` | Stop detail/schedule screen |
| `trip/` | Trip tracking screen |
| `trip-debug.tsx` | Debug screen for trip tracking |

### Business Logic (`mobile/src/`)

| Directory | Purpose |
|-----------|---------|
| `src/api/` | Backend API client (fetch wrappers) |
| `src/domain/` | Domain logic (stop detection, three-outcome model) |
| `src/hooks/` | React hooks (location, stops, routes) |
| `src/screens/` | Screen-level components |
| `src/types/` | TypeScript type definitions |
| `src/utils/` | Utility functions |

### Mobile Shared (`mobile/components/`, `mobile/constants/`)

- `components/` — Shared UI components (themed, ETA-specific)
- `constants/` — App-wide constants

## Documentation (`docs/`)

| File | Purpose |
|------|---------|
| `api.md` | Canonical API specification (source of truth for all endpoints) |
| `architecture.md` | Architecture design notes |
| `PLAN.md` | Original execution plan + ADRs |
| `CHANGELOG.md` | Version changelog |
| `deploy.md` | Production deployment guide (systemd, paths, nginx) |
| `gtfs-database.md` | Complete DB schema reference |
| `gtfs-analysis.md` | GTFS data analysis notes |
| `ops-metrics.md` | Observability and monitoring metrics |
| `quickstart.md` | 5-minute getting-started guide |
| `PROJECT_STRUCTURE.md` | Monorepo architecture overview |
| `DB_NOTES.md` | SQLite WAL notes and query patterns |
| `prd/` | Product requirements documents |
| `SECURITY_REVIEW/` | Security audit findings |

## Notable Patterns

**File naming:** snake_case for Python modules (`rate_limit.py`, `gtfs_bootstrap.py`). PascalCase for React components (`StyledText.tsx`, `Themed.tsx`). kebab-case for Expo route files (`trip-debug.tsx`).

**Python module organization:** Flat under `backend/app/` — no sub-packages. Each concern owns a single file.

**Test co-location:** All backend tests in `backend/tests/`. Mobile tests use Jest co-located via `__tests__/` in `mobile/components/`.

**Config injection:** All settings loaded via `get_settings()` (cached, overridable via env vars). No hardcoded values in handlers — always reference `settings.*`.

## Where to Add New Code

**New API endpoint:**
- Handler: `backend/app/routes.py` (add to existing `router`)
- Request/response models: `backend/app/models.py`
- Tests: `backend/tests/test_integration.py` or new `test_<feature>.py`
- Spec update (mandatory first): `docs/api.md`

**New learning algorithm:**
- Implementation: `backend/app/learning.py`
- Unit tests: `backend/tests/test_learning.py`

**New DB table:**
- Schema: `backend/app/schema.sql`
- Migration: `backend/app/migrations/`

**New mobile screen:**
- Route file: `mobile/app/<screen-name>/index.tsx` (or `(tabs)/`)
- API calls: `mobile/src/api/`
- Domain logic: `mobile/src/domain/`

**New config setting:**
- Add to `backend/app/config.py` `Settings` class with `BMTC_` prefix env var

**Operational script:**
- Shell scripts: `backend/scripts/`
- If needs systemd scheduling: `backend/deploy/`

---

*Structure analysis: 2026-07-01*

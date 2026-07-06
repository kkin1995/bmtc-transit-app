# Technology Stack

**Analysis Date:** 2026-07-01

## Languages

**Primary:**
- Python 3.9+ (backend) — all API, learning algorithms, DB access; `backend/app/`
- TypeScript 5.9 (mobile) — React Native app; `mobile/`

**Secondary:**
- SQL — SQLite schema at `backend/app/schema.sql`
- Bash — operational scripts at `backend/scripts/`

## Frameworks & Runtime

**Backend:**
- FastAPI 0.109.0 — async REST API framework; `backend/app/main.py`, `backend/app/routes.py`
- Uvicorn 0.27.0 (with `[standard]` extras, i.e., uvloop + httptools) — ASGI server

**Mobile:**
- React Native 0.81.5 — cross-platform mobile runtime
- Expo 54.0.24 — managed workflow; `mobile/`
- Expo Router 6.0.15 — file-based navigation; entry point `expo-router/entry`

## Key Libraries

**Backend:**
- Pydantic 2.5.3 — request/response schema validation; `backend/app/models.py`
- pydantic-settings 2.1.0 — env-var config with `BMTC_` prefix; `backend/app/config.py`
- slowapi 0.1.9 — rate limiting (wraps limits library); `backend/app/main.py`, `backend/app/rate_limit.py`
- python-multipart 0.0.6 — form data support (required by FastAPI)
- sqlite3 (stdlib) — all DB access; `backend/app/db.py`
- zoneinfo (stdlib) — timezone handling for time bins

**Mobile:**
- Tamagui 1.138.0 — UI component library and design system
- expo-location 19.0.8 — GPS/location access for trip tracking
- expo-crypto 15.0.8 — cryptographic utilities
- react-native-reanimated 4.1.1 — animation library
- @react-navigation/native 7.1.8 — navigation primitives

## Build & Package Management

**Backend:**
- `uv` 0.11.8 — Python package manager and runner (replaces pip/venv)
- hatchling — build backend (declared in `backend/pyproject.toml`)
- Lockfile: `backend/uv.lock` (present)
- Config: `backend/pyproject.toml`

**Mobile:**
- npm / yarn — standard React Native package manager
- Lockfile: `mobile/package.json` (private package)
- TypeScript compiler via `typescript` 5.9 devDependency

## Infrastructure & Deployment

**Target OS:** Linux (systemd-based)
- Runs as dedicated `bmtc` user/group (non-root)
- Code deployed to `/opt/bmtc-api`

**Service Management:** systemd
- `backend/deploy/bmtc-api.service` — main API process
- `backend/deploy/bmtc-backup.{service,timer}` — hourly SQLite backup
- `backend/deploy/bmtc-retention.{service,timer}` — daily data retention sweep

**Database:**
- SQLite with WAL mode — single file at `/var/lib/bmtc-api/bmtc.db` (prod) or `backend/bmtc_dev.db` (dev)
- 11 tables, 3 views; schema at `backend/app/schema.sql`

**Network:**
- Bound to `127.0.0.1:8000` (loopback only)
- Exposed externally via Cloudflare Tunnel (CF Tunnel) — no direct public port

**Security hardening (systemd):**
- `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`

## Development Tools

**Testing (Backend):**
- pytest 7.4.3 — test runner
- httpx 0.25.2 — async HTTP client for `TestClient` integration tests
- pytest-cov / coverage — code coverage
- pytest-xdist 3.5.0 — parallel test execution (`-n auto --dist loadfile`)
- pytest-randomly 3.15.0 — randomized test ordering for isolation verification
- Tests: `backend/tests/` (4 modules, 47 tests)

**Testing (Mobile):**
- Jest 29.7.0 — test runner
- jest-expo 52.0.1 — Expo-aware Jest preset
- @testing-library/react-native 12.4.3 — component testing utilities

**No linter or formatter config detected** (no `.eslintrc`, `.prettierrc`, `biome.json`, `ruff.toml`, or `.flake8` at repo root or backend/).

---

*Stack analysis: 2026-07-01*

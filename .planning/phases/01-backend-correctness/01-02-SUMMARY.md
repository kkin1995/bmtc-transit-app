---
phase: 01-backend-correctness
plan: 02
subsystem: api
tags: [cors, security, startup, dead-code, fastapi, sqlite]

# Dependency graph
requires:
  - phase: 01-backend-correctness (plan 01)
    provides: get_connection() as @contextmanager — all call sites migrated to `with` syntax
provides:
  - Explicit CORS origin allowlist (BMTC_CORS_ORIGINS) with no allow_credentials
  - cleanup_expired_keys() invoked at application lifespan startup
  - Removal of the dead slowapi Limiter mechanism (RateLimitMiddleware is sole rate limiter)
affects: [02-learning-correctness, deployment, mobile-cors-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level `settings = get_settings()` binding reused by both FastAPI app construction and middleware config (avoids repeated get_settings() calls in main.py)"
    - "Comma-separated string env var pattern for list-like settings (cors_origins, no JSON parsing)"

key-files:
  created:
    - backend/tests/test_cors.py
    - backend/tests/test_startup_cleanup.py
  modified:
    - backend/app/config.py
    - backend/app/main.py
    - backend/app/routes.py
    - backend/pyproject.toml

key-decisions:
  - "allow_credentials removed entirely (not set to False) — Bearer-header auth only, no cookies, per D-01"
  - "cors_origins is a plain str field split on comma at the call site, matching every other BMTC_* setting's bare-scalar convention"
  - "slowapi removed via uv sync (drops transitive deps limits, deprecated, wrapt from venv/lock too)"

requirements-completed: [BUGFIX-02, BUGFIX-07, LEARN-03]

coverage:
  - id: D1
    description: "CORS uses an explicit origin allowlist from BMTC_CORS_ORIGINS; allow_credentials removed entirely"
    requirement: "BUGFIX-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_cors.py#test_allowed_origin_receives_matching_header"
        status: pass
      - kind: integration
        ref: "backend/tests/test_cors.py#test_disallowed_origin_does_not_receive_matching_header"
        status: pass
      - kind: integration
        ref: "backend/tests/test_cors.py#test_no_allow_credentials_header_present"
        status: pass
      - kind: integration
        ref: "backend/tests/test_cors.py#test_custom_allowlist_via_env_override"
        status: pass
      - kind: unit
        ref: "backend/tests/test_cors.py#test_default_cors_origins_split"
        status: pass
    human_judgment: false
  - id: D2
    description: "Expired idempotency keys are purged automatically at application startup (lifespan)"
    requirement: "BUGFIX-07"
    verification:
      - kind: integration
        ref: "backend/tests/test_startup_cleanup.py#test_expired_idempotency_key_purged_on_startup"
        status: pass
    human_judgment: false
  - id: D3
    description: "All slowapi dead code removed from main.py, routes.py, and pyproject.toml; RateLimitMiddleware is the sole active rate limiter"
    requirement: "LEARN-03"
    verification:
      - kind: other
        ref: "grep -rn 'slowapi' backend/app/ --include='*.py' (zero matches)"
        status: pass
      - kind: other
        ref: "grep -c 'slowapi' backend/pyproject.toml (returns 0)"
        status: pass
      - kind: unit
        ref: "cd backend && uv run pytest -q (182 passed, 8 pre-existing baseline failures unchanged, no new regressions)"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 2: CORS Hardening, Startup Cleanup, and slowapi Removal Summary

**Explicit CORS origin allowlist (BMTC_CORS_ORIGINS) with allow_credentials removed, cleanup_expired_keys() wired into lifespan startup, and all dead slowapi Limiter code deleted from main.py/routes.py/pyproject.toml**

## Performance

- **Duration:** 27 min
- **Started:** 2026-07-01T08:34:50Z
- **Completed:** 2026-07-01T09:01:55Z
- **Tasks:** 3 completed
- **Files modified:** 5 (config.py, main.py, routes.py, pyproject.toml, plus 2 new test files)

## Accomplishments

- Added `cors_origins: str` setting (`BMTC_CORS_ORIGINS`, default `http://localhost:8081,http://localhost:19006`) following the existing bare-scalar convention in `Settings`
- Replaced `allow_origins=["*"]` + `allow_credentials=True` with `allow_origins=settings.cors_origins.split(",")` and fully deleted `allow_credentials` — eliminates the wildcard-origin+credentials combination browsers reject
- Wired `cleanup_expired_keys()` into the `lifespan` startup handler (runs after `init_db()`, before `state.set_startup_time()`), so expired idempotency rows never accumulate across restarts
- Deleted all `slowapi` imports, the unused `Limiter` instances (`main.py`, `routes.py`), `app.state.limiter` wiring, and the `RateLimitExceeded` exception handler; removed `slowapi==0.1.9` from `pyproject.toml` and ran `uv sync` (dropped `slowapi`, `limits`, `deprecated`, `wrapt` from the venv/lock)
- Added two new test files (`test_cors.py`, `test_startup_cleanup.py`) with 6 tests total, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cors_origins setting + write CORS and startup-cleanup tests (RED)** - `ba487eb` (test)
2. **Task 2: Fix CORS config + wire startup cleanup in main.py (GREEN)** - `5827b5b` (feat)
3. **Task 3: Remove all slowapi dead code (main.py, routes.py, pyproject.toml)** - `df86188` (chore)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 1 intentionally produced 3 failing tests (RED state) against the then-unfixed wildcard CORS/unwired cleanup; Task 2 turned them GREEN._

## Files Created/Modified

- `backend/app/config.py` - Added `cors_origins: str = "http://localhost:8081,http://localhost:19006"` field
- `backend/app/main.py` - CORS allowlist + `allow_credentials` removal; `cleanup_expired_keys()` call in lifespan; module-level `settings` binding added; all slowapi imports/wiring deleted
- `backend/app/routes.py` - Removed unused `slowapi` imports and the dead `limiter = Limiter(...)` instance (no `@limiter` decorators existed on any handler)
- `backend/pyproject.toml` - Removed `slowapi==0.1.9` from `[project.dependencies]`
- `backend/tests/test_cors.py` - New: allowlist enforcement, credentials-header absence, env override, default parsing (5 tests)
- `backend/tests/test_startup_cleanup.py` - New: pre-seeded expired row purged at lifespan startup, recent row preserved (1 test)

## Decisions Made

- `allow_credentials` was deleted entirely rather than set to `False` — per plan D-01 and RESEARCH.md Pitfall 5, this is the correct fix since Bearer-header auth requires no cookie-based credentials
- Discovered during Task 2 that PATTERNS.md's assumed module-level `settings = get_settings()` binding at "line ~61" did not actually exist in `main.py` (only an inline `get_settings().server_version` call) — added the binding as part of the CORS fix so both the CORS block and FastAPI app construction reuse one `Settings` instance (Rule 3 — blocking issue, minimal fix, no scope creep)
- `uv sync` (not manual `uv lock` editing) was used to regenerate the lockfile after removing `slowapi` from `pyproject.toml`, correctly cascading removal of transitive-only dependencies (`limits`, `deprecated`, `wrapt`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing module-level `settings` binding in main.py**
- **Found during:** Task 2 (CORS config fix)
- **Issue:** The plan's action text and PATTERNS.md both assumed `settings = get_settings()` was already bound at module level (reused for `server_version`), but the actual code only called `get_settings().server_version` inline with no persisted `settings` variable — the CORS block's `settings.cors_origins.split(",")` would have raised `NameError` without a fix.
- **Fix:** Added `settings = get_settings()` immediately before `app = FastAPI(...)`, and changed `version=get_settings().server_version` to `version=settings.server_version` to reuse the same binding, exactly as PATTERNS.md intended.
- **Files modified:** `backend/app/main.py`
- **Verification:** `test_cors.py` and `test_startup_cleanup.py` both pass; full suite shows no new failures.
- **Committed in:** `5827b5b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the plan's own described CORS fix to be syntactically valid. No scope creep — no other main.py logic touched beyond what the plan specified.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required. Note for deployment: `BMTC_CORS_ORIGINS` should be set to the production mobile/web origins before going live; the default (`http://localhost:8081,http://localhost:19006`) is Expo-dev-only and intentionally has no hardcoded production domain (D-04).

## Next Phase Readiness

- CORS, startup cleanup, and slowapi removal are all complete and verified — Plan 3 of this phase can proceed independently (no shared files with this plan per the phase's file ownership split)
- Test suite: 182 passed, 8 pre-existing baseline failures unchanged (2 in `test_idempotency.py`, 4 in `test_idempotency_bodyhash.py`, 2 in `test_rate_limit.py` — all pre-existing signature/assertion mismatches unrelated to this plan's scope, tracked separately)
- `BMTC_CORS_ORIGINS` env var is now the production hardening lever for mobile/web CORS — needs to be set in `/etc/bmtc-api/env` before production cutover

---
*Phase: 01-backend-correctness*
*Completed: 2026-07-01*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commits (`ba487eb`, `5827b5b`, `df86188`) verified present in git log.

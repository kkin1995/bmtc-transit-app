---
phase: 05-quality-operations
plan: 02
subsystem: observability
tags: [logging, middleware, json, fastapi, starlette, structured-logging]

# Dependency graph
requires:
  - phase: 05-quality-operations
    plan: 01
    provides: no direct dependency (parallel wave-1 plan); shares CLAUDE.md/RESEARCH.md/PATTERNS.md context
provides:
  - backend/app/logging_config.py — JsonFormatter + configure_logging() (root logger setup)
  - TimingMiddleware in backend/app/main.py — one JSON access log line per request
  - backend/deploy/bmtc-api.service — --no-access-log to avoid duplicate log lines
affects: [operators observing production latency/error-rate via journalctl | jq, any future phase adding middleware to main.py]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency-free JSON log formatter via logging.Formatter subclass + json.dumps(default=str)"
    - "Root-logger configure_logging() called once at import time, before app object creation"
    - "try/finally logging in BaseHTTPMiddleware.dispatch so 429/500 short-circuits still log"
    - "Middleware registration order: LAST app.add_middleware() call = outermost (Starlette reverses)"

key-files:
  created:
    - backend/app/logging_config.py
    - backend/tests/test_timing_middleware.py
  modified:
    - backend/app/main.py
    - backend/deploy/bmtc-api.service

key-decisions:
  - "TimingMiddleware registered as the LAST app.add_middleware() call (after RateLimitMiddleware), per RESEARCH.md's correction of CONTEXT.md/D-17's rationale text — Starlette builds the middleware stack in reverse of add_middleware() call order, so 'added first' does NOT make it outermost"
  - "configure_logging() called at import time in main.py before `app = FastAPI(...)`, mirroring the existing `settings = get_settings()` module-level pattern — without it the root logger has no handlers and defaults to WARNING (RESEARCH.md Pitfall 3)"
  - "error_rate is derived by the operator (count(status>=400)/count(*)) from the logged status field, never emitted as its own field (D-18)"
  - "--no-access-log added to the systemd ExecStart line only — no other unit directive touched — to prevent uvicorn's own non-JSON access log duplicating the new structured line"

requirements-completed: [OPS-04]

coverage:
  - id: D1
    description: "JsonFormatter.format() produces valid JSON with timestamp/level/logger/message plus any extra= fields, and never raises on non-serializable values"
    requirement: "OPS-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_json_formatter_produces_valid_json_with_core_keys"
        status: pass
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_json_formatter_includes_extra_fields"
        status: pass
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_json_formatter_never_raises_on_non_serializable_extra"
        status: pass
    human_judgment: false
  - id: D2
    description: "configure_logging() sets the root logger to INFO with exactly one JsonFormatter-formatted handler, idempotently"
    requirement: "OPS-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_configure_logging_sets_root_level_and_single_json_handler"
        status: pass
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_configure_logging_is_idempotent"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every request emits exactly one app.access JSON log line with request_latency_ms, method, path, status"
    requirement: "OPS-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_health_request_emits_one_app_access_log_record"
        status: pass
    human_judgment: false
  - id: D4
    description: "The logged path is request.url.path only — never query string or headers (no PII/secret leakage, T-05-03)"
    requirement: "OPS-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_access_log_path_excludes_query_string_and_secrets"
        status: pass
    human_judgment: false
  - id: D5
    description: "A 429 rate-limit short-circuit still emits an app.access log record — proving TimingMiddleware is registered outermost"
    requirement: "OPS-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_timing_middleware.py::test_429_short_circuit_still_emits_access_log"
        status: pass
    human_judgment: false
  - id: D6
    description: "systemd unit disables uvicorn's own access log to avoid duplicate per-request lines"
    requirement: "OPS-04"
    verification:
      - kind: static
        ref: "grep -- '--no-access-log' backend/deploy/bmtc-api.service"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-05
status: complete
---

# Phase 5 Plan 02: Structured Per-Request JSON Logging Summary

**A dependency-free `JsonFormatter` + `configure_logging()` root-logger setup, paired with a `TimingMiddleware` registered LAST (outermost) in `main.py`, emits one JSON access log line — `request_latency_ms`, `method`, `path`, `status` — for every request including 429s and 500s, with the systemd unit's built-in access log disabled to avoid duplicates.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-05
- **Tasks:** 3 completed
- **Files modified:** 4 (`backend/app/logging_config.py` created, `backend/app/main.py` modified, `backend/tests/test_timing_middleware.py` created, `backend/deploy/bmtc-api.service` modified)

## Accomplishments

- `JsonFormatter(logging.Formatter)` in `backend/app/logging_config.py` emits one `json.dumps()` line per record with `timestamp`/`level`/`logger`/`message` plus any `extra=` fields, using `default=str` so it never raises on non-serializable values
- `configure_logging()` attaches a single `JsonFormatter`-formatted `StreamHandler` to the root logger at INFO, clearing existing handlers first (idempotent) — called at import time in `main.py`, before `app = FastAPI(...)`, fixing RESEARCH.md Pitfall 3 (root logger previously had no handlers and defaulted to WARNING, so every `logger.info()` call in the codebase — including the pre-existing startup-cleanup log line — silently emitted nothing)
- `TimingMiddleware` in `main.py` logs via a dedicated `logging.getLogger("app.access")` in a `try/finally` block, so it fires on normal return, on a 429 short-circuit from `RateLimitMiddleware`, and on an unhandled exception (defaults `status_code = 500`)
- Registered as the LAST `app.add_middleware()` call (after `RateLimitMiddleware`), correcting D-17's own rationale text per RESEARCH.md Pitfall 2 — Starlette's `add_middleware()` inserts at the front of an internal list and builds the stack in reverse, so the last-added middleware is truly outermost
- Logged fields are exactly `request_latency_ms`, `method`, `path` (from `request.url.path` only — never the query string or full URL), and `status` — no Authorization header, request body, or query parameters are ever captured (T-05-03 mitigation)
- `backend/deploy/bmtc-api.service`'s `ExecStart` line gained `--no-access-log` so uvicorn's own non-JSON access log no longer duplicates the new structured JSON line (RESEARCH.md Open Question 2) — no other unit directive changed

## Task Commits

Each task was committed atomically, following the plan's RED/GREEN TDD structure:

1. **Task 1 RED: failing tests for JsonFormatter/configure_logging** - `65584aa` (test)
2. **Task 1 GREEN: JsonFormatter + configure_logging implementation** - `983d4d7` (feat)
3. **Task 2 RED+GREEN: TimingMiddleware wired outermost in main.py** - `139c563` (feat) — includes the RED test additions to `test_timing_middleware.py` plus the GREEN implementation, committed together since the test fixture required a Rule 1 bugfix discovered while getting the RED 429 test to fail meaningfully (see Deviations)
4. **Task 3: systemd `--no-access-log`** - `4fa0f5b` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `backend/app/logging_config.py` (created) — `JsonFormatter`, `configure_logging()`, `_RESERVED` constant
- `backend/app/main.py` (modified) — `configure_logging()` call at import time, `access_logger`, `TimingMiddleware` class, registered as the last `app.add_middleware()` call
- `backend/tests/test_timing_middleware.py` (created) — 8 tests covering the formatter, root-logger config, per-request logging, path/secret exclusion, and the 429-outermost regression guard
- `backend/deploy/bmtc-api.service` (modified) — `--no-access-log` appended to `ExecStart`

## Decisions Made

- Followed RESEARCH.md's two verified corrections to CONTEXT.md's D-17 rationale text: middleware must be added LAST (Pitfall 2), and `configure_logging()` is mandatory because the root logger has no handlers by default (Pitfall 3)
- `error_rate` intentionally NOT emitted as a field — derived by the operator from `status` across log lines (D-18), matching ROADMAP's literal wording via derivation rather than a separate aggregate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture used the wrong segment-seeding pattern, causing a spurious FK failure**
- **Found during:** Task 2, writing the RED test for the 429 regression check
- **Issue:** The plan's `read_first` pointed at `conftest.py`'s fixtures generally; my first attempt at the `rate_limited_access_client` fixture built on `db_with_test_segment`, which enables `PRAGMA foreign_keys = ON` via a raw `sqlite3.connect()` and requires pre-existing `routes`/`stops` rows the segment's FKs reference — this test doesn't need GTFS data, only a valid `segments` row
- **Fix:** Rewrote the fixture to seed the segment via `app.db.get_connection()` (the same connection path the app itself uses, which does not enforce `PRAGMA foreign_keys`), exactly mirroring `test_rate_limit.py`'s existing `setup_rate_limit_segment` fixture precedent
- **Files modified:** `backend/tests/test_timing_middleware.py`
- **Commit:** `139c563`

### Verification Beyond Plan Requirements

- Manually verified the regression guard is load-bearing: temporarily swapped `TimingMiddleware`'s registration to before `RateLimitMiddleware` (innermost) and re-ran `test_429_short_circuit_still_emits_access_log` — it failed as expected, then reverted and re-confirmed GREEN. This proves the test would have caught the exact ordering bug RESEARCH.md's Pitfall 2 warns about, not just exercised a passing code path.

## Issues Encountered

None beyond the fixture fix documented above. Full suite re-verified at 240 passed / 6 pre-existing failures (`test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2 — same baseline as Phase 1–4 and 05-01), no new regressions.

## User Setup Required

None — no external service configuration required. The systemd unit change (`--no-access-log`) will take effect on the next production deploy/restart of `bmtc-api.service`; no immediate action needed since this repo's dev workflow doesn't run the systemd unit.

## Next Phase Readiness

- OPS-04 fully satisfied: `request_latency_ms`/`method`/`path`/`status` are emitted on every request (including 429/500), the root logger is configured so the line actually appears, `error_rate` is derivable from `status` across lines, and no secrets are logged
- No blockers for 05-03/05-04 (load testing, CI pipeline), neither of which depends on this plan's output
- Full backend test suite remains at 240-passing / 6-pre-existing-failure baseline

---
*Phase: 05-quality-operations*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: backend/app/logging_config.py
- FOUND: backend/tests/test_timing_middleware.py
- FOUND: backend/app/main.py
- FOUND: backend/deploy/bmtc-api.service
- FOUND: 65584aa (commit exists in git log)
- FOUND: 983d4d7 (commit exists in git log)
- FOUND: 139c563 (commit exists in git log)
- FOUND: 4fa0f5b (commit exists in git log)

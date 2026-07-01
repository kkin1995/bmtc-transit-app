---
phase: 01-backend-correctness
plan: 01
subsystem: database
tags: [sqlite, connection-management, contextmanager, python]

# Dependency graph
requires: []
provides:
  - "get_connection() as an @contextmanager generator that guarantees conn.close() on every exit path"
  - "Every app + test call site converted to `with get_connection(...) as conn:` syntax"
  - "backend/tests/test_connection_leak.py forced-exception connection-safety regression test"
affects: [01-backend-correctness plan 02, 01-backend-correctness plan 03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["@contextmanager generator with try/finally wrapping yield for guaranteed resource cleanup"]

key-files:
  created:
    - backend/tests/test_connection_leak.py
  modified:
    - backend/app/db.py
    - backend/app/routes.py
    - backend/app/idempotency.py
    - backend/app/rate_limit.py
    - backend/app/bootstrap.py
    - backend/tests/test_integration.py
    - backend/tests/test_rate_limit.py
    - backend/tests/test_idempotency.py
    - backend/tests/test_idempotency_bodyhash.py
    - backend/tests/test_api_errors_alignment.py
    - backend/tests/test_api_v1_alignment.py
    - backend/tests/test_api_gtfs_alignment.py
    - backend/tests/test_global_aggregation.py

key-decisions:
  - "TestClient's default raise_server_exceptions=True means an unhandled exception in a route handler propagates as a Python exception, not a 500 HTTP response — test_connection_leak.py wraps the forced-failure POST in pytest.raises(RuntimeError) rather than asserting response.status_code == 500"
  - "db_with_test_segment fixture (conftest.py) is broken independent of this plan — it inserts into segments via a temp_db connection with PRAGMA foreign_keys=ON but never seeds the parent routes/stops rows, causing sqlite3.IntegrityError. test_connection_leak.py uses the app-level get_connection() (FK-unenforced) pattern from test_integration.py::setup_test_segment instead, avoiding the broken fixture without touching it (out of this plan's scope)."

patterns-established:
  - "Context-manager connection pattern: `with get_connection(db_path) as conn:` at every call site, connection close guaranteed by db.py's try/finally, not by caller discipline"

requirements-completed: [BUGFIX-01]

coverage:
  - id: D1
    description: "get_connection() converted to @contextmanager generator with try/finally guaranteeing conn.close() on every exit path (return, HTTPException, or unhandled exception)"
    requirement: "BUGFIX-01"
    verification:
      - kind: unit
        ref: "backend/app/db.py — python -c import check for __wrapped__ attribute"
        status: pass
      - kind: integration
        ref: "backend/tests/test_connection_leak.py#test_forced_exception_does_not_leak_connection"
        status: pass
      - kind: integration
        ref: "backend/tests/test_connection_leak.py#test_repeated_forced_failures_do_not_exhaust_connections"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 15 application call sites (routes.py x8, idempotency.py x3, rate_limit.py x3, bootstrap.py x1) and 24 test call sites migrated to `with get_connection(...) as conn:` syntax; zero manual conn.close() remain in routes.py"
    requirement: "BUGFIX-01"
    verification:
      - kind: other
        ref: "grep -c 'conn.close()' backend/app/routes.py (returns 0)"
        status: pass
      - kind: other
        ref: "grep -rn 'conn = get_connection' backend/app/ backend/tests/ (returns zero matches)"
        status: pass
      - kind: unit
        ref: "cd backend && uv run pytest -q (176 passed, 8 failed — matches 174/8 baseline plus 2 new leak tests, no regressions)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 1: Connection-Leak Fix (BUGFIX-01) Summary

**Converted `get_connection()` to an `@contextmanager` generator with try/finally, then migrated all 15 application + 24 test call sites to `with` syntax, closing the P0 SQLite file-descriptor leak.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-07-01T04:24:24Z
- **Completed:** 2026-07-01T04:38:19Z
- **Tasks:** 3/3 completed
- **Files modified:** 13 (1 created, 12 modified)

## Accomplishments
- `backend/app/db.py`'s `get_connection()` is now an `@contextmanager` generator: opens the connection, sets `PRAGMA busy_timeout=5000` and `row_factory`, then `try: yield conn / finally: conn.close()` — connection close is guaranteed on every exit path including mid-handler exceptions.
- Every one of the 15 application call sites (`routes.py` x8 handlers, `idempotency.py` x3 functions, `rate_limit.py` x3 functions, `bootstrap.py` x1) converted from `conn = get_connection(...)` to `with get_connection(...) as conn:`, with every early-return `conn.close()` deleted (`grep -c 'conn.close()' backend/app/routes.py` returns 0).
- All 24 test call sites across 9 test files (including the new `test_connection_leak.py`) converted to the same `with` syntax — mechanical, behavior-preserving.
- New `backend/tests/test_connection_leak.py` proves the fix: a forced mid-handler `RuntimeError` (monkeypatched `update_segment_stats`) does not leave the connection open — a subsequent normal request succeeds — and 25 repeated forced failures still leave the DB usable for a normal GET.
- Baseline recorded and verified unchanged: pre-change `174 passed, 8 failed`; post-change `176 passed, 8 failed` (same 8 failing test names — the 2 new passes are the new leak-test file).

## Task Commits

Each task was committed atomically:

1. **Task 1: Record baseline + write connection-leak test** - `a6137a1` (test)
2. **Task 2: Convert get_connection() to @contextmanager in db.py** - `ec06b62` (feat)
3. **Task 3: Update ALL get_connection call sites to `with` syntax** - `63e4d92` (fix)

**Plan metadata:** (this commit, following this SUMMARY)

## Files Created/Modified
- `backend/tests/test_connection_leak.py` - New forced-exception + repeated-failure connection-safety regression test
- `backend/app/db.py` - `get_connection()` converted to `@contextmanager` generator with try/finally
- `backend/app/routes.py` - All 8 handler call sites converted to `with`; all manual `conn.close()` deleted
- `backend/app/idempotency.py` - All 3 call sites (`check_idempotency_key`, `store_idempotency_key`, `cleanup_expired_keys`) converted to `with`
- `backend/app/rate_limit.py` - All 3 call sites (`check_and_spend_token`, `refill_if_needed`, `get_current_limit_state`) converted to `with`, redundant `finally: conn.close()` removed
- `backend/app/bootstrap.py` - 1 call site converted to `with`
- `backend/tests/test_integration.py` - `setup_test_segment` helper converted
- `backend/tests/test_rate_limit.py` - 3 call sites converted
- `backend/tests/test_idempotency.py` - 4 call sites converted
- `backend/tests/test_idempotency_bodyhash.py` - 5 call sites converted
- `backend/tests/test_api_errors_alignment.py` - 1 call site converted
- `backend/tests/test_api_v1_alignment.py` - 1 call site converted
- `backend/tests/test_api_gtfs_alignment.py` - 1 call site converted
- `backend/tests/test_global_aggregation.py` - 8 call sites converted (fixture + 7 test functions)

## Decisions Made
- Starlette's `TestClient` (used via the `client` fixture, default `raise_server_exceptions=True`) re-raises unhandled server exceptions rather than converting them to 500 responses, since `app/main.py` has no generic `Exception` handler. `test_connection_leak.py`'s forced-failure POST is wrapped in `pytest.raises(RuntimeError, match="forced")` instead of asserting `response.status_code == 500` — this correctly reflects the app's actual (pre-existing, out-of-scope) behavior rather than papering over it with a weaker assertion.
- The `db_with_test_segment` fixture in `conftest.py` is independently broken (inserts into `segments` via a `temp_db` connection that has `PRAGMA foreign_keys = ON`, without first seeding the parent `routes`/`stops` rows the FK constraints require — `sqlite3.IntegrityError` on any use). This fixture is unused everywhere else in the test suite. `test_connection_leak.py` avoids it entirely, using the same app-level `get_connection()` pattern (FK-unenforced) that `test_integration.py::setup_test_segment` already established — no fix to the broken fixture was made, since it's outside BUGFIX-01's scope and not required by any acceptance criterion.

## Deviations from Plan

None - plan executed exactly as written. The two items above are test-authoring decisions within Task 1's scope (writing a working, correctly-asserting test), not deviations from the plan's required behavior or files.

## Issues Encountered
- Initial draft of `test_connection_leak.py` used the `db_with_test_segment` fixture per a literal reading of the plan's `read_first` hints, which failed at fixture setup with `sqlite3.IntegrityError: FOREIGN KEY constraint failed` (a pre-existing, unrelated fixture bug). Resolved by switching to the `client`-fixture-based `_setup_test_segment` helper pattern already used by `test_integration.py`, which uses the app's own FK-unenforced connection.
- The forced-failure POST initially asserted `response.status_code == 500`, which raised `RuntimeError` at the assertion line instead because `TestClient` re-raises unhandled exceptions by default. Resolved by wrapping the POST call in `pytest.raises(RuntimeError, match="forced")`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The connection-management substrate (`with get_connection(...) as conn:`) is now established across the entire codebase. Plans 02 and 03 in this phase build directly on this contract and should use the same `with` pattern for any new `get_connection()` usage.
- Full test suite is green relative to baseline (176 passed, 8 failed — identical failure set to the pre-existing 174/8 baseline). The 8 pre-existing failures (idempotency replay-value assertions, rate-limit IP-fallback removal) are explicitly out of this plan's scope and are addressed by later plans in this phase per `01-VALIDATION.md`.
- No blockers for Plan 02 or Plan 03.

---
*Phase: 01-backend-correctness*
*Completed: 2026-07-01*

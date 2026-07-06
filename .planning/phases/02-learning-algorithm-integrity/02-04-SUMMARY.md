---
phase: 02-learning-algorithm-integrity
plan: 04
subsystem: api
tags: [transaction-consolidation, sqlite-single-writer, device-bucket, bugfix]

# Dependency graph
requires:
  - phase: 02-learning-algorithm-integrity
    plan: 02
    provides: update_segment_stats() no longer calls conn.commit() internally (BUGFIX-06 partial — that function only)
  - phase: 02-learning-algorithm-integrity
    plan: 03
    provides: routes.py::get_config already touched in Plan 03; this plan waited for Wave 4 to avoid concurrent edits to the same file
provides:
  - "A ride submission (any segment count) issues exactly one conn.commit() for the entire POST /v1/ride_summary transaction — the single outer commit at the end of the with get_connection(...) block"
  - update_device_bucket() called exactly once per ride, hoisted out of the per-segment loop in routes.py::ride_summary
  - update_device_bucket() and log_rejection() in learning.py no longer commit internally — all three inner learning.py commits (including update_segment_stats, removed in Plan 02) are now gone
affects: [phase-05-testing-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Counting-connection-factory pattern for commit-count assertions: on this Python/sqlite3 build, sqlite3.Connection is an immutable C type — monkeypatch.setattr(sqlite3.Connection, \"commit\", ...) raises TypeError (\"cannot set 'commit' attribute of immutable type\"). The compatible alternative: monkeypatch the plain-function sqlite3.connect to inject factory=<Connection subclass with overridden commit()> via kwargs.setdefault. Same counting intent as RESEARCH.md's documented pattern, portable across builds where the C type is locked."
    - "Once-per-ride setup placed before the per-segment loop, mirroring the existing INSERT INTO rides statement's placement convention (one-time ride-level work goes before the for seq, segment in enumerate(...) loop, not inside it)"

key-files:
  created: []
  modified:
    - backend/app/learning.py
    - backend/app/routes.py
    - backend/tests/test_integration.py
    - backend/tests/test_global_aggregation.py

key-decisions:
  - "D-12/D-13 sequencing: both changes landed in the same Task 2 commit since they're both required for the Task 1 tests to pass together — splitting them across commits would leave one test red between commits"
  - "RESEARCH.md's exact sqlite3.Connection.commit monkeypatch code example does not work on this Python 3.12.13 / sqlite3 3.50.4 build (immutable C type restriction); substituted a functionally equivalent sqlite3.connect-factory counting wrapper that preserves the test's intent (count real conn.commit() invocations across the whole POST) without requiring an unsupported class-level patch (Rule 3 auto-fix — blocking issue, not a deviation from the test's behavior)"

requirements-completed: [BUGFIX-06]

coverage:
  - id: D1
    description: "A 50-segment ride issues exactly one conn.commit() for the whole transaction, not ~100"
    requirement: "BUGFIX-06"
    verification:
      - kind: integration
        ref: "backend/tests/test_integration.py#test_ride_with_50_segments_commits_exactly_once"
        status: pass
    human_judgment: false
  - id: D2
    description: "update_device_bucket() runs exactly once per ride, not once per segment"
    requirement: "BUGFIX-06"
    verification:
      - kind: integration
        ref: "backend/tests/test_global_aggregation.py#test_device_bucket_updated_once_per_ride"
        status: pass
    human_judgment: false
  - id: D3
    description: "No conn.commit() remains inside any learning.py helper function"
    requirement: "BUGFIX-06"
    verification:
      - kind: unit
        ref: "grep -c 'conn.commit()' backend/app/learning.py returns 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full backend suite has no new regressions vs. Phase 2 baseline (196/202, 6 pre-existing failures)"
    requirement: "BUGFIX-06"
    verification:
      - kind: integration
        ref: "cd backend && uv run pytest -n auto --dist loadfile -q"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 4: Transaction Consolidation (BUGFIX-06) Summary

**A ride submission of any size now issues exactly one `conn.commit()` for the whole POST, and `update_device_bucket()` runs once per ride instead of once per segment — closing out BUGFIX-06 and D-13**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T11:47:05Z
- **Completed:** 2026-07-02T11:51:50Z
- **Tasks:** 2 completed (TDD RED/GREEN)
- **Files modified:** 4

## Accomplishments

- Removed the trailing `conn.commit()` from `update_device_bucket()` (learning.py) and `log_rejection()` (learning.py) — combined with Plan 02's removal from `update_segment_stats()`, all three inner per-helper commits in `learning.py` are now gone (D-12)
- Hoisted the `if device_bucket: update_device_bucket(conn, device_bucket)` call out of the per-segment loop in `routes.py::ride_summary`, placing it once immediately after `device_bucket = ride.device_bucket` and before the loop — mirroring the existing once-per-ride placement of `INSERT INTO rides` (D-13)
- The single `conn.commit()` at the end of `ride_summary`'s `with get_connection(...)` block is now the *only* commit for the entire ride-submission transaction — a 50-segment ride went from 51 commits (50 device_bucket + 1 final) down to exactly 1
- Added `test_ride_with_50_segments_commits_exactly_once` (test_integration.py) and `test_device_bucket_updated_once_per_ride` (test_global_aggregation.py), both RED against pre-fix code (51 commits observed; device_bucket incremented by 3 instead of 1) and GREEN after the fix
- Full backend suite: 198 passed, 6 pre-existing failures — same baseline as Plan 02/03, no new failures, +2 net passing tests from this plan

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — single-commit-per-ride and device-bucket-once-per-ride tests** - `723b355` (test)
2. **Task 2: GREEN — remove inner commits (D-12) and hoist device_bucket call (D-13)** - `090abf5` (fix)

**Plan metadata:** (pending — final commit below)

## Files Created/Modified

- `backend/app/learning.py` — Removed trailing `conn.commit()` from `update_device_bucket()` and `log_rejection()`; no other logic changed in either function
- `backend/app/routes.py` — Moved the `if device_bucket: update_device_bucket(conn, device_bucket)` block from inside the per-segment `for` loop to immediately before it, directly after `device_bucket = ride.device_bucket`
- `backend/tests/test_integration.py` — Added `test_ride_with_50_segments_commits_exactly_once`, which seeds the fixture segment via `setup_test_segment(client)` *before* monkeypatching (to avoid counting fixture-setup commits), then monkeypatches `sqlite3.connect` with a counting `Connection` subclass factory and asserts exactly 1 commit for a 50-segment POST
- `backend/tests/test_global_aggregation.py` — Added `test_device_bucket_updated_once_per_ride`, which submits a 3-segment ride with a fixed `device_bucket` and asserts `device_buckets.observation_count` incremented by exactly 1, not 3

## Decisions Made

- **RESEARCH.md's exact commit-counting pattern does not work on this build.** `RESEARCH.md`/`02-PATTERNS.md` specify `monkeypatch.setattr(sqlite3.Connection, "commit", _counting_commit)` — a direct class-level patch of the C-implemented `sqlite3.Connection` type. On this project's Python 3.12.13 / sqlite3 3.50.4 build, that raises `TypeError: cannot set 'commit' attribute of immutable type 'sqlite3.Connection'` (confirmed by reproducing outside pytest before writing the test). The fix substitutes a functionally equivalent approach: monkeypatch the plain-function `sqlite3.connect` (not a C-immutable type) to inject `factory=<CountingConnection subclass>` via `kwargs.setdefault`, where `CountingConnection.commit()` appends to a list and delegates to `super().commit()`. This preserves the exact test intent (count real `conn.commit()` calls across the whole ride POST) and the same fixture-before-monkeypatch ordering discipline RESEARCH.md calls out, just via a build-compatible mechanism. Documented inline in the test's docstring so future readers understand why it diverges from the RESEARCH.md code example.
- D-12 and D-13 were both implemented in the same Task 2 commit (as the plan intended) since the two Task 1 tests only pass together, not independently, once both fixes land.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] RESEARCH.md's `sqlite3.Connection.commit` monkeypatch pattern is incompatible with this Python/sqlite3 build**

- **Found during:** Task 1 (RED)
- **Issue:** `monkeypatch.setattr(sqlite3.Connection, "commit", _counting_commit)` — the exact code shown in `02-RESEARCH.md` "Single-commit-per-ride test" and `02-PATTERNS.md` — raises `TypeError: cannot set 'commit' attribute of immutable type 'sqlite3.Connection'` on Python 3.12.13 with sqlite3 3.50.4. `sqlite3.Connection` is a C-implemented type that does not permit class-level attribute assignment on this build (confirmed by reproducing the failure in an isolated `uv run python -c` snippet before touching the test file).
- **Fix:** Replaced the class-level patch with a `sqlite3.connect`-level patch: `monkeypatch.setattr(sqlite3, "connect", _patched_connect)`, where `_patched_connect` injects `factory=_CountingConnection` (a `sqlite3.Connection` subclass overriding `commit()` to count-then-delegate) into any `sqlite3.connect(...)` call that doesn't already specify a factory. `app/db.py::get_connection()` calls `sqlite3.connect(db_path)` with no factory argument, so this transparently intercepts the same connection the app code uses. Verified the subclass-factory approach works via an isolated repro before wiring it into the test.
- **Files modified:** `backend/tests/test_integration.py`
- **Commit:** `723b355`

Or in short: plan executed exactly as written for the fix (learning.py/routes.py changes match `02-PATTERNS.md`'s target shape verbatim); one test-mechanics gap (the documented monkeypatch pattern doesn't work on this Python build) was closed with a build-compatible substitute that verifies the identical behavior.

## Issues Encountered

None beyond the monkeypatch-mechanics deviation above, resolved within Task 1 before the RED-state acceptance criteria were checked.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- BUGFIX-06 fully resolved: all three inner `learning.py` commits removed (Plan 02 + this plan), device_bucket deduped to once-per-ride (D-13)
- Phase 2 (Learning Algorithm Integrity) is now complete: BUGFIX-04, BUGFIX-05, BUGFIX-06, LEARN-01 all resolved across Plans 01–04
- Full backend suite: 198 passed, 6 pre-existing failures (same baseline carried from Plan 01 through Plan 04 — Phase 6 scope per `01-REVIEW.md`, not phase-2-blocking)

---
*Phase: 02-learning-algorithm-integrity*
*Completed: 2026-07-02*

## Self-Check: PASSED

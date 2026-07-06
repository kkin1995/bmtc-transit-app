---
phase: 04-data-management
plan: 03
subsystem: infra
tags: [sqlite, systemd, bash, retention, data-lifecycle]

# Dependency graph
requires:
  - phase: 04-data-management (plan 02)
    provides: bmtc-rate-limit-cleanup.service/.timer pairing pattern and the 00:00/00:15 stagger convention this plan's retention.timer already used
provides:
  - "retention_cleanup.sh: a single script running three ordered TTL deletes (ride_segments, orphaned rides, rejection_log)"
  - "bmtc-retention.service now calls the script instead of an inline single-table sqlite3 DELETE"
affects: [04-04, 04-05, operations/deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordered multi-table retention delete in one script, each step's before/after row counts logged (mirrors rate_limit_cleanup.sh)"
    - "Test-file path resolved via Path(__file__).parent.parent so subprocess tests work regardless of pytest invocation cwd"

key-files:
  created:
    - backend/scripts/retention_cleanup.sh
    - backend/tests/test_retention_cleanup.py
  modified:
    - backend/deploy/bmtc-retention.service

key-decisions:
  - "Corrected RESEARCH.md's/plan's literal test subprocess path (\"backend/scripts/retention_cleanup.sh\", relative to repo root) to Path(__file__).parent.parent / \"scripts\" / \"retention_cleanup.sh\", matching the precedent already established in test_rate_limit_cleanup_script.py from 04-02 — the literal path breaks under the project's own documented `cd backend && uv run pytest` invocation."
  - "Orphan-rides DELETE keyed on rides.ride_id (the actual PK) rather than the RESEARCH.md code example's rides.id, per the plan's own key_links correction."

patterns-established: []

requirements-completed: [DATA-03]

coverage:
  - id: D1
    description: "retention_cleanup.sh deletes ride_segments older than BMTC_RETENTION_DAYS, then orphaned rides (zero remaining ride_segments), then rejection_log older than BMTC_REJECTION_LOG_RETENTION_DAYS, in that order, in one run"
    requirement: "DATA-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_retention_cleanup.py#test_single_run_performs_all_three_deletes_in_order"
        status: pass
      - kind: integration
        ref: "backend/tests/test_retention_cleanup.py#test_ride_segments_ttl_boundary"
        status: pass
      - kind: integration
        ref: "backend/tests/test_retention_cleanup.py#test_rejection_log_ttl_boundary"
        status: pass
    human_judgment: false
  - id: D2
    description: "A rides row whose ride_segments have all aged out is deleted; a ride that still has an in-window segment is kept"
    requirement: "DATA-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_retention_cleanup.py#test_orphaned_ride_removed_when_all_segments_age_out"
        status: pass
      - kind: integration
        ref: "backend/tests/test_retention_cleanup.py#test_non_orphan_ride_kept_when_a_segment_is_in_window"
        status: pass
    human_judgment: false
  - id: D3
    description: "bmtc-retention.service's ExecStart calls retention_cleanup.sh instead of the inline sqlite3 command (D-06)"
    verification:
      - kind: other
        ref: "grep -q retention_cleanup.sh backend/deploy/bmtc-retention.service && ! grep -q sqlite3 backend/deploy/bmtc-retention.service"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-04
status: complete
---

# Phase 4 Plan 03: Retention Cleanup Script (DATA-03) Summary

**`retention_cleanup.sh` replaces the inline single-table sqlite3 DELETE with three ordered TTL deletes (ride_segments, orphaned rides, rejection_log), closing the orphaned-`rides`-row leak and wiring the previously-dead `rejection_log` TTL.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-04T03:36:00Z (approx, session start)
- **Completed:** 2026-07-04T03:39:27Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- New `backend/scripts/retention_cleanup.sh` runs three ordered deletes in one invocation: `ride_segments` past `BMTC_RETENTION_DAYS` (90d default), orphaned `rides` with zero remaining `ride_segments` (the DATA-03 core fix), then `rejection_log` past `BMTC_REJECTION_LOG_RETENTION_DAYS` (30d default, D-05 drive-by).
- `bmtc-retention.service`'s `ExecStart` now calls the script (`/opt/bmtc-api/scripts/retention_cleanup.sh`) instead of an inline `bash -c 'sqlite3 ...'` one-liner that only ever touched `ride_segments` (D-06).
- Five new integration tests in `backend/tests/test_retention_cleanup.py` cover orphan removal, non-orphan retention, both TTL boundaries, and single-run ordering — all invoked via `subprocess.run(["bash", ...])` against the file-based `temp_db` fixture.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write failing retention-cleanup tests** - `8ee5cd2` (test)
2. **Task 2 (GREEN): Implement retention_cleanup.sh** - `d8a36f2` (feat)
3. **Task 3: Point bmtc-retention.service at the new script (D-06)** - `324d745` (fix)

**Plan metadata:** (this commit, follows)

## Files Created/Modified
- `backend/tests/test_retention_cleanup.py` - 5 tests (orphan-ride removal, non-orphan retention, ride_segments TTL boundary, rejection_log TTL boundary, single-run three-delete ordering)
- `backend/scripts/retention_cleanup.sh` - three-delete retention script, `chmod +x`, follows `rate_limit_cleanup.sh`'s header/logging/error-handling conventions
- `backend/deploy/bmtc-retention.service` - `ExecStart` changed from inline `sqlite3` DELETE to `/opt/bmtc-api/scripts/retention_cleanup.sh`

## Decisions Made
- Kept the orphan-rides DELETE keyed on `rides.ride_id` (the actual primary key) rather than `rides.id` — the plan's own `key_links` had already caught and corrected this against the RESEARCH.md code example, which used the wrong column name.
- Resolved the test subprocess script path via `Path(__file__).parent.parent / "scripts" / "retention_cleanup.sh"` instead of the plan's literal `"backend/scripts/retention_cleanup.sh"` string (see Deviations below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected subprocess script path to resolve independent of pytest invocation cwd**
- **Found during:** Task 1 (RED) — writing the test file
- **Issue:** The plan's `<behavior>` block and RESEARCH.md's code example both specify `subprocess.run(["bash", "backend/scripts/retention_cleanup.sh"], ...)`, a path relative to the repo root. But this repo's own documented test invocation is `cd backend && uv run pytest ...` (per CLAUDE.md and this plan's own `<verify>` blocks), which makes the process cwd `backend/` — so the literal string would resolve to the nonexistent `backend/backend/scripts/retention_cleanup.sh` and fail regardless of whether the script exists.
- **Fix:** Resolved the script path via `Path(__file__).parent.parent / "scripts" / "retention_cleanup.sh"`, matching the precedent already established in `backend/tests/test_rate_limit_cleanup_script.py` (04-02, `CLEANUP_SCRIPT` constant) which explicitly documents this exact cwd-independence concern.
- **Files modified:** backend/tests/test_retention_cleanup.py
- **Verification:** RED confirmed failures showed the correct absolute path with "No such file or directory" (script genuinely absent, not a path bug); GREEN confirmed all 5 tests pass once the script was created.
- **Committed in:** 8ee5cd2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary correctness fix to make the tests actually exercise the script under this project's real test-invocation convention. No scope creep — the fix only changed how the script path is resolved within the test file already specified by the plan.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (Production deploy of the updated `bmtc-retention.service` unit is an operator action outside this plan's scope, consistent with prior 04-01/04-02 plans.)

## Next Phase Readiness
- DATA-03 fully satisfied: the daily retention timer now bounds `rides`, `ride_segments`, and `rejection_log` table growth in a single scheduled run.
- Ready for 04-04 (GTFS update workflow), which is independent of this plan's scripts.
- Full backend suite: 225 passed, 6 pre-existing failures unchanged (`test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2) — same baseline as 04-01/04-02, no new regressions.

---
*Phase: 04-data-management*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commit hashes (8ee5cd2, d8a36f2, 324d745) verified present in git history.

---
phase: 02-learning-algorithm-integrity
plan: 02
subsystem: api
tags: [welford, learning-algorithm, dead-code-removal, seed-and-accept, ema-removal]

# Dependency graph
requires:
  - phase: 02-learning-algorithm-integrity
    plan: 01
    provides: Sample-variance-correct compute_variance() with the n<2 guard preserved (protects the seeded n=0 row and first Welford update from ZeroDivisionError)
provides:
  - update_segment_stats() seeds a new segment_stats row on first observation for any never-seen (segment_id, bin_id) and accepts it (n becomes 1) instead of rejecting with missing_stats
  - EMA fully removed from the active learning pipeline (update_ema, compute_time_based_alpha, is_stale deleted; ema_mean/ema_var no longer read or written by update_segment_stats)
  - update_segment_stats no longer commits internally (BUGFIX-06 partial — this function only)
affects: [02-03, 02-04, phase-05-testing-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed-then-fall-through for sparse aggregate tables: the seeded branch produces variables in the exact same shape/order as the row-found branch so downstream logic (outlier check, Welford update, UPDATE) runs unmodified regardless of which branch executed"
    - "Source-inspection test via inspect.getsource() to negatively assert dead strings/identifiers are absent from a function body (used for ema_mean/ema_var/missing_stats removal verification)"

key-files:
  created: []
  modified:
    - backend/app/learning.py
    - backend/tests/test_learning.py
    - backend/tests/test_global_aggregation.py

key-decisions:
  - "D-02/D-03 sequencing: EMA call-site removal and the three dead-function deletions landed in the SAME commit (Task 2) — splitting them would raise NameError on the next ride submission, per RESEARCH.md Pitfall #4"
  - "D-09/D-02 same-statement sequencing: the seed-and-fall-through rewrite and the ema_mean/ema_var column removal both edit the same SELECT/UPDATE statements in update_segment_stats — done as one coherent rewrite, not two passes"
  - "D-10 fallback: seed_schedule_mean uses AVG(schedule_mean) across the segment's other bins, or 0.0 when the segment has zero existing segment_stats rows (verified by a dedicated test)"
  - "Optional import removed from learning.py — the only two callers (compute_time_based_alpha, is_stale) were deleted in this plan, and no other function in the module used it as a live type annotation"

patterns-established:
  - "Test helper _insert_bare_segment() in test_learning.py seeds routes/stops/time_bins rows to satisfy FK constraints before inserting into segments — reusable pattern for future in_memory_db tests that need a real segment_id"

requirements-completed: [BUGFIX-04, LEARN-01]

coverage:
  - id: D1
    description: "A never-seen (segment_id, bin_id) creates a segment_stats row and the observation is accepted (n becomes 1), never rejected with missing_stats"
    requirement: "BUGFIX-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_update_segment_stats_seeds_new_bin_and_accepts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Seed schedule_mean falls back to 0.0 when the segment has zero existing segment_stats rows (AVG returns NULL)"
    requirement: "BUGFIX-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_seed_falls_back_to_zero_when_no_existing_bins"
        status: pass
    human_judgment: false
  - id: D3
    description: "The first observation on a freshly seeded n=0 row is never falsely rejected as an outlier"
    requirement: "BUGFIX-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_seed_row_is_not_falsely_rejected_as_outlier"
        status: pass
    human_judgment: false
  - id: D4
    description: "update_ema, compute_time_based_alpha, and is_stale no longer exist in app.learning"
    requirement: "LEARN-01"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_update_ema_and_compute_time_based_alpha_and_is_stale_are_removed"
        status: pass
    human_judgment: false
  - id: D5
    description: "update_segment_stats no longer reads/writes ema_mean/ema_var and no longer calls the EMA helpers or missing_stats"
    requirement: "LEARN-01"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_ema_columns_not_written_by_update_segment_stats"
        status: pass
    human_judgment: false
  - id: D6
    description: "Downstream rejection tests (test_global_aggregation.py) updated to assert deterministic reasons post-seed-and-accept, no missing_stats tolerance remains"
    requirement: "BUGFIX-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_global_aggregation.py#test_outlier_rejection, backend/tests/test_global_aggregation.py#test_rejected_by_reason_breakdown"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 2: Learning Core Surgery (Seed-and-Accept + EMA Removal) Summary

**`update_segment_stats()` now seeds and accepts a never-seen (segment_id, bin_id) instead of rejecting it with `missing_stats`, and all EMA dead code (`update_ema`, `compute_time_based_alpha`, `is_stale`) is deleted from `app.learning`**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-02T11:17:48Z (session start, continued from Plan 01)
- **Completed:** 2026-07-02T11:30:38Z
- **Tasks:** 3 completed (TDD RED/GREEN + one auto task)
- **Files modified:** 3

## Accomplishments

- Fixed BUGFIX-04: submitting a ride segment for a never-seen `(segment_id, bin_id)` now seeds a new `segment_stats` row (`n=0`, `welford_mean`/`schedule_mean` = `AVG(schedule_mean)` across the segment's other bins, or `0.0` if none) and falls through into the existing outlier-check + Welford-update logic, so the triggering observation is accepted and `n` becomes 1 — never rejected with `missing_stats`
- `missing_stats` is fully retired as a rejection reason; `update_segment_stats`'s docstring rejection-reason enumeration now lists only `'low_mapmatch_conf', 'outlier', None`
- Resolved LEARN-01: deleted `update_ema`, `compute_time_based_alpha`, and `is_stale` entirely from `app/learning.py` — zero remaining callers, confirmed via grep
- `update_segment_stats` no longer reads or writes `ema_mean`/`ema_var` in its SELECT/UPDATE statements (the columns remain inert in the schema per D-05, unchanged this plan)
- Removed the trailing `conn.commit()` from `update_segment_stats` (BUGFIX-06, this function only — `update_device_bucket`/`log_rejection` still commit, addressed in Plan 04)
- Updated two stale rejection tests in `test_global_aggregation.py` that tolerated `missing_stats` — both now assert deterministic post-BUGFIX-04 rejection reasons (`outlier` for the pre-seeded bin, `low_mapmatch_conf` for the low-confidence segment)
- Full backend suite: 196 passed, 6 pre-existing failures (unchanged baseline — no new failures, no `NameError` from split call-site/definition removal)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — seed-and-accept tests + EMA/is_stale removal-verification tests** - `8b2fb2b` (test)
2. **Task 2: GREEN — rewrite update_segment_stats (seed + EMA removal + no-commit) and delete EMA/is_stale defs** - `b51d99b` (fix)
3. **Task 3: Update stale rejection tests in test_global_aggregation.py** - `49b866e` (test)

**Plan metadata:** (pending — final commit below)

## Files Created/Modified

- `backend/app/learning.py` — `update_segment_stats` rewritten with seed-and-fall-through for unseen bins; `update_ema`, `compute_time_based_alpha`, `is_stale` deleted; `Optional` import removed (no longer used); trailing `conn.commit()` removed from `update_segment_stats`
- `backend/tests/test_learning.py` — Deleted `test_ema_update` and `test_time_based_alpha`; removed `update_ema`/`compute_time_based_alpha` from imports; added `_insert_bare_segment()` FK-satisfying test helper and five new tests: `test_update_segment_stats_seeds_new_bin_and_accepts`, `test_seed_falls_back_to_zero_when_no_existing_bins`, `test_seed_row_is_not_falsely_rejected_as_outlier`, `test_update_ema_and_compute_time_based_alpha_and_is_stale_are_removed`, `test_ema_columns_not_written_by_update_segment_stats`
- `backend/tests/test_global_aggregation.py` — `test_outlier_rejection` and `test_rejected_by_reason_breakdown` updated to drop `missing_stats` tolerance in favor of deterministic reasons

## Decisions Made

None beyond the plan's explicit instructions — the seed-and-fall-through shape, EMA deletion scope, and commit removal exactly followed 02-PATTERNS.md's target-shape section.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Added FK-satisfying test fixtures for the three new seed tests**

- **Found during:** Task 1 (RED)
- **Issue:** The plan's `<behavior>` spec described inserting "a bare segments row" directly via `conn.execute`, but `segments` has `FOREIGN KEY` constraints on `route_id → routes` and `from_stop_id`/`to_stop_id → stops`, and `segment_stats` has an additional FK on `bin_id → time_bins`. A bare insert into `segments` (and subsequently `segment_stats`) fails with `sqlite3.IntegrityError: FOREIGN KEY constraint failed` under the `in_memory_db` fixture, which only loads the schema with no seed rows.
- **Fix:** Added a small test-only helper `_insert_bare_segment(conn, route_id, ...)` that inserts a minimal `routes` row, `stops` rows (via `INSERT OR IGNORE`), and `time_bins` rows for bins 0 and 5 before inserting into `segments`. All three new DB-backed tests (`test_update_segment_stats_seeds_new_bin_and_accepts`, `test_seed_falls_back_to_zero_when_no_existing_bins`, `test_seed_row_is_not_falsely_rejected_as_outlier`) use this helper.
- **Files modified:** `backend/tests/test_learning.py`
- **Commit:** `8b2fb2b`

Or in short: plan executed as written for `app/learning.py` and `test_global_aggregation.py`; one test-fixture gap (FK dependencies) was closed in `test_learning.py` to make the RED tests actually exercise the intended code path rather than fail on unrelated `IntegrityError`s.

## Issues Encountered

None beyond the FK deviation above, which was resolved within Task 1 before the RED-state acceptance criteria were verified.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- BUGFIX-04 and LEARN-01 (learning.py surgery half) fully resolved and regression-locked
- LEARN-01's config-surface completion (removing `ema_alpha`/`half_life_days` from `Settings` and soft-deprecating the corresponding `ConfigResponse` fields) is deferred to Plan 03, per the plan's stated scope split
- BUGFIX-06's remaining commit removals (`update_device_bucket`, `log_rejection`) and the `ride_summary` loop dedupe (D-13) are deferred to Plan 04
- Full backend suite: 196 passed, 6 pre-existing failures (unchanged baseline vs. Plan 01's 193/199 — the +3 passed reflects this plan's 5 new tests minus... actually net effect: 5 new tests added and passing, 2 existing tests deleted, 2 existing tests updated in place, 0 new failures)

---
*Phase: 02-learning-algorithm-integrity*
*Completed: 2026-07-02*

## Self-Check: PASSED

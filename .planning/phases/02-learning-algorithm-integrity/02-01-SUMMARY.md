---
phase: 02-learning-algorithm-integrity
plan: 01
subsystem: api
tags: [welford, statistics, learning-algorithm, sample-variance]

# Dependency graph
requires:
  - phase: 01-backend-correctness
    provides: Clean learning.py module (connection leak, idempotency, CORS fixed); stable test baseline (189 passed, 6 pre-existing failures)
provides:
  - compute_variance() now returns Bessel-corrected sample variance m2/(n-1) for n>=2
  - Three golden-value regression tests locking the variance formula, the n<2 guard, and P90 widening behavior
affects: [02-02, 02-03, 02-04, phase-05-testing-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["golden-value unit test using Python stdlib statistics.variance/pvariance as an independent oracle"]

key-files:
  created: []
  modified:
    - backend/app/learning.py
    - backend/tests/test_learning.py

key-decisions:
  - "Preserved the existing n<2 guard exactly (returns 0.0 for n=0 and n=1) — this guard is what keeps the BUGFIX-04 seeded n=0 row and the first Welford update safe from ZeroDivisionError"

patterns-established:
  - "Golden-value tests cross-check pure statistical functions against Python's stdlib `statistics` module (ddof=0/1) rather than hand-computed expected values"

requirements-completed: [BUGFIX-05]

coverage:
  - id: D1
    description: "compute_variance() returns m2/(n-1) sample variance for n>=2 instead of m2/n population variance"
    requirement: "BUGFIX-05"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_compute_variance_uses_sample_formula_not_population"
        status: pass
    human_judgment: false
  - id: D2
    description: "n<2 guard preserved unchanged (n=0 and n=1 both return 0.0, no ZeroDivisionError)"
    requirement: "BUGFIX-05"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_compute_variance_guards_n_less_than_2"
        status: pass
    human_judgment: false
  - id: D3
    description: "P90 ETA bound is measurably wider with sample variance than with population variance after 10 observations"
    requirement: "BUGFIX-05"
    verification:
      - kind: unit
        ref: "backend/tests/test_learning.py#test_p90_wider_with_sample_variance_than_population_variance"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 1: Sample Variance Fix Summary

**`compute_variance()` now returns Bessel-corrected sample variance `m2/(n-1)` instead of population variance `m2/n`, widening P90 ETA bounds to correctly reflect statistical uncertainty**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T11:17:48Z
- **Completed:** 2026-07-02T11:24:00Z
- **Tasks:** 2 completed (TDD RED/GREEN)
- **Files modified:** 2

## Accomplishments
- Fixed BUGFIX-05: `compute_variance()` divisor changed from `m2/n` (population variance) to `m2/(n-1)` (sample variance), the canonical convention paired with Welford's algorithm
- Added three golden-value regression tests cross-checked against Python's stdlib `statistics.variance`/`statistics.pvariance`
- Confirmed the `n < 2` guard survives the divisor change unmodified — locks in protection against `ZeroDivisionError` for the BUGFIX-04 seeded `n=0` row and the first real Welford update (`n=1`)
- Verified P90 ETA bound is strictly wider under the sample formula than the population formula after 10 observations, satisfying ROADMAP Phase 2 success criterion #2

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — golden-value tests for sample variance, guard, and P90 widening (BUGFIX-05)** - `707ebde` (test)
2. **Task 2: GREEN — change compute_variance divisor to m2/(n-1) (BUGFIX-05)** - `a812bcd` (fix)

**Plan metadata:** (pending — final commit below)

## Files Created/Modified
- `backend/app/learning.py` - `compute_variance()` divisor changed from `m2/n` to `m2/(n-1)`; `if n < 2: return 0.0` guard unchanged
- `backend/tests/test_learning.py` - Added `import statistics`; added `test_compute_variance_uses_sample_formula_not_population`, `test_compute_variance_guards_n_less_than_2`, `test_p90_wider_with_sample_variance_than_population_variance`

## Decisions Made
None beyond the plan's explicit instruction — preserved the `n < 2` guard exactly as specified, did not touch the docstring (already correctly says "sample variance").

## Deviations from Plan

None - plan executed exactly as written.

One clarifying note (not a deviation): the plan's Task 1 acceptance criteria expected both `test_compute_variance_uses_sample_formula_not_population` and `test_p90_wider_with_sample_variance_than_population_variance` to FAIL in RED state. In practice, `test_p90_wider...` computes both the old (`m2/n`) and new (`m2/(n-1)`) formulas inline and compares them directly — it does not call the (still-buggy) `compute_variance()` function at all, so it passed immediately in RED state. Only `test_compute_variance_uses_sample_formula_not_population` failed as expected (assertion error, not a collection/import error), and the guard test passed as expected. This is consistent with the test's own design intent (comparing the two formulas independent of the current implementation) and required no code change to resolve — verified per plan's actual acceptance criteria wording ("assertion error, not collection/import error").

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BUGFIX-05 fully resolved; `compute_variance()` is now correct and regression-locked
- Wave 1 of Phase 2 complete; Wave 2 plans (02-02, 02-03, 02-04) can proceed — the `n < 2` guard this plan locked in is a documented dependency for BUGFIX-04's seeded-row path (per RESEARCH.md Pitfall #2)
- Full backend suite: 193 passed, 6 pre-existing failures (unchanged baseline vs. 189/195 recorded in 02-VALIDATION.md — no new failures introduced)

---
*Phase: 02-learning-algorithm-integrity*
*Completed: 2026-07-02*

## Self-Check: PASSED

---
phase: 05-quality-operations
plan: 03
subsystem: testing
tags: [httpx, asyncio, sqlite, load-testing, performance]

# Dependency graph
requires:
  - phase: 05-quality-operations (plan 01)
    provides: bootstrap smoke test conventions (17-table/3-view schema verification, temp-DB patterns)
  - phase: 05-quality-operations (plan 02)
    provides: TimingMiddleware/JsonFormatter (not directly used here, but establishes the phase's "zero new deps, stdlib-only" pattern)
provides:
  - Standalone asyncio/httpx load-test script (backend/tests/perf/load_test.py) proving POST /v1/ride_summary p99 < 200ms and GET /v1/eta p99 < 100ms under 20 concurrent clients
  - Committed evidence artifact (backend/tests/perf/results.txt) of a real manual run
affects: [05-04 (CI pipeline — load test intentionally excluded per D-03)]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies — httpx/asyncio/sqlite3 already present (dev dependency-group)
  patterns:
    - "Direct scratch-DB segment/segment_stats seeding (mirrors conftest's db_with_test_segment) instead of reusing generate_sample_data.py's synthetic IDs, which 422 against the real segment-lookup check"
    - "Per-client distinct SHA256 device_bucket to exercise the real RateLimitMiddleware token-bucket path under concurrency, not bypass it"
    - "Hardcoded local-only BASE_URL/API_KEY/DB_PATH constants, never read from ambient env vars, to prevent an accidental run against a real deployment or bmtc_dev.db"

key-files:
  created:
    - backend/tests/perf/load_test.py
    - backend/tests/perf/results.txt
  modified: []

key-decisions:
  - "load_test.py filename intentionally not prefixed test_ so pytest's python_files = test_*.py config does not collect it (D-06) — verified via `uv run pytest --collect-only`"
  - "results.txt written relative to the script's own location (Path(__file__).parent), not the invocation cwd, so it's robust regardless of which directory the script is run from"
  - "POST and GET load runs executed in two separate invocations against isolated scratch DB (/tmp/perf.db), per D-05 — not mixed concurrent traffic"

patterns-established:
  - "Pattern: manual/local-only evidence artifacts (results.txt) are committed to git but never referenced from CI workflows or pytest collection — a phase can have OPS-verification narrower than 'runs on every commit'"

requirements-completed: [OPS-01]

coverage:
  - id: D1
    description: "Standalone load_test.py script exists, drives >=20 concurrent clients per endpoint via asyncio/httpx, is not collected by pytest, and computes p50/p99 via pure-Python nearest-rank percentile"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "cd backend && uv run python -c \"import sys; sys.path.insert(0,'tests/perf'); import load_test as L; assert L.percentile(list(range(1,101)),99)==99 and L.percentile(list(range(1,101)),50)==50\""
        status: pass
      - kind: unit
        ref: "cd backend && uv run pytest --collect-only -q | grep -c 'load_test' -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two real load runs (POST /v1/ride_summary and GET /v1/eta, separate) executed against a scratch-DB-backed uvicorn server on 127.0.0.1:8001; p99 latency below target for both, evidence committed in results.txt"
    requirement: "OPS-01"
    verification:
      - kind: manual_procedural
        ref: "backend/tests/perf/results.txt (POST: p50=31.05ms p99=88.29ms target=200ms PASS=True; GET: p50=20.96ms p99=78.47ms target=100ms PASS=True)"
        status: pass
    human_judgment: true
    rationale: "This is a manual/local-only load test by explicit design (D-03) — not automated or CI-gated. Actual latency numbers reflect this development machine's hardware, not a production SLA guarantee; a human should confirm the numbers are plausible and the run methodology (steady-rate, separate endpoints, real device_bucket per client) matches the plan's intent."

duration: 8min
completed: 2026-07-05
status: complete
---

# Phase 5 Plan 03: Load Testing (OPS-01) Summary

**Standalone asyncio/httpx load-test script proves POST /v1/ride_summary p99=88ms (<200ms target) and GET /v1/eta p99=78ms (<100ms target) under 20 concurrent clients, each with a real per-bucket rate-limit token check — zero new dependencies.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-05T09:07:00Z (approx, per STATE.md session continuity)
- **Completed:** 2026-07-05T09:11:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Built `backend/tests/perf/load_test.py`: a dependency-free asyncio/httpx script that spins up N concurrent simulated clients (`asyncio.gather`), each with its own `httpx.AsyncClient` and a distinct SHA256 `device_bucket`, hitting either `POST /v1/ride_summary` or `GET /v1/eta` in isolated runs
- Implemented direct scratch-DB seeding (`seed_scratch_db`) that inserts a `PERF_ROUTE` segment plus all-192-bin `segment_stats` rows with `n=5`/populated Welford values, mirroring `conftest.py`'s `db_with_test_segment` fixture — avoids `generate_sample_data.py`'s synthetic IDs, which would 422 against the real segment-lookup check
- Implemented pure-Python nearest-rank `percentile()`, verified against `percentile([1..100], 99) == 99` and `percentile([1..100], 50) == 50`
- Ran the two required load passes for real against a scratch-DB uvicorn server on `127.0.0.1:8001` (never `bmtc_dev.db`), captured actual p50/p99 numbers, and committed them to `backend/tests/perf/results.txt` as evidence — both endpoints passed their p99 targets with comfortable margin (POST: 88ms vs 200ms target; GET: 78ms vs 100ms target)
- Confirmed the script is invisible to pytest collection (`uv run pytest --collect-only -q | grep -c load_test` → 0) and not referenced anywhere in a CI workflow (no `.github/workflows/` exists yet — OPS-03 is out of scope for this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the standalone asyncio/httpx load test script** - `0fecf31` (feat)
2. **Task 2: Execute the two load runs and commit results.txt evidence** - `8ee9fc9` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified
- `backend/tests/perf/load_test.py` - Standalone asyncio/httpx load-test script (seed, percentile, post_client, eta_client, run, main/argparse); not collected by pytest, not run in CI
- `backend/tests/perf/results.txt` - Two committed run lines (POST and GET) as OPS-01 evidence

## Decisions Made
- Wrote `results.txt` relative to the script's own file location (`Path(__file__).parent / "results.txt"`) rather than the invocation `cwd`, so the append target is stable regardless of which directory the script is invoked from — a small robustness improvement over the RESEARCH.md skeleton's relative `"tests/perf/results.txt"` literal (which assumed `cwd == backend/`).
- Followed D-03/D-05/D-06/D-04/D-02/T-05-06 exactly as specified in the plan and threat model — no deviations required.

## Deviations from Plan

None - plan executed exactly as written. The RESEARCH.md's provided skeleton needed only the `Path(__file__).parent`-relative results path adjustment (a minor robustness improvement, not a bug fix requiring deviation tracking) and the `seed_scratch_db(db_path)` signature to accept an explicit `db_path` parameter as the plan's `<action>` text specified (rather than reading a module-level global directly), which was already the intended shape.

## Issues Encountered

None. The manual load runs executed cleanly on the first attempt: the scratch-DB server started successfully on port 8001, both load passes completed without unexpected non-200/429 responses, and the background uvicorn process was confirmed stopped (`ps aux | grep uvicorn` returned nothing) before cleanup of `/tmp/perf.db` and its WAL/SHM sidecar files.

## User Setup Required

None - no external service configuration required. This is a fully local, manual-only load test (D-03); no ongoing operator action is needed beyond re-running it manually if the endpoints change materially.

## Next Phase Readiness

OPS-01 is fully satisfied: both stated performance targets (POST p99 < 200ms, GET p99 < 100ms) are demonstrated under >=20 concurrent clients with a reproducible script and committed evidence. The load test is deliberately excluded from `.github/workflows/ci.yml` (D-03) — Plan 05-04 (CI pipeline, OPS-03) should NOT add `load_test.py` to the CI job; it remains a manual, on-demand tool. No blockers for the remaining Phase 5 plan.

---
*Phase: 05-quality-operations*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: backend/tests/perf/load_test.py
- FOUND: backend/tests/perf/results.txt
- FOUND: .planning/phases/05-quality-operations/05-03-SUMMARY.md
- FOUND commit: 0fecf31
- FOUND commit: 8ee9fc9

---
phase: 05-quality-operations
plan: 04
subsystem: infra
tags: [github-actions, ci, uv, pytest, yaml]

requires:
  - phase: 05-quality-operations (plan 01-03)
    provides: verified test suite (bootstrap schema tests, JSON access logging, load test) that CI now runs on every push/PR
provides:
  - .github/workflows/ci.yml — GitHub Actions workflow authored, committed, and verified green on a real PR run
affects: [operator branch-protection follow-up, future CI job additions]

tech-stack:
  added: [GitHub Actions (actions/checkout@v7, astral-sh/setup-uv@v8.3.0)]
  patterns: ["backend-only CI job with defaults.run.working-directory", "least-privilege permissions: contents: read", "pull_request (never pull_request_target) trigger"]

key-files:
  created: [.github/workflows/ci.yml]
  modified: [backend/.gitignore, .gitignore, backend/uv.lock, backend/tests/conftest.py, backend/tests/test_idempotency_bodyhash.py, backend/tests/test_rate_limit.py, backend/app/rate_limit.py]

key-decisions:
  - "astral-sh/setup-uv has no rolling v8 major tag yet (only exact v8.x.y and the older rolling v7) — pinned to exact v8.3.0 instead of a floating major tag"
  - "backend/uv.lock was gitignored in both .gitignore files and had never been committed — un-ignored and committed it, since `uv sync --locked` in CI cannot function without a checked-in lockfile"
  - "Fixed 5 real test-isolation/app bugs surfaced by the first true CI runs (no dev .env, no ambient ports/services) rather than suppressing them — see requirements-completed and Issues Encountered"
  - "Pushing the phase branch and opening PR #1 was confirmed with the user before doing it, since it's a shared-state/remote action"

patterns-established:
  - "CI workflow scope is backend-only (D-11); mobile Jest and tests/perf/load_test.py are explicitly excluded from CI (D-03)"
  - "conftest.py sets a process-wide BMTC_API_KEY fallback via os.environ.setdefault() so Settings() always validates regardless of ambient .env presence"

requirements-completed: [OPS-03]

coverage:
  - id: D1
    description: ".github/workflows/ci.yml exists, is valid YAML, triggers on push/pull_request to main, declares permissions: contents: read, and runs uv sync + uv run pytest -n auto --dist loadfile in backend/ with Python 3.12 pinned and uv dependency caching"
    requirement: "OPS-03"
    verification:
      - kind: other
        ref: "python3 -c \"import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); assert d['permissions']['contents']=='read'; ...\" (Task 1's <verify><automated> block, run against the committed file)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The workflow actually executes on GitHub Actions (triggered by a push/PR), runs uv run pytest in the test job, and reports a visible green/red status"
    verification:
      - kind: other
        ref: "PR #1 (gsd/phase-05-quality-operations -> main), run 28747654025: 'Backend test suite: pass' via `gh pr checks 1` / `gh run view`"
        status: pass
    human_judgment: false
    rationale: "Orchestrator confirmed with the user before pushing, then pushed the branch, opened PR #1, and iterated through 5 real CI failures (bad action tag, missing lockfile, missing .env fallback, 2 stale/buggy tests+1 middleware bug) until the run reported green."

duration: ~90min (Task 1: 5min: Task 2 + CI debugging: ~85min)
completed: 2026-07-05
status: complete
---

# Phase 5 Plan 4: GitHub Actions CI Workflow Summary

**`.github/workflows/ci.yml` authored, pushed, and verified green on a real GitHub Actions run (PR #1) — which in the process surfaced and fixed 5 real bugs that had never been exercised by CI before.**

## Performance

- **Duration:** ~90 min total (Task 1: ~5 min; Task 2 + CI debugging: ~85 min)
- **Tasks:** 2 of 2 completed

## Accomplishments

- Authored `.github/workflows/ci.yml`: least-privilege (`permissions: contents: read`), `push`/`pull_request` restricted to `branches: [main]`, backend-only job with `uv sync --locked` + `uv run pytest -n auto --dist loadfile`, Python 3.12 pinned, uv dependency caching
- Pushed `gsd/phase-05-quality-operations` and opened PR #1 (confirmed with the user first, since pushing is a shared-state action)
- Iterated through the workflow's first 4 real CI runs, each failing on a different, previously-unexercised issue, until the run went green:
  1. `astral-sh/setup-uv@v8` doesn't resolve — the action has no rolling `v8` major tag yet (only exact `v8.x.y` releases and the older rolling `v7`). Fixed by pinning the exact `v8.3.0` tag.
  2. `uv sync --locked` failed — `backend/uv.lock` was gitignored in both `.gitignore` and `backend/.gitignore` and had never been committed. Un-ignored and committed it.
  3. 5 extra test failures beyond the known local baseline, all `pydantic ValidationError: Settings` — `Settings.api_key` has no default, and several `test_learning.py` tests call `get_settings()` without requesting the `test_env` fixture; they were silently passing locally only because a developer's gitignored `backend/.env` supplied a fallback `BMTC_API_KEY`. Fixed with a process-wide `os.environ.setdefault("BMTC_API_KEY", ...)` in `conftest.py`.
  4. The known "6 pre-existing" local test failures were still failing in CI (as expected — CI doesn't erase existing bugs). Investigated and fixed all 6, all root-caused as stale test expectations or one real middleware bug (see Issues Encountered).
- Full backend suite: **246/246 passing**, confirmed both with and without a local `.env` file present.
- PR #1 CI run 28747654025: `Backend test suite: pass`.

## Task Commits

1. **Task 1: Author .github/workflows/ci.yml** - `51cd6fc` (feat)
2. **Task 2 debugging fixes:**
   - `681957b` - fix(ci): pin astral-sh/setup-uv to exact v8.3.0 tag
   - `4847e69` - fix(ci): commit backend/uv.lock so CI's `uv sync --locked` can find it
   - `eb44399` - fix(tests): set BMTC_API_KEY fallback in conftest for CI test isolation
   - `282ea2c` - fix(tests): update stale idempotency body-hash test expectations
   - `18c120c` - fix(rate-limit): return JSONResponse instead of raising from middleware

## Files Created/Modified

- `.github/workflows/ci.yml` (new) — GitHub Actions CI workflow
- `.gitignore`, `backend/.gitignore` — removed `uv.lock` exclusion
- `backend/uv.lock` (new, committed) — dependency lockfile, previously local-only
- `backend/tests/conftest.py` — process-wide `BMTC_API_KEY` fallback
- `backend/tests/test_idempotency_bodyhash.py` — 3 stale assertions/fixtures fixed
- `backend/tests/test_rate_limit.py` — 1 stale assertion removed, 1 test rewritten to match current H3-fix behavior
- `backend/app/rate_limit.py` — middleware now returns `JSONResponse` instead of letting `HTTPException` propagate unhandled

## Decisions Made

- Pinned `actions/checkout@v7` (rolling major tag, valid) and `astral-sh/setup-uv@v8.3.0` (exact tag — no rolling `v8` tag exists yet)
- Committed `backend/uv.lock`: per `uv`'s guidance for applications (not libraries), the lockfile should be version-controlled for reproducible builds; it was an oversight that it was gitignored
- Set a `BMTC_API_KEY` fallback via `os.environ.setdefault()` in `conftest.py` rather than adding the `test_env` fixture to every test that transitively calls `get_settings()` — smaller, systemic fix that doesn't touch currently-passing tests' behavior
- For the 6 pre-existing failures: fixed the actual root causes rather than quarantining with `xfail`, per explicit user direction after being asked how to handle them

## Issues Encountered (the 6 pre-existing failures, now fixed)

All 6 were investigated to determine test-bug vs. app-bug before fixing:

1. **`test_replay_with_different_body_returns_409`, `test_replay_with_modified_segment_data_returns_409`** — asserted `data["detail"]["error"]`, but `main.py`'s `http_exception_handler` flattens structured error dicts to the top level (`data["error"]`), matching `docs/api.md`'s documented 409 shape. **Test bug** — updated assertions to the flat format.
2. **`test_replay_with_reordered_json_keys_succeeds`** — hardcoded a fixed past epoch timestamp (`1729615200`, Oct 2024) that aged out of the `observed_at_utc`/`timestamp_utc` ±7-day validation window as real time passed. **Test bug** — replaced with a timestamp computed via `int(time.time())` at test-run time.
3. **`test_expired_key_allows_new_submission`** — used `device_bucket="new_bucket_" + "x"*53`, which is 64 characters but not valid hex, tripping the SHA256-format validator. **Test bug** — replaced with `"d" * 64`.
4. **`test_rate_limit_error_structure`** — asserted `data["details"]["bucket_id_type"]`, a field that no longer exists: it was part of the old IP-fallback design, removed by the H3 security fix (`app.rate_limit.extract_bucket_id` docstring: "Eliminates IP address fallback to prevent privacy violations"). **Test bug** — removed the stale assertion.
5. **`test_fallback_to_ip_when_no_device_bucket`** — tested IP-fallback rate-limiting behavior that the H3 fix deliberately removed. Renamed/rewritten as `test_missing_device_bucket_returns_400`, asserting the current (and correct) 400 `invalid_request` rejection instead.
6. **Real app bug surfaced while fixing #5**: submitting a request without `device_bucket` did not actually return the intended 400 — it crashed as an unhandled 500. `extract_bucket_id()` raises `HTTPException`, but it's called from inside `RateLimitMiddleware.dispatch()` (a `BaseHTTPMiddleware`), which sits **outside** FastAPI's exception-handling middleware — so the exception was never converted to a response by `@app.exception_handler(HTTPException)` and propagated unhandled. **App bug**, previously masked because the only test exercising this path was itself broken (#5). Fixed by catching `HTTPException` at both `extract_bucket_id()` call sites in `dispatch()` and returning the equivalent `JSONResponse` directly, matching the pattern already used for the 429 case in the same file.

None of these were introduced by this phase's other plans — they predate Phase 5 and were only surfaced now because this is the first time the full suite has ever run in a clean environment (no local `.env`, no ambient dev-machine state) via real CI.

## User Setup Required

None. The workflow uses no secrets. Branch-protection / required-status-check configuration remains an explicit operator follow-up outside this phase's scope (D-12) and was intentionally not touched.

## Next Phase Readiness

- OPS-03 fully satisfied: CI workflow exists, is committed, and has been proven to run green on GitHub Actions against a real PR.
- Phase 5 (OPS-01 through OPS-04) is now fully complete.

---
*Phase: 05-quality-operations*
*Completed: 2026-07-05*

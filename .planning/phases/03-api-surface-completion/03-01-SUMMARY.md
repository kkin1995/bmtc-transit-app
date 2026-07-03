---
phase: 03-api-surface-completion
plan: 01
subsystem: api
tags: [fastapi, sqlite, gtfs, pydantic]

# Dependency graph
requires:
  - phase: 02-learning-algorithm-integrity
    provides: Stable API surface with correct learning algorithms (Welford/blend, no EMA dead code)
provides:
  - "GET /v1/stops/{stop_id} stop-detail endpoint (API-01)"
  - "StopDetailResponse Pydantic model reusing RouteResponse for nested routes list"
  - "Precedent test for the project's flat HTTPException(detail={...}) error-envelope wire shape"
affects: [03-02-route-detail, 03-03-radius-search, 03-04-eta-enrichment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New GET-detail endpoints use HTTPException(status_code, detail={error,message,details}) which main.py's http_exception_handler flattens to the top-level body (same wire shape as JSONResponse-style sibling endpoints)"

key-files:
  created: []
  modified:
    - docs/api.md
    - backend/tests/conftest.py
    - backend/tests/test_api_gtfs_alignment.py
    - backend/app/models.py
    - backend/app/routes.py

key-decisions:
  - "D-07..D-11 implemented as locked: full RouteResponse entries, no dedup by route_short_name, ORDER BY route_short_name, 200+empty routes for orphaned stop, HTTPException(404, detail={...}) error style"
  - "Corrected an inaccurate assumption in 03-01-PLAN.md/03-RESEARCH.md/03-PATTERNS.md: the new endpoint's 404 body is the FLAT {error,message,details} shape (verified via app/main.py's http_exception_handler, which unwraps a dict `detail` containing an 'error' key into the top-level body), not a nested {'detail': {error,...}} envelope as the plan's Task 2 instructions stated"

requirements-completed: [API-01]

coverage:
  - id: D1
    description: "GET /v1/stops/{stop_id} returns stop_id/stop_name/stop_lat/stop_lon/zone_id plus a routes array of full RouteResponse objects, ordered by route_short_name, not deduplicated by short_name"
    requirement: "API-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stop_detail_success"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unknown stop_id returns 404 with the flat {error:'not_found', message, details:{stop_id}} body"
    requirement: "API-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stop_detail_not_found"
        status: pass
    human_judgment: false
  - id: D3
    description: "A stop that exists but has zero serving routes returns 200 with routes: [], never 404"
    requirement: "API-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stop_detail_no_routes"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-03
status: complete
---

# Phase 3 Plan 01: Stop Detail Endpoint Summary

**GET /v1/stops/{stop_id} returns full stop detail plus a non-deduplicated, route_short_name-ordered list of every route serving it, using SQLite JOINs against stop_times/trips/routes**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-03
- **Tasks:** 3 (SPEC → RED → GREEN, per CLAUDE.md's mandatory Spec-First → Tests → Code order)
- **Files modified:** 5 (docs/api.md, backend/tests/conftest.py, backend/tests/test_api_gtfs_alignment.py, backend/app/models.py, backend/app/routes.py)

## Accomplishments
- Documented `GET /v1/stops/{stop_id}` in `docs/api.md` before any test or code existed (spec-first per CLAUDE.md Rule 1), including the D-08 no-dedup rule, D-09 ordering, D-10 empty-routes edge case, and a 404 example — renumbered the 7 subsequent endpoint sections (3→9) to keep the doc's numbering sequential
- Added `db_with_test_stop_routes` fixture inserting a served stop (2 routes sharing `route_short_name="285"` to prove D-08) and an orphan stop with no serving routes (D-10)
- Implemented `StopDetailResponse` (reusing `RouteResponse` verbatim for the nested list, per D-07) and `get_stop_detail()` handler using parameterized `?` queries throughout — no SQL injection surface on the untrusted `stop_id` path param
- Full backend suite: 201 passed (198 baseline + 3 new), 6 pre-existing failures unchanged — zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: SPEC — document GET /v1/stops/{stop_id}** - `368a63d` (docs)
2. **Task 2: RED — failing integration tests + fixture** - `a2146c3` (test)
3. **Task 3: GREEN — StopDetailResponse model + get_stop_detail handler** - `0250d65` (feat)

_TDD gate sequence verified in git log: test(...) precedes feat(...); no refactor commit needed (implementation was already minimal)._

## Files Created/Modified
- `docs/api.md` - New `GET /v1/stops/{stop_id}` section (#2), renumbered sections 3-9, updated GTFS discovery-endpoints list and Changelog
- `backend/tests/conftest.py` - New `db_with_test_stop_routes` fixture (served stop + orphan stop + 2 routes sharing a short_name)
- `backend/tests/test_api_gtfs_alignment.py` - 3 new tests: `test_get_stop_detail_success`, `test_get_stop_detail_not_found`, `test_get_stop_detail_no_routes`
- `backend/app/models.py` - New `StopDetailResponse` model
- `backend/app/routes.py` - New `get_stop_detail()` handler, registered adjacent to `get_stops()`; added `StopDetailResponse` to the `app.models` import block

## Decisions Made
- Followed all locked decisions D-07 through D-11 from `03-CONTEXT.md` exactly: full `RouteResponse` entries (D-07), no dedup by `route_short_name` (D-08), `ORDER BY route_short_name` (D-09), 200+empty-array for an orphaned stop (D-10), `HTTPException(404, detail={...})` error style (D-11)
- Registered `get_stop_detail()` directly after `get_stops()` in `routes.py` — confirmed no path-matching collision with the 3-segment `/stops/{stop_id}/schedule` route (different path depth, per 03-RESEARCH.md Pattern 3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/plan-assumption error] Corrected the 404 error-envelope shape assumption**
- **Found during:** Task 2 (writing the RED tests)
- **Issue:** `03-01-PLAN.md`'s Task 2 `<read_first>`/`<behavior>` sections (and `03-RESEARCH.md`/`03-PATTERNS.md`) instructed writing tests that assert a **nested** envelope — `response.json()["detail"]["error"]` — reasoning that `HTTPException(detail={...})` differs from the sibling endpoints' `JSONResponse(content={...})` at the wire level. Reading `backend/app/main.py`'s custom `http_exception_handler` shows this is incorrect: when `exc.detail` is a dict containing an `"error"` key, the handler returns `content=exc.detail` directly — i.e. the **same flat** `{error, message, details}` body as `JSONResponse`-style endpoints. This is also directly confirmed by the already-passing `test_eta_segment_not_found` in `backend/tests/test_api_errors_alignment.py`, which asserts the flat shape (`data["error"]`) for `GET /v1/eta`'s existing identical `HTTPException(404, detail={"error":...})` call. `03-PATTERNS.md` itself states this correctly elsewhere ("Both styles ultimately produce the same wire-format JSON via the custom `http_exception_handler`"), so this was an internal inconsistency between planning artifacts rather than a genuinely open question.
- **Fix:** Wrote `test_get_stop_detail_not_found` asserting the flat shape (`data["error"] == "not_found"`, `data["details"]["stop_id"] == ...`), matching verified codebase behavior and existing test precedent. Documented the discrepancy inline in the test file as a comment block so future contributors don't reintroduce the nested-envelope assumption.
- **Files modified:** `backend/tests/test_api_gtfs_alignment.py`
- **Verification:** Test passes against the Task 3 implementation; full suite shows no regressions in the pre-existing `test_eta_segment_not_found` test that established this precedent.
- **Committed in:** `a2146c3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 plan-assumption correction, Rule 1)
**Impact on plan:** No functional impact — D-06/D-11's actual intent (use `HTTPException` as the code-style convention, matching `get_eta`) was implemented exactly as locked. Only the test assertions' expected JSON shape was corrected to match verified runtime behavior instead of an incorrect assumption propagated across three planning artifacts.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API-01 fully satisfied; `GET /v1/stops/{stop_id}` is live and tested
- The flat-error-envelope clarification documented here is directly relevant to 03-02-PLAN.md (`GET /v1/routes/{route_id}`), which uses the identical D-06 `HTTPException(detail={...})` convention — its RED tests should assert the flat shape from the start, not repeat this deviation
- No blockers for 03-02, 03-03, or 03-04

---
*Phase: 03-api-surface-completion*
*Completed: 2026-07-03*

## Self-Check: PASSED

All 5 modified files and 3 task commits (368a63d, a2146c3, 0250d65) verified present on disk / in git log.

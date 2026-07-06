---
phase: 03-api-surface-completion
plan: 02
subsystem: api
tags: [fastapi, sqlite, gtfs, pydantic]

# Dependency graph
requires:
  - phase: 03-api-surface-completion (plan 01)
    provides: Precedent for the flat HTTPException(detail={...}) error-envelope wire shape and the docs/api.md spec-first section structure
provides:
  - "GET /v1/routes/{route_id} route detail endpoint (API-02)"
  - "RouteDetailResponse/DirectionInfo/DirectionStopInfo Pydantic models (nested 3-tier composition)"
  - "Representative-shape (most-common shape_id) selection query for route branch variants"
affects: [03-03-radius-search, 03-04-eta-enrichment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "get_route_detail() registered at the end of routes.py, after search_routes(), to avoid /routes/{route_id} shadowing /routes/search (FastAPI static-before-dynamic route matching)"
    - "Representative-shape selection: GROUP BY shape_id ORDER BY COUNT(*) DESC LIMIT 1 per (route_id, direction_id), using shape_id IS ? to survive a possibly-null shape_id"

key-files:
  created: []
  modified:
    - docs/api.md
    - backend/tests/conftest.py
    - backend/tests/test_api_gtfs_alignment.py
    - backend/app/models.py
    - backend/app/routes.py

key-decisions:
  - "D-01..D-06 and D-23 implemented as locked: stops-only response (no trip_ids/schedule times), directions:[{direction_id,stops}] array shape, full 5-field stop entries, most-common-shape representative trip, 200+empty-directions for a zero-trip route, HTTPException(404, detail={...}) error style, zero-trip direction omitted entirely (not stops:[])"
  - "Per the known correction carried forward from 03-01-SUMMARY.md, the 404 wire body uses the FLAT {error,message,details} shape (verified via app/main.py's http_exception_handler unwrapping a dict detail containing an 'error' key), NOT a nested {'detail':{...}} envelope -- both docs/api.md's example and the test assertions use the flat form, correcting the plan's own Task 1/Task 2 text"

requirements-completed: [API-02]

coverage:
  - id: D1
    description: "GET /v1/routes/{route_id} returns full route metadata (route_id, route_short_name, route_long_name, route_type, agency_id) plus a directions array, each direction holding stops ordered by stop_sequence with all 5 D-03 fields; no trip-level or schedule data anywhere in the body"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_route_detail_success"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unknown route_id returns 404 with the flat {error:'not_found', message, details:{route_id}} body"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_route_detail_not_found"
        status: pass
    human_judgment: false
  - id: D3
    description: "A route that exists but has zero trips returns 200 with directions: [], never 404"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_route_detail_no_trips"
        status: pass
    human_judgment: false
  - id: D4
    description: "For a (route_id, direction_id) with multiple shape_id branch variants, the most-common shape's representative trip determines the ordered stop list; a direction with zero trips is omitted from the directions array entirely"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_route_detail_branch_selection"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-07-03
status: complete
---

# Phase 3 Plan 02: Route Detail Endpoint Summary

**GET /v1/routes/{route_id} returns full route metadata plus a per-direction ordered stop list, using a GROUP BY-ranked representative-shape query to pick a single canonical stop order when branch variants exist**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-03
- **Tasks:** 3 (SPEC → RED → GREEN, per CLAUDE.md's mandatory Spec-First → Tests → Code order)
- **Files modified:** 5 (docs/api.md, backend/tests/conftest.py, backend/tests/test_api_gtfs_alignment.py, backend/app/models.py, backend/app/routes.py)

## Accomplishments
- Documented `GET /v1/routes/{route_id}` in `docs/api.md` before any test or code existed (spec-first per CLAUDE.md Rule 1), covering the `directions` array shape (D-02), stops-only scope (D-01), representative-shape rule (D-04), the D-05 empty-directions 200 case, and the D-23 omit-empty-direction rule — renumbered the 6 subsequent endpoint sections (5→10) and updated the GTFS discovery-endpoints list + Changelog
- Added `db_with_test_route_branches` fixture inserting ROUTE_M (two single-shape directions), ROUTE_EMPTY (route row, zero trips), and ROUTE_BRANCH (direction 0 with a 3-trip majority shape vs a 1-trip minority shape, no direction-1 trips) to deterministically exercise D-04 and D-23
- Implemented `RouteDetailResponse`/`DirectionInfo`/`DirectionStopInfo` (3-tier nested composition, matching the `ScheduleResponse`/`StopInfo`/`DepartureInfo` precedent) and `get_route_detail()`, registered at the end of `routes.py` — after `search_routes()` — so `/v1/routes/search` is not shadowed by `/routes/{route_id}`
- Full backend suite: 205 passed (201 baseline + 4 new), 6 pre-existing failures unchanged — zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: SPEC — document GET /v1/routes/{route_id}** - `ba87cba` (docs)
2. **Task 2: RED — failing integration tests + multi-shape fixture** - `8c68172` (test)
3. **Task 3: GREEN — RouteDetailResponse models + get_route_detail handler** - `ef39c33` (feat)

_TDD gate sequence verified in git log: `test(...)` (8c68172) precedes `feat(...)` (ef39c33); no refactor commit needed (implementation was already minimal)._

## Files Created/Modified
- `docs/api.md` - New `GET /v1/routes/{route_id}` section (#4), renumbered sections 5-9 to 6-10, updated GTFS discovery-endpoints list and Changelog
- `backend/tests/conftest.py` - New `db_with_test_route_branches` fixture (ROUTE_M, ROUTE_EMPTY, ROUTE_BRANCH with shape-variant trips/stop_times)
- `backend/tests/test_api_gtfs_alignment.py` - 4 new tests: `test_get_route_detail_success`, `test_get_route_detail_not_found`, `test_get_route_detail_no_trips`, `test_get_route_detail_branch_selection`
- `backend/app/models.py` - New `DirectionStopInfo`, `DirectionInfo`, `RouteDetailResponse` models
- `backend/app/routes.py` - New `get_route_detail()` handler, registered at the end of the file (after `search_routes()`); added the three new model names to the `app.models` import block

## Decisions Made
- Followed all locked decisions D-01 through D-06 and D-23 exactly: stops-only response scope (D-01), `directions: [{direction_id, stops}]` array shape (D-02), 5-field stop entries (D-03), most-common-shape representative trip (D-04), 200+empty-directions for a zero-trip route (D-05), `HTTPException(404, detail={...})` error style (D-06), zero-trip direction omitted entirely rather than included with `stops: []` (D-23)
- Applied the correction from `03-01-SUMMARY.md`/this plan's `<known_correction_from_prior_plan>` from the start: docs/api.md's 404 example and both the not-found test assertion and the endpoint's threat-model description use the FLAT `{error, message, details}` wire shape (verified via `app/main.py`'s `http_exception_handler`), not the nested `{"detail": {...}}` shape the plan's own Task 1/Task 2 text originally described — this avoided repeating 03-01's already-diagnosed deviation
- Registered `get_route_detail()` at the very end of `routes.py`, after `search_routes()`, per RESEARCH.md Pattern 3 (FastAPI matches path operations in registration order; `/routes/{route_id}` before `/routes/search` would capture `search` as a `route_id` value)

## Deviations from Plan

None - plan executed exactly as written (with the correction already flagged and pre-applied via the `<known_correction_from_prior_plan>` instructions carried over from 03-01, so no new deviation was introduced during this execution).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API-02 fully satisfied; `GET /v1/routes/{route_id}` is live and tested
- The flat-error-envelope convention is now applied consistently across both new detail endpoints (`GET /v1/stops/{stop_id}` from 03-01 and `GET /v1/routes/{route_id}` from this plan) — no lingering inconsistency for 03-03/03-04 to inherit
- No blockers for 03-03 (radius search) or 03-04 (ETA enrichment)

---
*Phase: 03-api-surface-completion*
*Completed: 2026-07-03*

## Self-Check: PASSED

All 5 modified files and 3 task commits (ba87cba, 8c68172, ef39c33) verified present on disk / in git log.

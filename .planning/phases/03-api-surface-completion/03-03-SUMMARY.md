---
phase: 03-api-surface-completion
plan: 03
subsystem: api
tags: [fastapi, sqlite, geospatial, haversine, pydantic]

# Dependency graph
requires:
  - phase: 03-api-surface-completion
    provides: "03-01/03-02 established the HTTPException(detail={...}) vs JSONResponse(content={...}) error-envelope precedents and the manual-validation pattern this plan extends"
provides:
  - "GET /v1/stops radius search: lat/lon/radius_m params with bbox pre-filter + exact Haversine second pass"
  - "Reusable haversine_m()/bounding_box() pure helpers in routes.py for any future geospatial feature"
  - "D-17 drive-by: bbox coordinates on GET /v1/stops are now range-validated, closing a doc/code mismatch"
affects: [mobile-nearby-stops, future-geospatial-endpoints]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bounding-box SQL pre-filter + pure-Python Haversine exact-distance second pass for radius search without a spatial index"
    - "Manual (non-declarative) FastAPI Query param validation returning JSONResponse(400, {error,message,details}) to preserve the canonical error envelope, avoiding FastAPI's default 422"
    - "Fixed validation order (mutual-exclusivity -> all-or-nothing -> range -> cap) for deterministic compound-invalid-request error messages"

key-files:
  created: []
  modified:
    - docs/api.md
    - backend/tests/test_api_gtfs_alignment.py
    - backend/app/routes.py

key-decisions:
  - "D-13..D-17 implemented exactly as locked in CONTEXT.md/RESEARCH.md: mutual exclusivity, all-or-nothing, 2000m cap, lat/lon range validation, and a bbox range-validation drive-by fix"
  - "haversine_m/bounding_box placed as module-level pure helpers directly above get_stops() in routes.py, matching this codebase's single-consumer-helper-next-to-caller precedent (normalize_for_search())"

requirements-completed: [API-03]

coverage:
  - id: D1
    description: "GET /v1/stops?lat&lon&radius_m returns stops within radius using bbox pre-filter + exact Haversine distance; a 450m stop is included and a diagonal 600m stop is excluded"
    requirement: "API-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stops_radius_boundary"
        status: pass
    human_judgment: false
  - id: D2
    description: "bbox + lat/lon/radius_m together returns 400 invalid_request (D-13 mutual exclusivity)"
    requirement: "API-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stops_bbox_radius_mutually_exclusive"
        status: pass
    human_judgment: false
  - id: D3
    description: "Partial lat/lon/radius_m returns 400 invalid_request (D-14 all-or-nothing)"
    requirement: "API-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stops_radius_all_or_nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: "radius_m above the 2000m cap returns 400 invalid_request (D-15)"
    requirement: "API-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stops_radius_exceeds_cap"
        status: pass
    human_judgment: false
  - id: D5
    description: "Out-of-range lat/lon for radius search returns 400 invalid_request (D-16)"
    requirement: "API-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stops_radius_invalid_latlon"
        status: pass
    human_judgment: false
  - id: D6
    description: "bbox with an out-of-range coordinate returns 400 invalid_request (D-17 drive-by fix)"
    requirement: "API-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py::test_get_stops_bbox_invalid_range"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-03
status: complete
---

# Phase 3 Plan 3: GET /v1/stops Radius Search Summary

**Geospatial radius search on GET /v1/stops using an equirectangular bounding-box SQL pre-filter plus a pure-Python Haversine exact-distance second pass — no new dependency, no spatial index.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-03T05:05:00Z (approx.)
- **Completed:** 2026-07-03T05:17:04Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `GET /v1/stops` accepts `lat`/`lon`/`radius_m` and returns all stops within `radius_m` meters of `(lat, lon)`, verified with a deterministic 450m-included / 600m-diagonal-excluded boundary test (RESEARCH.md Pitfall 2)
- Four validation rules (D-13 mutual exclusivity, D-14 all-or-nothing, D-15 2000m cap, D-16 lat/lon range) enforced in a fixed, deterministic order, all returning the canonical `{error, message, details}` 400 envelope via manual (non-declarative) validation
- D-17 drive-by fix: the existing `bbox` param's four coordinates are now range-validated, closing a gap where `docs/api.md` already claimed this behavior but the code did not implement it
- `docs/api.md` updated spec-first (CLAUDE.md Rule 1) before tests, before implementation

## Task Commits

Each task was committed atomically:

1. **Task 1: SPEC — document radius search params + fix bbox validation claim** - `0f82c2d` (docs)
2. **Task 2: RED — failing radius-search + validation tests** - `4f109ee` (test)
3. **Task 3: GREEN — haversine_m/bounding_box helpers + radius search & ordered validation** - `814b9ad` (feat)

_TDD sequence: docs -> test (RED) -> feat (GREEN), no refactor commit needed._

## Files Created/Modified
- `docs/api.md` - Documented `lat`/`lon`/`radius_m` params, validation rules, success + failure examples; bbox param description now states its coordinates are range-validated
- `backend/tests/test_api_gtfs_alignment.py` - Added `destination_point()` helper (verbatim from RESEARCH.md) and 6 new tests covering the boundary case and all four validation rules
- `backend/app/routes.py` - Added `haversine_m()`/`bounding_box()`/`_validate_latlon_range()` module-level helpers; extended `get_stops()` with the radius search branch and D-17 bbox range validation

## Decisions Made
- Followed the plan's fixed validation order exactly (mutual exclusivity -> all-or-nothing -> range -> cap) so compound-invalid requests produce a deterministic error message
- Radius mode fetches bbox-pre-filtered candidates, applies the Haversine filter, then paginates in-memory (rather than in SQL) since the exact candidate set size is unknown until after the distance filter runs — consistent with RESEARCH.md's "Python filtering happens once, in the app" guidance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- API-03 fully satisfied; `GET /v1/stops` now supports both bbox and radius geospatial filtering, mutually exclusive
- No blockers for `03-04-PLAN.md` (final plan of Phase 3)
- Full backend suite remains at the established baseline: 211 passed, 6 pre-existing failures (unchanged, no new failures introduced)

---
*Phase: 03-api-surface-completion*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created/modified files exist on disk; all 3 task commit hashes (0f82c2d, 4f109ee, 814b9ad) verified present in git log.

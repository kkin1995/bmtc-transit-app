---
phase: 03-api-surface-completion
plan: 04
subsystem: api
tags: [fastapi, pydantic, sqlite, gtfs, eta]

# Dependency graph
requires:
  - phase: 03-api-surface-completion
    provides: "03-01..03-03 established the API-01/02/03 detail endpoints and the docs/api.md spec-first + HTTPException(detail={...}) error-envelope convention this plan reuses"
provides:
  - "GET /v1/eta's nested segment object now includes from_stop_name, to_stop_name, and route_short_name resolved from GTFS via a LEFT JOIN"
affects: [mobile, eta-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LEFT JOIN enrichment attached to an already-resolved primary-key lookup (segment_id), keeping client input out of the enrichment query entirely"
    - "Additive-only response field extension: 3 new Optional[str] = None fields on an existing nested Pydantic model, zero changes to the flat deprecated fields"

key-files:
  created: []
  modified:
    - docs/api.md
    - backend/tests/test_api_gtfs_alignment.py
    - backend/app/models.py
    - backend/app/routes.py

key-decisions:
  - "D-18: enrichment fields added ONLY to the nested v1.1 SegmentInfo object, never to the flat deprecated ETA fields"
  - "D-19: route_long_name intentionally excluded even though the same JOIN would make it free"
  - "D-20: LEFT JOIN (never INNER JOIN) so an orphaned from_stop_id/to_stop_id/route_id nulls only that field and the endpoint still returns 200"
  - "D-21: docs/api.md's misleading \"route_id\": \"335E\" example replaced with a realistic compound route_id plus a separate route_short_name"

patterns-established:
  - "GTFS name-enrichment JOIN pattern: LEFT JOIN stops (x2, aliased) + LEFT JOIN routes, keyed on an already-resolved internal ID, for any future endpoint needing human-readable names alongside raw GTFS identifiers"

requirements-completed: [API-04]

coverage:
  - id: D1
    description: "GET /v1/eta segment object includes from_stop_name, to_stop_name, route_short_name populated from GTFS when all references resolve"
    requirement: "API-04"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py#test_get_eta_segment_names_populated"
        status: pass
    human_judgment: false
  - id: D2
    description: "An orphaned from_stop_id nulls only that field (LEFT JOIN) while to_stop_name/route_short_name remain populated, and the endpoint still returns 200 (never 500)"
    requirement: "API-04"
    verification:
      - kind: integration
        ref: "backend/tests/test_api_gtfs_alignment.py#test_get_eta_segment_names_orphaned_null"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs/api.md documents the 3 new nullable fields on the nested segment object only, omits route_long_name, and replaces the misleading route_id=\"335E\" example with a realistic compound route_id + separate route_short_name"
    requirement: "API-04"
    verification:
      - kind: other
        ref: "grep -c from_stop_name docs/api.md (returns 3); manual diff review of the GET /v1/eta section"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-03
status: complete
---

# Phase 3 Plan 4: ETA Segment Name Enrichment Summary

**GET /v1/eta's nested segment object now returns from_stop_name, to_stop_name, and route_short_name via a LEFT JOIN against GTFS stops/routes, so mobile clients get human-readable ETA results in one call.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-03T05:20:00Z
- **Completed:** 2026-07-03T05:26:25Z
- **Tasks:** 3 (spec-first TDD: SPEC -> RED -> GREEN)
- **Files modified:** 4

## Accomplishments
- `docs/api.md`'s `GET /v1/eta` section documents `from_stop_name`, `to_stop_name`, `route_short_name` as nullable fields on the nested `segment` object, explicitly excludes `route_long_name`, and replaces the misleading `"route_id": "335E"` example with a realistic compound GTFS `route_id` plus a separate `route_short_name`
- `SegmentInfo` (models.py) extended with the 3 new `Optional[str] = None` fields, accepting NULLs from the enrichment JOIN without a Pydantic validation error
- `get_eta()` (routes.py) runs a parameterized `LEFT JOIN` enrichment query keyed on the already-resolved `segment_id`, immediately after segment resolution, and wires the 3 fields into the `SegmentInfo` response
- `setup_test_segment_for_eta()` test fixture extended to insert real `routes`/`stops` parent rows (`ROUTE1`, `STOP_A`, `STOP_B`) so the LEFT JOIN has real GTFS data to resolve; new `setup_test_segment_for_eta_orphaned_from_stop()` helper creates a segment referencing a stop with no matching `stops` row
- Two new tests (`test_get_eta_segment_names_populated`, `test_get_eta_segment_names_orphaned_null`) added and confirmed RED (KeyError, not a collection error) before implementation, then GREEN after

## Task Commits

Each task was committed atomically (TDD plan: spec -> RED -> GREEN):

1. **Task 1: SPEC — document 3 new SegmentInfo fields + fix route_id example** - `3cd99af` (docs)
2. **Task 2: RED — failing ETA-enrichment tests + fixture parent rows** - `f3bd71a` (test)
3. **Task 3: GREEN — extend SegmentInfo + LEFT JOIN enrichment in get_eta** - `68228f7` (feat)

_TDD gate sequence verified in git log: `docs` -> `test` -> `feat`, in that order._

## Files Created/Modified
- `docs/api.md` - Documents the 3 new nullable segment fields (nested object only), notes D-19/D-20, replaces the misleading `route_id` example
- `backend/tests/test_api_gtfs_alignment.py` - Extends `setup_test_segment_for_eta()` with parent `routes`/`stops` rows; adds `setup_test_segment_for_eta_orphaned_from_stop()`; adds `test_get_eta_segment_names_populated` and `test_get_eta_segment_names_orphaned_null`
- `backend/app/models.py` - `SegmentInfo` extended with `from_stop_name`, `to_stop_name`, `route_short_name` (all `Optional[str] = None`)
- `backend/app/routes.py` - `get_eta()` runs the LEFT JOIN enrichment query after segment resolution and passes the 3 resolved fields into `SegmentInfo(...)`

## Decisions Made
- Extended the fixture helper directly in `test_api_gtfs_alignment.py` (where `setup_test_segment_for_eta()` already lives) rather than moving it into `conftest.py` — the plan explicitly allowed either location ("or its conftest counterpart"), and keeping it colocated with the tests that use it avoids an unnecessary cross-file move for a small, single-file-scoped helper.
- Used `ROUTE1`/`route_short_name="R1"` and descriptive stop names (`"Test Origin Stop"`, `"Test Destination Stop"`) for the populated-case fixture, and a dedicated `STOP_ORPHAN_FROM` identifier (never inserted into `stops`) for the null-case fixture, keeping the two scenarios independent and easy to reason about.

## Deviations from Plan

None - plan executed exactly as written. All 5 `must_haves.truths` and all 5 `must_haves.artifacts` were delivered as specified; the LEFT JOIN (not INNER JOIN) requirement was implemented and is test-locked by `test_get_eta_segment_names_orphaned_null`.

## Issues Encountered

None. The app's `get_connection()` does not set `PRAGMA foreign_keys = ON` (unlike the test fixtures' own `temp_db` connection), so inserting the orphaned-reference segment in the RED-phase fixture did not require any special FK-bypass handling — confirmed by running the test before writing the null-test assertions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 (API Surface Completion) is now fully complete: all 4 plans (API-01 stop detail, API-02 route detail, API-03 radius search, API-04 ETA enrichment) delivered and verified.
- Full backend suite: 213 passed, 6 pre-existing failures (same baseline as Phase 1/2/03-01..03-03 — no new regressions introduced by this plan).
- No blockers for Phase 4.

---
*Phase: 03-api-surface-completion*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commits (`3cd99af`, `f3bd71a`, `68228f7`) verified present in git log.

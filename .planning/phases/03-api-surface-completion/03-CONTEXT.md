# Phase 3: API Surface Completion - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the missing single-resource read endpoints (`GET /v1/stops/{stop_id}`, `GET /v1/routes/{route_id}`), geospatial radius search on `GET /v1/stops`, and human-readable name enrichment (`from_stop_name`, `to_stop_name`, `route_short_name`) on `GET /v1/eta`. Covers requirements API-01, API-02, API-03, API-04.

No mobile app changes (backend-only phase), no trip-level detail (trips/schedules) in route detail beyond a per-direction ordered stop list, no new write endpoints, no dwell-time or learning-algorithm changes (that's Phase 2, already done), no DB migration framework (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Route Detail (API-02) — Scope & Branch Handling
- **D-01:** `GET /v1/routes/{route_id}` response includes route metadata (`route_short_name`, `route_long_name`, `route_type`, `agency_id` — full existing `RouteResponse` field set) plus a `directions` array. **No trip-level data, no trip_id lists, no schedule times** — stops-only, matching ROADMAP's literal "ordered list of stops" wording. REQUIREMENTS.md's broader "stops, trips, schedules" language is narrowed to stops-only for this phase; trip/schedule detail is not in scope.
- **D-02:** Response shape is `directions: [{direction_id, stops: [...]}]` — an array of direction objects, not fixed `stops_direction_0`/`stops_direction_1` fields. Naturally handles routes with 1 or 2 directions.
- **D-03:** Each stop entry in a direction's `stops` array has `stop_id`, `stop_name`, `stop_lat`, `stop_lon`, `stop_sequence` — enough to render/plot without a follow-up lookup.
- **D-04 (branch/shape ambiguity):** DB reality confirmed during scouting — a `(route_id, direction_id)` can have multiple `shape_id` variants (branches) with different stop sequences. To pick "the" ordered stop list per direction: **use the most-common shape's representative trip** (`GROUP BY shape_id, ORDER BY COUNT(*) DESC LIMIT 1`, then pull that trip's `stop_times` ordered by `stop_sequence`). This is a deliberate simplification — rare branch variants are not separately represented.
- **D-05 (edge case):** A route_id that exists in `routes` but has zero trips (e.g. after a GTFS re-bootstrap dropped trips) returns **200 with `directions: []`**, not 404. 404 is reserved strictly for a `route_id` with no row in the `routes` table at all.
- **D-06 (error style):** New endpoint uses `HTTPException(404, detail={...})` — matching `GET /v1/eta`'s existing convention, not the `JSONResponse(...)` style used by `/stops`, `/routes`, `/routes/search`, `/stops/{id}/schedule`. This becomes the convention for both new endpoints in this phase (see D-11).

### Stop Detail (API-01) — Routes-Serving-It Shape
- **D-07:** `GET /v1/stops/{stop_id}` returns stop detail (`stop_id`, `stop_name`, `stop_lat`, `stop_lon`, `zone_id` — existing `StopResponse` fields) plus a `routes` array where each entry is a **full `RouteResponse` object** (`route_id`, `route_short_name`, `route_long_name`, `route_type`, `agency_id`) — not a minimal `{route_id, route_short_name}` pair.
- **D-08 (non-unique short names):** `route_short_name` is confirmed NOT unique per `route_id` (e.g. short name `"285"` maps to 17 distinct `route_id`s in live data). The routes list **does not deduplicate by short_name** — every distinct `route_id` serving the stop appears as its own entry, technically accurate to GTFS structure even if multiple entries share a display label.
- **D-09:** Routes list is ordered `ORDER BY route_short_name` (matches existing `GET /v1/routes` sort convention).
- **D-10 (edge case):** A stop_id that exists but currently has zero routes serving it (orphaned stop) returns **200 with `routes: []`**, not 404 — symmetric with D-05's route-detail edge case rule ("exists but no schedule data" is 200+empty, not 404).
- **D-11 (error style):** Same as D-06 — `HTTPException(404, detail={...})` for unknown `stop_id`.

### Geospatial Radius Search (API-03)
- **D-12:** New `lat`, `lon`, `radius_m` query params land on the existing `GET /v1/stops` endpoint (additive), not a new endpoint — per ROADMAP's literal success criterion.
- **D-13 (mutual exclusivity):** If a request includes both `bbox` AND any of `lat`/`lon`/`radius_m`, return **400 `invalid_request`** — the two filter modes are mutually exclusive, no silent precedence rule.
- **D-14 (all-or-nothing):** `lat`, `lon`, and `radius_m` must all be present together or none at all — 400 `invalid_request` if only some are given. No implicit default radius.
- **D-15 (cap):** `radius_m` has a maximum of **2000m** — requests above the cap return 400 `invalid_request`. Matches the existing pattern of capping `limit=1000` on list endpoints.
- **D-16 (validation):** `lat`/`lon` for radius search ARE range-validated (-90..90, -180..180) with 400 on out-of-range — this is new validation that doesn't exist for the current `bbox` param.
- **D-17 (drive-by fix, bbox):** The existing `bbox` param on `GET /v1/stops` (routes.py:493-509) has **no actual lat/lon range validation** despite `docs/api.md:310` claiming it does — a pre-existing bug discovered during scouting. Since D-16 adds this exact validation logic for radius search in the same function, **apply the same range validation to bbox's four coordinates too**, as a drive-by fix (same file, same validation pattern, same PR — consistent with the Phase 1/2 precedent for tightly-coupled adjacent fixes found during related work).
- **Implementation note (not a locked decision, flag for research):** No Haversine/distance function exists anywhere in `backend/app/*.py` today (confirmed via grep) and there's no spatial index (`stops` table has no R-tree) — radius filtering needs a distance calculation built from scratch. This is a technical implementation detail for the researcher/planner to resolve, not a user decision; ROADMAP's literal success criterion #3 ("a stop within range is included, a stop 600m away is excluded") requires the distance calc to be reasonably accurate, not a rough bbox approximation.

### ETA Enrichment (API-04)
- **D-18:** `from_stop_name`, `to_stop_name`, `route_short_name` are added **only to the nested `SegmentInfo`** (v1.1 structured shape) — matching the project's existing precedent that new fields land in the nested structure, not the flat deprecated fields (per `docs/api.md` changelog). The flat deprecated fields are frozen as pure legacy.
- **D-19 (scope, explicitly excluded):** `route_long_name` is **not** added even though the same JOIN would make it free — sticking strictly to ROADMAP's 3 locked field names.
- **D-20 (fallback behavior):** If a segment's `from_stop_id`/`to_stop_id`/`route_id` can't be resolved (orphaned reference — no matching row in `stops`/`routes`), the response **nulls the missing field and still returns 200** — consistent with Phase 2's D-09/D-10 precedent (missing data gets a fallback/null rather than rejecting the whole response). Does NOT return 500.
- **D-21 (docs drive-by fix):** `docs/api.md`'s current `GET /v1/eta` example uses `"route_id": "335E"`, but live DB data confirms real `route_id` values are long compound GTFS strings (e.g. `"215-NE ANP11-KMT-VSD"`) while `"335E"`-style codes are actually `route_short_name`. Since this phase requires a spec-first docs update for the new fields anyway (CLAUDE.md Rule 1), **replace the example with a real-looking route_id/route_short_name pair** rather than leaving the misleading one in place.
- **D-22 (out of scope, explicit):** No mobile app changes in this phase. The mobile ETA screen is not wired to display the new fields — that's a separate, additive frontend change for a future phase. Fields are optional/additive so no mobile code breaks either way.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level requirements and roadmap
- `.planning/REQUIREMENTS.md` §"API Surface Completion" — API-01, API-02, API-03, API-04 definitions (note: API-02's "stops, trips, schedules" wording is narrowed to stops-only per D-01)
- `.planning/ROADMAP.md` §"Phase 3: API Surface Completion" — goal and 4 literal success criteria that this phase's decisions are locked against
- `.planning/PROJECT.md` — constraints (SQLite-only, backward compatibility, additive-only API changes)

### API spec (must update spec-first per CLAUDE.md Rule 1)
- `docs/api.md` — sections for `GET /v1/stops`, `GET /v1/routes`, `GET /v1/routes/search`, `GET /v1/stops/{stop_id}/schedule`, `GET /v1/eta` — existing pagination convention (`{items[], total, limit, offset}`), canonical error shape (`{error, message, details}`), and the error-code table (`invalid_request`/400, `not_found`/404, etc.) that new endpoints must reuse. Also contains the misleading `route_id="335E"` example flagged in D-21.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — component responsibilities, GTFS Discovery Path, API layer table, error-format/versioning conventions
- `.planning/codebase/CONCERNS.md` — check for any other pre-existing gaps in the touched area before implementing

### Prior phase precedent
- `.planning/phases/02-learning-algorithm-integrity/02-CONTEXT.md` D-09/D-10 — the "seed with fallback default rather than reject" pattern this phase's D-20 (ETA enrichment fallback) directly follows
- `.planning/phases/01-backend-correctness/01-CONTEXT.md` — established the "drive-by fix for tightly-coupled adjacent bugs" precedent this phase's D-17 (bbox validation) and D-21 (docs example) follow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/models.py:166-172` `StopResponse` and `:183-189` `RouteResponse` — reuse these exact field sets for stop detail and route detail's top-level metadata (D-01, D-07) rather than inventing new schemas.
- `backend/app/schema.sql:262-288` `route_summary` and `stop_summary` views — defined but currently unused by any Python code (confirmed via grep); could power count-style metadata if a future phase needs it, though this phase's D-01 explicitly excludes trip counts.
- `backend/app/schema.sql:290-310` `segment_learning_progress` view — already models a from/to-stop-name + route join pattern; useful template for the ETA enrichment JOIN (D-18).
- `backend/app/db.py` `get_connection()` context manager, `compute_bin_id()` — standard connection pattern for all new handlers.

### Established Patterns
- `backend/app/routes.py:476-555` `get_stops()` — bbox parsing/validation lives inline here (not in `db.py`); this is where D-13/D-14/D-15/D-16/D-17's new radius-search validation logic lands, alongside the existing bbox handling.
- `backend/app/routes.py:245-414` `get_eta()` — resolves a `segments` row via exact match on `(route_id, direction_id, from_stop_id, to_stop_id)`; D-18's enrichment JOINs (`stops` for from/to names, `routes` for short_name) attach here using IDs already in scope.
- `backend/app/routes.py:558-632` `get_routes()` and `:635-743` `get_stop_schedule()` — structural templates for the new detail endpoints' query/response pattern (existence check → 404 or build response).
- Error-handling styles are inconsistent today: `/eta` and `/ride_summary` use `HTTPException(status_code, detail={...})`; `/stops`, `/routes`, `/stops/{id}/schedule`, `/routes/search` use `JSONResponse(status_code=..., content={...})`. D-06/D-11 pick `HTTPException` for both new endpoints, following `/eta`'s convention — does not retrofit the existing `JSONResponse`-style endpoints.

### Integration Points
- `backend/app/main.py:108` `app.include_router(routes.router, prefix="/v1")` — FastAPI matches path operations in registration order. `GET /routes/{route_id}` MUST be registered **after** `GET /routes/search` (routes.py:761) in the file, or FastAPI will match `GET /v1/routes/search` as `route_id="search"`. `GET /stops/{stop_id}` vs `GET /stops/{stop_id}/schedule` don't collide (different path-template depth) but confirm during implementation.
- Live DB confirms `route_short_name` is not 1:1 with `route_id` (2,936 distinct short names across 4,190 routes) and some routes have up to 347 trips across multiple shapes — both facts directly informed D-04 and D-08 above; downstream agents should not assume 1:1 short_name↔route_id anywhere else in new code either.

</code_context>

<specifics>
## Specific Ideas

User wants every ambiguity resolved before planning (same pattern as Phases 1 and 2) — drilled deep into the route-detail branch/shape ambiguity discovered during scouting (not something ROADMAP anticipated), the non-unique route_short_name implications for stop detail, edge-case symmetry between route detail and stop detail (both use "200 + empty array" for exists-but-no-data, never 404), and explicitly locked two drive-by fixes (bbox validation gap, misleading docs example) using the same "same file, same PR, tightly-coupled" reasoning established in Phases 1-2. Also explicitly scoped OUT: route_long_name in ETA enrichment (not asked for) and mobile app changes (separate phase).

</specifics>

<deferred>
## Deferred Ideas

- **Trip-level / schedule detail in route detail** — REQUIREMENTS.md's "stops, trips, schedules" language for API-02 is broader than what this phase delivers (stops-only per D-01). If trip-level detail is wanted later, it needs its own phase/requirement given the up-to-347-trips-per-route scale problem.
- **`time_window_minutes` unused parameter bug in `GET /v1/stops/{stop_id}/schedule`** — discovered during scouting (routes.py:702-713): the param is accepted and validated but never actually used to filter the SQL query (`ORDER BY st.departure_time LIMIT 100` with no time-range WHERE clause), despite the docstring claiming Python-side filtering that doesn't exist. This is unrelated to API-01..04 and was not bundled as a drive-by (different endpoint, different code path from anything this phase touches) — flagged for a future phase or bugfix pass.
- **Mobile app consumption of new ETA fields** — explicit out-of-scope decision (D-22); separate additive frontend phase whenever prioritized.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`gsd-tools query todo.match-phase 3` returned zero matches).

</deferred>

---

*Phase: 3-API Surface Completion*
*Context gathered: 2026-07-03*

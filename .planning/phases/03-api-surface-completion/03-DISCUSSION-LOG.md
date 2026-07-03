# Phase 3: API Surface Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 3-API Surface Completion
**Areas discussed:** Route detail depth & branch handling, Stop detail — routes-serving-it shape, Geospatial radius search vs bbox, ETA enrichment placement & fallback

---

## Route Detail Depth & Branch Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Stops only, per direction | Matches ROADMAP's locked criterion literally; no trip_id list, no schedule times | ✓ |
| Stops + trip/shape counts | Same plus lightweight counts via unused `route_summary` view | |
| Full trips array included | Every trip_id under each direction; routes with 347 trips would need pagination | |

**User's choice:** Stops only, per direction.

| Option | Description | Selected |
|--------|-------------|----------|
| Most-common trip's stops | GROUP BY shape_id, ORDER BY COUNT(*) DESC LIMIT 1 | ✓ |
| Longest stop list wins | COUNT(stop_sequence) DESC | |
| First trip_id by ordering | Arbitrary, no weighting | |

**User's choice:** Most-common trip's stops.

| Option | Description | Selected |
|--------|-------------|----------|
| `directions: [{direction_id, stops:[...]}]` | Array of direction objects | ✓ |
| Fixed `stops_direction_0`/`stops_direction_1` fields | Breaks GTFS's variable-direction-count assumption | |

**User's choice:** `directions: [...]` array.

| Option | Description | Selected |
|--------|-------------|----------|
| stop_id, stop_name, lat/lon, stop_sequence | Full render-ready stop entry | ✓ |
| stop_id, stop_name, stop_sequence only | Lighter, forces follow-up lookup for coords | |

**User's choice:** Full stop entry with lat/lon.

| Option | Description | Selected |
|--------|-------------|----------|
| Include route_type + agency_id | Reuses existing RouteResponse fields | ✓ |
| Only short/long name + directions | Minimal, literal ROADMAP wording only | |

**User's choice:** Include route_type + agency_id.

| Option | Description | Selected |
|--------|-------------|----------|
| 200 with empty `directions: []` | Route exists in `routes` table but has zero trips | ✓ |
| 404 not_found | Treat zero-trips route as non-existent | |

**User's choice:** 200 with empty array (route exists, just no trips).

| Option | Description | Selected |
|--------|-------------|----------|
| `HTTPException(404, detail={...})` — matches /v1/eta | | ✓ |
| `JSONResponse(404, content={...})` — matches most other GET endpoints | | |

**User's choice:** HTTPException style, matching /v1/eta. Applied to both new endpoints (route detail + stop detail).

**Notes:** User chose "drill down to clear every ambiguity no matter how small" rather than moving on after the first pass — extended this area to 7 questions total covering scope, branch representation, response shape, field set, metadata inclusion, the zero-trips edge case, and error-handling convention.

---

## Stop Detail — Routes-Serving-It Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Full RouteResponse object | route_id, route_short_name, route_long_name, route_type, agency_id | ✓ |
| Minimal `{route_id, route_short_name}` | Lighter payload, needs follow-up call for more detail | |

**User's choice:** Full RouteResponse object per entry.

| Option | Description | Selected |
|--------|-------------|----------|
| List every distinct route_id (no dedup) | Technically accurate to GTFS structure | ✓ |
| Deduplicate by route_short_name | Matches rider mental model but loses branch distinction | |

**User's choice:** List every distinct route_id, no deduplication.

| Option | Description | Selected |
|--------|-------------|----------|
| 200 with empty `routes: []` | Symmetric with route-detail's zero-trips edge case | ✓ |
| 404 not_found | Inconsistent with route-detail decision | |

**User's choice:** 200 with empty array.

| Option | Description | Selected |
|--------|-------------|----------|
| Order by route_short_name (alphabetical) | Matches existing GET /v1/routes convention | ✓ |
| Order by route_id | Not a meaningful sort for long compound GTFS IDs | |

**User's choice:** Order by route_short_name.

---

## Geospatial Radius Search vs Bbox

| Option | Description | Selected |
|--------|-------------|----------|
| 400 invalid_request — mutually exclusive | Reject if both bbox and radius params present | ✓ |
| radius_m silently wins, bbox ignored | No error, but no signal to the client either | |
| AND both filters together | Most flexible, unrequested complexity | |

**User's choice:** 400, mutually exclusive.

| Option | Description | Selected |
|--------|-------------|----------|
| All three (lat, lon, radius_m) required together | 400 if only some given, no implicit defaults | ✓ |
| radius_m optional with a default (e.g. 500m) | More convenient, introduces a magic-number default | |

**User's choice:** All three required together.

| Option | Description | Selected |
|--------|-------------|----------|
| Cap radius_m at 2000m | Matches existing limit=1000 capping pattern | ✓ |
| No cap | Risks near-full-table Haversine scan on every request | |

**User's choice:** Cap at 2000m.

| Option | Description | Selected |
|--------|-------------|----------|
| Validate lat/lon range (-90..90, -180..180), 400 on out-of-range | Fixes a gap the existing bbox param also has | ✓ |
| No validation, same as existing (buggy) bbox behavior | Perpetuates the existing gap | |

**User's choice:** Validate and 400 on out-of-range.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, fix bbox validation too (drive-by) | Same file, same validation pattern, being touched anyway | ✓ |
| No, leave bbox as-is, note for later | Keep phase strictly scoped to API-01..04 literal wording | |

**User's choice:** Yes, fix bbox validation as a drive-by (same PR).

---

## ETA Enrichment Placement & Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Nested SegmentInfo only | Matches existing v1→v1.1 evolution precedent | ✓ |
| Both nested and flat fields | More legacy-client-friendly, extends deprecated-field investment | |

**User's choice:** Nested SegmentInfo only.

| Option | Description | Selected |
|--------|-------------|----------|
| Null the missing field, still return 200 | Matches Phase 2's D-09/D-10 fallback-default precedent | ✓ |
| 500 server_error if any name can't be resolved | Would take down a working ETA response over a display-name issue | |

**User's choice:** Null the missing field, return 200.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, use a real route_id/short_name pair in docs example | Zero-extra-cost drive-by, same file/section being edited anyway | ✓ |
| No, leave existing (misleading) example as-is | Keeps docs diff minimal | |

**User's choice:** Fix the docs example.

| Option | Description | Selected |
|--------|-------------|----------|
| No, stick to the 3 locked fields | Exactly matches ROADMAP's success criterion #4 | ✓ |
| Yes, add route_long_name too | Same JOIN, zero extra query cost, but not asked for | |

**User's choice:** Stick to the 3 locked fields (no route_long_name).

| Option | Description | Selected |
|--------|-------------|----------|
| No, backend-only this phase | ROADMAP Phase 3 scoped as backend API work | ✓ |
| Yes, wire it into the mobile ETA screen now | New capability beyond ROADMAP Phase 3's scope | |

**User's choice:** Backend-only; mobile consumption deferred.

**Notes:** User again chose to keep asking ("More questions") past the first check, extending this area to 6 questions total.

---

## Claude's Discretion

None — every gray area surfaced had an explicit user selection; no "you decide" delegations were made in this discussion.

## Deferred Ideas

- Trip-level / schedule detail in route detail (REQUIREMENTS.md's broader "stops, trips, schedules" wording for API-02) — needs its own future phase/requirement.
- `time_window_minutes` unused-parameter bug in `GET /v1/stops/{stop_id}/schedule` (discovered during codebase scouting, unrelated code path to this phase) — flagged for a future bugfix pass.
- Mobile app consumption of the new ETA enrichment fields — explicit out-of-scope decision, future additive frontend phase.

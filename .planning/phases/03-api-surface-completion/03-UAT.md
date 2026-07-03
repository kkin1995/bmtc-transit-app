---
status: complete
phase: 03-api-surface-completion
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-07-03T08:12:10Z
updated: 2026-07-03T08:17:16Z
---

## Current Test

[testing complete]

## Tests

### 1. GET /v1/stops/{stop_id} returns full stop detail with non-deduplicated, ordered routes list
expected: GET /v1/stops/{stop_id} returns stop_id/stop_name/stop_lat/stop_lon/zone_id plus a routes array of full RouteResponse objects, ordered by route_short_name, not deduplicated by short_name
result: pass
source: automated
coverage_id: D1

### 2. Unknown stop_id returns flat 404
expected: Unknown stop_id returns 404 with the flat {error:'not_found', message, details:{stop_id}} body
result: pass
source: automated
coverage_id: D2

### 3. Stop with zero serving routes returns 200 with empty routes
expected: A stop that exists but has zero serving routes returns 200 with routes:[], never 404
result: pass
source: automated
coverage_id: D3

### 4. GET /v1/routes/{route_id} returns full route metadata with per-direction stops
expected: GET /v1/routes/{route_id} returns full route metadata (route_id, route_short_name, route_long_name, route_type, agency_id) plus a directions array, each direction holding stops ordered by stop_sequence with all 5 D-03 fields; no trip-level or schedule data anywhere in the body
result: pass
source: automated
coverage_id: D1

### 5. Unknown route_id returns flat 404
expected: Unknown route_id returns 404 with the flat {error:'not_found', message, details:{route_id}} body
result: pass
source: automated
coverage_id: D2

### 6. Route with zero trips returns 200 with empty directions
expected: A route that exists but has zero trips returns 200 with directions:[], never 404
result: pass
source: automated
coverage_id: D3

### 7. Route branch-variant selection picks most-common shape
expected: For a (route_id, direction_id) with multiple shape_id branch variants, the most-common shape's representative trip determines the ordered stop list; a direction with zero trips is omitted from the directions array entirely
result: pass
source: automated
coverage_id: D4

### 8. Radius search returns stops within radius using bbox pre-filter + Haversine
expected: GET /v1/stops?lat&lon&radius_m returns stops within radius using bbox pre-filter + exact Haversine distance; a 450m stop is included and a diagonal 600m stop is excluded
result: pass
source: automated
coverage_id: D1

### 9. bbox + lat/lon/radius_m together is rejected (mutual exclusivity)
expected: bbox + lat/lon/radius_m together returns 400 invalid_request (D-13 mutual exclusivity)
result: pass
source: automated
coverage_id: D2

### 10. Partial lat/lon/radius_m is rejected (all-or-nothing)
expected: Partial lat/lon/radius_m returns 400 invalid_request (D-14 all-or-nothing)
result: pass
source: automated
coverage_id: D3

### 11. radius_m above 2000m cap is rejected
expected: radius_m above the 2000m cap returns 400 invalid_request (D-15)
result: pass
source: automated
coverage_id: D4

### 12. Out-of-range lat/lon for radius search is rejected
expected: Out-of-range lat/lon for radius search returns 400 invalid_request (D-16)
result: pass
source: automated
coverage_id: D5

### 13. bbox with out-of-range coordinate is rejected
expected: bbox with an out-of-range coordinate returns 400 invalid_request (D-17 drive-by fix)
result: pass
source: automated
coverage_id: D6

### 14. GET /v1/eta segment includes resolved GTFS names
expected: GET /v1/eta segment object includes from_stop_name, to_stop_name, route_short_name populated from GTFS when all references resolve
result: pass
source: automated
coverage_id: D1

### 15. Orphaned stop reference nulls only that field, endpoint still returns 200
expected: An orphaned from_stop_id nulls only that field (LEFT JOIN) while to_stop_name/route_short_name remain populated, and the endpoint still returns 200 (never 500)
result: pass
source: automated
coverage_id: D2

### 16. docs/api.md documents the 3 new ETA enrichment fields correctly
expected: docs/api.md documents the 3 new nullable fields on the nested segment object only, omits route_long_name, and replaces the misleading route_id="335E" example with a realistic compound route_id + separate route_short_name
result: pass
source: automated
coverage_id: D3

## Summary

total: 16
passed: 16
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]

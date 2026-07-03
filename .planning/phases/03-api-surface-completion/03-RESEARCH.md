# Phase 3: API Surface Completion - Research

**Researched:** 2026-07-03
**Domain:** FastAPI + SQLite GTFS query endpoints; geospatial radius search without a spatial index
**Confidence:** MEDIUM-HIGH (codebase facts VERIFIED against live `backend/bmtc_dev.db`; external formulas/patterns CITED from web sources; no new third-party packages introduced)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Route Detail (API-02) — Scope & Branch Handling**
- **D-01:** `GET /v1/routes/{route_id}` response includes route metadata (`route_short_name`, `route_long_name`, `route_type`, `agency_id` — full existing `RouteResponse` field set) plus a `directions` array. No trip-level data, no trip_id lists, no schedule times — stops-only, matching ROADMAP's literal "ordered list of stops" wording. REQUIREMENTS.md's broader "stops, trips, schedules" language is narrowed to stops-only for this phase; trip/schedule detail is not in scope.
- **D-02:** Response shape is `directions: [{direction_id, stops: [...]}]` — an array of direction objects, not fixed `stops_direction_0`/`stops_direction_1` fields.
- **D-03:** Each stop entry in a direction's `stops` array has `stop_id`, `stop_name`, `stop_lat`, `stop_lon`, `stop_sequence`.
- **D-04 (branch/shape ambiguity):** A `(route_id, direction_id)` can have multiple `shape_id` variants (branches) with different stop sequences. To pick "the" ordered stop list per direction: use the most-common shape's representative trip (`GROUP BY shape_id, ORDER BY COUNT(*) DESC LIMIT 1`, then pull that trip's `stop_times` ordered by `stop_sequence`). Deliberate simplification — rare branch variants are not separately represented.
- **D-05 (edge case):** A route_id that exists in `routes` but has zero trips returns 200 with `directions: []`, not 404. 404 is reserved strictly for a `route_id` with no row in the `routes` table at all.
- **D-06 (error style):** New endpoint uses `HTTPException(404, detail={...})` — matching `GET /v1/eta`'s existing convention, not the `JSONResponse(...)` style used by `/stops`, `/routes`, `/routes/search`, `/stops/{id}/schedule`. This becomes the convention for both new endpoints in this phase (see D-11).

**Stop Detail (API-01) — Routes-Serving-It Shape**
- **D-07:** `GET /v1/stops/{stop_id}` returns stop detail (`stop_id`, `stop_name`, `stop_lat`, `stop_lon`, `zone_id`) plus a `routes` array where each entry is a full `RouteResponse` object — not a minimal `{route_id, route_short_name}` pair.
- **D-08 (non-unique short names):** `route_short_name` is confirmed NOT unique per `route_id` (e.g. short name `"285"` maps to 17 distinct `route_id`s in live data). The routes list does not deduplicate by short_name.
- **D-09:** Routes list is ordered `ORDER BY route_short_name`.
- **D-10 (edge case):** A stop_id that exists but currently has zero routes serving it returns 200 with `routes: []`, not 404 — symmetric with D-05.
- **D-11 (error style):** Same as D-06 — `HTTPException(404, detail={...})` for unknown `stop_id`.

**Geospatial Radius Search (API-03)**
- **D-12:** New `lat`, `lon`, `radius_m` query params land on the existing `GET /v1/stops` endpoint (additive), not a new endpoint.
- **D-13 (mutual exclusivity):** If a request includes both `bbox` AND any of `lat`/`lon`/`radius_m`, return 400 `invalid_request`.
- **D-14 (all-or-nothing):** `lat`, `lon`, and `radius_m` must all be present together or none at all — 400 `invalid_request` if only some are given. No implicit default radius.
- **D-15 (cap):** `radius_m` has a maximum of 2000m — requests above the cap return 400 `invalid_request`.
- **D-16 (validation):** `lat`/`lon` for radius search ARE range-validated (-90..90, -180..180) with 400 on out-of-range.
- **D-17 (drive-by fix, bbox):** The existing `bbox` param on `GET /v1/stops` (routes.py:493-509) has no actual lat/lon range validation despite `docs/api.md:310` claiming it does. Apply the same range validation to bbox's four coordinates too, as a drive-by fix (same file, same PR).
- **Implementation note (flagged for research — resolved below):** No Haversine/distance function exists anywhere in `backend/app/*.py` today and there's no spatial index. Radius filtering needs a distance calculation built from scratch. ROADMAP's literal success criterion #3 requires the distance calc to be reasonably accurate, not a rough bbox approximation.

**ETA Enrichment (API-04)**
- **D-18:** `from_stop_name`, `to_stop_name`, `route_short_name` are added only to the nested `SegmentInfo` (v1.1 structured shape) — not the flat deprecated fields.
- **D-19 (scope, explicitly excluded):** `route_long_name` is not added even though the same JOIN would make it free.
- **D-20 (fallback behavior):** If a segment's `from_stop_id`/`to_stop_id`/`route_id` can't be resolved (orphaned reference), the response nulls the missing field and still returns 200. Does NOT return 500.
- **D-21 (docs drive-by fix):** `docs/api.md`'s current `GET /v1/eta` example uses `"route_id": "335E"`, but live DB data confirms real `route_id` values are long compound GTFS strings (e.g. `"215-NE ANP11-KMT-VSD"`) while `"335E"`-style codes are actually `route_short_name`. Replace the example with a real-looking route_id/route_short_name pair.
- **D-22 (out of scope, explicit):** No mobile app changes in this phase.

### Claude's Discretion
None explicitly delegated beyond what's noted as "Claude's Discretion" in CONTEXT.md — this phase's CONTEXT.md resolved all ambiguities into locked decisions (D-01 through D-22). The only open items are the two "flagged for research" implementation questions (Haversine approach, D-04 query efficiency) — both are resolved in this document.

### Deferred Ideas (OUT OF SCOPE)
- **Trip-level / schedule detail in route detail** — REQUIREMENTS.md's "stops, trips, schedules" language for API-02 is broader than what this phase delivers (stops-only per D-01). Needs its own phase/requirement given the up-to-178-trips-per-route-direction scale problem (verified against live DB, see Common Pitfalls).
- **`time_window_minutes` unused parameter bug in `GET /v1/stops/{stop_id}/schedule`** — pre-existing bug, unrelated to API-01..04, not bundled as a drive-by (different endpoint/code path).
- **Mobile app consumption of new ETA fields** — explicit out-of-scope decision (D-22).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | GET /v1/stops/{stop_id} returns single stop detail (coordinates, name, routes serving it) | See "New Endpoint: GET /v1/stops/{stop_id}" pattern below; reuses `StopResponse`/`RouteResponse` models, `get_stop_schedule()` existence-check template |
| API-02 | GET /v1/routes/{route_id} returns single route detail (stops-only per D-01, narrowed scope) | See "New Endpoint: GET /v1/routes/{route_id}" and "Don't Hand-Roll: Representative-Shape Query" below; verified query plan against live DB |
| API-03 | GET /v1/stops?lat=X&lon=Y&radius_m=500 — geospatial stop search | See "Architecture Patterns: Geospatial Radius Search" below — bounding-box pre-filter + Haversine precise filter, with exact formulas and a verified test-coordinate generation method |
| API-04 | GET /v1/eta response includes from_stop_name, to_stop_name, route_short_name | See "Code Examples: ETA Enrichment JOIN" below; follows `segment_learning_progress` view's existing from/to-stop-name + route join pattern |
</phase_requirements>

## Summary

This phase adds two new single-resource GET endpoints, extends an existing GET endpoint with geospatial filtering, and enriches an existing response with human-readable names — no new endpoints require new tables, migrations, or third-party packages. All four requirements are additive reads against the existing GTFS schema (`stops`, `routes`, `trips`, `stop_times`) using patterns already established elsewhere in `backend/app/routes.py`.

The one genuinely new technical capability this phase requires is geospatial distance filtering, and there is no Haversine/distance function or spatial index (R-tree/SpatiaLite) anywhere in this codebase today (confirmed by grep and schema inspection). The verified, appropriate solution at this project's scale (9,360 stops, confirmed via live `bmtc_dev.db` — CONTEXT.md's "~8k" estimate was close) is: **compute an equirectangular bounding box in Python around the query point, use it as a cheap SQL `BETWEEN` pre-filter (full table scan over 9,360 rows is trivial), then apply an exact pure-Python Haversine calculation to the pre-filtered candidate set to exclude bounding-box corner false-positives.** No SQLite math-function extension, no `sqlite3.enable_load_extension`, and no new pip dependency are needed — `math.radians/sin/cos/atan2/sqrt` from the Python standard library is sufficient and matches this project's existing "computation in Python, simple queries in SQL" pattern (see `search_routes()`'s Python-side normalization filter for architectural precedent).

The second technical question — efficiency of the D-04 "most-common shape" query — is verified directly against the live dev database: `EXPLAIN QUERY PLAN` confirms `idx_trips_route_dir` is used to narrow to a route+direction's trip set (max 178 rows observed for the largest route in the current GTFS feed) before the `GROUP BY shape_id` temp B-tree sort, which is negligible at this row count. No new index is needed.

**Primary recommendation:** Implement pure-Python Haversine + equirectangular bounding-box pre-filter for radius search (no new dependency); implement the two new detail endpoints using the existing `HTTPException(404, detail={...})` convention (matching `/eta`, per D-06/D-11) while leaving `/stops` and `/routes/{route_id}`'s sibling endpoints on their existing `JSONResponse` convention; keep the D-15 `radius_m` cap and D-16 lat/lon validation as **manual checks returning `JSONResponse(400, ...)`** rather than FastAPI's declarative `Query(le=...)` validation, because the latter produces a 422 in a different error shape than this project's canonical `{error, message, details}` envelope — this is the single most important pitfall in this phase (see Common Pitfalls).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stop detail lookup (API-01) | API / Backend | Database / Storage | Single-row existence check + JOIN against `stops`/`trips`/`stop_times`/`routes`; no client-side logic needed |
| Route detail lookup (API-02) | API / Backend | Database / Storage | Representative-shape selection (D-04) is a backend query-planning decision, not exposable to clients |
| Geospatial radius search (API-03) | API / Backend | Database / Storage | Distance calculation must be server-authoritative (client cannot be trusted to filter correctly); DB does the cheap pre-filter, Python does the precise math |
| ETA name enrichment (API-04) | API / Backend | Database / Storage | Pure JOIN-time enrichment of an existing response; no new business logic |

This phase touches only the API/Backend and Database tiers — no browser/mobile client, SSR, or CDN tier involvement (D-22 explicitly excludes mobile changes).

## Standard Stack

### Core

No new packages. This phase is implemented entirely with the existing dependency set:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.109.0 [VERIFIED: backend/pyproject.toml] | Route handlers for the 2 new + 2 modified endpoints | Already the project's sole web framework |
| pydantic | 2.5.3 [VERIFIED: backend/pyproject.toml] | New response models (`RouteDetailResponse`, `DirectionInfo`, extended `StopResponse`/`SegmentInfo`) | Already the project's sole validation/schema library |
| Python stdlib `math` | 3.9+ (bundled) | Haversine distance calculation (`radians`, `sin`, `cos`, `asin`/`atan2`, `sqrt`) | Zero-dependency; sufficient accuracy (<1% error) for terrestrial distances at the 2000m cap this phase enforces [CITED: general geodesy — see Sources] |
| sqlite3 (stdlib) | bundled with Python 3.9+ | Bounding-box pre-filter query, representative-shape query | Already the project's sole DB access layer; no extension loading needed |

### Supporting

None — no supporting libraries needed. Explicitly confirmed via grep of `backend/app/*.py` that no Haversine/geopy/scipy import exists today, and none is needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-Python Haversine | SpatiaLite extension (`mod_spatialite`) + R-tree index | Correct long-term answer for a growing stops table, but adds a native extension dependency, requires `conn.enable_load_extension(True)` (disabled in this project's plain `sqlite3.connect()` calls, see `backend/app/db.py`), and is overkill at 9,360 rows. Rejected for this phase — flag as a v2 idea if the stops table grows an order of magnitude. |
| Pure-Python Haversine | `geopy.distance.geodesic` (Vincenty/ellipsoidal) | More accurate (accounts for Earth's ellipsoid shape) but pulls in a new pip dependency for a difference (~0.3% at Bengaluru's latitude) that doesn't matter at 500m/2000m radii or for a 500m-vs-600m boundary test. Rejected — Haversine's spherical-Earth approximation is well within tolerance for this success criterion. |
| SQL `BETWEEN` bounding box only (no Python Haversine pass) | Skip the precise-distance pass entirely | **Rejected explicitly by CONTEXT.md's implementation note** — a bounding box alone would incorrectly include corner points beyond the true radius, which fails ROADMAP success criterion #3's literal requirement that a 600m-distant stop must be excluded (a naive square bounding box at certain bearings can include points beyond the circular radius in the box corners). |

**Installation:** None required — this phase adds no new dependencies to `backend/pyproject.toml`.

**Version verification:** All versions in the Core table were read directly from `backend/pyproject.toml` (VERIFIED via file read, not registry lookup — no new packages to check against a registry).

## Package Legitimacy Audit

**Not applicable — this phase introduces zero new external packages.** All work is implemented with libraries already present in `backend/pyproject.toml` (`fastapi`, `pydantic`) plus the Python standard library (`math`, `sqlite3`). No `npm view`/`pip index versions` verification or `package-legitimacy check` run was needed because there is nothing new to verify.

**Packages removed due to [SLOP] verdict:** none (n/a — no new packages)
**Packages flagged as suspicious [SUS]:** none (n/a — no new packages)

## Architecture Patterns

### System Architecture Diagram

```
Mobile Client (out of scope this phase)
        │
        │  GET /v1/stops/{stop_id}         GET /v1/routes/{route_id}
        │  GET /v1/stops?lat&lon&radius_m  GET /v1/eta (enriched)
        ▼
┌───────────────────────────────────────────────────────────────┐
│  FastAPI Router (backend/app/routes.py)                       │
│                                                                 │
│  Registration order matters for path matching:                │
│    /stops                (existing, extended w/ radius params) │
│    /stops/{stop_id}            ← NEW (API-01)                  │
│    /stops/{stop_id}/schedule   (existing — deeper path, no     │
│                                  collision w/ above)            │
│    /routes                (existing)                            │
│    /stops/{stop_id}/schedule (existing)                        │
│    /routes/search         (existing — MUST stay before...)     │
│    /routes/{route_id}          ← NEW (API-02), MUST be          │
│                                  registered AFTER /routes/search │
│    /eta                   (existing, response enriched)         │
└───────────────────────────────────────────────────────────────┘
        │
        │  1. Validate query/path params (400/404 per D-06/D-11/D-13..17)
        │  2. Existence check (404 if missing row) or empty-array (200, D-05/D-10)
        │  3a. [Radius search] compute bbox in Python → SQL BETWEEN pre-filter
        │      → Python Haversine precise filter on candidate rows
        │  3b. [Route/Stop detail] existence check → JOIN query → build response
        │  3c. [ETA enrich] existing segment lookup → LEFT JOIN stops×2, routes×1
        ▼
┌───────────────────────────────────────────────────────────────┐
│  SQLite (backend/bmtc_dev.db, WAL mode)                        │
│  stops (9,360 rows) — routes (~4,190) — trips (~54,780)        │
│  stop_times (~1.46M, indexed on trip_id+stop_sequence)          │
└───────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new files — all changes land in existing files, matching this phase's "small and additive" mandate (CLAUDE.md Rule 3):

```
backend/app/
├── routes.py       # 2 new route handlers + 2 modified handlers (get_stops, get_eta)
├── models.py       # New: RouteDetailResponse, DirectionInfo, DirectionStopInfo (or reuse
│                   #   existing StopResponse-shaped inline dict); extend SegmentInfo with
│                   #   from_stop_name/to_stop_name/route_short_name (D-18)
├── db.py           # Optional: add a small haversine_m(lat1, lon1, lat2, lon2) helper here
│                   #   if the planner wants it colocated with compute_bin_id(), OR keep it
│                   #   in routes.py next to get_stops() — see note below on placement
└── schema.sql      # NO CHANGES — no new tables/columns/indexes required for this phase
```

**Placement note:** `db.py` currently holds `get_connection()` and `compute_bin_id()` — both are "pure computation, no route awareness" helpers. A `haversine_m()` function fits that same profile and would be reusable if radius search is ever needed elsewhere. Alternatively, keeping it as a private `_haversine_m()` in `routes.py` next to `get_stops()` (where it's the only caller) is equally consistent with this codebase's existing style (`normalize_for_search()` and `_compute_confidence()` are both module-level helpers in `routes.py`, not `db.py`, despite being pure functions). **Recommendation: put it in `routes.py`** — precedent favors keeping single-consumer pure helpers next to their caller in this codebase, reserving `db.py` for connection/schema-level concerns.

### Pattern 1: Bounding-Box Pre-Filter + Precise Haversine Filter (API-03)

**What:** Two-stage geospatial filter — a cheap SQL range query narrows the candidate set, then an exact distance calculation in Python removes false positives.

**When to use:** Any radius search against a table with no spatial index, where the table is small enough (low thousands to tens of thousands of rows) that a full or lightly-filtered table scan is acceptably fast.

**Example:**
```python
# Source: derived from equirectangular-approximation bounding-box technique
# [CITED: web — SQLite/geospatial bounding box pattern, see Sources] +
# [CITED: web — Haversine formula, see Sources]
import math

EARTH_RADIUS_M = 6_371_000.0
MAX_RADIUS_M = 2000  # D-15 cap


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_M * c


def bounding_box(lat: float, lon: float, radius_m: float) -> tuple[float, float, float, float]:
    """Equirectangular-approximation bbox: (min_lat, max_lat, min_lon, max_lon)."""
    lat_delta = math.degrees(radius_m / EARTH_RADIUS_M)
    # Longitude degrees shrink as |latitude| grows; guard against cos(90)=0 at poles
    # (not reachable for Bengaluru's ~13°N, but defensive nonetheless).
    lon_delta = math.degrees(radius_m / EARTH_RADIUS_M / math.cos(math.radians(lat)))
    return (lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta)


# In the route handler:
min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius_m)
cursor.execute(
    """
    SELECT stop_id, stop_name, stop_lat, stop_lon, zone_id
    FROM stops
    WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?
    """,
    (min_lat, max_lat, min_lon, max_lon),
)
candidates = cursor.fetchall()

# Precise filter — removes bounding-box corner false positives
results = [
    row for row in candidates
    if haversine_m(lat, lon, row["stop_lat"], row["stop_lon"]) <= radius_m
]
```

**Why this satisfies success criterion #3:** The Haversine formula has <1% error for terrestrial distances [CITED: general geodesy], which is far tighter than the 100m gap between the "included" (≤500m) and "excluded" (600m) test stops in the literal success criterion. A deterministic unit test can synthesize a stop at exactly 500m and one at exactly 600m from a fixed origin using the same formula in reverse (see Code Examples below) — no live GTFS coordinates are needed for the boundary assertion, making the test independent of GTFS data churn.

### Pattern 2: Representative-Shape Selection for Route Detail (API-02, D-04)

**What:** For a `(route_id, direction_id)` with multiple `shape_id` branch variants, pick the most-common shape's trip as the canonical ordered stop list.

**When to use:** Any time GTFS data has branch/variant trips under one route+direction and a single "representative" ordering is needed.

**Example:**
```python
# Source: verified against live backend/bmtc_dev.db via EXPLAIN QUERY PLAN
cursor.execute(
    """
    SELECT shape_id, COUNT(*) as cnt
    FROM trips
    WHERE route_id = ? AND direction_id = ?
    GROUP BY shape_id
    ORDER BY cnt DESC
    LIMIT 1
    """,
    (route_id, direction_id),
)
shape_row = cursor.fetchone()
if shape_row is None:
    directions_stops = []  # D-05: no trips for this direction → empty, not 404
else:
    most_common_shape_id = shape_row["shape_id"]
    cursor.execute(
        """
        SELECT trip_id FROM trips
        WHERE route_id = ? AND direction_id = ? AND shape_id IS ?
        LIMIT 1
        """,
        (route_id, direction_id, most_common_shape_id),
    )
    representative_trip_id = cursor.fetchone()["trip_id"]

    cursor.execute(
        """
        SELECT st.stop_id, s.stop_name, s.stop_lat, s.stop_lon, st.stop_sequence
        FROM stop_times st
        JOIN stops s ON st.stop_id = s.stop_id
        WHERE st.trip_id = ?
        ORDER BY st.stop_sequence
        """,
        (representative_trip_id,),
    )
    directions_stops = cursor.fetchall()
```

**Verified performance:** `EXPLAIN QUERY PLAN` on the live dev DB confirms `idx_trips_route_dir` is used (`SEARCH trips USING INDEX idx_trips_route_dir (route_id=? AND direction_id=?)`) before the `GROUP BY`/`ORDER BY` temp B-tree steps. The largest route+direction in the current GTFS feed has 178 trips — trivial for an in-memory sort. **No new index is required.** The `stop_times` lookup uses the existing `idx_stop_times_trip_seq(trip_id, stop_sequence)` index.

**Edge case to handle defensively:** `shape_id IS ?` (not `= ?`) is used above because SQLite's `GROUP BY` treats all `NULL` values as one group; if a future GTFS re-bootstrap ever has `NULL` shape_ids mixed with real ones, `WHERE shape_id = NULL` would match nothing (SQL NULL semantics), silently breaking the second query. Verified against live data: all 54,780 trips in the current feed have a non-null `shape_id`, but the `IS` operator is a one-line defensive fix worth including since GTFS `shape_id` is optional per spec.

### Pattern 3: FastAPI Static-Before-Dynamic Route Registration

**What:** FastAPI/Starlette matches path operations top-to-bottom in registration order and stops at the first match.

**When to use:** Whenever a literal path segment (e.g. `/search`) and a path parameter (e.g. `/{route_id}`) could both match the same URL.

**Example:**
```python
# Source: fastapi.tiangolo.com path-params tutorial + confirmed against current
# backend/app/routes.py registration order [CITED: official FastAPI docs]

# routes.py — CURRENT order (verified by reading the file):
#   558: @router.get("/routes")            get_routes()
#   635: @router.get("/stops/{stop_id}/schedule")   get_stop_schedule()
#   761: @router.get("/routes/search")     search_routes()
#
# The NEW /routes/{route_id} handler MUST be inserted AFTER line 761's
# search_routes() definition (i.e., after the "/routes/search" decorator),
# otherwise a request to GET /v1/routes/search would be captured by
# /routes/{route_id} with route_id="search" — evaluated first since it
# appears earlier in the file.
#
# /stops/{stop_id} (NEW, API-01) does NOT need this same ordering care
# relative to /stops/{stop_id}/schedule: FastAPI/Starlette route matching
# is not purely line-order for differing path *depths* — a 2-segment path
# (/stops/{stop_id}) and a 3-segment path (/stops/{stop_id}/schedule) are
# structurally distinct patterns that cannot both match the same URL, so
# order between them is irrelevant. Still recommended: register
# /stops/{stop_id} near the other /stops routes for readability.
```

**Verified current registration order (read directly from `backend/app/routes.py`):**
1. `POST /ride_summary` (line 50)
2. `GET /eta` (line 245)
3. `GET /config` (line 417)
4. `GET /health` (line 449)
5. `GET /stops` (line 476)
6. `GET /routes` (line 558)
7. `GET /stops/{stop_id}/schedule` (line 635)
8. `GET /routes/search` (line 761)

**Required insertion points:**
- `GET /stops/{stop_id}` — any position among the `/stops*` handlers works (no depth collision); simplest is directly after `get_stops()` (line 476-555) and before `get_routes()`.
- `GET /routes/{route_id}` — **must be placed after `search_routes()`'s full definition (after line 885, end of file)**, or as an explicit late registration. Do not insert it near `get_routes()` (line 558) — that would place it before `/routes/search` (line 761) and break the search endpoint.

### Anti-Patterns to Avoid

- **Using FastAPI's declarative `Query(ge=-90, le=90)` for `lat`/`lon`/`radius_m` validation:** This project's established error-response contract wraps ALL validation errors in `{error, message, details}` via manual checks that return `JSONResponse(status_code=400, content={...})` (see `get_stops()`'s existing bbox/route_type validation). FastAPI's own declarative `Query(le=...)` bounds trigger Pydantic's default validation error path — a **422** with FastAPI's built-in error shape (`{"detail": [...]}`), not this project's 400 `invalid_request` envelope. D-15/D-16 explicitly require 400, so `lat`, `lon`, and `radius_m` must be declared as unconstrained `Optional[float]`/`Optional[int]` in the function signature and validated manually inside the handler body, exactly like the existing `bbox` and `route_type` checks.
- **Computing Haversine distance inside the SQL query (e.g. as a computed column in the SELECT):** SQLite's stock build (this project uses `sqlite3` stdlib with no `-DSQLITE_ENABLE_MATH_FUNCTIONS` flag or loaded extensions per `backend/app/db.py`) does not reliably expose `sin`/`cos`/`atan2` as SQL functions across all SQLite builds bundled with different Python versions — relying on it is a portability risk. Registering a Python UDF via `conn.create_function()` is possible but adds indirection for no benefit at this row count; a plain Python list-comprehension filter after fetching bbox-filtered rows is simpler, easier to unit-test in isolation, and avoids per-row Python↔SQLite call overhead concerns entirely (Python filtering happens once, in the app, not once per DB call).
- **Treating GTFS `shape_id` as always non-null:** It's optional per the GTFS spec even though it's fully populated (54,780/54,780) in the current feed. Use `IS ?` instead of `= ?` when matching a possibly-null `shape_id` value in a WHERE clause (see Pattern 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Great-circle distance | A custom flat-Earth/Pythagorean approximation ("just use `sqrt(dlat² + dlon²)`") | The Haversine formula (Pattern 1) | Flat approximations break down non-uniformly with latitude (longitude degrees compress toward the poles) and would give meaningfully wrong results even at Bengaluru's ~13°N — Haversine correctly accounts for spherical geometry with a single extra `cos(lat)` term and is barely more code |
| Spatial indexing | A hand-rolled quadtree/geohash bucketing scheme in Python | The bounding-box + Haversine two-stage filter (Pattern 1) | At 9,360 rows, a full/lightly-filtered table scan plus a Python list comprehension is fast enough (sub-millisecond to low-millisecond range) — building custom spatial indexing structures for this scale is solving a problem the data size doesn't have |
| Error response formatting | New ad-hoc error dict shapes for the 2 new endpoints | The existing `HTTPException(status_code, detail={"error": ..., "message": ..., "details": {...}})` pattern (D-06/D-11) — same shape as `/eta` | This project already has one canonical error envelope (`docs/api.md` "Error Model" section); the two error-response styles (`HTTPException` vs `JSONResponse`) that already coexist in this codebase both produce the *same JSON shape* via the custom `http_exception_handler` in `main.py` — the choice between them is a code-style decision (D-06 already locked it), not a new pattern to invent |

**Key insight:** This phase's only "hard" problem — accurate radius filtering without a spatial index — has a well-known two-line solution (bbox pre-filter + Haversine) that is standard practice for small-to-medium tables; reaching for a spatial extension or a custom indexing scheme would be solving for a scale (millions of rows) this project doesn't have.

## Common Pitfalls

### Pitfall 1: Radius/bbox validation returning the wrong HTTP status code
**What goes wrong:** A planner or implementer uses FastAPI's `Query(..., ge=-90, le=90)` declarative validation for `lat`/`lon`, or `Query(..., le=2000)` for `radius_m`, producing a 422 response in FastAPI's default shape instead of the 400 `invalid_request` envelope D-15/D-16 require.
**Why it happens:** It's the more "idiomatic FastAPI" way to add bounds, and it's easy to miss that this project has intentionally opted out of that pattern for parameter-level errors (see `get_routes()`'s manual `route_type` check, which exists specifically because `Query()` bounds don't produce this project's error shape).
**How to avoid:** Declare `lat: Optional[float] = Query(None)`, `lon: Optional[float] = Query(None)`, `radius_m: Optional[int] = Query(None)` with no `ge`/`le`/pattern constraints, then validate manually inside the function body exactly like the existing `bbox` and `route_type` blocks, returning `JSONResponse(status_code=400, content={"error": "invalid_request", ...})`.
**Warning signs:** A test asserting `response.status_code == 400` fails with `422` instead; the response body has a `"detail"` key instead of `"error"`/`"message"`/`"details"`.

### Pitfall 2: Bounding-box false positives at the exact radius boundary
**What goes wrong:** A stop lands inside the equirectangular bounding box (rectangle) but is actually a diagonal distance greater than `radius_m` away (box corners are farther from center than box edges), yet the code returns it because the Haversine precise-filter step was skipped or applied incorrectly (e.g., filtering on squared distance without taking the final `sqrt`/`atan2`, or comparing meters against a value still in the intermediate `a`/`c` unit).
**Why it happens:** It's tempting to treat the bounding box as "good enough" since it's cheap, especially under time pressure — but CONTEXT.md's implementation note and ROADMAP success criterion #3 explicitly require the 600m-stop-excluded assertion to pass, which a box-only filter can violate near the corners.
**How to avoid:** Always run the Haversine filter (Pattern 1) as a second pass over the bbox-filtered candidates before returning results; write a unit test with a stop at a *diagonal* offset near the box corner, not just north/south/east/west of center, to catch this specific failure mode.
**Warning signs:** A test stop placed at, e.g., 45° bearing and 550m distance (inside the bbox, outside the 500m radius) is incorrectly included in results.

### Pitfall 3: `radius_m` cap enforcement ordering vs. mutual-exclusivity check
**What goes wrong:** D-13 (bbox + lat/lon/radius_m mutually exclusive → 400) and D-14 (all-or-nothing lat/lon/radius_m → 400) and D-15 (radius_m > 2000 → 400) and D-16 (lat/lon range → 400) are four separate validation rules that all return the same 400 status but with different `message`/`details` content. If validation order isn't deliberate, a request violating multiple rules simultaneously (e.g., `bbox` + `radius_m=5000`) could return a confusing or non-deterministic error message depending on which `if` branch executes first, and tests asserting a *specific* message for a specific violation could be flaky if the implementation's check order changes.
**Why it happens:** Four independent boolean conditions naturally tempt an implementer into an unordered chain of `if` statements.
**How to avoid:** Pick and document a fixed check order (e.g., mutual-exclusivity first, then all-or-nothing completeness, then range validation, then cap) so behavior for compound-invalid requests is deterministic and testable. This is an implementation detail the planner should fix explicitly in the plan rather than leaving to task-time judgment.
**Warning signs:** Two different test runs of the same "multiple violations at once" test case produce different error messages.

### Pitfall 4: Route detail scale assumption breaking on a future GTFS update
**What goes wrong:** D-04's representative-shape approach and this research's "178 trips max" performance verification are both snapshots of the *current* GTFS feed. A future `scripts/update_gtfs.sh` re-bootstrap (DATA-04, a later phase) could load a GTFS feed with a route that has thousands of trip variants, changing the GROUP BY's row count assumptions.
**Why it happens:** Performance verification against live data is only valid for that data snapshot; GTFS feeds are refreshed periodically per this project's roadmap.
**How to avoid:** The `WHERE route_id = ? AND direction_id = ?` filter (using `idx_trips_route_dir`) bounds the GROUP BY's input to a single route+direction's trips regardless of total GTFS feed size — this scales with "trips per route direction," not "total trips in the feed," so it remains fast even as the feed grows, unless a single route grows an implausible number of branch variants. No action needed now; noted for awareness only.
**Warning signs:** N/A for this phase — flagged as a forward-looking note, not a blocking concern.

## Code Examples

### New Endpoint: GET /v1/stops/{stop_id} (API-01)

```python
# Source: pattern derived from get_stop_schedule()'s existence-check template
# (backend/app/routes.py:635-743), adapted to D-06/D-11's HTTPException style

@router.get("/stops/{stop_id}")
async def get_stop_detail(stop_id: str):
    settings = get_settings()
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT stop_id, stop_name, stop_lat, stop_lon, zone_id FROM stops WHERE stop_id = ?",
            (stop_id,),
        )
        stop_row = cursor.fetchone()
        if stop_row is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "not_found",
                    "message": "Stop not found in GTFS data",
                    "details": {"stop_id": stop_id},
                },
            )

        # D-10: 200 + empty routes list if no routes currently serve this stop
        cursor.execute(
            """
            SELECT DISTINCT r.route_id, r.route_short_name, r.route_long_name,
                   r.route_type, r.agency_id
            FROM routes r
            JOIN trips t ON r.route_id = t.route_id
            JOIN stop_times st ON t.trip_id = st.trip_id
            WHERE st.stop_id = ?
            ORDER BY r.route_short_name
            """,
            (stop_id,),
        )
        routes = [RouteResponse(**dict(row)) for row in cursor.fetchall()]

    return {
        "stop_id": stop_row["stop_id"],
        "stop_name": stop_row["stop_name"],
        "stop_lat": stop_row["stop_lat"],
        "stop_lon": stop_row["stop_lon"],
        "zone_id": stop_row["zone_id"],
        "routes": routes,
    }
```

### New Endpoint: GET /v1/routes/{route_id} (API-02)

See Pattern 2 above for the representative-shape query; wrap it with the existence check and D-06 error style:

```python
# Source: combines Pattern 2's verified query with D-06's HTTPException style

@router.get("/routes/{route_id}")  # MUST be registered after search_routes() (Pattern 3)
async def get_route_detail(route_id: str):
    settings = get_settings()
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT route_id, route_short_name, route_long_name, route_type, agency_id "
            "FROM routes WHERE route_id = ?",
            (route_id,),
        )
        route_row = cursor.fetchone()
        if route_row is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "not_found",
                    "message": "Route not found in GTFS data",
                    "details": {"route_id": route_id},
                },
            )

        directions = []
        for direction_id in (0, 1):
            # ... Pattern 2's representative-shape query here, per direction_id ...
            # D-05: if no trips for this direction_id, simply skip it (don't
            # append an entry) rather than appending an empty-stops entry —
            # confirm this interpretation with the planner/user if ambiguous,
            # since D-05's "directions: []" wording describes the whole-route
            # zero-trips case; per-direction absence is a related but distinct
            # edge case worth being explicit about in the plan.
            pass

    return {
        "route_id": route_row["route_id"],
        "route_short_name": route_row["route_short_name"],
        "route_long_name": route_row["route_long_name"],
        "route_type": route_row["route_type"],
        "agency_id": route_row["agency_id"],
        "directions": directions,
    }
```

**Note flagged for the planner:** D-05 explicitly covers "route exists but has zero trips at all → `directions: []`." It does not explicitly say what happens if direction 0 has trips but direction 1 does not (a route that only runs in one direction) — should `directions` contain one entry (for direction 0 only) or two entries (with direction 1's `stops: []`)? This is a genuine gap in CONTEXT.md's decisions, not resolved by the D-01..D-22 list. **Recommend the planner add this as an explicit micro-decision in PLAN.md** (suggested default: omit directions with zero trips entirely, matching the spirit of D-05's "empty is fine, don't force structure that doesn't exist" — but this is a recommendation, not a locked decision, and should be flagged for a 30-second user confirmation if the planning workflow supports it).

### ETA Enrichment JOIN (API-04, D-18)

```python
# Source: pattern modeled on schema.sql's existing segment_learning_progress VIEW
# (backend/app/schema.sql:290-310), which already joins stops×2 + routes for the
# exact same from/to-stop-name + route_short_name shape this phase needs.

with get_connection(settings.db_path) as conn:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            seg.segment_id,
            fs.stop_name AS from_stop_name,
            ts.stop_name AS to_stop_name,
            r.route_short_name
        FROM segments seg
        LEFT JOIN stops fs ON seg.from_stop_id = fs.stop_id
        LEFT JOIN stops ts ON seg.to_stop_id = ts.stop_id
        LEFT JOIN routes r ON seg.route_id = r.route_id
        WHERE seg.segment_id = ?
        """,
        (segment_id,),
    )
    enrichment_row = cursor.fetchone()

# D-20: LEFT JOIN means an orphaned from_stop_id/to_stop_id/route_id yields
# NULL for that field (not a missing row) — Pydantic model fields must be
# Optional[str] = None to accept this without a 500, and the response is
# still built and returned with status 200.
```

**Why `LEFT JOIN` (not `INNER JOIN`) is required here:** D-20 mandates that an orphaned reference nulls the field and still returns 200. An `INNER JOIN` would silently drop the entire row from the result set if any one of `from_stop_id`/`to_stop_id`/`route_id` doesn't resolve, which would make the *whole* ETA lookup appear to fail (empty result → could be misinterpreted as segment-not-found) rather than partially enriching. This is the single most important implementation detail for API-04 — using `JOIN` instead of `LEFT JOIN` here is a correctness bug, not a style choice.

### Test Coordinate Generation for Success Criterion #3 (Radius Search)

```python
# Source: derived from the destination-point formula (inverse of Haversine),
# useful for deterministic radius-boundary tests independent of real GTFS data.
import math

EARTH_RADIUS_M = 6_371_000.0

def destination_point(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    """Compute a lat/lon that is exactly `distance_m` meters from (lat, lon)
    at the given compass bearing. Useful for generating deterministic
    boundary-condition test fixtures (e.g., "exactly 500m away")."""
    phi1 = math.radians(lat)
    lam1 = math.radians(lon)
    theta = math.radians(bearing_deg)
    delta = distance_m / EARTH_RADIUS_M

    phi2 = math.asin(
        math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta)
    )
    lam2 = lam1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1),
        math.cos(delta) - math.sin(phi1) * math.sin(phi2),
    )
    return math.degrees(phi2), math.degrees(lam2)

# Example test fixture generation:
# origin = (12.97, 77.59)
# included_stop_lat, included_stop_lon = destination_point(*origin, bearing_deg=45, distance_m=500)
# excluded_stop_lat, excluded_stop_lon = destination_point(*origin, bearing_deg=45, distance_m=600)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| No radius search on `/v1/stops` (bbox only) | Additive `lat`/`lon`/`radius_m` params, mutually exclusive with `bbox` | This phase (API-03) | Mobile clients can do "nearby stops" without computing a manual bounding box client-side |
| ETA response has only IDs (`route_id`, `from_stop_id`, `to_stop_id`) | `SegmentInfo` adds `from_stop_name`, `to_stop_name`, `route_short_name` | This phase (API-04) | Mobile clients (in a future phase) can render human-readable ETA results without a follow-up `/v1/stops`/`/v1/routes` lookup per segment |

**Deprecated/outdated:** None introduced by this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Haversine's <1% terrestrial-distance error is "well within tolerance" for the 500m/600m boundary test and the 2000m cap | Standard Stack, Pattern 1 | LOW — even a full 1% error at 600m is a 6m margin against a 100m gap between the two test cases; would only matter if the test used a much tighter boundary (e.g., 500m vs 505m) |
| A2 | `route_id` grouping for D-04's "most-common shape" should default to omitting directions with zero trips (rather than including them with `stops: []`) when only one of two directions has trips | Code Examples — flagged explicitly in-line as a genuine gap, not fully resolved by CONTEXT.md's D-01..D-22 | MEDIUM — if the planner locks the wrong default, a later UAT pass or mobile integration could reveal the response shape doesn't match client expectations; recommend a 1-line clarification in PLAN.md or a quick user confirmation before implementation |
| A3 | Placing the `haversine_m()`/`bounding_box()` helper functions in `routes.py` (not `db.py`) is the "right" location per this codebase's existing style precedent | Recommended Project Structure | LOW — purely a code-organization choice with no functional impact; easy to move later if reviewers disagree |

**If this table is empty:** N/A — see entries above. All three are LOW-to-MEDIUM risk, non-blocking judgment calls, not verified-vs-actual factual disputes.

## Open Questions

1. **Should `GET /v1/routes/{route_id}`'s `directions` array include an entry with `stops: []` for a direction that has zero trips (while the other direction has trips), or omit that direction's entry entirely?**
   - What we know: D-05 covers the whole-route zero-trips case (`directions: []`) explicitly. D-02 defines the array-of-objects shape.
   - What's unclear: The per-direction partial case (one direction has service, the other doesn't) isn't explicitly addressed by any of D-01 through D-22.
   - Recommendation: Default to omitting the direction from the array entirely (symmetric with D-05's philosophy of "don't manufacture structure for data that doesn't exist"), but this is a genuine gap the planner should either lock explicitly in PLAN.md or raise as a 1-question confirmation before implementation, since it's a visible API-shape decision a mobile client will need to know about eventually (even though mobile integration itself is out of scope, D-22).

## Environment Availability

Skipped — this phase has no external tool/service/runtime dependencies beyond what's already installed and verified working in this repository (`fastapi`, `pydantic`, stdlib `sqlite3`/`math`, already-running dev DB at `backend/bmtc_dev.db`). No Docker, no external API, no new CLI tool.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 7.4.3 [VERIFIED: backend/pyproject.toml] with pytest-xdist 3.5.0, pytest-randomly 3.15.0 |
| Config file | `backend/pytest.ini` |
| Quick run command | `cd backend && uv run pytest tests/test_api_gtfs_alignment.py -v` (closest analog module for the new endpoints) |
| Full suite command | `cd backend && uv run pytest -n auto --dist loadfile -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | `GET /v1/stops/{stop_id}` returns stop detail + routes array for a known stop | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stop_detail_success -x` | ❌ Wave 0 (new test, new fixture with a stop+route+trip+stop_time chain) |
| API-01 | `GET /v1/stops/{stop_id}` returns 404 for unknown stop_id | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stop_detail_not_found -x` | ❌ Wave 0 |
| API-01 | Stop with zero serving routes returns 200 + `routes: []` (D-10) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stop_detail_no_routes -x` | ❌ Wave 0 |
| API-02 | `GET /v1/routes/{route_id}` returns route metadata + ordered stops per direction for a known route | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_success -x` | ❌ Wave 0 (new fixture with multi-shape trips per D-04) |
| API-02 | `GET /v1/routes/{route_id}` returns 404 for unknown route_id | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_not_found -x` | ❌ Wave 0 |
| API-02 | Route with zero trips returns 200 + `directions: []` (D-05) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_no_trips -x` | ❌ Wave 0 |
| API-02 | Route with multiple shape_id branches per direction selects the most-common shape's stop order (D-04) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_branch_selection -x` | ❌ Wave 0 |
| API-03 | Radius search includes a stop within 500m, excludes one at 600m (literal success criterion #3) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_boundary -x` | ❌ Wave 0 — use `destination_point()` helper (Code Examples) to generate deterministic fixtures |
| API-03 | `bbox` + `lat`/`lon`/`radius_m` together → 400 (D-13) | unit/integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_bbox_radius_mutually_exclusive -x` | ❌ Wave 0 |
| API-03 | Partial lat/lon/radius_m (only some present) → 400 (D-14) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_all_or_nothing -x` | ❌ Wave 0 |
| API-03 | `radius_m` > 2000 → 400 (D-15) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_exceeds_cap -x` | ❌ Wave 0 |
| API-03 | Out-of-range lat/lon → 400 (D-16), and same for bbox (D-17 drive-by) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_invalid_latlon -x`, `test_get_stops_bbox_invalid_range -x` | ❌ Wave 0 |
| API-04 | ETA response's `segment` object includes `from_stop_name`/`to_stop_name`/`route_short_name` populated from GTFS | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_eta_segment_names_populated -x` | ❌ Wave 0 (extend `setup_test_segment_for_eta()` fixture to also insert stops/routes rows) |
| API-04 | Orphaned from/to/route reference nulls the field, still 200 (D-20) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_eta_segment_names_orphaned_null -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/test_api_gtfs_alignment.py -v`
- **Per wave merge:** `cd backend && uv run pytest -n auto --dist loadfile -q`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] All test functions listed in the table above are new — none exist yet. `tests/test_api_gtfs_alignment.py` is the natural home (it already covers the sibling `/stops`, `/routes`, `/stops/{id}/schedule`, `/eta` endpoints in the same GTFS-alignment testing style).
- [ ] `conftest.py` needs a new or extended fixture analogous to `db_with_test_routes` that also inserts `stops`, `trips`, and `stop_times` rows with multiple `shape_id` branches per `(route_id, direction_id)`, to exercise D-04's representative-shape selection deterministically (the existing `db_with_test_routes` fixture only inserts `routes`/`agency` rows, no trips/stops/stop_times).
- [ ] `setup_test_segment_for_eta()` (existing helper in `test_api_gtfs_alignment.py`) needs to additionally insert `stops` rows for `STOP_A`/`STOP_B` and a `routes` row for `ROUTE1` so the new JOIN-based enrichment (API-04) has real data to resolve against — currently that fixture only inserts `segments`/`segment_stats`, relying on FK columns without matching parent rows (which works today only because `stops`/`routes` FKs aren't enforced at the `segments` insert in that fixture's `temp_db`, per `PRAGMA foreign_keys = ON` combined with SQLite's default deferred/optional enforcement — worth the planner double-checking this doesn't silently break once the LEFT JOIN is added).
- [ ] Framework install: none — pytest and all test dependencies already present.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | All 4 endpoints touched by this phase are unauthenticated GETs (existing pattern; no auth changes) |
| V3 Session Management | No | No session state involved |
| V4 Access Control | No | No resource-ownership or role-based access — all GTFS data is public |
| V5 Input Validation | Yes | Manual validation of `stop_id`/`route_id` (path params, used only in parameterized queries — no injection risk), and `lat`/`lon`/`radius_m` (query params, range + mutual-exclusivity + completeness checks per D-13..D-17) — all via Python-side checks returning the standard error envelope, never via raw string interpolation into SQL |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `stop_id`/`route_id` path parameters | Tampering | All existing and new queries use parameterized `?` placeholders (confirmed throughout `routes.py` — no f-string interpolation of user input into SQL values anywhere in this codebase, including the dynamic `WHERE`-clause-building code, which only interpolates clause *structure*, never values) |
| Unbounded radius search causing large full-table scans (resource exhaustion) | Denial of Service | D-15's 2000m cap bounds the worst-case bounding-box query result set; at 9,360 total stops, even a full-table Haversine pass (worst case, e.g. radius spanning the whole city) is sub-100ms in pure Python — not a meaningful DoS vector at current data scale, but the cap is still the correct defensive control per D-15 |
| Overly permissive route detail exposing internal trip/schedule internals | Information Disclosure | D-01 deliberately narrows the response to stops-only (no trip_id, no schedule times) — this is itself a scope-minimization control, not just a UX simplification |

## Sources

### Primary (HIGH confidence)
- `backend/app/routes.py`, `backend/app/models.py`, `backend/app/db.py`, `backend/app/schema.sql`, `backend/app/config.py`, `backend/app/main.py` — read directly, all code-organization/registration-order/index claims verified against actual file contents
- `backend/bmtc_dev.db` (live dev database) — queried directly via `sqlite3` CLI: confirmed 9,360 stops, 54,780 trips (100% non-null `shape_id`), `idx_trips_route_dir` index usage via `EXPLAIN QUERY PLAN`, max 178 trips per `(route_id, direction_id)`, 17 distinct `route_id`s sharing `route_short_name="285"`
- `backend/tests/test_api_gtfs_alignment.py`, `backend/tests/conftest.py` — read directly for existing test patterns and fixture gaps
- `docs/api.md` — read directly (Error Model, GET /v1/stops, GET /v1/eta sections) to confirm the canonical error envelope and existing example values

### Secondary (MEDIUM confidence)
- FastAPI official docs (fastapi.tiangolo.com/tutorial/path-params-numeric-validations/) via WebSearch — static-route-before-dynamic-route registration order requirement [CITED]
- General geodesy references (Haversine formula derivation) via WebSearch — formula correctness and <1% terrestrial accuracy claim [CITED]
- Bounding-box-then-precise-filter geospatial pattern via WebSearch (SQLite forum, SpatiaLite docs, general geospatial-query engineering writeups) [CITED]

### Tertiary (LOW confidence)
- None — all WebSearch findings above were corroborated by either official documentation or well-established, widely-consistent mathematical/engineering consensus (not a single unverified blog post).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing versions read directly from `pyproject.toml`
- Architecture: HIGH — all registration-order and index-usage claims verified against actual code and a live `EXPLAIN QUERY PLAN` run against the real dev database
- Geospatial formulas: MEDIUM — well-established mathematical formulas (Haversine, equirectangular bbox), corroborated by multiple independent web sources and internally consistent, but not verified via an authoritative single-source spec (there is no "npm view"-equivalent for a math formula)
- Pitfalls: HIGH — the FastAPI Query()-validation-vs-error-shape pitfall and the LEFT JOIN requirement for D-20 are both directly derived from reading this project's own existing code conventions, not external speculation

**Research date:** 2026-07-03
**Valid until:** 2026-08-02 (30 days — stable domain: FastAPI/SQLite/Haversine are all mature, slow-moving technologies; the GTFS data snapshot facts (row counts, max trips per route) should be re-verified if `scripts/update_gtfs.sh` (DATA-04) runs before this phase is implemented)

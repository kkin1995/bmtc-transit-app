# Phase 3: API Surface Completion - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 5 (2 modified core files, 1 modified test file, 1 modified fixture file, 1 modified spec doc)
**Analogs found:** 5 / 5 (all analogs are sibling code within the same modified files — this phase is purely additive to an existing small codebase)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/app/routes.py` — `get_stop_detail()` (NEW, API-01) | route/controller | request-response, CRUD-read | `get_stop_schedule()` (`routes.py:635-743`) | exact (existence-check → 404 → JOIN → build response template) |
| `backend/app/routes.py` — `get_route_detail()` (NEW, API-02) | route/controller | request-response, CRUD-read | `get_stop_schedule()` (`routes.py:635-743`) + `get_eta()`'s error style (`routes.py:245-296`) | exact (existence check identical shape; error style borrowed from `get_eta`) |
| `backend/app/routes.py` — `get_stops()` (MODIFIED, API-03: add radius params) | route/controller | request-response, CRUD-read (query/filter) | itself — extend the existing `bbox` validation block (`routes.py:476-555`) | exact (same function, same validation idiom) |
| `backend/app/routes.py` — `get_eta()` (MODIFIED, API-04: enrich `SegmentInfo`) | route/controller | request-response, CRUD-read | itself — extend the existing segment-resolution query (`routes.py:245-296`) | exact (same function, add LEFT JOIN) |
| `backend/app/models.py` — new `RouteDetailResponse`, `DirectionInfo`, `DirectionStopInfo`, `StopDetailResponse`; extended `SegmentInfo` | model | data-shape/schema | `ScheduleResponse`/`StopInfo`/`TripInfo`/`DepartureInfo` (`models.py:200-236`) | exact (nested-object composition pattern) |
| `backend/tests/test_api_gtfs_alignment.py` — new test functions (API-01..04) | test | request-response (integration, via `TestClient`) | existing `test_get_schedule_*` and `test_get_eta_*` functions (`test_api_gtfs_alignment.py:319-534`, `585-896`) | exact (same file, same `client` fixture, same assertion style) |
| `backend/tests/conftest.py` — extend `setup_test_segment_for_eta()`; new/extended fixture for multi-shape route+stop data | test-fixture | file-I/O (temp SQLite), setup | `db_with_test_routes` (`conftest.py:317-368`) and `setup_test_segment_for_eta` (`test_api_gtfs_alignment.py:550-582`) | exact (idempotent `INSERT OR IGNORE` + `temp_db` composition pattern) |
| `docs/api.md` — new endpoint sections + updated `/eta` example (D-21) | config/doc | n/a | existing `GET /v1/stops`, `GET /v1/eta` sections in `docs/api.md` | exact (spec-first doc structure already established) |

## Pattern Assignments

### `backend/app/routes.py` — `get_stop_detail()` (NEW)

**Analog:** `get_stop_schedule()` (`backend/app/routes.py:635-743`), error style borrowed from `get_eta()` (`backend/app/routes.py:283-295`) per D-06/D-11.

**Imports pattern** (already present at top of file, `routes.py:1-43`) — no new imports needed beyond what's already imported (`HTTPException`, `get_connection`, `RouteResponse`, `StopResponse`). Add any new response model names to the existing `from app.models import (...)` block (`routes.py:23-42`).

**Existence-check + 404 pattern** — copy this shape, but swap `JSONResponse` for `HTTPException` per D-06/D-11 (see `get_eta()`'s style at lines 282-295):
```python
# backend/app/routes.py:661-673 (get_stop_schedule, existing JSONResponse style)
cursor.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?", (stop_id,))
stop_row = cursor.fetchone()

if stop_row is None:
    return JSONResponse(
        status_code=404,
        content={
            "error": "not_found",
            "message": "Stop not found in GTFS data",
            "details": {"stop_id": stop_id}
        }
    )
```
```python
# backend/app/routes.py:282-295 (get_eta, HTTPException style — USE THIS STYLE per D-06/D-11)
if row is None:
    raise HTTPException(
        status_code=404,
        detail={
            "error": "not_found",
            "message": "Segment not found in GTFS data",
            "details": {
                "route_id": route_id,
                ...
            }
        }
    )
```

**JOIN-for-related-rows pattern** (D-07/D-10, routes serving a stop, 200+empty-array if none) — model on `get_stops()`'s `route_id` sub-select filter (`routes.py:511-521`):
```python
# backend/app/routes.py:511-521
if route_id:
    where_clauses.append("""stop_id IN (
        SELECT DISTINCT st.stop_id
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id
        WHERE t.route_id = ?
    )""")
    params.append(route_id)
```
Invert this for stop→routes (see RESEARCH.md's fully-worked `get_stop_detail()` example, which already applies this JOIN direction with `ORDER BY r.route_short_name` per D-09). No 404 for the empty-routes case — return `routes: []` with 200 (D-10), same idiom as `get_stops()` returning an empty `stops: []` list when a filter matches nothing (no special-casing needed, empty `cursor.fetchall()` already produces this).

**Response construction pattern** — copy `get_stop_schedule()`'s final `return ScheduleResponse(...)` (`routes.py:734-743`) structure: build nested Pydantic sub-objects (here: `RouteResponse` list) inside the `with get_connection(...)` block, then construct and return the top-level model after the block closes.

---

### `backend/app/routes.py` — `get_route_detail()` (NEW)

**Analog:** `get_stop_schedule()`'s existence-check-then-build pattern, combined with the D-04 representative-shape query already fully worked out in RESEARCH.md ("Pattern 2: Representative-Shape Selection", `03-RESEARCH.md` lines 244-284) — copy that query verbatim, it is already verified against the live dev DB via `EXPLAIN QUERY PLAN`.

**Route registration position (critical):** Per Pattern 3 in RESEARCH.md, `@router.get("/routes/{route_id}")` **must be defined after `search_routes()`** (which starts at `routes.py:761` and is the last route currently in the file) — insert the new route detail handler at the end of the file, not near `get_routes()` (`routes.py:558`). Verify final position with:
```bash
grep -n "^@router.get" backend/app/routes.py
```

**404 pattern:** Same `HTTPException(404, detail={...})` shape as `get_eta()` (see above), keyed on `route_id`.

**D-05 edge case (route exists, zero trips → `directions: []`):** No special-case code needed — if the representative-shape query returns no `shape_row` for a given `direction_id`, simply don't append that direction's entry to the `directions` list (this also resolves RESEARCH.md's Open Question #1 — omit rather than including a `stops: []` placeholder, consistent with D-05's "don't manufacture structure for data that doesn't exist" philosophy). Flag this default in PLAN.md as the locked resolution unless the planner chooses otherwise.

---

### `backend/app/routes.py` — `get_stops()` (MODIFIED: add radius search, D-12..D-17)

**Analog:** itself — extend the existing manual `bbox` validation block.

**Existing validation pattern to copy for lat/lon/radius_m** (`backend/app/routes.py:492-509`):
```python
if bbox:
    try:
        parts = bbox.split(",")
        if len(parts) != 4:
            raise ValueError("Invalid bbox format")
        min_lat, min_lon, max_lat, max_lon = map(float, parts)
        where_clauses.append("stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?")
        params.extend([min_lat, max_lat, min_lon, max_lon])
    except (ValueError, IndexError):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "bbox must be in format: min_lat,min_lon,max_lat,max_lon",
                "details": {"bbox": bbox}
            }
        )
```
Apply the identical `JSONResponse(400, {"error": "invalid_request", ...})` shape for each of D-13 (mutual exclusivity), D-14 (all-or-nothing), D-15 (radius cap), D-16 (lat/lon range). **Do NOT use `Query(ge=..., le=...)` declarative bounds** — RESEARCH.md Pitfall 1 explicitly documents why (produces 422 in the wrong envelope shape). Declare `lat/lon/radius_m` as unconstrained `Optional[float]`/`Optional[int] = Query(None)`, exactly like `bbox: Optional[str] = Query(None)` is declared today (`routes.py:478`).

**D-17 drive-by fix (bbox range validation):** apply the same range-check logic to the 4 unpacked bbox floats in the existing `try` block above — same file, same PR, same validation pattern (already the project's established "drive-by fix" precedent per Phase 1/2 CONTEXT.md).

**Haversine + bbox pre-filter implementation** — use RESEARCH.md's fully-worked `haversine_m()` / `bounding_box()` functions verbatim (03-RESEARCH.md lines 189-234). Per RESEARCH.md's Recommended Project Structure, place these as module-level private helpers in `routes.py` (next to `get_stops()`), matching the existing precedent of `normalize_for_search()` (`routes.py:746-758`) and `_compute_confidence()` being module-level pure helpers in `routes.py` rather than `db.py`.

**Response building unaffected** — the existing `StopResponse` construction loop (`routes.py:540-548`) and `StopsListResponse(...)` return (`routes.py:550-555`) need no changes; radius filtering only changes which `candidates` reach that loop.

---

### `backend/app/routes.py` — `get_eta()` (MODIFIED: D-18 enrichment)

**Analog:** itself — extend the existing segment-resolution `cursor.execute(...)` block (`routes.py:274-297`).

**Core enrichment JOIN pattern** — use RESEARCH.md's fully-worked example (03-RESEARCH.md lines 490-513), modeled on `schema.sql:290-310`'s `segment_learning_progress` VIEW which already does this exact from/to-stop-name + route_short_name join:
```python
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
```
**Critical: must be `LEFT JOIN`, never `INNER JOIN`** — D-20 requires nulling an orphaned field while still returning 200; an `INNER JOIN` would drop the whole row instead. This is the single highest-risk implementation detail in this phase (RESEARCH.md flags it explicitly).

**Model field wiring** — the existing `SegmentInfo(...)` construction at `routes.py:372-377` is where the 3 new optional fields attach:
```python
# routes.py:372-377 (current)
segment=SegmentInfo(
    route_id=route_id,
    direction_id=direction_id,
    from_stop_id=from_stop_id,
    to_stop_id=to_stop_id
),
```
Extend to pass `from_stop_name=enrichment_row["from_stop_name"]`, etc. — all three new `SegmentInfo` fields must be `Optional[str] = None` in `models.py` to accept `NULL` from the LEFT JOIN without a 500 (D-20).

---

### `backend/app/models.py` — new/extended models

**Analog:** `ScheduleResponse` / `StopInfo` / `TripInfo` / `DepartureInfo` composition (`backend/app/models.py:200-236`) — the existing precedent for "nested nested-object response model built from multiple small sub-models."

**Extend `SegmentInfo`** (`models.py:239-244`) — add 3 new `Optional[str] = None` fields, following the exact style of other Optional fields in this file (e.g. `RouteResponse.route_short_name: Optional[str] = None` at `models.py:186`):
```python
class SegmentInfo(BaseModel):
    """Segment information for ETA response (v1.1)."""
    route_id: str
    direction_id: int
    from_stop_id: str
    to_stop_id: str
    from_stop_name: Optional[str] = None   # NEW (API-04, D-18)
    to_stop_name: Optional[str] = None     # NEW (API-04, D-18)
    route_short_name: Optional[str] = None # NEW (API-04, D-18)
```

**New `DirectionStopInfo` / `DirectionInfo` / `RouteDetailResponse`** (API-02) — follow the `StopInfo`/`DepartureInfo`/`ScheduleResponse` 3-tier nesting pattern (`models.py:200-236`):
```python
class DirectionStopInfo(BaseModel):
    """Single stop within a route direction's ordered stop list (API-02, D-03)."""
    stop_id: str
    stop_name: str
    stop_lat: float
    stop_lon: float
    stop_sequence: int


class DirectionInfo(BaseModel):
    """Ordered stops for one direction of a route (API-02, D-02)."""
    direction_id: int
    stops: List[DirectionStopInfo]


class RouteDetailResponse(BaseModel):
    """GET /v1/routes/{route_id} response (API-02, D-01)."""
    route_id: str
    route_short_name: Optional[str] = None
    route_long_name: Optional[str] = None
    route_type: int
    agency_id: Optional[str] = None
    directions: List[DirectionInfo]
```

**New `StopDetailResponse`** (API-01, D-07) — reuse `RouteResponse` directly for the nested list (no new route-shaped model needed):
```python
class StopDetailResponse(BaseModel):
    """GET /v1/stops/{stop_id} response (API-01, D-07)."""
    stop_id: str
    stop_name: str
    stop_lat: float
    stop_lon: float
    zone_id: Optional[str] = None
    routes: List[RouteResponse]
```

---

### `backend/tests/test_api_gtfs_alignment.py` — new test functions

**Analog:** existing `test_get_schedule_*` group (`test_api_gtfs_alignment.py:319-534`) for the two new detail endpoints; existing `test_get_eta_*` group (`test_api_gtfs_alignment.py:585-896`) for ETA enrichment tests.

**Not-found test pattern** (copy for `test_get_stop_detail_not_found`, `test_get_route_detail_not_found`):
```python
# backend/tests/test_api_gtfs_alignment.py:477-495 (test_get_schedule_stop_not_found)
def test_get_schedule_stop_not_found(client):
    response = client.get("/v1/stops/NONEXISTENT_STOP_ID/schedule")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data or "detail" in data  # depends on error style used
```
Note: since D-06/D-11 use `HTTPException(detail={...})` (not `JSONResponse(content={...})`), the response body shape is `{"detail": {"error": ..., "message": ..., "details": {...}}}` — one level deeper than the existing `JSONResponse`-style 404s in this test file. New tests must assert on `data["detail"]["error"]`, not `data["error"]`, for the two new endpoints. Flag this discrepancy explicitly in the plan/tests so assertions aren't copy-pasted incorrectly from the `JSONResponse`-style tests.

**Fixture setup + success-path pattern** — copy `setup_test_segment_for_eta()` (`test_api_gtfs_alignment.py:550-582`) as the template for a new `setup_test_route_with_branches()` / `setup_test_stop_with_routes()` helper: idempotent `INSERT OR IGNORE`, fetch generated IDs back via `SELECT`, `conn.commit()` at the end.

**Deterministic boundary-condition fixture generation** (API-03, radius) — use RESEARCH.md's `destination_point()` helper verbatim (03-RESEARCH.md lines 519-548) to generate stops at exactly 500m/600m from a fixed origin, avoiding dependence on live GTFS coordinate data.

---

### `backend/tests/conftest.py` — fixture extensions

**Analog:** `db_with_test_routes` (`conftest.py:317-368`) — idempotent multi-row `executemany` insert pattern, composed on top of `temp_db`.

```python
# backend/tests/conftest.py:317-336 pattern to replicate for a new
# db_with_test_route_branches / db_with_test_stop_routes fixture
@pytest.fixture
def db_with_test_routes(temp_db) -> Generator[tuple[str, sqlite3.Connection], None, None]:
    db_path, conn = temp_db
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO agency (agency_id, agency_name, agency_url, agency_timezone) VALUES (?, ?, ?, ?)",
        ("BMTC", "Bangalore Metropolitan Transport Corporation", "http://mybmtc.com", "Asia/Kolkata")
    )
    cursor.executemany(
        "INSERT OR IGNORE INTO routes (...) VALUES (...)",
        test_routes
    )
    conn.commit()
    yield db_path, conn
```
Per RESEARCH.md's Wave 0 Gaps: extend `setup_test_segment_for_eta()` to also insert `stops` rows for `STOP_A`/`STOP_B` and a `routes` row for `ROUTE1` (needed once `get_eta()`'s LEFT JOIN is added — the fixture currently only inserts `segments`/`segment_stats`, relying on FK columns without matching parent rows). Also add a new fixture inserting `trips`+`stop_times` with 2+ `shape_id` values per `(route_id, direction_id)` to exercise D-04's representative-shape selection deterministically — this is genuinely new fixture data, no existing analog inserts `trips`/`stop_times` rows in `conftest.py` today (only `test_api_gtfs_alignment.py`'s `setup_test_segment_for_eta` touches `segments`).

---

### `docs/api.md` — spec updates

**Analog:** existing `GET /v1/stops`, `GET /v1/routes`, `GET /v1/stops/{stop_id}/schedule`, `GET /v1/eta` sections — reuse the established doc structure (path/method, params table, response JSON schema, one success + one failure example, error-code table entries) per CLAUDE.md Rule 1. Read the existing `/v1/eta` and `/v1/stops` sections directly before drafting the new sections to match heading levels, example JSON formatting, and error-table row format exactly — no code excerpt is meaningful here since this is prose/JSON-example authoring, not code to literally copy. D-21's docs fix (replace `"route_id": "335E"` with a real-looking compound `route_id` + separate `route_short_name`) applies directly to the existing `/v1/eta` example block.

## Shared Patterns

### Error Response Envelope (two coexisting styles — pick per D-06/D-11)
**Source A (existing endpoints — do not change):** `JSONResponse(status_code=400/404, content={"error": ..., "message": ..., "details": {...}})` — used by `get_stops()`, `get_routes()`, `get_stop_schedule()`, `search_routes()`.
**Source B (new endpoints in this phase, per D-06/D-11):** `HTTPException(status_code=400/404, detail={"error": ..., "message": ..., "details": {...}})` — used by `get_eta()` today; **both new detail endpoints (`get_stop_detail`, `get_route_detail`) must use this style.**
**Apply to:** `get_stop_detail()`, `get_route_detail()` (both new); `get_stops()`'s new radius-validation branches should follow **Source A** (`JSONResponse`) since they live inside the existing `get_stops()` function which already uses that style for `bbox` — do not mix styles within one function.
Both styles ultimately produce the same wire-format JSON via `main.py`'s custom exception handler — the choice is a code-style decision already locked by D-06/D-11, not something to re-derive.

### Manual (non-declarative) Query Param Validation
**Source:** `get_stops()`'s `bbox` handling (`routes.py:492-509`) and `get_routes()`'s `route_type` handling (`routes.py:570-579`).
**Apply to:** all new `lat`/`lon`/`radius_m` params on `get_stops()` — declare as unconstrained `Optional[float]`/`Optional[int] = Query(None)`, validate manually inside the function body, return `JSONResponse(400, ...)` on failure. Never use `Query(ge=..., le=...)` — see RESEARCH.md Pitfall 1.

### SQLite Connection Pattern
**Source:** `db.get_connection(settings.db_path)` used as a context manager in every handler (`routes.py:270`, `routes.py:485`, `routes.py:658`, etc.).
**Apply to:** both new detail endpoints — `with get_connection(settings.db_path) as conn: cursor = conn.cursor() ...` — build all response sub-objects inside the block, return the assembled model after it closes (matches every existing GET handler in this file).

### Parameterized Queries Only (no string interpolation of values)
**Source:** confirmed throughout `routes.py` — every `WHERE` clause uses `?` placeholders; only clause *structure* (not values) is ever f-string-interpolated (e.g. `routes.py:522` `where_sql = f"WHERE {' AND '.join(where_clauses)}"` — the clause text is built from trusted static strings, values always go through `params`).
**Apply to:** all new queries in `get_stop_detail()`, `get_route_detail()`, the radius bbox pre-filter, and the ETA enrichment JOIN.

## No Analog Found

None. Every file/function in scope for this phase has a directly-applicable analog within the same modified files (`routes.py`, `models.py`, `test_api_gtfs_alignment.py`, `conftest.py`) — this is expected for a small, additive, single-service codebase where the phase's new endpoints are structurally identical in shape to existing sibling endpoints.

## Metadata

**Analog search scope:** `backend/app/routes.py`, `backend/app/models.py`, `backend/app/db.py`, `backend/app/schema.sql`, `backend/tests/test_api_gtfs_alignment.py`, `backend/tests/conftest.py`, `docs/api.md` (all read directly; no broader repo search needed since RESEARCH.md already identified exact line ranges via prior codebase scouting).
**Files scanned:** 6 source/test files read directly (no Glob/Grep sweep needed — RESEARCH.md's `03-RESEARCH.md` already pinpointed exact line numbers for every analog via its own scouting pass).
**Pattern extraction date:** 2026-07-03

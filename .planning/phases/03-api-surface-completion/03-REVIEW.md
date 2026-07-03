---
phase: 03-api-surface-completion
reviewed: 2026-07-03T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - backend/app/models.py
  - backend/app/routes.py
  - backend/tests/conftest.py
  - backend/tests/test_api_gtfs_alignment.py
  - docs/api.md
findings:
  critical: 8
  warning: 10
  info: 2
  total: 20
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

The reviewed diff implements the GTFS-aligned discovery endpoints (`/v1/stops`, `/v1/routes`, `/v1/stops/{id}`, `/v1/routes/{id}`, `/v1/stops/{id}/schedule`, `/v1/routes/search`) plus the structured `/v1/eta` v1.1 response. Most of the new GET endpoints correctly build the `{error, message, details}` envelope by hand for their manually-raised `HTTPException`s, and the GTFS-alignment test suite exercises the happy paths for stops/routes discovery reasonably well.

However, the review surfaced a serious, systemic gap: **every Pydantic-level validation failure (missing fields, out-of-range values, stale timestamps, malformed `device_bucket`, etc.) bypasses the documented error envelope entirely**, because there is no `RequestValidationError` handler registered anywhere in the app. This means nearly every "422 unprocessable" / "400 invalid_request" example in `docs/api.md` (the canonical spec, per `CLAUDE.md`) does not match actual server behavior. On top of that, two of `ride_summary`'s manually-raised exceptions use the wrong status code and/or a bare string `detail` instead of the structured envelope, and `GET /v1/stops/{stop_id}/schedule` silently ignores its own `when`/`time_window_minutes` parameters, always returning the same 100 rows regardless of the requested time window. Several timestamp-parsing call sites are also vulnerable to naive-datetime/local-timezone ambiguity, which can silently corrupt the time-bin the server assigns to a ride observation.

The test file in scope (`test_api_gtfs_alignment.py`) does not catch the schedule-filtering bug because its schedule tests reference a `stop_id` that is never seeded into the isolated test database, so their "success path" assertions never execute.

## Critical Issues

### CR-01: Pydantic validation failures bypass the documented error envelope entirely

**File:** `backend/app/models.py:13,17,22-66,91,95-105` and `backend/app/routes.py` (all Pydantic-validated request models); root cause is the missing handler in `backend/app/main.py`
**Issue:** Every field-level constraint declared in `models.py` (`duration_sec` bounds, `mapmatch_conf` bounds, `direction_id` bounds, the `observed_at_utc`/`timestamp_utc`/`device_bucket` `field_validator`s that raise `ValueError`) is enforced by FastAPI/Pydantic *before* any route-handler code runs. When one of these fails, FastAPI raises `RequestValidationError` and — because `backend/app/main.py` only registers a custom handler for `HTTPException`, not for `RequestValidationError` — the client receives FastAPI's default shape:
```json
{"detail": [{"type": "value_error", "loc": ["body", "segments", 0, "observed_at_utc"], "msg": "...", "input": "..."}]}
```
This does not match any of the extensively documented `{"error": "unprocessable", "message": ..., "details": {...}}` examples in `docs/api.md` (e.g. the "422 Unprocessable (stale timestamp)" example at `docs/api.md:1468-1500`, or the `device_bucket`/`duration_sec` validation examples). Effectively, the single most heavily-documented error path in the spec (stale/future `observed_at_utc`) is not implemented as documented.
**Fix:** Register a `RequestValidationError` handler in `main.py` that translates Pydantic errors into the canonical envelope, e.g.:
```python
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0]
    return JSONResponse(
        status_code=422,
        content={
            "error": "unprocessable",
            "message": first.get("msg", "Validation error"),
            "details": {"field": ".".join(str(p) for p in first.get("loc", [])), "value": first.get("input")},
        },
    )
```

### CR-02: `ride_summary` "too many segments" uses wrong status code and unstructured body

**File:** `backend/app/routes.py:113-118`
**Issue:**
```python
if len(ride.segments) > settings.max_segments_per_ride:
    raise HTTPException(
        status_code=400,
        detail=f"Too many segments ({len(ride.segments)}), max is {settings.max_segments_per_ride}",
    )
```
`docs/api.md` explicitly lists "Too many segments" as a **422 unprocessable** condition (`docs/api.md:1308-1339`), with a structured example body (`error`, `message`, `details.segments_count`, `details.max_allowed`). The implementation returns **400** with a bare string `detail`, which `main.py`'s `http_exception_handler` will wrap as `{"detail": "Too many segments (...)"}"` — neither the right status code nor the right shape.
**Fix:**
```python
if len(ride.segments) > settings.max_segments_per_ride:
    raise HTTPException(
        status_code=422,
        detail={
            "error": "unprocessable",
            "message": f"Too many segments in ride (max {settings.max_segments_per_ride})",
            "details": {
                "segments_count": len(ride.segments),
                "max_allowed": settings.max_segments_per_ride,
            },
        },
    )
```

### CR-03: `ride_summary` "unknown segment" 422 returns an unstructured plain-string body

**File:** `backend/app/routes.py:156-161`
**Issue:**
```python
if row is None:
    raise HTTPException(
        status_code=422,
        detail=f"Unknown segment: {segment.from_stop_id} -> {segment.to_stop_id}",
    )
```
`docs/api.md:1341-1354` documents this exact case with a structured body (`error: "unprocessable"`, `message`, `details.route_id/direction_id/from_stop_id/to_stop_id`). Passing a plain string means `main.py`'s handler falls through to `{"detail": "Unknown segment: ..."}`, so any client parsing `response.json()["error"]` will `KeyError`.
**Fix:**
```python
raise HTTPException(
    status_code=422,
    detail={
        "error": "unprocessable",
        "message": "Segment not found in GTFS for this route and direction",
        "details": {
            "field": f"segments[{seq}]",
            "route_id": ride.route_id,
            "direction_id": ride.direction_id,
            "from_stop_id": segment.from_stop_id,
            "to_stop_id": segment.to_stop_id,
        },
    },
)
```

### CR-04: `GET /v1/eta` "stats not found" 404 returns an unstructured plain-string body

**File:** `backend/app/routes.py:365-366`
**Issue:** `raise HTTPException(status_code=404, detail="Stats not found for segment×bin")` — same defect pattern as CR-02/CR-03: plain string instead of `{"error": "not_found", "message": ..., "details": {...}}`. This is also an undocumented error path (`docs/api.md`'s only documented 404 for this endpoint is "Segment not found in GTFS data", not "stats missing for this bin").
**Fix:** Use the structured form consistent with the segment-not-found 404 a few lines above (`routes.py:288-300`):
```python
raise HTTPException(
    status_code=404,
    detail={
        "error": "not_found",
        "message": "No learned statistics for this segment and time bin",
        "details": {"segment_id": segment_id, "bin_id": bin_id},
    },
)
```

### CR-05: `GET /v1/stops/{stop_id}/schedule` ignores `when` and `time_window_minutes` entirely

**File:** `backend/app/routes.py:854-932`
**Issue:** The endpoint validates `time_window_minutes` (lines 866-875) and parses `when` into `dt` (lines 895-910), but neither value is ever used to filter the query:
```python
cursor.execute(
    f"""
    SELECT t.trip_id, t.route_id, t.service_id, t.trip_headsign, t.direction_id,
           st.arrival_time, st.departure_time, st.stop_sequence
    FROM stop_times st
    JOIN trips t ON st.trip_id = t.trip_id
    WHERE {where_clause}
    ORDER BY st.departure_time
    LIMIT 100
    """,
    params
)
```
`where_clause` only filters by `stop_id` (and optionally `route_id`). Per `docs/api.md:995-1006`, this endpoint is documented to return "upcoming departures within a time window" relative to `when` (default "now"), with `time_window_minutes` controlling the look-ahead. As written, it always returns (up to) the first 100 departures for the stop ordered by `departure_time` string, system-wide, regardless of the requested time or window — the core feature of the endpoint is unimplemented.
**Fix:** Add a time-range predicate, e.g. compute `start = dt.strftime("%H:%M:%S")` and `end = (dt + timedelta(minutes=time_window_minutes)).strftime("%H:%M:%S")` (handling day-wraparound / GTFS's >24:00:00 times), and filter `st.departure_time BETWEEN ? AND ?` accordingly, or filter in Python against parsed times before truncating to `LIMIT 100`.

### CR-06: `duration_sec` has no upper bound, allowing unbounded values into the learning pipeline

**File:** `backend/app/models.py:13`
**Issue:** `duration_sec: float = Field(gt=0)` only enforces `> 0`. `docs/api.md:1213-1217,1263` explicitly requires `duration_sec` to be in `(0, 7200]` seconds and lists "Invalid duration_sec range (must be > 0 and ≤ 7200 seconds)" as a 400 condition. Nothing in `models.py` or `routes.py` enforces the upper bound, so a client (malicious or buggy) can submit e.g. `duration_sec=999999999`; because outlier rejection (`|x-μ| > 3σ`) only activates once `n > 5` for a given segment×bin, the first few submissions for any segment×bin can poison `welford_mean`/`welford_m2` with an extreme value before rejection logic ever engages.
**Fix:**
```python
duration_sec: float = Field(gt=0, le=7200)
```

### CR-07: `device_bucket` is documented as required but modeled as `Optional`

**File:** `backend/app/models.py:92`
**Issue:** `device_bucket: Optional[str] = None` — but `docs/api.md:1261` explicitly lists `device_bucket` among the "Missing required fields (route_id, direction_id, device_bucket, segments)" that must trigger a 400. Because the field is `Optional`, a request that omits `device_bucket` is silently accepted with `device_bucket=None`. This also has a privacy/abuse-control side effect: `device_bucket` drives per-bucket rate limiting (`CLAUDE.md` "Quick Rules"); omitting it degrades enforcement to the IP-fallback path, which a client can trivially exploit to dodge per-device rate limits.
**Fix:** Make the field required (drop the default / `Optional`), or explicitly document and intentionally support the `None` case if that's a deliberate product decision (in which case `docs/api.md` needs to be corrected instead).

### CR-08: Naive ISO-8601 timestamps are silently interpreted in server-local time, not UTC

**File:** `backend/app/models.py:33,76`; `backend/app/routes.py:331-332`
**Issue:** All three call sites do the same thing:
```python
dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
timestamp = int(dt.timestamp())
```
If the caller supplies an ISO-8601 string with no trailing `Z` and no explicit UTC offset (e.g. `"2025-10-22T10:33:00"`), `.replace("Z", "+00:00")` is a no-op, `datetime.fromisoformat(...)` returns a **naive** `datetime`, and `.timestamp()` interprets naive datetimes using the **host machine's local timezone** (per Python docs), not UTC. Nothing in `validate_observed_at_utc` (`models.py:22-52`) rejects timestamps lacking a timezone designator. On a server or dev machine not running in UTC (e.g. `Asia/Kolkata`, UTC+5:30), this silently shifts the computed epoch by the local offset, which then feeds directly into `compute_bin_id()` — corrupting which of the 192 time bins an observation is attributed to — and into the ±7-day staleness/future checks (potentially causing spurious rejections or spurious acceptances near the boundary).
**Fix:** Reject timestamps without an explicit offset, or force UTC interpretation explicitly:
```python
dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
if dt.tzinfo is None:
    raise ValueError("observed_at_utc must include a UTC offset or trailing 'Z'")
timestamp = int(dt.timestamp())
```
Apply the same guard to `get_timestamp_epoch()` (models.py:76) and the `when` parser in `get_eta` (routes.py:331-332).

## Warnings

### WR-01: No handler for unhandled exceptions — most GET endpoints can leak a non-conformant 500

**File:** `backend/app/routes.py` (e.g. `get_stops` 594-716, `get_stop_detail` 719-774, `get_routes` 777-851, `get_route_detail` 1110-1206 — none wrap their `get_connection`/query calls in `try/except`); root fix belongs in `backend/app/main.py`
**Issue:** `docs/api.md` documents a `500 server_error` envelope (`{"error": "server_error", "message": "An unexpected error occurred", "details": {}}`) for every single endpoint. Only `get_config`, `health_check`, and `search_routes` actually catch exceptions and produce that shape. Every other handler listed above has no `try/except` around its DB access; an unhandled `sqlite3.OperationalError` (locked DB, disk I/O error, etc.) propagates past FastAPI's default handling with no matching custom handler for bare `Exception`, producing FastAPI's default 500 body, not the documented one.
**Fix:** Register a catch-all `@app.exception_handler(Exception)` in `main.py` that logs the error and returns the documented `server_error` envelope, so individual handlers don't need bespoke `try/except` blocks.

### WR-02: `schedule_sec`/`scheduled.duration_sec` are non-nullable but the DB column can be `NULL`

**File:** `backend/app/routes.py:408-412`; `backend/app/models.py:129,287`
**Issue:** `schedule_mean` is read directly from `segment_stats.schedule_mean` (routes.py:357-368) with no `None`-check, then passed straight into `ScheduledInfo(duration_sec=schedule_mean, ...)`, where `duration_sec: float` is required and non-nullable (models.py:287). If a segment×bin row exists (e.g. inserted by GTFS bootstrap before the schedule mean is computed) with `schedule_mean IS NULL`, Pydantic response-model validation will raise, and — per WR-01 — that becomes an unhandled 500.
**Fix:** Either enforce `schedule_mean NOT NULL DEFAULT 0` at the schema level, or explicitly default to `0.0`/reject with a clear 404/422 in the route handler when `schedule_mean is None`.

### WR-03: `model_version="welford-ema-v1"` still references EMA after its removal (LEARN-01)

**File:** `backend/app/routes.py:422`
**Issue:** Per `CLAUDE.md`, EMA was removed from the active learning pipeline in Phase 2 (LEARN-01); only Welford + schedule-blend are active. The hardcoded `model_version` string still says `"welford-ema-v1"`, which is misleading for any downstream consumer that keys behavior/analytics off this field.
**Fix:** Update the literal to reflect the actual active algorithm (e.g. `"welford-blend-v1"`), ideally sourced from a single constant/config value rather than a hardcoded string at the call site.

### WR-04: `docs/api.md` still describes EMA as an active algorithm in two places

**File:** `docs/api.md:208-209,1176`
**Issue:** "Algorithms: Welford online variance + EMA with schedule blending" (line 208-209) and "The server updates per-segment×time-bin statistics (Welford mean/variance, EMA) and logs rejections" (line 1176) both contradict `CLAUDE.md`'s authoritative statement that EMA was removed from the active pipeline in LEARN-01 (Phase 2). Since `docs/api.md` is the canonical spec per `CLAUDE.md`'s "Spec-First Development" rule, this is a real spec-accuracy defect, not just a comment.
**Fix:** Update both passages to describe Welford + schedule-blend only, consistent with the `ConfigResponse`/`PredictionInfo` deprecation notes already present elsewhere in the same document (e.g. line 1747-1748).

### WR-05: `get_config()` silently swallows DB errors with a bare `except Exception: pass`

**File:** `backend/app/routes.py:453-461`
**Issue:**
```python
try:
    with get_connection(settings.db_path) as conn:
        ...
except Exception:
    pass
```
Any DB failure here (not just "GTFS version row missing") is silently swallowed with no logging, defaulting `gtfs_version` to `"unknown"`. This makes real DB connectivity problems on this endpoint undiagnosable from logs.
**Fix:** Narrow the catch (e.g. `except (sqlite3.Error, KeyError)`) and log at `warning`/`error` level:
```python
except Exception as e:
    logger.warning(f"Could not read gtfs_version: {e}")
```

### WR-06: Dead/unused imports in `routes.py`

**File:** `backend/app/routes.py:27` (unused `ETAResponse` import), `backend/app/routes.py:260,380-381` (dead `dt_timezone` alias, redundant re-import)
**Issue:** `ETAResponse` is imported at line 27 but never referenced — `get_eta` uses `ETAResponseV11` exclusively. Separately, `get_eta` imports `from datetime import datetime, timezone as dt_timezone` at line 260, but then re-imports `from datetime import datetime, timezone` inside the same function body at lines 380-381 (immediately before use), leaving `dt_timezone` completely unused and the two imports of `datetime` redundant.
**Fix:** Remove the unused `ETAResponse` import; consolidate to a single `from datetime import datetime, timezone` at the top of `get_eta` (or module level) and delete the unused `dt_timezone` alias.

### WR-07: Schedule tests never seed their fixture stop, so success-path assertions never execute

**File:** `backend/tests/test_api_gtfs_alignment.py:442-666`
**Issue:** All `GET /v1/stops/{stop_id}/schedule` tests (`test_get_schedule_basic_success`, `test_get_schedule_stop_object_fields`, `test_get_schedule_departure_structure`, `test_get_schedule_trip_fields`, `test_get_schedule_stop_time_fields`, `test_get_schedule_query_time_iso8601`, `test_get_schedule_with_route_filter`) hardcode `stop_id = "20558"` and guard their real assertions behind `if response.status_code == 200:`. The `client` fixture (conftest.py) provisions a schema-only `temp_db` with no GTFS data preloaded, and none of these tests insert stop `20558`. As a result these requests always 404, and the `if response.status_code == 200` bodies — which contain nearly all of the meaningful schema assertions — never run. This is precisely how CR-05 (schedule time-window filtering completely unimplemented) went undetected: the test file provides false-positive coverage for this endpoint.
**Fix:** Add a fixture that seeds a known stop + trips/stop_times spanning a controlled time range (similar to `db_with_test_route_branches`), and assert against a real 200 response, including a case that proves the `time_window_minutes`/`when` filtering actually excludes out-of-window departures.

### WR-08: `test_env` fixture still sets environment variables removed by LEARN-01

**File:** `backend/tests/conftest.py:48-49`
**Issue:** `test_env` sets `BMTC_EMA_ALPHA` and `BMTC_HALF_LIFE_DAYS`, but per `CLAUDE.md`, `Settings.ema_alpha`/`Settings.half_life_days` were removed along with these env vars in LEARN-01. They're harmless (unrecognized env vars are ignored by pydantic-settings) but are stale/misleading test configuration that no longer maps to any real setting.
**Fix:** Remove these two lines from `test_env`.

### WR-09: `client_with_routes` fixture duplicates `client` fixture verbatim

**File:** `backend/tests/conftest.py:206-234` vs `backend/tests/conftest.py:557-580`
**Issue:** Both fixtures have an identical body (clear settings cache, `with TestClient(app) as test_client: yield test_client`, clear cache again); the only difference is their dependency list (`temp_db, test_settings` vs `db_with_test_routes, test_settings`). This is straightforward duplication that will drift over time if one is updated and not the other.
**Fix:** Factor the shared body into a helper function/context manager both fixtures call, e.g. `_make_client()`.

### WR-10: `verify_test_isolation` fixture doesn't verify anything

**File:** `backend/tests/conftest.py:588-606`
**Issue:** The fixture is named `verify_test_isolation` and its docstring says it "verif[ies] isolation setup," but it only prints hardcoded strings (`"pytest-xdist: installed"`, `"pytest-randomly: installed"`) regardless of whether those packages are actually installed or isolation is actually configured correctly. It performs no assertions and cannot fail.
**Fix:** Either rename it to reflect what it does (e.g. `print_test_config_banner`) or make it actually verify installation (e.g. `importlib.util.find_spec("xdist")`) and assert/skip accordingly.

## Info

### IN-01: `PredictionInfo` uses legacy Pydantic v1-style `class Config`

**File:** `backend/app/models.py:304-305`
**Issue:** `class Config: protected_namespaces = ()` is the Pydantic v1 configuration idiom. Pydantic 2.5.3 (per `CLAUDE.md`'s stack) supports it for backward compatibility, but the idiomatic v2 form is `model_config = ConfigDict(protected_namespaces=())`, which avoids the deprecation warning Pydantic v2 can emit for nested `class Config`.
**Fix:**
```python
from pydantic import ConfigDict
...
class PredictionInfo(BaseModel):
    ...
    model_config = ConfigDict(protected_namespaces=())
```

### IN-02: `segments` list has no upper bound at the Pydantic layer

**File:** `backend/app/models.py:93`; enforced only after full parsing in `backend/app/routes.py:114-118`
**Issue:** `segments: List[RideSegment] = Field(min_length=1)` has no `max_length`, so an oversized payload (e.g. 100k segments) is fully deserialized and validated (running every per-segment `field_validator`) before the manual `max_segments_per_ride` check in `routes.py` rejects it. `CLAUDE.md`'s Security & Privacy Gate explicitly calls for enforcing "request size and segment count limits" — doing this earlier, at the field level, avoids unnecessary validation work on oversized payloads.
**Fix:** Add a generous static ceiling as a defense-in-depth cap, e.g. `Field(min_length=1, max_length=200)`, in addition to the existing configurable `max_segments_per_ride` business-rule check.

---

_Reviewed: 2026-07-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# API Reference (v1)

**Project:** Privacy-preserving ETA learning for BMTC (Bengaluru)
**Style:** Minimal surface area; unauthenticated reads; authenticated writes; idempotent ingestion.
**Formats:** JSON over HTTPS. Times are ISO-8601 with `Z` (UTC). Durations are seconds (`_sec`).

---

## Versioning

- Base path is **`/v1`**.
- Responses include `X-API-Version: 1`.
- Additive, backward-compatible changes may introduce new optional fields.
- Breaking changes will use a new base path (e.g., `/v2`).

---

## Authentication

Only **`POST /v1/ride_summary`** requires a Bearer token.

```
Authorization: Bearer <API_KEY>
```

- Generate and manage keys out-of-band.
- Keys should be rotated at least every 90 days.
- **GET endpoints** (`/v1/eta`, `/v1/config`, `/v1/health`) are **unauthenticated** (public).

---

## Idempotency

**Required** for `POST /v1/ride_summary`.

```
Idempotency-Key: <UUIDv4>
```

- The server stores `(key, method, path, body_sha256, status_code)`.
- Reusing the same key with the **same** body returns the original result.
- Reusing the same key with a **different** body returns **409 Conflict**.
- Keys expire after **24 hours**.

---

## Rate Limiting

- Write (POST) operations are limited **per `device_bucket`** (with fallback to client IP).
- Default: **500 requests/hour** per device bucket.

Response headers on POST:

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: <int>
X-RateLimit-Reset: <unix-epoch-seconds>
```

Exceeding the limit returns **429 Too Many Requests**.

**Note:** Rate limit information is returned in **response headers only**, not in the response body.

---

## Request & Response Conventions

- **Timestamps:** ISO-8601 strings, UTC, e.g., `2025-10-22T10:33:00Z`.
- **Durations:** floating-point seconds (e.g., `320.5`).
- **Integers:** `n`, counts, and identifiers where applicable.
- **Booleans:** `low_confidence`, feature flags.
- **Bin semantics:** 192 time bins (15-minute slots × weekday/weekend).

---

## Error Model

All API errors return a standardized JSON object with three fields:

```json
{
  "error": "<error_code>",
  "message": "<human-readable description>",
  "details": <optional object with context-specific fields>
}
```

**Field descriptions:**

* `error` (string, required): Machine-readable error code (see table below)
* `message` (string, required): Human-readable error description
* `details` (object, optional): Context-specific information about the error
  * For parameter validation errors: includes the field name, provided value, constraints
  * For GTFS lookup errors: includes the route_id, stop_id, or segment identifiers
  * For idempotency conflicts: includes the idempotency_key
  * For rate limiting: includes limit, window, retry_after_sec
  * May be empty `{}` when no additional context is available

**Canonical error codes:**

| Code | HTTP Status | Description | When Used |
|------|-------------|-------------|-----------|
| `invalid_request` | 400 | Parameter-level issues, invalid ranges, malformed input | Query parameter format errors, invalid bbox, out-of-range values, malformed JSON |
| `unauthorized` | 401 | Invalid or absent API key | Missing `Authorization` header on POST endpoints, invalid Bearer token |
| `not_found` | 404 | Missing GTFS entities, missing segments | Segment not found in GTFS data, stop_id not found, route_id not found |
| `conflict` | 409 | Idempotency body_hash mismatch | Idempotency-Key reused with different request body |
| `unprocessable` | 422 | Semantic validation failures | Stale timestamp (>7 days), future timestamp, unknown segment, too many segments, low mapmatch_conf |
| `rate_limited` | 429 | Rate limiting exceeded | POST request quota exceeded for device_bucket |
| `server_error` | 500 | Server-side errors | Database errors, unexpected internal failures |

**Example error responses:**

**400 invalid_request (parameter validation):**
```json
{
  "error": "invalid_request",
  "message": "bbox must be in format: min_lat,min_lon,max_lat,max_lon",
  "details": {
    "bbox": "invalid"
  }
}
```

**401 unauthorized:**
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid Authorization header",
  "details": {}
}
```

**404 not_found:**
```json
{
  "error": "not_found",
  "message": "Segment not found in GTFS data",
  "details": {
    "route_id": "INVALID",
    "direction_id": 0,
    "from_stop_id": "99999",
    "to_stop_id": "88888"
  }
}
```

**409 conflict:**
```json
{
  "error": "conflict",
  "message": "Idempotency key reused with different request body",
  "details": {
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**422 unprocessable:**
```json
{
  "error": "unprocessable",
  "message": "observed_at_utc must be within the last 7 days",
  "details": {
    "field": "segments[0].observed_at_utc",
    "value": "2025-10-01T10:33:00Z"
  }
}
```

**429 rate_limited:**
```json
{
  "error": "rate_limited",
  "message": "Rate limit exceeded for device bucket",
  "details": {
    "limit": 500,
    "window": "1 hour",
    "retry_after_sec": 1800
  }
}
```

**500 server_error:**
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred",
  "details": {}
}
```

---

## GTFS Compliance

This API follows [GTFS Schedule Reference](https://gtfs.org/documentation/schedule/reference/) for all schedule-related data. The API is organized into two clear layers:

### GTFS Layer (Schedule Data)
- **Discovery endpoints:** GET /v1/stops, GET /v1/routes, GET /v1/stops/{stop_id}/schedule
- **Field names:** Use exact GTFS specification names (e.g., `stop_id`, `route_short_name`, `stop_lat`)
- **Data format:** HH:MM:SS for schedule times (per GTFS spec), ISO-8601 UTC for query times
- **Supported GTFS files:** agency, routes, stops, trips, stop_times, calendar
- **Scope:** Public BMTC transit data from official GTFS feed

### ML Prediction Layer (Learning Extensions)
- **ETA prediction:** GET /v1/eta returns both scheduled (GTFS) and predicted (ML) durations
- **Learning ingestion:** POST /v1/ride_summary submits observed ride data
- **Algorithms:** Welford online variance + EMA with schedule blending
- **Privacy:** All learning features are privacy-preserving (no PII, device_bucket hashing)

### GTFS Fields Supported

Our database includes these GTFS fields from the official BMTC GTFS feed:

**stops.txt:**
- stop_id (required)
- stop_name (required)
- stop_lat (required)
- stop_lon (required)
- zone_id (optional)

**routes.txt:**
- route_id (required)
- agency_id (optional)
- route_short_name (optional)
- route_long_name (optional)
- route_type (required)

**trips.txt:**
- trip_id (required)
- route_id (required)
- service_id (required)
- trip_headsign (optional)
- direction_id (optional)
- shape_id (optional)

**stop_times.txt:**
- trip_id (required)
- stop_sequence (required)
- stop_id (required)
- arrival_time (required, HH:MM:SS format)
- departure_time (required, HH:MM:SS format)

**BMTC-Specific Extensions:**
- Learning statistics (segment_stats, dwell_stats)
- Idempotency and rate limiting
- Privacy-preserving device tracking
- Outlier rejection and quality monitoring

---

## Endpoints

### 1) `GET /v1/stops` — Discover stops *(Unauthenticated)*

Query GTFS stops with filtering and pagination. Returns stops in GTFS-compliant format.

**Query parameters**

* `bbox` (optional): Bounding box filter as `min_lat,min_lon,max_lat,max_lon` (e.g., `12.9,77.5,13.1,77.7`)
* `route_id` (optional): Filter stops served by this route
* `limit` (optional): Maximum results per page (default 100, max 1000)
* `offset` (optional): Pagination offset (default 0)

**Response — 200 OK**

```json
{
  "stops": [
    {
      "stop_id": "20558",
      "stop_name": "Majestic Bus Station",
      "stop_lat": 12.97644,
      "stop_lon": 77.57148,
      "zone_id": "ZONE_A"
    },
    {
      "stop_id": "29374",
      "stop_name": "Electronic City",
      "stop_lat": 12.84534,
      "stop_lon": 77.66036,
      "zone_id": null
    }
  ],
  "total": 2,
  "limit": 100,
  "offset": 0
}
```

**GTFS Mapping**

All response fields map directly to GTFS stops.txt:
- `stop_id` → stops.stop_id (TEXT, required)
- `stop_name` → stops.stop_name (TEXT, required)
- `stop_lat` → stops.stop_lat (REAL, required)
- `stop_lon` → stops.stop_lon (REAL, required)
- `zone_id` → stops.zone_id (TEXT, optional)

**Status codes**

* `200` — Success
* `400` — Invalid query parameters (`error="invalid_request"`)
* `500` — Internal error (`error="server_error"`)

**Error Responses**

**400 invalid_request** - Query parameter validation failures:
* Invalid bbox format (must be `min_lat,min_lon,max_lat,max_lon`)
* Invalid bbox range (latitude must be -90 to 90, longitude must be -180 to 180)
* Invalid limit (must be 1 to 1000)
* Invalid offset (must be ≥ 0)

Example:
```json
{
  "error": "invalid_request",
  "message": "limit must be between 1 and 1000",
  "details": {
    "limit": 5000
  }
}
```

**500 server_error** - Database errors or unexpected failures:
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred",
  "details": {}
}
```

**cURL examples**

**All stops (paginated):**
```bash
curl "http://localhost:8000/v1/stops?limit=10&offset=0"
```

**Stops within bounding box (Bengaluru city center):**
```bash
curl "http://localhost:8000/v1/stops?bbox=12.9,77.5,13.1,77.7&limit=50"
```

**Stops served by route 335E:**
```bash
curl "http://localhost:8000/v1/stops?route_id=335E"
```

**Error example — Invalid bbox format:**
```bash
curl "http://localhost:8000/v1/stops?bbox=invalid"
```

Response:
```json
{
  "error": "invalid_request",
  "message": "bbox must be in format: min_lat,min_lon,max_lat,max_lon",
  "details": {
    "bbox": "invalid"
  }
}
```

---

### 2) `GET /v1/routes` — Discover routes *(Unauthenticated)*

Query GTFS routes with filtering and pagination. Returns routes in GTFS-compliant format.

**Query parameters**

* `stop_id` (optional): Filter routes serving this stop
* `route_type` (optional): Filter by GTFS route type (3 = bus for BMTC)
* `limit` (optional): Maximum results per page (default 100, max 1000)
* `offset` (optional): Pagination offset (default 0)

**Response — 200 OK**

```json
{
  "routes": [
    {
      "route_id": "4715",
      "route_short_name": "335E",
      "route_long_name": "Kengeri to Electronic City",
      "route_type": 3,
      "agency_id": "BMTC"
    },
    {
      "route_id": "4716",
      "route_short_name": "500",
      "route_long_name": "Majestic to Banashankari",
      "route_type": 3,
      "agency_id": "BMTC"
    }
  ],
  "total": 2,
  "limit": 100,
  "offset": 0
}
```

**GTFS Mapping**

All response fields map directly to GTFS routes.txt:
- `route_id` → routes.route_id (TEXT, required)
- `route_short_name` → routes.route_short_name (TEXT, optional)
- `route_long_name` → routes.route_long_name (TEXT, optional)
- `route_type` → routes.route_type (INTEGER, required, 3=bus per GTFS spec)
- `agency_id` → routes.agency_id (TEXT, optional)

**Status codes**

* `200` — Success
* `400` — Invalid query parameters (`error="invalid_request"`)
* `500` — Internal error (`error="server_error"`)

**Error Responses**

**400 invalid_request** - Query parameter validation failures:
* Invalid route_type (must be 0-7 per GTFS spec: 0=tram, 1=subway, 2=rail, 3=bus, 4=ferry, 5=cable car, 6=aerial lift, 7=funicular)
* Invalid limit (must be 1 to 1000)
* Invalid offset (must be ≥ 0)

Example:
```json
{
  "error": "invalid_request",
  "message": "route_type must be a valid GTFS route type (0-7)",
  "details": {
    "route_type": 99
  }
}
```

**500 server_error** - Database errors or unexpected failures:
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred",
  "details": {}
}
```

**cURL examples**

**All routes (paginated):**
```bash
curl "http://localhost:8000/v1/routes?limit=20&offset=0"
```

**Routes serving stop 20558:**
```bash
curl "http://localhost:8000/v1/routes?stop_id=20558"
```

**Filter by route type (3=bus):**
```bash
curl "http://localhost:8000/v1/routes?route_type=3&limit=50"
```

**Error example — Invalid route_type:**
```bash
curl "http://localhost:8000/v1/routes?route_type=99"
```

Response:
```json
{
  "error": "invalid_request",
  "message": "route_type must be a valid GTFS route type (0-7)",
  "details": {
    "route_type": 99
  }
}
```

---

### 3) `GET /v1/stops/{stop_id}/schedule` — Get scheduled departures *(Unauthenticated)*

Query scheduled departures for a stop from GTFS data. Returns upcoming departures within a time window.

**Path parameters**

* `stop_id` (required): GTFS stop identifier (e.g., "20558")

**Query parameters**

* `when` (optional): ISO-8601 UTC timestamp for query time (e.g., `2025-11-18T14:30:00Z`); defaults to server "now"
* `time_window_minutes` (optional): Look-ahead window in minutes (default 60, max 180)
* `route_id` (optional): Filter departures by route

**Response — 200 OK**

```json
{
  "stop": {
    "stop_id": "20558",
    "stop_name": "Majestic Bus Station",
    "stop_lat": 12.97644,
    "stop_lon": 77.57148
  },
  "departures": [
    {
      "trip": {
        "trip_id": "335E_WD_1",
        "route_id": "4715",
        "service_id": "WEEKDAY",
        "trip_headsign": "Electronic City",
        "direction_id": 0
      },
      "stop_time": {
        "arrival_time": "14:28:00",
        "departure_time": "14:30:00",
        "stop_sequence": 5,
        "pickup_type": null,
        "drop_off_type": null
      }
    },
    {
      "trip": {
        "trip_id": "500_WD_3",
        "route_id": "4716",
        "service_id": "WEEKDAY",
        "trip_headsign": "Banashankari",
        "direction_id": 1
      },
      "stop_time": {
        "arrival_time": "14:45:00",
        "departure_time": "14:45:00",
        "stop_sequence": 1,
        "pickup_type": null,
        "drop_off_type": null
      }
    }
  ],
  "query_time": "2025-11-18T14:25:00Z"
}
```

**GTFS Mapping**

**stop object:**
- `stop_id` → stops.stop_id (TEXT)
- `stop_name` → stops.stop_name (TEXT)
- `stop_lat` → stops.stop_lat (REAL)
- `stop_lon` → stops.stop_lon (REAL)

**trip object:**
- `trip_id` → trips.trip_id (TEXT)
- `route_id` → trips.route_id (TEXT)
- `service_id` → trips.service_id (TEXT)
- `trip_headsign` → trips.trip_headsign (TEXT, optional)
- `direction_id` → trips.direction_id (INTEGER, 0 or 1)

**stop_time object:**
- `arrival_time` → stop_times.arrival_time (TEXT, HH:MM:SS per GTFS spec)
- `departure_time` → stop_times.departure_time (TEXT, HH:MM:SS per GTFS spec)
- `stop_sequence` → stop_times.stop_sequence (INTEGER)
- `pickup_type` → Not in our DB (returns null)
- `drop_off_type` → Not in our DB (returns null)

**Status codes**

* `200` — Success (empty departures array if none found)
* `400` — Invalid query parameters (`error="invalid_request"`)
* `404` — Stop not found (`error="not_found"`)
* `500` — Internal error (`error="server_error"`)

**Error Responses**

**400 invalid_request** - Query parameter validation failures:
* Invalid `when` timestamp format (must be ISO-8601 UTC, e.g., `2025-11-18T14:30:00Z`)
* Invalid `time_window_minutes` (must be 1 to 180)

Example:
```json
{
  "error": "invalid_request",
  "message": "time_window_minutes must be between 1 and 180",
  "details": {
    "time_window_minutes": 300
  }
}
```

**404 not_found** - Stop not found in GTFS data:
```json
{
  "error": "not_found",
  "message": "Stop not found in GTFS data",
  "details": {
    "stop_id": "99999"
  }
}
```

**500 server_error** - Database errors or unexpected failures:
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred",
  "details": {}
}
```

**cURL examples**

**Departures in next hour (default):**
```bash
curl "http://localhost:8000/v1/stops/20558/schedule"
```

**Departures at specific time with 2-hour window:**
```bash
curl "http://localhost:8000/v1/stops/20558/schedule?when=2025-11-18T14:30:00Z&time_window_minutes=120"
```

**Filter by route:**
```bash
curl "http://localhost:8000/v1/stops/20558/schedule?route_id=335E"
```

**Error example — Stop not found:**
```bash
curl "http://localhost:8000/v1/stops/99999/schedule"
```

Response:
```json
{
  "error": "not_found",
  "message": "Stop not found in GTFS data",
  "details": {
    "stop_id": "99999"
  }
}
```

**Error example — Invalid time window:**
```bash
curl "http://localhost:8000/v1/stops/20558/schedule?time_window_minutes=300"
```

Response:
```json
{
  "error": "invalid_request",
  "message": "time_window_minutes must be between 1 and 180",
  "details": {
    "time_window_minutes": 300
  }
}
```

---

### 4) `POST /v1/ride_summary` — Submit ride for learning *(Authenticated, Idempotent)*

Ingest a single ride consisting of ordered segments. The server updates per-segment×time-bin statistics (Welford mean/variance, EMA) and logs rejections (outliers, low confidence, etc.).

**Headers (required):**

```
Authorization: Bearer <API_KEY>
Idempotency-Key: <UUIDv4>
Content-Type: application/json
```

**Request body**

```json
{
  "route_id": "335E",
  "direction_id": 0,
  "device_bucket": "7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d",
  "segments": [
    {
      "from_stop_id": "20558",
      "to_stop_id": "29374",
      "duration_sec": 320.5,
      "dwell_sec": 25.0,
      "mapmatch_conf": 0.86,
      "observed_at_utc": "2025-10-22T10:33:00Z"
    }
  ]
}
```

**Field constraints**

* `route_id`: string; must exist in GTFS.
* `direction_id`: integer in `{0, 1}` (from GTFS).
* `device_bucket`: **top-level field** (not inside segments); client-side stable hash (salted per install). Not personally identifying; used for rate limiting and abuse control.
* `segments`: 1..50 elements (configurable `max_segments_per_ride`).

  * `from_stop_id`/`to_stop_id`: must form a valid consecutive pair on some trip for the given `route_id` and `direction_id`.
  * `duration_sec`: float, (0, 7200] reasonable window (configurable).
  * `dwell_sec`: float ≥ 0 (optional).
  * `mapmatch_conf`: float 0..1; default reject if `< config.mapmatch_min_conf` (e.g., 0.7).
  * `observed_at_utc`: ISO-8601 UTC timestamp string; must be within **past 7 days**, not in the future.

**Response — 200 OK**

```json
{
  "accepted_segments": 1,
  "rejected_segments": 0,
  "rejected_by_reason": {
    "outlier": 0,
    "low_confidence": 0,
    "invalid_segment": 0,
    "too_many_segments": 0,
    "stale_timestamp": 0
  }
}
```

**Response headers**

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 499
X-RateLimit-Reset: 1761136800
X-API-Version: 1
```

**Status codes**

* `200` — Success (idempotent: same key+body returns same result)
* `400` — Invalid JSON or schema (`error="invalid_request"`)
* `401` — Missing/invalid API key (`error="unauthorized"`)
* `409` — Idempotency key reused with different payload (`error="conflict"`)
* `422` — Semantic failure (`error="unprocessable"`)
* `429` — Rate limit exceeded (`error="rate_limited"`)
* `500` — Internal error (`error="server_error"`)

**Error Responses**

**400 invalid_request** - Malformed JSON or schema validation failures:
* Invalid JSON syntax
* Missing required fields (`route_id`, `direction_id`, `device_bucket`, `segments`)
* Invalid field types (e.g., `direction_id` must be integer 0 or 1)
* Invalid `duration_sec` range (must be > 0 and ≤ 7200 seconds)
* Invalid `mapmatch_conf` range (must be 0.0 to 1.0)
* Invalid `dwell_sec` (must be ≥ 0)

Example (malformed JSON):
```json
{
  "error": "invalid_request",
  "message": "Invalid JSON in request body",
  "details": {}
}
```

Example (invalid field type):
```json
{
  "error": "invalid_request",
  "message": "direction_id must be 0 or 1",
  "details": {
    "field": "direction_id",
    "value": 5
  }
}
```

**401 unauthorized** - Missing or invalid Authorization header:
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid Authorization header",
  "details": {}
}
```

**409 conflict** - Idempotency key reused with different body:
```json
{
  "error": "conflict",
  "message": "Idempotency key reused with different request body",
  "details": {
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**422 unprocessable** - Semantic validation failures:
* `observed_at_utc` is stale (> 7 days old)
* `observed_at_utc` is in the future
* Segment's `from_stop_id` and `to_stop_id` pair not found in GTFS for this route/direction
* Too many segments (exceeds `max_segments_per_ride` config, default 50)
* `mapmatch_conf` below threshold (default 0.7)
* Route not found in GTFS
* Invalid `from_stop_id` or `to_stop_id` (not in GTFS)

Example (stale timestamp):
```json
{
  "error": "unprocessable",
  "message": "observed_at_utc must be within the last 7 days",
  "details": {
    "field": "segments[0].observed_at_utc",
    "value": "2025-10-01T10:33:00Z"
  }
}
```

Example (too many segments):
```json
{
  "error": "unprocessable",
  "message": "Too many segments in ride (max 50)",
  "details": {
    "segments_count": 75,
    "max_allowed": 50
  }
}
```

Example (invalid segment):
```json
{
  "error": "unprocessable",
  "message": "Segment not found in GTFS for this route and direction",
  "details": {
    "field": "segments[0]",
    "route_id": "335E",
    "direction_id": 0,
    "from_stop_id": "99999",
    "to_stop_id": "88888"
  }
}
```

**429 rate_limited** - Rate limit exceeded for device bucket:
```json
{
  "error": "rate_limited",
  "message": "Rate limit exceeded for device bucket",
  "details": {
    "limit": 500,
    "window": "1 hour",
    "retry_after_sec": 1800
  }
}
```

**500 server_error** - Database errors or unexpected failures:
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred",
  "details": {}
}
```

**cURL example (localhost)**

```bash
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
        "route_id": "335E",
        "direction_id": 0,
        "device_bucket": "7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d",
        "segments": [
          {
            "from_stop_id": "20558",
            "to_stop_id": "29374",
            "duration_sec": 320.5,
            "dwell_sec": 25.0,
            "mapmatch_conf": 0.86,
            "observed_at_utc": "2025-10-22T10:33:00Z"
          }
        ]
      }'
```

**Error examples**

**400 Invalid Request (malformed JSON):**
```bash
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"route_id": 335E}'  # Missing quotes
```

Response:
```json
{
  "error": "invalid_request",
  "message": "Invalid JSON in request body",
  "details": {}
}
```

**401 Unauthorized (missing Bearer token):**
```bash
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Response:
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid Authorization header",
  "details": {}
}
```

**409 Conflict (idempotency key reused with different body):**
```bash
IK=$(uuidgen)
# First request
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $IK" \
  -H "Content-Type: application/json" \
  -d '{"route_id": "335E", "direction_id": 0, "device_bucket": "abc123", "segments": [...]}'

# Second request with SAME key but DIFFERENT body
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $IK" \
  -H "Content-Type: application/json" \
  -d '{"route_id": "500", "direction_id": 1, "device_bucket": "xyz789", "segments": [...]}'
```

Response:
```json
{
  "error": "conflict",
  "message": "Idempotency key reused with different request body",
  "details": {
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**422 Unprocessable (stale timestamp):**
```bash
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
        "route_id": "335E",
        "direction_id": 0,
        "device_bucket": "7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d",
        "segments": [
          {
            "from_stop_id": "20558",
            "to_stop_id": "29374",
            "duration_sec": 320.5,
            "mapmatch_conf": 0.86,
            "observed_at_utc": "2025-10-01T10:33:00Z"
          }
        ]
      }'
```

Response:
```json
{
  "error": "unprocessable",
  "message": "observed_at_utc must be within the last 7 days",
  "details": {
    "field": "segments[0].observed_at_utc",
    "value": "2025-10-01T10:33:00Z"
  }
}
```

**429 Rate Limited:**
```bash
# After 500 requests in an hour
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Response:
```json
{
  "error": "rate_limited",
  "message": "Rate limit exceeded for device bucket",
  "details": {
    "limit": 500,
    "window": "1 hour",
    "retry_after_sec": 1800
  }
}
```

---

### 5) `GET /v1/eta` — Query ETA with predictions *(Unauthenticated)*

Return both GTFS scheduled duration and ML-predicted ETA at a given time (defaults to server "now"). Separates schedule data from prediction data.

**Query parameters**

* `route_id` — required (string)
* `direction_id` — required; `0` or `1` (integer)
* `from_stop_id` — required (string)
* `to_stop_id` — required (string)
* `when` — optional ISO-8601 UTC timestamp string (e.g., `2025-10-22T10:41:00Z`); defaults to server "now"
* `timestamp_utc` — **DEPRECATED** (use `when` instead); optional Unix epoch timestamp (integer); maintained for backward compatibility

**Response — 200 OK**

```json
{
  "segment": {
    "route_id": "335E",
    "direction_id": 0,
    "from_stop_id": "20558",
    "to_stop_id": "29374"
  },
  "query_time": "2025-11-18T10:41:00Z",
  "scheduled": {
    "duration_sec": 320.0,
    "service_id": "WEEKDAY",
    "source": "gtfs"
  },
  "prediction": {
    "predicted_duration_sec": 305.0,
    "p50_sec": 300.0,
    "p90_sec": 360.0,
    "confidence": "high",
    "blend_weight": 0.375,
    "samples_used": 12,
    "bin_id": 87,
    "last_updated": "2025-11-18T10:40:12Z",
    "model_version": "welford-ema-v1"
  }
}
```

**Field descriptions**

**segment object:**
* `route_id`: GTFS route identifier
* `direction_id`: GTFS direction (0 or 1)
* `from_stop_id`: GTFS origin stop identifier
* `to_stop_id`: GTFS destination stop identifier

**scheduled object (GTFS data):**
* `duration_sec`: Scheduled duration from GTFS stop_times (seconds)
* `service_id`: GTFS service identifier (WEEKDAY, WEEKEND, etc.) (optional)
* `source`: Always "gtfs" to indicate data source

**prediction object (ML extensions):**
* `predicted_duration_sec`: Blended ETA (learned + schedule) in seconds
* `p50_sec`: 50th percentile (median) estimate; equals mean for normal distribution
* `p90_sec`: 90th percentile estimate; `mean + 1.28σ` (or `mean + 1.5σ` if low confidence)
* `confidence`: Prediction confidence level (`"high"` if n≥8, `"medium"` if 3≤n<8, `"low"` if n<3)
* `blend_weight`: Weight given to learned data; `n / (n + n0)` where `n0=20`
* `samples_used`: Sample count used for this segment×bin
* `bin_id`: Time bin ID (0-191) for this query
* `last_updated`: ISO-8601 UTC timestamp of last update to this segment×bin
* `model_version`: Learning algorithm version identifier

**GTFS Mapping**

**scheduled object fields are derived from:**
- `duration_sec` → Calculated from stop_times.departure_time differences for consecutive stops
- `service_id` → trips.service_id (linked via route/direction to applicable trips)

**Notes**

* Scheduled duration is baseline from GTFS; never changes unless GTFS feed is updated
* Prediction blends learned data with schedule: `predicted_duration_sec = blend_weight × learned + (1 - blend_weight) × scheduled`
* `blend_weight = n / (n + n0)` where `n0` is from config (`/v1/config`, default 20)
* Confidence levels: `high` (n≥8), `medium` (3≤n<8), `low` (n<3)
* Low confidence uses wider P90 margin for safety: `mean + 1.5σ` instead of `mean + 1.28σ`
* Future enhancement: Server may softly blend adjacent bins near 15-minute boundaries

**Status codes**

* `200` — Success
* `400` — Invalid query parameters (`error="invalid_request"`)
* `404` — Segment not found (`error="not_found"`)
* `500` — Internal error (`error="server_error"`)

**Error Responses**

**400 invalid_request** - Query parameter validation failures:
* Missing required parameters (`route_id`, `direction_id`, `from_stop_id`, `to_stop_id`)
* Invalid `direction_id` (must be 0 or 1)
* Invalid `when` timestamp format (must be ISO-8601 UTC, e.g., `2025-11-18T14:30:00Z`)
* Invalid `timestamp_utc` format (deprecated parameter, must be Unix epoch integer if provided)

Example:
```json
{
  "error": "invalid_request",
  "message": "when must be a valid ISO-8601 UTC timestamp",
  "details": {
    "when": "2025-11-18 14:30:00"
  }
}
```

**404 not_found** - Segment not found in GTFS data:
```json
{
  "error": "not_found",
  "message": "Segment not found in GTFS data",
  "details": {
    "route_id": "INVALID",
    "direction_id": 0,
    "from_stop_id": "99999",
    "to_stop_id": "88888"
  }
}
```

**500 server_error** - Database errors or unexpected failures:
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred",
  "details": {}
}
```

**Backward Compatibility Note**

This endpoint response structure has been updated to separate GTFS schedule data from ML predictions. The previous flat response format (`eta_sec`, `p50_sec`, `p90_sec`, `n`, `blend_weight`, `schedule_sec`, `low_confidence`, `bin_id`, `last_updated`) is **deprecated but still supported** for existing clients. See Changelog for migration timeline.

**cURL examples**

**Query ETA at current time (default):**
```bash
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374"
```

**Query ETA at specific time using `when` parameter:**
```bash
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374&when=2025-11-18T14:30:00Z"
```

**Backward compatibility with `timestamp_utc` (deprecated):**
```bash
# Deprecated: Use 'when' parameter with ISO-8601 format instead
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374&timestamp_utc=1729593660"
```

**Error examples**

**404 Not Found (invalid segment):**
```bash
curl "http://localhost:8000/v1/eta?route_id=INVALID&direction_id=0&from_stop_id=99999&to_stop_id=88888"
```

Response:
```json
{
  "error": "not_found",
  "message": "Segment not found in GTFS data",
  "details": {
    "route_id": "INVALID",
    "direction_id": 0,
    "from_stop_id": "99999",
    "to_stop_id": "88888"
  }
}
```

---

### 6) `GET /v1/config` — Server configuration *(Unauthenticated)*

Returns public configuration and tuning parameters.

**Response — 200 OK**

```json
{
  "n0": 20,
  "time_bin_minutes": 15,
  "half_life_days": 30,
  "ema_alpha": 0.1,
  "outlier_sigma": 3.0,
  "mapmatch_min_conf": 0.7,
  "max_segments_per_ride": 50,
  "rate_limit_per_hour": 500,
  "idempotency_ttl_hours": 24,
  "gtfs_version": "2025-09-02",
  "server_version": "0.2.0"
}
```

**Field descriptions**

* `n0`: Blend weight denominator; `blend_weight = n / (n + n0)`
* `time_bin_minutes`: Time bin granularity (15 minutes)
* `half_life_days`: EMA half-life for time-based decay
* `ema_alpha`: EMA smoothing parameter
* `outlier_sigma`: Outlier rejection threshold (standard deviations)
* `mapmatch_min_conf`: Minimum map-matching confidence to accept observations
* `max_segments_per_ride`: Maximum segments per ride submission
* `rate_limit_per_hour`: Rate limit for POST requests per device bucket
* `idempotency_ttl_hours`: Idempotency key expiration time (hours)
* `gtfs_version`: GTFS feed version/date
* `server_version`: API server version

**Status codes**

* `200` — Success (always returns 200)
* `500` — Internal error (`error="server_error"`) - Extremely rare; only on catastrophic failures

**Error Responses**

This endpoint has no expected error conditions under normal operation. Configuration is static and always available. In the extremely unlikely event of a catastrophic server failure:

**500 server_error:**
```json
{
  "error": "server_error",
  "message": "An unexpected error occurred",
  "details": {}
}
```

**cURL example (localhost)**

```bash
curl http://localhost:8000/v1/config
```

---

### 7) `GET /v1/health` — Health & uptime *(Unauthenticated)*

Liveness/readiness with DB check.

**Response — 200 OK**

```json
{
  "status": "ok",
  "db_ok": true,
  "uptime_sec": 86400
}
```

**Field descriptions**

* `status`: Overall health status (`"ok"` or `"degraded"`)
* `db_ok`: Database connectivity check (boolean)
* `uptime_sec`: Server uptime in seconds since startup

**Status codes**

* `200` — Always returns 200, even when degraded (check `status` field for health state)
  * `status="ok"`: All systems operational
  * `status="degraded"`: Partial failure (e.g., DB connectivity issues)

**Error Responses**

This endpoint is designed to always return HTTP 200, even when the service is degraded. It does not return error responses. Health status is conveyed through the `status` field in the response body:

* `status="ok"` - All systems operational
* `status="degraded"` - Partial failure (check `db_ok` field for specifics)

**Example degraded response (still HTTP 200):**
```json
{
  "status": "degraded",
  "db_ok": false,
  "uptime_sec": 3600
}
```

**Note:** This endpoint is specifically designed for load balancer health checks and monitoring systems that expect a 200 status code to indicate the server process is running, even if subsystems are failing.

**cURL example (localhost)**

```bash
curl http://localhost:8000/v1/health
```

---

## Security & Privacy Notes

* **Data minimization:** No user identity. `device_bucket` is a salted, client-generated stable hash; **never returned by GET APIs**.
* **Transport:** HTTPS only (e.g., via Cloudflare Tunnel/Tailscale) in production.
* **Logging:** Do not log request payloads at INFO level in production. Avoid storing client IPs with ride data.
* **No PII:** System does not collect personally identifiable information.
* **Retention:**

  * `ride_segments`: prune after **90 days** (configurable).
  * `rejection_log`: **30 days**.
  * `idempotency_keys`: **24 hours**.
  * `segment_stats`: long-lived, compacted in-place.

---

## Validation & Limits (defaults)

* `max_segments_per_ride = 50`
* `rate_limit_per_hour = 500` (per `device_bucket`)
* `mapmatch_min_conf = 0.7`
* `outlier_sigma = 3.0` (reject if `|x−μ| > 3σ` and `n > 5`)
* `n0 = 20` (schedule blend denominator)
* `half_life_days = 30` (EMA recency)
* **Timestamp window:** `observed_at_utc` must be within the past **7 days** and not in the future.
* **Duration bounds:** `duration_sec` must be in (0, 7200] seconds (0 to 2 hours).

---

## Examples

### Minimal ETA lookup (now)

```bash
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374"
```

### ETA lookup at specific time

```bash
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374&when=2025-10-22T14:30:00Z"
```

### ETA lookup with deprecated timestamp_utc parameter

```bash
# Deprecated: Use 'when' parameter with ISO-8601 format instead
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374&timestamp_utc=1729600200"
```

### Idempotent ride submission (single segment)

```bash
IK=$(uuidgen)
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $IK" \
  -H "Content-Type: application/json" \
  -d '{
        "route_id": "335E",
        "direction_id": 0,
        "device_bucket": "7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d",
        "segments": [
          {
            "from_stop_id": "20558",
            "to_stop_id": "29374",
            "duration_sec": 320.5,
            "mapmatch_conf": 0.86,
            "observed_at_utc": "2025-10-22T10:33:00Z"
          }
        ]
      }'
```

### Ride submission with multiple segments

```bash
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
        "route_id": "335E",
        "direction_id": 0,
        "device_bucket": "7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d",
        "segments": [
          {
            "from_stop_id": "20558",
            "to_stop_id": "21234",
            "duration_sec": 180.0,
            "dwell_sec": 15.0,
            "mapmatch_conf": 0.92,
            "observed_at_utc": "2025-10-22T10:30:00Z"
          },
          {
            "from_stop_id": "21234",
            "to_stop_id": "29374",
            "duration_sec": 140.5,
            "dwell_sec": 20.0,
            "mapmatch_conf": 0.88,
            "observed_at_utc": "2025-10-22T10:35:00Z"
          }
        ]
      }'
```

### Check server health

```bash
curl http://localhost:8000/v1/health
```

### Get server configuration

```bash
curl http://localhost:8000/v1/config | jq .
```

---

## Stability & Backward Compatibility

* New fields in responses will be **additive** and optional.
* Field removals or semantic changes will ship in `/v2`.
* Clients should ignore unknown fields and rely on documented types.
* Deprecated fields will be marked in documentation and maintained for at least 90 days before removal.

---

## Changelog (API)

See [`CHANGELOG.md`](./CHANGELOG.md) for detailed version history.

**v1.1 — 2025-11-18 (GTFS Alignment - Spec Pass):**
* **New endpoints (GTFS discovery):**
  * GET `/v1/stops` - Discover stops with filtering (bbox, route_id) and pagination
  * GET `/v1/routes` - Discover routes with filtering (stop_id, route_type) and pagination
  * GET `/v1/stops/{stop_id}/schedule` - Get scheduled departures from GTFS data
* **GET `/v1/eta` response structure updated (backward compatible):**
  * **New structure:** Separated GTFS schedule data (`scheduled` object) from ML predictions (`prediction` object)
  * Added `segment` object with route/direction/stop identifiers
  * Added `query_time` field (ISO-8601)
  * Added `confidence` field to predictions: `"high"` (n≥8), `"medium"` (3≤n<8), `"low"` (n<3)
  * Renamed `n` → `samples_used` for clarity
  * Added `model_version` field to predictions
  * **Backward compatibility:** Old flat response format is deprecated but still supported for existing clients
* **GTFS compliance:**
  * All field names match GTFS Schedule Reference specification exactly
  * Schedule times in HH:MM:SS format per GTFS spec
  * All optional GTFS fields returned as null when not present in data
  * Added GTFS Mapping sections to documentation
* **Documentation improvements:**
  * Added "GTFS Compliance" section explaining two-layer architecture
  * Listed all supported GTFS fields from BMTC feed
  * Clear separation between GTFS schedule layer and ML prediction layer
  * Added comprehensive curl examples with success and error cases for all new endpoints

**v1.0 — 2025-11-17 (Phase 0 Baseline):**
* **Breaking change (Phase 0 alignment):** GET `/v1/eta` now uses `when` parameter (ISO-8601 string) instead of `timestamp_utc` (epoch int). Backward compatibility maintained: `timestamp_utc` still accepted but deprecated.
* Established v1 baseline specification
* Defined authentication model (GETs unauthenticated, POSTs require Bearer token)
* Required `Idempotency-Key` header for POST `/v1/ride_summary`
* Standardized request/response schemas with ISO-8601 UTC timestamps
* Moved `device_bucket` to top-level in POST request body
* Used `observed_at_utc` field name for segment timestamps
* Defined 7 machine-readable error codes with HTTP status code mapping
* Rate limit info in response headers only (not response body)
* GET `/v1/eta` returns: `eta_sec`, `p50_sec`, `p90_sec`, `n`, `blend_weight`, `schedule_sec`, `low_confidence`, `bin_id`, `last_updated`
* Documented validation limits and privacy guarantees

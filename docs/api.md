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

All errors return JSON with machine-readable codes.

```json
{
  "error": "invalid_request",
  "message": "observed_at_utc must be within the last 7 days",
  "details": {
    "field": "segments[0].observed_at_utc"
  }
}
```

Common `error` codes:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_request` | 400 | Malformed JSON, schema errors, type mismatches |
| `unauthorized` | 401 | Missing or invalid Bearer token |
| `not_found` | 404 | Segment not found in GTFS data |
| `conflict` | 409 | Idempotency key reused with different payload |
| `unprocessable` | 422 | Semantic validation failed (unknown segment, stale/future time, too many segments, low confidence) |
| `rate_limited` | 429 | Write quota exceeded |
| `server_error` | 500 | Unexpected internal failure |

---

## Endpoints

### 1) `POST /v1/ride_summary` — Submit ride for learning *(Authenticated, Idempotent)*

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

### 2) `GET /v1/eta` — Query ETA for a segment *(Unauthenticated)*

Return blended ETA at a given time (defaults to server "now"), including learned sample count and confidence.

**Query parameters**

* `route_id` — required (string)
* `direction_id` — required; `0` or `1` (integer)
* `from_stop_id` — required (string)
* `to_stop_id` — required (string)
* `when` — optional ISO-8601 timestamp; defaults to now

**Response — 200 OK**

```json
{
  "eta_sec": 305.0,
  "p50_sec": 300.0,
  "p90_sec": 360.0,
  "n": 12,
  "blend_weight": 0.375,
  "schedule_sec": 320.0,
  "low_confidence": false,
  "bin_id": 87,
  "last_updated": "2025-10-22T10:40:12Z"
}
```

**Field descriptions**

* `eta_sec`: Blended ETA (learned + schedule) in seconds
* `p50_sec`: 50th percentile (median) estimate; equals mean for normal distribution
* `p90_sec`: 90th percentile estimate; `mean + 1.28σ` (or `mean + 1.5σ` if low confidence)
* `n`: Sample count used for this segment×bin
* `blend_weight`: Weight given to learned data; `n / (n + n0)` where `n0=20`
* `schedule_sec`: GTFS scheduled duration for this segment×bin
* `low_confidence`: `true` if `n < 8` (wider P90 applied for safety)
* `bin_id`: Time bin ID (0-191) for this query
* `last_updated`: ISO-8601 UTC timestamp of last update to this segment×bin

**Notes**

* `n` is the sample count used. `low_confidence = true` if `n < 8` (internal wider P90).
* `blend_weight = n / (n + n0)` where `n0` is from config (`/v1/config`).
* `schedule_sec` is GTFS seed for that segment×bin.
* Future enhancement: Server may softly blend adjacent bins near 15-minute boundaries.

**Status codes**

* `200` — Success
* `404` — Segment not found (`error="not_found"`)
* `500` — Internal error (`error="server_error"`)

**cURL example (localhost, default to "now")**

```bash
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374"
```

**cURL example (with specific time)**

```bash
curl "http://localhost:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374&when=2025-10-22T10:41:00Z"
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

### 3) `GET /v1/config` — Server configuration *(Unauthenticated)*

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
  "gtfs_version": "2025-09-02",
  "gtfs_valid_from": "2025-09-02",
  "gtfs_valid_to": "2026-09-02",
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
* `gtfs_version`: GTFS feed version/date
* `gtfs_valid_from`: GTFS feed start date
* `gtfs_valid_to`: GTFS feed end date
* `server_version`: API server version

**Status codes**

* `200` — Success
* `500` — Internal error (`error="server_error"`)

**cURL example (localhost)**

```bash
curl http://localhost:8000/v1/config
```

---

### 4) `GET /v1/health` — Health & uptime *(Unauthenticated)*

Liveness/readiness with DB check.

**Response — 200 OK**

```json
{
  "status": "ok",
  "db_ok": true,
  "uptime_sec": 86400,
  "ingest_queue_ok": true
}
```

**Field descriptions**

* `status`: Overall health status (`"ok"` or `"degraded"`)
* `db_ok`: Database connectivity check
* `uptime_sec`: Server uptime in seconds
* `ingest_queue_ok`: Ingest processing queue status

**Status codes**

* `200` — Healthy
* `503` — Degraded (`error="server_error"`)

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

**Latest (v1 — 2025-10-22):**
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

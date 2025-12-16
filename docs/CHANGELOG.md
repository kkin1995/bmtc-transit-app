# Changelog

All notable changes to the BMTC Transit API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Mobile App

#### Changed
- Increased routes limit in Routes tab from 50 to 1000 to improve route availability for client-side search
- Added `routesListLimit` configuration constant to `apiConfig` (default: 1000)
- Updated routes search documentation to reflect support for up to 1000 routes

---

## [1.0.0] - 2025-10-22

### API v1 Baseline Release

This release establishes the v1 API specification baseline for the BMTC Transit API.

#### Added

**Authentication & Security:**
- Bearer token authentication for POST endpoints (`Authorization: Bearer <API_KEY>`)
- GET endpoints remain unauthenticated (public access)
- Required `Idempotency-Key` header (UUIDv4) for `POST /v1/ride_summary`
- 24-hour TTL for idempotency keys
- Idempotency conflict detection (409 when key reused with different body)

**Rate Limiting:**
- 500 requests/hour per `device_bucket` (with IP fallback)
- Rate limit headers on POST responses:
  - `X-RateLimit-Limit: 500`
  - `X-RateLimit-Remaining: <int>`
  - `X-RateLimit-Reset: <unix-epoch-seconds>`
- `rate_limited` error code (429) when quota exceeded

**Request/Response Standards:**
- ISO-8601 UTC timestamp format for all datetime fields (e.g., `2025-10-22T10:33:00Z`)
- Consistent field naming conventions (`observed_at_utc`, `duration_sec`, `eta_sec`)
- Top-level `device_bucket` field in POST request body (not nested in segments)
- Floating-point seconds for all duration fields

**POST /v1/ride_summary:**
- Request schema with fields:
  - `route_id` (string)
  - `direction_id` (0 or 1)
  - `device_bucket` (string, top-level)
  - `segments` (array, 1-50 elements)
    - `from_stop_id` (string)
    - `to_stop_id` (string)
    - `duration_sec` (float)
    - `dwell_sec` (float, optional)
    - `mapmatch_conf` (float, 0-1)
    - `observed_at_utc` (ISO-8601 string)
- Response schema:
  - `accepted_segments` (int)
  - `rejected_segments` (int)
  - `rejected_by_reason` (object with counters)
    - `outlier`
    - `low_confidence`
    - `invalid_segment`
    - `too_many_segments`
    - `stale_timestamp`

**GET /v1/eta:**
- Response schema with fields:
  - `eta_sec` (float) - Blended ETA
  - `p50_sec` (float) - 50th percentile
  - `p90_sec` (float) - 90th percentile
  - `n` (int) - Sample count
  - `blend_weight` (float) - Weight given to learned data
  - `schedule_sec` (float) - GTFS scheduled duration
  - `low_confidence` (bool) - True if n < 8
  - `bin_id` (int) - Time bin ID (0-191)
  - `last_updated` (string) - ISO-8601 UTC timestamp

**Error Handling:**
- 7 machine-readable error codes with consistent structure:
  - `invalid_request` (400) - Malformed JSON/schema errors
  - `unauthorized` (401) - Missing/invalid Bearer token
  - `not_found` (404) - Segment not found
  - `conflict` (409) - Idempotency key conflict
  - `unprocessable` (422) - Semantic validation failure
  - `rate_limited` (429) - Quota exceeded
  - `server_error` (500) - Internal failure
- Error response structure:
  ```json
  {
    "error": "<code>",
    "message": "<human-readable>",
    "details": { <field-specific info> }
  }
  ```

**Validation & Limits:**
- `max_segments_per_ride = 50`
- `rate_limit_per_hour = 500`
- `mapmatch_min_conf = 0.7`
- `outlier_sigma = 3.0`
- `n0 = 20` (blend weight denominator)
- `half_life_days = 30`
- Timestamp window: observed_at_utc must be within past 7 days, not in future
- Duration bounds: duration_sec must be in (0, 7200] seconds

**Documentation:**
- Complete API reference with runnable curl examples
- Comprehensive error scenarios with request/response examples
- Field-level descriptions for all endpoints
- Security and privacy guidelines
- Backward compatibility policy

#### Changed

**Breaking Changes:**
- This is the initial v1 release, establishing the baseline specification
- Future changes will be additive and backward-compatible within v1
- Breaking changes will be introduced in v2

#### Privacy & Security

- No PII collection
- `device_bucket` is client-side salted hash, never returned by GET endpoints
- HTTPS-only transport (Cloudflare Tunnel/Tailscale)
- No request payload logging at INFO level
- Data retention policies:
  - `ride_segments`: 90 days
  - `rejection_log`: 30 days
  - `idempotency_keys`: 24 hours
  - `segment_stats`: long-lived, compacted in-place

#### Notes

- All curl examples target `localhost:8000` for easy local testing
- Real GTFS route/stop IDs used in examples (335E, stops 20558/29374)
- Rate limit information returned in headers only (not response body)
- `bin_window` and `cache_ttl_sec` fields intentionally omitted from GET /v1/eta for now (future enhancement)

---

## [1.1.0] - 2025-11-18

### GTFS Alignment & Standardized Errors

This release adds GTFS-compliant discovery endpoints and implements standardized error responses across the entire API.

#### Added

**GTFS Discovery Endpoints (Read-Only):**
- `GET /v1/stops` - Discover GTFS stops with filtering and pagination
  - Filter by bounding box: `?bbox=min_lat,min_lon,max_lat,max_lon`
  - Filter by route: `?route_id=335E`
  - Pagination: `?limit=100&offset=0`
- `GET /v1/routes` - Discover GTFS routes with filtering and pagination
  - Filter by stop: `?stop_id=20558`
  - Filter by route type: `?route_type=3` (3=bus per GTFS spec)
  - Pagination: `?limit=100&offset=0`
- `GET /v1/stops/{stop_id}/schedule` - Get scheduled departures from GTFS
  - Query time window: `?when=2025-11-18T14:30:00Z&time_window_minutes=60`
  - Filter by route: `?route_id=335E`
- All field names match GTFS Schedule Reference specification exactly
- Schedule times in HH:MM:SS format per GTFS spec
- All endpoints return GTFS-compliant data structures

**Standardized Error Response Format:**
- Consistent error structure across all endpoints:
  ```json
  {
    "error": "<error_code>",
    "message": "<human-readable description>",
    "details": <context-specific fields>
  }
  ```
- Context-specific `details` object for all error scenarios:
  - Parameter validation errors include field names and constraints
  - GTFS lookup errors include route_id, stop_id, or segment identifiers
  - Idempotency conflicts include the idempotency_key
  - Rate limiting errors include limit, window, and retry_after_sec
- Auth errors now return 401 (previously 403) with structured error format
- New helper module `backend/app/errors.py` for creating standardized errors

**GET /v1/eta Enhanced to v1.1:**
- Response structure separates GTFS schedule data from ML predictions:
  - `segment` object: route/direction/stop identifiers
  - `query_time`: ISO-8601 timestamp of query
  - `scheduled` object: GTFS scheduled duration, service_id, source
  - `prediction` object: ML-predicted duration, confidence, samples, model version
- Added `confidence` field to predictions: `"high"` (n≥8), `"medium"` (3≤n<8), `"low"` (n<3)
- Renamed `n` → `samples_used` for clarity (in new structure)
- Added `model_version` field to predictions (currently `"welford-ema-v1"`)
- **Backward compatible:** Old flat response format still supported (deprecated)
  - Deprecated fields: `eta_sec`, `p50_sec`, `p90_sec`, `n`, `blend_weight`, `schedule_sec`, `low_confidence`, `bin_id`, `last_updated`
  - These duplicate the data in the new nested structure

**Comprehensive Test Coverage:**
- `test_api_errors_alignment.py`: Tests for standardized error format across all endpoints
- `test_api_gtfs_alignment.py`: Tests for new GTFS endpoints and v1.1 ETA format
- All tests validate error response structure and content

#### Changed

**Documentation Updates:**
- `docs/api.md`: Complete rewrite with GTFS compliance section
  - Error Model section with canonical error codes and examples
  - GTFS Compliance section explaining two-layer architecture
  - Complete specs for all new endpoints with curl examples
  - GTFS field mappings for all endpoints
  - Comprehensive error examples for every scenario
- Added GTFS Layer vs ML Prediction Layer distinction
- Listed all supported GTFS fields from BMTC feed

**Security Documentation:**
- Added STRIDE security review for v0.2.0 in `docs/SECURITY_REVIEW/`
- Privacy impact assessment for device_bucket anonymization
- Security controls evaluation (auth, idempotency, rate limiting)

#### Notes

- This release maintains full backward compatibility with v1.0.0
- Old ETA response format is deprecated but will be maintained for minimum 90 days
- All GTFS endpoints are read-only and unauthenticated (public access)
- GTFS data sourced from official BMTC GTFS feed via github.com/Vonter/bmtc-gtfs

---

## [Unreleased]

Future enhancements under consideration:
- Bin boundary smoothing for GET /v1/eta
- `bin_window` field in GET /v1/eta response (showing time window metadata)
- Cache TTL hints for client optimization
- Batch ride submission endpoint
- WebSocket support for real-time updates
- OpenAPI 3.1 specification for SDK generation

---

## Version History Summary

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2025-11-18 | GTFS discovery endpoints + standardized errors |
| 1.0.0 | 2025-10-22 | Initial v1 baseline specification |

---

## Backward Compatibility Policy

**Within v1:**
- All changes will be **additive only** (new optional fields)
- No field removals or renames
- No breaking changes to request/response schemas
- Deprecated fields will be marked and maintained for minimum 90 days

**v2 Migration:**
- Breaking changes will be introduced only in v2 (`/v2` base path)
- v1 will be maintained for minimum 6 months after v2 release
- Migration guide will be provided before v2 launch

---

## How to Stay Updated

- **API Documentation:** [`docs/api.md`](./api.md)
- **Implementation Status:** [`PLAN.md`](./PLAN.md)
- **Git Commits:** Use `git log -- docs/api.md` to track API changes
- **Release Announcements:** Check git tags for version releases

---

Last Updated: 2025-10-22

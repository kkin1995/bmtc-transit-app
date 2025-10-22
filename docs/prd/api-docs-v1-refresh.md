# PRD: API Docs v1 Refresh
**Status:** Draft | **Owner:** Product | **Created:** 2025-10-22

## 1. Problem & User Story
**Problem:** docs/api.md exists but contains field name misalignments with implementation (e.g., docs use `observed_at_utc` but code expects `timestamp_utc`; docs show `eta_sec` but code returns `mean_sec`). New API consumers fail to integrate without reading source code, violating API-first principle.

**User Story:** As a client engineer, I want to integrate POST /v1/ride_summary and GET /v1/eta using only docs/api.md, without examining backend code, and have all curl examples work copy-paste against dev server.

## 2. Scope
**In Scope:**
- Correct field name misalignments (RideSegment: `timestamp_utc` vs docs `observed_at_utc`; ETAResponse: `mean_sec` vs docs `eta_sec`; device_bucket in RideSummary request, not segment)
- Verify all curl examples are runnable against localhost:8000
- Confirm error codes match implementation (7 codes: invalid_request, unauthorized, conflict, unprocessable, rate_limited, not_found, server_error)
- Document exact rate-limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- Add POST response field alignment (RideSummaryResponse fields: accepted, rejected_count, rejected_by_reason)
- Privacy attestation (device_bucket is client-salted hash, never returned by GETs)

**Out of Scope:**
- OpenAPI 3.1 spec generation (future work)
- Mobile-specific examples (API-first only)
- Performance tuning or caching strategy details (beyond cache_ttl_sec note)

## 3. Documentation Requirements
1. **DR1** — Correct POST /v1/ride_summary request: `device_bucket` at ride level (not segment), `timestamp_utc` in segments (integer Unix epoch, not `observed_at_utc` ISO string)
2. **DR2** — Correct GET /v1/eta response: field names `mean_sec`, `p50_sec`, `p90_sec`, `sample_count`, `blend_weight`, `last_updated`, `low_n_warning` (not `low_confidence`)
3. **DR3** — Remove `bin_window` object from docs (not in ETAResponse model); keep `bin_id` only if present
4. **DR4** — POST response clarify: `RideSummaryResponse` contains `accepted: bool`, `rejected_count: int`, `rejected_by_reason: dict[str, int]` (no `rate_limit` object in body)
5. **DR5** — Rate limit headers only on POST responses (not GET); use exact names from routes.py rate limiter
6. **DR6** — All timestamps in examples use ISO-8601 UTC where shown; internal storage uses Unix epoch integers
7. **DR7** — Runnable curl examples for all endpoints with localhost:8000 (replace `<host>`)
8. **DR8** — Error model examples updated: 400/401/409/422/429 status codes map to error codes

## 4. Acceptance Criteria
- **AC1:** docs/api.md updated in-place; field names match implementation exactly (verified against models.py)
- **AC2:** All 4 curl examples (POST, GET /eta, GET /config, GET /health) copy-paste and succeed against `uvicorn app.main:app --reload`
- **AC3:** POST body shows `device_bucket` at ride level; segments contain `timestamp_utc` (integer), `duration_sec`, `dwell_sec`, `mapmatch_conf`, no `observed_at_utc`
- **AC4:** GET /eta response shows `mean_sec` (not `eta_sec`), `sample_count` (not `n`), `low_n_warning` (not `low_confidence`); no `bin_window` or `cache_ttl_sec`
- **AC5:** POST response body shows `{accepted: bool, rejected_count: int, rejected_by_reason: dict}` only; no `rate_limit` in body
- **AC6:** Rate-limit headers documented for POST only: `X-RateLimit-Limit: 500`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **AC7:** Error section lists exact 7 codes; 400/401/409/422/429 examples present with request body + response
- **AC8:** Two reviewers independently integrate using only docs/api.md without code reading

## 5. NFRs
- **Clarity:** API consumer integrates in <30min without code inspection
- **Accuracy:** 100% field-name parity with models.py (verified by grep `class.*Response`)
- **Completeness:** All request/response fields, headers, status codes documented
- **Consistency:** Timestamp format rules, duration units, error structure uniform across all examples

## 6. Privacy & Security Impact
- **Data In:** Document that `device_bucket` (client-provided, optional, salted hash) is never exposed via GET APIs
- **Retention:** Clarify in docs: ride_segments 90d, rejection_log 30d, idempotency_keys 24h, segment_stats long-lived
- **Logging:** Reiterate: "Do not log request payloads at INFO level in production"
- **Idempotency:** Document 409 Conflict behavior (same key + different body returns 409)

## 7. Rollout & Backout
**Rollout Steps:**
1. Update docs/api.md in-place with field name corrections (6 changes: timestamp_utc, mean_sec, sample_count, low_n_warning, device_bucket location, removed bin_window)
2. Verify curl examples locally: `cd backend && uv run uvicorn app.main:app --reload &` then run all 4 examples
3. Commit with message: `docs(api): Correct field names and examples for v1 spec alignment`

**Validation:**
```bash
# Test each endpoint
curl http://127.0.0.1:8000/v1/health
curl http://127.0.0.1:8000/v1/config
curl "http://127.0.0.1:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374"
API_KEY=test_key IK=$(uuidgen) && curl -X POST http://127.0.0.1:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" -H "Idempotency-Key: $IK" \
  -H "Content-Type: application/json" \
  -d '{"route_id":"335E","direction_id":0,"segments":[{"from_stop_id":"20558","to_stop_id":"29374","duration_sec":320.5,"timestamp_utc":'$(date +%s)'}]}'
```

**Backout:** Revert commit if any curl example fails or field mismatch detected.

## 8. Test Scenarios
**Positive:** Copy-paste curl POST example with real route/stops → 200 OK response with `accepted: true`
**Boundary:** POST with `timestamp_utc` exactly 7 days old → accepted; 8 days old → 422 unprocessable
**Negative:** POST with invalid `route_id` → 422 error; missing `Authorization` header → 401 unauthorized; reuse `Idempotency-Key` with different body → 409 conflict
**Negative:** GET /eta for non-existent segment → 404 not_found
**Privacy:** GET /eta response never includes `device_bucket` field

## 9. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Docs drift from code post-update | M | Add pre-commit hook to verify field names match models.py |
| Curl examples fail due to DB state | M | Include note: "Examples assume GTFS-seeded DB; run bootstrap first" |
| Rate-limit headers confuse POST-only policy | L | Clarify in docs: "Rate-limit headers appear on POST responses only" |

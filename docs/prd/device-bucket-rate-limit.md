# PRD: Device-Bucket Rate Limiting for POST /v1/ride_summary

**Status**: Draft | **Owner**: Backend | **Created**: 2025-10-22

## 1. Problem & User Story

Device-bucket rate limiting prevents abuse and ensures fair resource allocation across clients. Currently, POST /v1/ride_summary has no per-device enforcement; a single compromised client can flood the API with requests, degrading service for legitimate users. This PRD enforces a **500 request/hour per device_bucket** (or fallback IP) quota using a persistent token bucket, persisted in SQLite, checked atomically before learning work begins.

---

## 2. Scope

**In Scope:**
- Token bucket keyed by `device_bucket` (from ride body); fallback to `ip:<remote_addr>` if missing
- Persistent quota tracking in `rate_limit_buckets` table; hourly reset window
- HTTP 429 response (error="rate_limited") on quota exceeded
- X-RateLimit-{Limit,Remaining,Reset} headers on all POST responses
- Idempotency interop: identical (Idempotency-Key + body_sha256) replays do NOT deduct quota
- Feature flag (BMTC_RATE_LIMIT_ENABLED) for safe gradual rollout

**Out of Scope:**
- Per-route or per-user quotas (handled post-MVP)
- Distributed rate limiting across multiple servers (single-writer SQLite only)
- Burst allowance or graduated backoff (fixed hourly window)

---

## 3. Functional Requirements

1. **FR-1: Token Bucket Storage**: System SHALL maintain a `rate_limit_buckets` table with columns: `bucket_id TEXT PRIMARY KEY`, `quota_remaining INT`, `reset_utc INT` (unix epoch).

2. **FR-2: Bucket Identification**: System SHALL extract `device_bucket` from request body; if absent or invalid, derive key as `ip:<X-Forwarded-For>` (or remote_addr fallback). Store canonical bucket_id without logging.

3. **FR-3: Quota Check Before Ingest**: System SHALL check remaining quota BEFORE updating segment_stats or rejection_log. If `quota_remaining <= 0`, return 429 with error="rate_limited" and no state changes.

4. **FR-4: Atomic Decrement**: System SHALL decrement `quota_remaining` by 1 in the same transaction as ride ingest; no race conditions under concurrent POSTs to same bucket.

5. **FR-5: Hourly Reset**: System SHALL reset `quota_remaining` to 500 when `reset_utc <= current_timestamp`. Next reset window computed as `now + 3600` seconds.

6. **FR-6: Idempotency Integration**: System SHALL NOT deduct quota on replay of identical (Idempotency-Key, body_sha256). Quota spent only on first submission; cached response returned for replays.

7. **FR-7: Response Headers**: System SHALL include X-RateLimit-Limit: 500, X-RateLimit-Remaining: <N>, X-RateLimit-Reset: <unix-sec> on all POST responses (including 429).

8. **FR-8: Feature Flag**: System SHALL respect `BMTC_RATE_LIMIT_ENABLED` env var (default=true); when false, skip quota check (headers still returned for client compatibility).

---

## 4. Acceptance Criteria

**Positive Cases:**
- AC1: GIVEN clean bucket WHEN POST /v1/ride_summary THEN X-RateLimit-Remaining=499 AND 200 OK
- AC2: GIVEN quota_remaining=1 WHEN POST /v1/ride_summary with new Idempotency-Key THEN 200 OK AND Remaining=0
- AC3: GIVEN quota_remaining=0 WHEN POST /v1/ride_summary with new key THEN 429 error="rate_limited" AND Remaining=0
- AC4: GIVEN reset_utc in past WHEN POST /v1/ride_summary THEN bucket reset to 500, Remaining=499, Reset updated to +3600s

**Boundary Cases:**
- AC5: GIVEN device_bucket missing from body WHEN POST THEN fallback to ip:<addr> and enforce quota
- AC6: GIVEN Idempotency-Key replay with same body WHEN POST THEN return cached 200 AND Remaining unchanged

**Concurrent Cases:**
- AC7: GIVEN N concurrent POSTs to same bucket WHEN executed within 1s THEN all see consistent Remaining (no oversell)
- AC8: GIVEN feature flag disabled WHEN POST THEN skip quota check, return 200 with Remaining=999 (sentinel)

**Negative Cases:**
- AC9: GIVEN invalid device_bucket (not SHA256 hex) WHEN POST THEN treat as missing, use IP fallback

---

## 5. Non-Functional Requirements

- **Performance**: Rate limit check + atomic decrement p95 < 3 ms (SQLite WAL single-writer)
- **Storage**: rate_limit_buckets table growth ≤1 row per unique bucket/hour, auto-cleanup of stale (>24h) rows via daily vacuum
- **Consistency**: No quota overspend under concurrent writes (PRAGMA synchronous=FULL on quota transaction)
- **Compatibility**: Headers returned for all outcomes; clients must respect X-RateLimit-Reset to avoid 429 storms

---

## 6. Privacy & Security Impact

- **Data In**: device_bucket from ride body; IP from request headers (fallback only, not logged to rides table)
- **Data Storage**: rate_limit_buckets is ephemeral (bucket_id salted hash, no PII), cleaned daily; no linkage to ride_segments
- **Abuse Resistance**: 500 req/hour ≈ 12k observations/day per device; sufficient for legitimate multi-trip submissions, prevents trivial spam
- **No Payload Logging**: Quota enforcement is silent; no INFO-level logs with bucket_id or IP

---

## 7. Rollout & Backout

**Rollout Plan:**
1. Add BMTC_RATE_LIMIT_ENABLED=false to production .env (feature flag off)
2. Create rate_limit_buckets table via schema migration
3. Deploy code with rate-limit middleware; run integration tests
4. Enable flag via env reload; monitor 429 rate (should be <1% initially)
5. If 429 rate spikes >5% unexpectedly, set flag to false to disable

**Backout Criteria:**
- IF 429 error rate > 5% for 10 min THEN disable flag
- IF response p95 latency > 5 ms THEN rollback code

**Monitoring Queries:**
```sql
-- 429 error rate (per hour)
SELECT COUNT(*) as rate_limited_429 FROM rejection_log
WHERE reason='rate_limited' AND submitted_at > unixepoch('now', '-1 hour');

-- Quota distribution
SELECT COUNT(DISTINCT bucket_id) as active_buckets,
       AVG(quota_remaining) as avg_remaining
FROM rate_limit_buckets WHERE reset_utc > unixepoch('now');
```

---

## 8. Test Scenarios

**Unit Tests:**
- Test bucket reset logic (now > reset_utc trigger)
- Test quota decrement (n → n-1)
- Test idempotency interop (cache hit should not deduct)

**Integration Tests:**
```bash
# Consume full quota
for i in {1..500}; do
  curl -X POST /v1/ride_summary \
    -H "Authorization: Bearer $KEY" \
    -H "Idempotency-Key: $(uuidgen)" \
    -H "Content-Type: application/json" \
    -d '{...}' || break
done
# Last should be 429; check X-RateLimit-Remaining=0

# Replay same key (should not deduct)
curl -X POST /v1/ride_summary -H "Idempotency-Key: $KEY_1" ...
# Should return 200, Remaining unchanged

# IP fallback (remove device_bucket from body)
curl -X POST /v1/ride_summary -d '{"segments":[...], "route_id":"335E", "direction_id":0}' ...
# Should rate-limit by IP, not device_bucket
```

**Boundary/Negative:**
- Test invalid device_bucket (non-hex string) → fallback to IP
- Test concurrent POSTs to same bucket → verify no oversell
- Test reset window boundary (request at reset time) → verify bucket resets once

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| IP spoofing (X-Forwarded-For abuse) | M | Validate IP header only from trusted proxies (CF, Tailscale); if untrusted, use remote_addr only |
| Stale buckets (unlimited table growth) | M | Add daily cleanup job: DELETE FROM rate_limit_buckets WHERE reset_utc < now() - 24h |
| Clock skew (reset_utc in future) | L | Validate now >= reset_utc before allowing quota reset; log anomalies |
| Feature flag not honored | M | Add integration test for both enabled/disabled states; log flag state at startup |

---

**Total Words**: 650 | **File**: `docs/prd/device-bucket-rate-limit.md`

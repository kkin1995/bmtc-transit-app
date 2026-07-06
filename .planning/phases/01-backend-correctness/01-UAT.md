---
status: complete
phase: 01-backend-correctness
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md]
started: 2026-07-02T09:58:33Z
updated: 2026-07-02T10:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. get_connection() guarantees close on every exit path
expected: get_connection() converted to @contextmanager generator with try/finally guaranteeing conn.close() on every exit path (return, HTTPException, or unhandled exception)
result: pass
source: automated
coverage_id: D1

### 2. All call sites migrated to `with get_connection(...)` syntax
expected: All 15 application call sites (routes.py x8, idempotency.py x3, rate_limit.py x3, bootstrap.py x1) and 24 test call sites migrated to `with get_connection(...) as conn:` syntax; zero manual conn.close() remain in routes.py
result: pass
source: automated
coverage_id: D1

### 3. CORS explicit allowlist, no credentials
expected: CORS uses an explicit origin allowlist from BMTC_CORS_ORIGINS; allow_credentials removed entirely
result: pass
source: automated
coverage_id: D1

### 4. Expired idempotency keys purged at startup
expected: Expired idempotency keys are purged automatically at application startup (lifespan)
result: pass
source: automated
coverage_id: D2

### 5. slowapi dead code fully removed
expected: All slowapi dead code removed from main.py, routes.py, and pyproject.toml; RateLimitMiddleware is the sole active rate limiter
result: pass
source: automated
coverage_id: D3

### 6. Idempotent replay returns original counts
expected: Idempotent replay returns the ORIGINAL accepted/rejected counts, not hardcoded zeros
result: pass
source: automated
coverage_id: D1

### 7. Spec documents X-Deprecation-Warning before implementation
expected: docs/api.md documents X-Deprecation-Warning (name, trigger, value, both endpoints) BEFORE implementation — spec-first
result: pass
source: automated
coverage_id: D3

### 8. X-Deprecation-Warning header present when timestamp_utc used
expected: X-Deprecation-Warning header present on POST /v1/ride_summary and GET /v1/eta when timestamp_utc used; absent when current field used
result: pass
source: automated
coverage_id: D4

### 9. Stale idempotency tests fixed to current signature
expected: "Drive-by: fix 2 stale test_idempotency.py tests calling old 2-arg store_idempotency_key() signature"
result: pass
source: automated
coverage_id: D5

### 10. Legacy idempotency replay with NULL response_body
expected: |
  A pre-existing idempotency_keys row written before this fix (response_body IS NULL)
  is treated as a cache miss and the request is reprocessed fresh, rather than
  crashing or returning a stale zero-count response.
result: pass
coverage_id: D2
coverage_reason: validation_failed
verified_via: "Manual curl: POST /v1/ride_summary with Idempotency-Key K, response_body nulled in DB, re-submit same key+body -> accepted_segments: 1 both times (no crash, no hardcoded zero)"

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]

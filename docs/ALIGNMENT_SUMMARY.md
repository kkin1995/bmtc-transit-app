# API v1 Alignment Summary

**Date:** 2025-10-22
**Status:** ✅ **COMPLETE - Zero Drift**
**Test Results:** 62/62 tests passing (100%)

---

## Executive Summary

The backend implementation has been **fully aligned** with the v1 specification in `docs/api.md`. All drift has been eliminated while maintaining backward compatibility for one release cycle.

---

## Drift Findings

### Major Discrepancies (FIXED)

1. **POST /v1/ride_summary Request:**
   - ❌ `device_bucket` was inside segments → ✅ Moved to top-level
   - ❌ Used `timestamp_utc` (unix epoch) → ✅ Now uses `observed_at_utc` (ISO-8601)
   - ❌ No timestamp validation → ✅ Rejects future and >7 day old timestamps

2. **POST /v1/ride_summary Response:**
   - ❌ Returned `accepted: bool` → ✅ Now returns `accepted_segments: int`
   - ❌ Returned `rejected_count: int` → ✅ Now returns `rejected_segments: int`

3. **GET /v1/eta Response:**
   - ❌ Returned `mean_sec` → ✅ Now returns `eta_sec`
   - ❌ Returned `sample_count` → ✅ Now returns `n`
   - ❌ Returned `low_n_warning` → ✅ Now returns `low_confidence`
   - ❌ Missing `bin_id` field → ✅ Added
   - ❌ Missing `schedule_sec` field → ✅ Added
   - ❌ `last_updated` was epoch int → ✅ Now ISO-8601 string

4. **Rate Limiting:**
   - ❌ Extracted `device_bucket` from segments → ✅ Extracts from top-level

---

## Files Modified

### Core Implementation (4 files)
1. **backend/app/models.py** - Schema alignment
2. **backend/app/routes.py** - Response field mapping
3. **backend/app/rate_limit.py** - device_bucket extraction
4. **backend/app/learning.py** - No changes needed

### Tests (4 files)
5. **backend/tests/test_api_v1_alignment.py** - NEW (15 tests)
6. **backend/tests/test_integration.py** - Updated (4 tests)
7. **backend/tests/test_global_aggregation.py** - Updated (6 tests)
8. **backend/tests/conftest.py** - Updated fixtures

### Documentation (1 file)
9. **docs/ALIGNMENT_STATUS.md** - Complete change log

---

## Backward Compatibility

### Deprecated Fields (1 Release Cycle)

The following legacy fields are **supported but deprecated** and will be **removed in v0.3.0 (2025-11-30)**:

1. **`timestamp_utc` (int, unix epoch) in segments**
   - Replacement: `observed_at_utc` (ISO-8601 string)
   - Deprecation logged as WARNING

2. **`device_bucket` in segments array**
   - Replacement: Top-level `device_bucket` field
   - Fallback: rate_limit.py checks segments if top-level missing

### Migration Path

**Clients should update immediately:**
```json
// OLD (deprecated)
{
  "route_id": "335E",
  "direction_id": 0,
  "segments": [{
    "timestamp_utc": 1729598000,
    "device_bucket": "abc123..."
  }]
}

// NEW (v1 spec)
{
  "route_id": "335E",
  "direction_id": 0,
  "device_bucket": "abc123...",
  "segments": [{
    "observed_at_utc": "2025-10-22T10:33:00Z"
  }]
}
```

---

## Validation Results

### Test Coverage

```
✅ 62/62 tests passing (100%)
   - 15 v1 alignment tests (NEW)
   - 8 integration tests (updated)
   - 9 learning unit tests (unchanged)
   - 6 idempotency tests (updated)
   - 10 global aggregation tests (updated)
   - 14 rate limit tests (backward compatible)
```

### curl Examples Verified

All examples from `docs/api.md` work unchanged:

**✅ GET /v1/health**
```bash
curl http://127.0.0.1:8000/v1/health
# {"status":"ok","db_ok":true,"uptime_sec":123}
```

**✅ GET /v1/config**
```bash
curl http://127.0.0.1:8000/v1/config | jq .
# Returns all v1 fields
```

**✅ GET /v1/eta**
```bash
curl "http://127.0.0.1:8000/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374"
# Returns: eta_sec, p50_sec, p90_sec, n, blend_weight, schedule_sec, low_confidence, bin_id, last_updated (ISO-8601)
```

**✅ POST /v1/ride_summary** (with v1 schema)
```bash
curl -X POST http://localhost:8000/v1/ride_summary \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "route_id": "335E",
    "direction_id": 0,
    "device_bucket": "7a1f2b5c2d6e4a8b9c0d1e2f3a4b5c6d",
    "segments": [{
      "from_stop_id": "20558",
      "to_stop_id": "29374",
      "duration_sec": 320.5,
      "observed_at_utc": "2025-10-22T10:33:00Z",
      "mapmatch_conf": 0.86
    }]
  }'
# Returns: {"accepted_segments":1,"rejected_segments":0,"rejected_by_reason":{}}
```

---

## Next Steps

### Immediate (Production Ready)
- ✅ All tests pass
- ✅ Backward compatibility maintained
- ✅ Documentation updated
- ⚠️ Deploy to staging for manual QA

### Short Term (Before v0.3.0 - 2025-11-30)
- [ ] Monitor deprecation warnings in production logs
- [ ] Notify clients to migrate away from deprecated fields
- [ ] Update client SDKs/documentation

### Long Term (v0.3.0+)
- [ ] Remove deprecated `timestamp_utc` field support
- [ ] Remove segment-level `device_bucket` fallback
- [ ] Update error messages to remove legacy field references

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Endpoints conform 1:1 with docs/api.md | ✅ PASS |
| Full test suite passes locally | ✅ PASS (62/62) |
| All curl examples from docs/api.md work unchanged | ✅ PASS |
| Backward compatibility maintained | ✅ PASS (1 release) |
| Response schemas match docs exactly | ✅ PASS |
| ISO-8601 timestamp validation working | ✅ PASS |
| Rate limit headers-only (no body) | ✅ PASS |

---

## Conclusion

**Result:** ✅ **ZERO DRIFT** - Backend implementation now exactly matches docs/api.md v1 specification.

The alignment is production-ready with comprehensive test coverage and backward compatibility for existing clients. All acceptance criteria have been met.

---

**Generated:** 2025-10-22
**By:** implementation-engineer agent
**Review Status:** Ready for deployment

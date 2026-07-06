---
status: complete
phase: 02-learning-algorithm-integrity
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-07-02T12:41:31Z
updated: 2026-07-02T12:47:00Z
---

## Current Test

[testing complete]

## Tests

### 1. compute_variance() returns sample variance (m2/(n-1)) not population variance (m2/n)
expected: compute_variance() returns m2/(n-1) sample variance for n>=2 instead of m2/n population variance
result: pass
source: automated
coverage_id: D1

### 2. n<2 guard preserved unchanged
expected: n<2 guard preserved unchanged (n=0 and n=1 both return 0.0, no ZeroDivisionError)
result: pass
source: automated
coverage_id: D2

### 3. P90 ETA bound is wider with sample variance
expected: P90 ETA bound is measurably wider with sample variance than with population variance after 10 observations
result: pass
source: automated
coverage_id: D3

### 4. Never-seen (segment_id, bin_id) seeds and accepts instead of rejecting
expected: A never-seen (segment_id, bin_id) creates a segment_stats row and the observation is accepted (n becomes 1), never rejected with missing_stats
result: pass
source: automated
coverage_id: D1

### 5. Seed schedule_mean falls back to 0.0 when no existing bins
expected: Seed schedule_mean falls back to 0.0 when the segment has zero existing segment_stats rows (AVG returns NULL)
result: pass
source: automated
coverage_id: D2

### 6. Freshly seeded n=0 row is never falsely rejected as an outlier
expected: The first observation on a freshly seeded n=0 row is never falsely rejected as an outlier
result: pass
source: automated
coverage_id: D3

### 7. EMA functions fully removed from app.learning
expected: update_ema, compute_time_based_alpha, and is_stale no longer exist in app.learning
result: pass
source: automated
coverage_id: D4

### 8. update_segment_stats no longer touches EMA columns
expected: update_segment_stats no longer reads/writes ema_mean/ema_var and no longer calls the EMA helpers or missing_stats
result: pass
source: automated
coverage_id: D5

### 9. Downstream rejection tests assert deterministic reasons post-seed-and-accept
expected: Downstream rejection tests (test_global_aggregation.py) updated to assert deterministic reasons post-seed-and-accept, no missing_stats tolerance remains
result: pass
source: automated
coverage_id: D6

### 10. GET /v1/config returns 200 with ema_alpha/half_life_days null
expected: GET /v1/config returns 200 (not 500) after Settings.ema_alpha/half_life_days removal; response body has ema_alpha=null, half_life_days=null
result: pass
source: automated
coverage_id: D1

### 11. config.py Settings no longer defines ema_alpha or half_life_days
expected: config.py Settings no longer defines ema_alpha or half_life_days
result: pass
source: automated
coverage_id: D2

### 12. A 50-segment ride issues exactly one conn.commit()
expected: A 50-segment ride issues exactly one conn.commit() for the whole transaction, not ~100
result: pass
source: automated
coverage_id: D1

### 13. update_device_bucket() runs exactly once per ride
expected: update_device_bucket() runs exactly once per ride, not once per segment
result: pass
source: automated
coverage_id: D2

### 14. No conn.commit() remains inside any learning.py helper function
expected: No conn.commit() remains inside any learning.py helper function
result: pass
source: automated
coverage_id: D3

### 15. Full backend suite has no new regressions vs. Phase 2 baseline
expected: Full backend suite has no new regressions vs. Phase 2 baseline (196/202, 6 pre-existing failures)
result: pass
source: automated
coverage_id: D4

### 16. docs/api.md documents ema_alpha/half_life_days as deprecated, spec-first
expected: |
  docs/api.md's GET /v1/config example JSON shows "half_life_days": null and "ema_alpha": null.
  Field descriptions for both flag them as deprecated with a pointer to a future v2 research item (LEARN-V2-01).
  The validation-defaults note is updated to match.
result: pass
verified_by: claude
notes: "Confirmed via grep: docs/api.md:1397-1398 (null example), :1413-1414 (deprecated field descriptions with LEARN-V2-01 pointer), :1523 (defaults note)"

### 17. Primary docs reframe EMA as removed-from-active-pipeline, not erased
expected: |
  CLAUDE.md, .claude/CLAUDE.md, docs/architecture.md, docs/PROJECT_STRUCTURE.md, and docs/gtfs-database.md
  describe EMA as removed from the active pipeline (Phase 2 / LEARN-01), deferred to v2 research (LEARN-V2-01) —
  without erasing EMA mentions entirely. ema_mean/ema_var schema columns are annotated as retained-but-inert.
result: pass
verified_by: claude
notes: "Confirmed via grep across all 5 files: no stale 'Welford + EMA' framing remains, EMA mentions present (19/12/8/4/7 hits respectively) and correctly reframed as removed/deferred to LEARN-V2-01"

## Summary

total: 17
passed: 17
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]

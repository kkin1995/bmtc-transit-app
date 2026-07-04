-- Migration: Rate Limit Buckets
-- Purpose: Create rate_limit_buckets table for per-device token bucket rate limiting
-- Dependencies: None (standalone table)
-- Estimated time: <10ms (empty table creation)
-- Lock impact: None (WAL mode, no readers blocked)
--
-- This table supports atomic check-and-spend operations for rate limiting
-- using token bucket algorithm with hourly refills.
--
-- Table design:
-- - bucket_id: Device bucket hash OR "ip:<remote_addr>" fallback
-- - tokens: Current available tokens (0..500, where 500 is the limit)
-- - last_refill: ISO-8601 UTC timestamp of last refill calculation
--
-- Access pattern:
-- - Primary access: SELECT/UPDATE by bucket_id (O(1) via PRIMARY KEY index)
-- - No range queries needed
-- - High write contention expected (multiple requests per device)
--
-- Atomic guarantees:
-- - All operations use UPDATE with WHERE clause to prevent race conditions
-- - SQLite's ACID guarantees ensure token balance correctness
-- - WAL mode allows concurrent reads during writes

BEGIN TRANSACTION;

-- Idempotency check: Table creation is safe to re-run
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_id TEXT PRIMARY KEY,        -- Device bucket hash or "ip:<addr>"
    tokens INTEGER NOT NULL,           -- Current token count (0..500)
    last_refill TEXT NOT NULL,         -- ISO-8601 UTC timestamp (e.g., "2025-10-22 14:30:00")

    -- Constraints
    CHECK(tokens >= 0 AND tokens <= 500),  -- Enforce valid token range
    CHECK(length(last_refill) >= 19)       -- Ensure ISO-8601 format minimum length
) STRICT;

-- Index analysis:
-- PRIMARY KEY on bucket_id creates implicit UNIQUE index (B-tree)
-- This covers all access patterns:
--   1. SELECT tokens WHERE bucket_id = ? -- O(1) lookup
--   2. UPDATE ... WHERE bucket_id = ?    -- O(1) update
--   3. DELETE WHERE bucket_id = ?        -- O(1) cleanup
--
-- No additional indices needed.

-- Run ANALYZE to update query planner statistics
ANALYZE;

COMMIT;

-- Post-migration verification queries:
-- 1. Verify table exists:
--    SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limit_buckets';
--
-- 2. Verify schema:
--    .schema rate_limit_buckets
--
-- 3. Verify PRIMARY KEY index usage:
--    EXPLAIN QUERY PLAN SELECT * FROM rate_limit_buckets WHERE bucket_id = 'test';
--    Expected: SEARCH rate_limit_buckets USING INDEX sqlite_autoindex_rate_limit_buckets_1 (bucket_id=?)
--
-- 4. Test atomic update pattern:
--    INSERT INTO rate_limit_buckets VALUES ('test', 500, datetime('now'));
--    UPDATE rate_limit_buckets SET tokens = tokens - 1 WHERE bucket_id = 'test' AND tokens > 0;
--    SELECT changes(); -- Should return 1 if successful

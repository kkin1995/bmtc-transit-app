-- Rollback: Rate Limit Buckets
-- Purpose: Drop rate_limit_buckets table
-- WARNING: This will permanently delete all rate limit state.
--          Devices will start with fresh token buckets after rollback.
--
-- Data loss impact:
-- - All current token balances lost (devices reset to 500 tokens)
-- - No historical data is stored in this table, so loss is transient
-- - Rate limiting will be disabled until table is recreated
--
-- Dependencies:
-- - No foreign key constraints reference this table
-- - Safe to drop without CASCADE

BEGIN TRANSACTION;

-- Idempotency check: Safe to re-run if table doesn't exist
DROP TABLE IF EXISTS rate_limit_buckets;

COMMIT;

-- Post-rollback verification:
-- 1. Verify table is dropped:
--    SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limit_buckets';
--    Expected: No rows returned
--
-- 2. Verify no orphaned indices:
--    SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='rate_limit_buckets';
--    Expected: No rows returned

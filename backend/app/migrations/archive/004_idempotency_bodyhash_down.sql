-- Migration 004 Rollback: Remove body_hash column from idempotency_keys table
-- Date: 2025-10-22
-- Description: Rollback body_hash security enhancement

-- Step 1: Drop index
DROP INDEX IF EXISTS idx_idempotency_body_hash;

-- Step 2: Remove body_hash column
-- Note: SQLite requires table recreation to drop column
CREATE TABLE idempotency_keys_backup AS SELECT key, submitted_at, response_hash FROM idempotency_keys;

DROP TABLE idempotency_keys;

CREATE TABLE idempotency_keys (
    key TEXT PRIMARY KEY,
    submitted_at INTEGER NOT NULL,
    response_hash TEXT NOT NULL
);

INSERT INTO idempotency_keys SELECT * FROM idempotency_keys_backup;

DROP TABLE idempotency_keys_backup;

-- Recreate index from original schema
CREATE INDEX IF NOT EXISTS idx_idempotency_submitted ON idempotency_keys(submitted_at);

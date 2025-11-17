-- Migration 004: Add body_hash column to idempotency_keys table
-- Fixes: H1 - Idempotency Body Hash Verification (STRIDE: Tampering)
-- Date: 2025-10-22
-- Description: Add body_hash column to prevent replay attacks with modified payloads

-- Step 1: Add body_hash column to idempotency_keys table
-- This column stores SHA256 hash of request body for verification
ALTER TABLE idempotency_keys ADD COLUMN body_hash TEXT;

-- Step 2: Create index for faster lookups during verification
CREATE INDEX IF NOT EXISTS idx_idempotency_body_hash ON idempotency_keys(body_hash);

-- Note: Existing rows will have NULL body_hash, which is acceptable
-- The application will handle NULL body_hash by allowing the request
-- (backward compatibility during migration period)

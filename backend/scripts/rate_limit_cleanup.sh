#!/bin/bash
# File: backend/scripts/rate_limit_cleanup.sh
# Purpose: Delete stale rate limit buckets (24h+ old)
# Schedule: Daily via systemd timer (deploy/bmtc-rate-limit-cleanup.timer)
#
# This script removes rate limit buckets that haven't been used in 24+ hours
# to keep the table size bounded. Deleted buckets will be recreated with
# fresh token quota (500) on next request.
#
# Expected deletion rate: ~10-50% of buckets daily (inactive users)
# Runtime: <1 second for <100k rows

set -euo pipefail

# Configuration
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
RETENTION_HOURS=24
LOG_PREFIX="[$(date -Iseconds)] [rate-limit-cleanup]"

# Validate database exists
if [[ ! -f "$DB_PATH" ]]; then
    echo "$LOG_PREFIX ERROR: Database not found at $DB_PATH" >&2
    exit 1
fi

echo "$LOG_PREFIX Starting rate limit cleanup (retention: ${RETENTION_HOURS}h)..."

# Count buckets before cleanup
BEFORE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rate_limit_buckets;" 2>&1 || echo "0")
echo "$LOG_PREFIX Current buckets: $BEFORE_COUNT"

# Delete stale buckets (last_refill > 24 hours ago)
DELETED=$(sqlite3 "$DB_PATH" <<EOF
DELETE FROM rate_limit_buckets
WHERE (unixepoch('now') - unixepoch(last_refill)) >= $(($RETENTION_HOURS * 3600));
SELECT changes();
EOF
)

# Count buckets after cleanup
AFTER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rate_limit_buckets;" 2>&1 || echo "0")

echo "$LOG_PREFIX Deleted $DELETED stale buckets"
echo "$LOG_PREFIX Remaining buckets: $AFTER_COUNT"

# Optional: VACUUM to reclaim disk space (run weekly via separate job)
# Uncomment to enable:
# if [[ "${VACUUM:-0}" == "1" ]]; then
#     echo "$LOG_PREFIX Running VACUUM..."
#     sqlite3 "$DB_PATH" "VACUUM;"
#     echo "$LOG_PREFIX VACUUM complete"
# fi

echo "$LOG_PREFIX Cleanup complete"
exit 0

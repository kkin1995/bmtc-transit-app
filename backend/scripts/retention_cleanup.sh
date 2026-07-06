#!/bin/bash
# File: backend/scripts/retention_cleanup.sh
# Purpose: Enforce data retention windows across ride_segments, rides, and
#          rejection_log in a single ordered pass (DATA-03, D-05).
# Schedule: Daily via systemd timer (deploy/bmtc-retention.timer)
#
# This script runs three ordered deletes:
#   1. ride_segments older than BMTC_RETENTION_DAYS (existing behavior)
#   2. rides with zero remaining ride_segments (orphan cleanup, DATA-03 core fix)
#      - must run AFTER step 1 so rides that just lost their last segment
#        become orphans and are caught in the same pass
#   3. rejection_log older than BMTC_REJECTION_LOG_RETENTION_DAYS (drive-by, D-05)
#
# No backup/rollback pattern needed here — every delete is bounded by an
# explicit retention window read from config, not a destructive bulk operation.

set -euo pipefail

# Configuration
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
RETENTION_DAYS="${BMTC_RETENTION_DAYS:-90}"
REJECTION_LOG_RETENTION_DAYS="${BMTC_REJECTION_LOG_RETENTION_DAYS:-30}"
LOG_PREFIX="[$(date -Iseconds)] [retention-cleanup]"

# Validate database exists
if [[ ! -f "$DB_PATH" ]]; then
    echo "$LOG_PREFIX ERROR: Database not found at $DB_PATH" >&2
    exit 1
fi

# Validate retention windows are positive integers (CR-02) -- these values
# are interpolated directly into the DELETE WHERE clauses below. A
# negative value (a typo, or a sign flip during a config refactor) would
# shift the cutoff into the future and delete essentially all rows in
# ride_segments/rejection_log; a non-numeric value (e.g. "90 days") would
# produce silently-wrong arithmetic instead of a clear failure. This runs
# unattended, daily, via bmtc-retention.timer, so there is no human in the
# loop to catch a bad value before data is gone.
for var_name in RETENTION_DAYS REJECTION_LOG_RETENTION_DAYS; do
    value="${!var_name}"
    if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ]; then
        echo "$LOG_PREFIX ERROR: $var_name must be a positive integer, got '$value'" >&2
        exit 1
    fi
done

echo "$LOG_PREFIX Starting retention cleanup (ride_segments/rides: ${RETENTION_DAYS}d, rejection_log: ${REJECTION_LOG_RETENTION_DAYS}d)..."

# 1. ride_segments older than retention window
BEFORE_SEGMENTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ride_segments;" 2>&1 || echo "0")
sqlite3 "$DB_PATH" "DELETE FROM ride_segments WHERE timestamp_utc < strftime('%s','now') - ($RETENTION_DAYS * 86400);"
AFTER_SEGMENTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ride_segments;" 2>&1 || echo "0")
echo "$LOG_PREFIX ride_segments: $BEFORE_SEGMENTS -> $AFTER_SEGMENTS"

# 2. orphaned rides (DATA-03 fix) — zero remaining ride_segments.
# Keyed on rides.ride_id (the actual PK, not "id"). No separate age gate is
# needed: a ride only reaches zero segments after all its segments aged out
# in step 1.
BEFORE_RIDES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rides;" 2>&1 || echo "0")
sqlite3 "$DB_PATH" "DELETE FROM rides WHERE NOT EXISTS (SELECT 1 FROM ride_segments WHERE ride_id = rides.ride_id);"
AFTER_RIDES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rides;" 2>&1 || echo "0")
echo "$LOG_PREFIX rides (orphan cleanup): $BEFORE_RIDES -> $AFTER_RIDES"

# 3. rejection_log older than its retention window (drive-by fix, D-05)
BEFORE_REJECTIONS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rejection_log;" 2>&1 || echo "0")
sqlite3 "$DB_PATH" "DELETE FROM rejection_log WHERE submitted_at < strftime('%s','now') - ($REJECTION_LOG_RETENTION_DAYS * 86400);"
AFTER_REJECTIONS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rejection_log;" 2>&1 || echo "0")
echo "$LOG_PREFIX rejection_log: $BEFORE_REJECTIONS -> $AFTER_REJECTIONS"

echo "$LOG_PREFIX Retention cleanup complete."
exit 0

#!/bin/bash
# File: backend/scripts/update_gtfs.sh
# Purpose: Safely refresh GTFS static data from an operator-supplied local
#          zip without losing Welford learning history (DATA-04, D-10..D-15).
#
# Pipeline: validate $1 -> pre-refresh backup -> stop bmtc-api -> clear the
#           7 GTFS-source tables -> re-bootstrap (reuses app.bootstrap
#           unmodified) -> row-count sanity check -> restart bmtc-api, OR
#           auto-restore the pre-refresh backup and exit non-zero on any
#           failure signal along the way (D-14).
#
# `segments`, `segment_stats`, `rides`, `ride_segments` are NEVER touched by
# the clear step (D-11/D-12) -- re-bootstrap's schedule_mean-only upsert
# preserves welford_mean/n/m2 for every segment×bin already learned
# (RESEARCH.md finding #2).
#
# Usage: update_gtfs.sh <path-to-new-gtfs.zip>
#
# Env overrides (match the EnvironmentFile=/etc/bmtc-api/env convention):
#   BMTC_DB_PATH               default /var/lib/bmtc-api/bmtc.db
#   BMTC_GTFS_PATH              default /var/lib/bmtc-api/gtfs
#   BMTC_BACKUP_DIR              default /var/lib/bmtc-api/backups
#   BMTC_SKIP_SERVICE_CONTROL   set to 1 to skip systemctl stop/start bmtc-api
#                                (used by tests / hosts without the unit)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolved from this script's own location, not the caller's cwd or a
# hardcoded /opt/bmtc-api path -- works both in production
# (/opt/bmtc-api/backend/scripts/update_gtfs.sh -> backend dir
# /opt/bmtc-api/backend) and under test (repo_root/backend/scripts -> repo
# backend/), where app.bootstrap's pyproject.toml/uv.lock live.
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
GTFS_PATH="${BMTC_GTFS_PATH:-/var/lib/bmtc-api/gtfs}"
BACKUP_DIR="${BMTC_BACKUP_DIR:-/var/lib/bmtc-api/backups}"
SKIP_SERVICE_CONTROL="${BMTC_SKIP_SERVICE_CONTROL:-0}"
LOG_PREFIX="[$(date -Iseconds)] [update-gtfs]"
GTFS_TABLES="agency routes stops trips stop_times calendar gtfs_metadata"

# --- Step 0: validate $1 before ANY side effect (V5, T-04-07) ---
if [ $# -ne 1 ]; then
    echo "$LOG_PREFIX ERROR: Usage: $0 <path-to-new-gtfs.zip>" >&2
    exit 1
fi

NEW_GTFS_ZIP="$1"

if [ ! -f "$NEW_GTFS_ZIP" ]; then
    echo "$LOG_PREFIX ERROR: GTFS zip not found: $NEW_GTFS_ZIP" >&2
    exit 1
fi

if ! unzip -t "$NEW_GTFS_ZIP" > /dev/null 2>&1; then
    echo "$LOG_PREFIX ERROR: $NEW_GTFS_ZIP is not a valid zip archive" >&2
    exit 1
fi

if [ ! -f "$DB_PATH" ]; then
    echo "$LOG_PREFIX ERROR: Database not found at $DB_PATH" >&2
    exit 1
fi

# --- Service control helper with test escape hatch (D-15) ---
service_control() {
    local action="$1"
    if [ "$SKIP_SERVICE_CONTROL" = "1" ]; then
        echo "$LOG_PREFIX skipping service control ($action bmtc-api)"
        return 0
    fi
    sudo systemctl "$action" bmtc-api
}

# --- Auto-rollback (D-14): restore the pre-refresh backup, ensure the
# service is back up, and exit non-zero. restore.sh already does its own
# systemctl stop/start bmtc-api with `|| true`, so this tolerates both a
# real bmtc-api unit and a test environment with none installed. ---
rollback_and_exit() {
    echo "$LOG_PREFIX VALIDATION FAILED -- restoring pre-refresh backup from $BACKUP_FILE" >&2
    # Force any WAL frames written by the clear step (D-11) to be applied
    # and the WAL file truncated to zero before restore.sh's raw file-level
    # `mv` swap. -wal/-shm files are keyed to $DB_PATH's filename, not its
    # content -- a stale non-empty WAL left next to the freshly restored
    # main file would otherwise be replayed by the next connection to open
    # it, silently reapplying the destructive DELETEs on top of the
    # restored backup and defeating D-14's rollback guarantee.
    sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" > /dev/null 2>&1 || true
    BMTC_DB_PATH="$DB_PATH" "$SCRIPT_DIR/restore.sh" "$BACKUP_FILE"
    if [ "$SKIP_SERVICE_CONTROL" != "1" ]; then
        sudo systemctl start bmtc-api || true
    fi
    exit 1
}

# --- Step 1: pre-refresh backup (D-14), reusing backup.sh verbatim ---
echo "$LOG_PREFIX Taking pre-refresh backup..."
BACKUP_OUTPUT=$(BMTC_DB_PATH="$DB_PATH" BMTC_BACKUP_DIR="$BACKUP_DIR" "$SCRIPT_DIR/backup.sh")
echo "$LOG_PREFIX $BACKUP_OUTPUT"
BACKUP_FILE=$(echo "$BACKUP_OUTPUT" | grep -oP '(?<=Backup complete: ).*')

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "$LOG_PREFIX ERROR: pre-refresh backup did not produce a usable backup file" >&2
    exit 1
fi

# Snapshot BEFORE row counts on the 7 GTFS tables only (D-13) -- segments/
# segment_stats/rides/ride_segments are append-only and never validated here.
declare -A BEFORE_COUNTS
for t in $GTFS_TABLES; do
    BEFORE_COUNTS[$t]=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $t;")
done

# --- Step 2: stop the API before the destructive step (D-15) ---
echo "$LOG_PREFIX Stopping bmtc-api..."
service_control stop

# --- Step 3: clear ONLY the 7 GTFS-source tables (D-11). Child-before-parent
# order is defensive style -- FK enforcement is never turned on in this
# codebase (PRAGMA foreign_keys is not set in db.py), so this is not
# required for correctness today. segments/segment_stats/rides/
# ride_segments are never referenced here (D-12). ---
for t in stop_times trips calendar routes stops agency gtfs_metadata; do
    sqlite3 "$DB_PATH" "DELETE FROM $t;"
done

# --- Step 4: re-bootstrap. Reuses app.bootstrap/app.gtfs_bootstrap
# unmodified -- its segment_stats upsert only ever writes schedule_mean,
# never welford_mean/n/m2/ema_mean/ema_var (RESEARCH.md finding #2). ---
mkdir -p "$GTFS_PATH"
cp "$NEW_GTFS_ZIP" "${GTFS_PATH}/bmtc.zip"

if ! (cd "$BACKEND_DIR" && uv run python -m app.bootstrap); then
    echo "$LOG_PREFIX ERROR: re-bootstrap failed" >&2
    rollback_and_exit
fi

# --- Step 5: row-count sanity check (D-13) -- >50% delta threshold in
# either direction, deliberately generous since GTFS publishers routinely
# add/remove a handful of routes/stops/trips between feed versions
# (RESEARCH.md Pitfall 5). Only the 7 GTFS tables are validated. ---
for t in $GTFS_TABLES; do
    AFTER=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $t;")
    BEFORE=${BEFORE_COUNTS[$t]}

    if [ "$BEFORE" -gt 0 ] && [ "$AFTER" -eq 0 ]; then
        echo "$LOG_PREFIX $t is empty after refresh (was $BEFORE)" >&2
        rollback_and_exit
    fi

    if [ "$BEFORE" -gt 0 ]; then
        DELTA_PCT=$(echo "scale=2; 100 * ($AFTER - $BEFORE) / $BEFORE" | bc)
        ABS_DELTA_PCT=$(echo "$DELTA_PCT" | tr -d -)
        if (( $(echo "$ABS_DELTA_PCT > 50" | bc -l) )); then
            echo "$LOG_PREFIX $t changed by ${DELTA_PCT}% (before=$BEFORE after=$AFTER) -- exceeds 50% threshold" >&2
            rollback_and_exit
        fi
    fi
done

# --- Step 6: validation passed -- restart the API ---
echo "$LOG_PREFIX Validation passed. Restarting bmtc-api..."
service_control start
echo "$LOG_PREFIX GTFS refresh complete."
exit 0

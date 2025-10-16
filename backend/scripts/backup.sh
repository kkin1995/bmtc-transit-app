#!/bin/bash
# SQLite backup script for BMTC API

set -euo pipefail

DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
BACKUP_DIR="${BMTC_BACKUP_DIR:-/var/lib/bmtc-api/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/bmtc_${TIMESTAMP}.db.gz"

mkdir -p "$BACKUP_DIR"

# Use SQLite .backup command
sqlite3 "$DB_PATH" ".backup /tmp/bmtc_backup.db"

# Compress
gzip -c /tmp/bmtc_backup.db > "$BACKUP_FILE"

# Cleanup temp
rm /tmp/bmtc_backup.db

# Prune old backups (keep last 168 = 7 days of hourly backups)
ls -t "$BACKUP_DIR"/bmtc_*.db.gz | tail -n +169 | xargs -r rm

echo "Backup complete: $BACKUP_FILE"

#!/bin/bash
# Restore SQLite backup

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file.db.gz>"
    exit 1
fi

BACKUP_FILE="$1"
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Decompress to temp
gunzip -c "$BACKUP_FILE" > /tmp/bmtc_restore.db

# Stop service (if running)
systemctl stop bmtc-api || true

# Replace DB
mv "$DB_PATH" "${DB_PATH}.old"
mv /tmp/bmtc_restore.db "$DB_PATH"

# Restart service
systemctl start bmtc-api || true

echo "Restore complete from $BACKUP_FILE"
echo "Old DB saved to ${DB_PATH}.old"

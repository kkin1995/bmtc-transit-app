#!/bin/bash
# File: backend/scripts/apply_migrations.sh
# Purpose: Diff-and-apply versioned SQL migrations against schema_migrations (DATA-01)
# Invocation: manual, post-deploy — NEVER wired into main.py's app-startup lifespan (D-04)
#
# Reads migrations/*_up.sql (up-only, D-03), compares each filename against
# the schema_migrations tracking table, and applies only the ones missing,
# in filename (lexical/version) order. A freshly bootstrapped DB has every
# existing migration filename pre-seeded into schema_migrations by
# app/db.py's init_db() (RESEARCH.md Pitfall 1), so this script only ever
# executes migrations that are genuinely missing from an older DB's history.
#
# Requirement for every *_up.sql file (WR-03): wrap the entire body in
# `BEGIN TRANSACTION; ... COMMIT;` (see 003_rate_limit_up.sql for the
# reference pattern). Without this, a mid-file failure on a later statement
# leaves earlier statements in that same file already applied but the
# migration itself unmarked in schema_migrations -- the next invocation
# re-runs the whole file from the top and a repeated `ALTER TABLE ADD
# COLUMN` fails with "duplicate column name", permanently wedging the
# runner for every migration after that point until someone intervenes
# manually.

set -euo pipefail

# Configuration
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
MIGRATIONS_DIR="${BMTC_MIGRATIONS_DIR:-$(dirname "$0")/../app/migrations}"
LOG_PREFIX="[$(date -Iseconds)] [apply-migrations]"

# Validate database exists
if [[ ! -f "$DB_PATH" ]]; then
    echo "$LOG_PREFIX ERROR: Database not found at $DB_PATH" >&2
    exit 1
fi

echo "$LOG_PREFIX Starting migration apply (dir: $MIGRATIONS_DIR)..."

sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);"

applied_count=0
for f in "$MIGRATIONS_DIR"/*_up.sql; do
    [ -e "$f" ] || continue  # no migrations found — glob didn't match

    name="$(basename "$f")"
    # Escape embedded single quotes (SQL-literal doubling) before
    # interpolating into the query strings below (WR-03) -- a filename
    # containing a single quote would otherwise break the query or worse.
    name_escaped="${name//\'/\'\'}"
    already=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$name_escaped';")

    if [ "$already" -eq 0 ]; then
        echo "$LOG_PREFIX Applying $name..."
        sqlite3 "$DB_PATH" < "$f"
        sqlite3 "$DB_PATH" "INSERT INTO schema_migrations (filename) VALUES ('$name_escaped');"
        applied_count=$((applied_count + 1))
    fi
done

echo "$LOG_PREFIX Applied $applied_count migration(s)."
exit 0

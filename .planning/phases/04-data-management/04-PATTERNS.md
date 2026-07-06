# Phase 4: Data Management - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 12 (new/modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/scripts/apply_migrations.sh` | utility (script) | batch (DDL diff-and-apply) | `backend/scripts/rate_limit_cleanup.sh` | role-match (logging/error style); no direct migration-runner analog exists |
| `backend/app/migrations/archive/{003,004}_*.sql` | migration (relocated, not authored) | batch | existing files themselves | exact (pure `git mv`, no content change) |
| `backend/app/db.py` (`init_db` seeding addition) | utility / config | batch | `backend/app/db.py:21-26` guarded `ALTER TABLE` block | exact — same file, same idempotent-seed pattern |
| `backend/scripts/retention_cleanup.sh` | utility (script) | batch (CRUD delete) | `backend/scripts/rate_limit_cleanup.sh` | exact — same role, same data flow (TTL-bounded DELETE script) |
| `backend/deploy/bmtc-retention.service` (modified) | config (systemd unit) | batch | `backend/deploy/bmtc-backup.service` | exact — identical `Type=oneshot` + `EnvironmentFile` + `ExecStart=<script>` shape |
| `backend/deploy/bmtc-retention.timer` (modified) | config (systemd unit) | batch | `backend/deploy/bmtc-backup.timer` | exact — same `[Timer]`/`[Install]` shape, only `OnCalendar=` value changes |
| `backend/deploy/bmtc-rate-limit-cleanup.service` | config (systemd unit) | batch | `backend/deploy/bmtc-retention.service` (pre-modification) | exact — `Type=oneshot` calling an existing script by path |
| `backend/deploy/bmtc-rate-limit-cleanup.timer` | config (systemd unit) | batch | `backend/deploy/bmtc-retention.timer` (pre-modification, bare `daily`) | exact — same shape, needs explicit `OnCalendar=` (D-09) |
| `scripts/update_gtfs.sh` | utility (script) | batch + file-I/O (backup/restore + re-bootstrap orchestration) | `backend/scripts/restore.sh` (service-control + file-swap) and `backend/scripts/backup.sh` (backup mechanics) | role-match — no single analog covers the full backup→destructive-op→validate→rollback shape, composed from two existing scripts |
| `backend/tests/test_migrations.py` | test | batch | `backend/tests/test_idempotency.py` (subprocess-adjacent, temp_db-based) | role-match — closest existing DB-lifecycle test structure |
| `backend/tests/test_retention_cleanup.py` | test | CRUD | `backend/tests/test_global_aggregation.py` (seeds rows, asserts deletion/rejection behavior via `temp_db`) | exact — same "seed rows past TTL, assert row counts" shape |
| `backend/tests/test_gtfs_update.py` | test | file-I/O / event-driven (subprocess + zip fixture) | `backend/tests/test_integration.py` (uses `temp_db`, exercises multi-step flows end-to-end) | role-match |

## Pattern Assignments

### `backend/scripts/retention_cleanup.sh` (utility, batch/CRUD-delete)

**Analog:** `backend/scripts/rate_limit_cleanup.sh` (full file, 55 lines — read in full, small file)

**Header + config pattern** (lines 1-18):
```bash
#!/bin/bash
# File: backend/scripts/rate_limit_cleanup.sh
# Purpose: Delete stale rate limit buckets (24h+ old)
# Schedule: Daily via systemd timer (deploy/bmtc-rate-limit-cleanup.timer)
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
```
For `retention_cleanup.sh`, read config from `EnvironmentFile`-provided settings instead of a hardcoded constant — use `RETENTION_DAYS="${BMTC_RETENTION_DAYS:-90}"` and `REJECTION_LOG_RETENTION_DAYS="${BMTC_REJECTION_LOG_RETENTION_DAYS:-30}"` (these settings already exist in `backend/app/config.py:16,25`).

**Before/after count + DELETE + logging pattern** (lines 26-44):
```bash
echo "$LOG_PREFIX Starting rate limit cleanup (retention: ${RETENTION_HOURS}h)..."

BEFORE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rate_limit_buckets;" 2>&1 || echo "0")
echo "$LOG_PREFIX Current buckets: $BEFORE_COUNT"

DELETED=$(sqlite3 "$DB_PATH" <<EOF
DELETE FROM rate_limit_buckets
WHERE (unixepoch('now') - unixepoch(last_refill)) >= $(($RETENTION_HOURS * 3600));
SELECT changes();
EOF
)

AFTER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rate_limit_buckets;" 2>&1 || echo "0")

echo "$LOG_PREFIX Deleted $DELETED stale buckets"
echo "$LOG_PREFIX Remaining buckets: $AFTER_COUNT"
```
Replicate this exact before/after-count + `echo` logging shape three times in `retention_cleanup.sh`, once per D-05 delete (1. `ride_segments` by `BMTC_RETENTION_DAYS`, 2. orphaned `rides` via `NOT EXISTS`, 3. `rejection_log` by `BMTC_REJECTION_LOG_RETENTION_DAYS`). Existing `ride_segments` delete predicate (from the inline SQL this replaces, `backend/deploy/bmtc-retention.service` line 9):
```sql
DELETE FROM ride_segments WHERE timestamp_utc < strftime('%s','now') - ($BMTC_RETENTION_DAYS * 86400)
```

**Exit pattern** (lines 46-55):
```bash
echo "$LOG_PREFIX Cleanup complete"
exit 0
```

---

### `backend/deploy/bmtc-rate-limit-cleanup.service` + `.timer` (config, batch)

**Analog:** `backend/deploy/bmtc-backup.service` / `bmtc-backup.timer` (both full files, read in full)

**Service unit pattern** (`bmtc-backup.service`, full file):
```ini
[Unit]
Description=BMTC API Database Backup

[Service]
Type=oneshot
User=bmtc
Group=bmtc
EnvironmentFile=/etc/bmtc-api/env
ExecStart=/opt/bmtc-api/scripts/backup.sh
```
Copy verbatim, changing `Description=` and `ExecStart=/opt/bmtc-api/backend/scripts/rate_limit_cleanup.sh` (confirm actual deployed path prefix matches other units — note `bmtc-backup.service` uses `/opt/bmtc-api/scripts/...` while research sketch used `/opt/bmtc-api/backend/scripts/...`; verify the real deploy path convention at implementation time by checking `docs/deploy.md`).

**Timer unit pattern** (`bmtc-backup.timer`, full file):
```ini
[Unit]
Description=BMTC API Hourly Backup Timer

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```
For the new timer, use an explicit `OnCalendar=*-*-* 00:15:00` (D-09) instead of a bare keyword like `hourly`/`daily` — Pitfall 4 in RESEARCH.md explains why bare keywords cause simultaneous-start collisions with `bmtc-retention.timer`.

**Modify existing `bmtc-retention.timer`** (currently, full file):
```ini
[Unit]
Description=BMTC API Daily Retention Cleanup

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```
Change `OnCalendar=daily` → `OnCalendar=*-*-* 00:00:00` (D-09), everything else unchanged.

**Modify existing `bmtc-retention.service`** (currently, full file):
```ini
[Unit]
Description=BMTC API Data Retention Cleanup

[Service]
Type=oneshot
User=bmtc
Group=bmtc
EnvironmentFile=/etc/bmtc-api/env
ExecStart=/bin/bash -c 'sqlite3 $BMTC_DB_PATH "DELETE FROM ride_segments WHERE timestamp_utc < strftime(\"%s\", \"now\") - ($BMTC_RETENTION_DAYS * 86400)"'
```
Replace the `ExecStart=` line with a direct script call matching `bmtc-backup.service`'s convention: `ExecStart=/opt/bmtc-api/backend/scripts/retention_cleanup.sh` (D-06) — everything else (`[Unit]`, `User`, `Group`, `EnvironmentFile`) stays identical.

---

### `backend/scripts/apply_migrations.sh` (utility, batch DDL)

**Analog:** `backend/scripts/rate_limit_cleanup.sh` for style (header comment block, `set -euo pipefail`, `LOG_PREFIX`, existence check, exit 0) — no direct migration-runner analog exists in this codebase; this is genuinely new orchestration logic. Use the RESEARCH.md Pattern 1 sketch as the functional starting point (already vetted against this repo's conventions):

```bash
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
MIGRATIONS_DIR="$(dirname "$0")/../app/migrations"
LOG_PREFIX="[$(date -Iseconds)] [apply-migrations]"

sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);"

applied_count=0
for f in "$MIGRATIONS_DIR"/*_up.sql; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    already=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$name';")
    if [ "$already" -eq 0 ]; then
        echo "$LOG_PREFIX Applying $name..."
        sqlite3 "$DB_PATH" < "$f"
        sqlite3 "$DB_PATH" "INSERT INTO schema_migrations (filename) VALUES ('$name');"
        applied_count=$((applied_count + 1))
    fi
done

echo "$LOG_PREFIX Applied $applied_count migration(s)."
exit 0
```

**Companion fresh-bootstrap seeding — modify `backend/app/db.py`'s `init_db()`.**

**Analog:** the existing guarded `ALTER TABLE` idempotent-seed block already in this exact file (`backend/app/db.py:21-26`):
```python
    # Guarded ALTER TABLE: add response_body column for existing DBs whose
    # CREATE TABLE IF NOT EXISTS was a no-op (BUGFIX-03, D-06). Idempotent —
    # safe to run on every startup since it checks PRAGMA table_info first.
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(idempotency_keys)").fetchall()}
    if "response_body" not in existing_cols:
        conn.execute("ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT")
```
Add a parallel idempotent block right after `executescript(schema)`: create `schema_migrations` if missing, then `INSERT OR IGNORE` every filename found under `app/migrations/*_up.sql` (excluding `archive/`) as pre-applied — this is the Pitfall 1 fix from RESEARCH.md. Follow the same "read directory glob → INSERT OR IGNORE" idiom `init_db()` already uses for `time_bins` seeding (lines ~28-40 of the same function).

---

### `scripts/update_gtfs.sh` (utility, batch + file-I/O orchestration)

**Analogs:** `backend/scripts/backup.sh` (full file, reused verbatim as a subprocess call) and `backend/scripts/restore.sh` (full file, service-stop/file-swap/service-start pattern to imitate for the rollback branch).

**Backup mechanics to call, not reimplement** (`backup.sh`, full file):
```bash
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
BACKUP_DIR="${BMTC_BACKUP_DIR:-/var/lib/bmtc-api/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/bmtc_${TIMESTAMP}.db.gz"
mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup /tmp/bmtc_backup.db"
gzip -c /tmp/bmtc_backup.db > "$BACKUP_FILE"
rm /tmp/bmtc_backup.db
ls -t "$BACKUP_DIR"/bmtc_*.db.gz | tail -n +169 | xargs -r rm
echo "Backup complete: $BACKUP_FILE"
```
`update_gtfs.sh` should call this script and capture its stdout `Backup complete: <path>` line (as sketched in RESEARCH.md's Pattern 3) rather than duplicating `.backup`/gzip logic.

**Restore mechanics to call on validation failure** (`restore.sh`, full file):
```bash
BACKUP_FILE="$1"
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi
gunzip -c "$BACKUP_FILE" > /tmp/bmtc_restore.db
systemctl stop bmtc-api || true
mv "$DB_PATH" "${DB_PATH}.old"
mv /tmp/bmtc_restore.db "$DB_PATH"
systemctl start bmtc-api || true
echo "Restore complete from $BACKUP_FILE"
echo "Old DB saved to ${DB_PATH}.old"
```
Note: `restore.sh` already contains its own `systemctl stop/start bmtc-api || true` calls — `update_gtfs.sh`'s rollback path can call `restore.sh "$BACKUP_FILE"` directly and does not need to separately manage service state during rollback (the `|| true` means restore.sh tolerates a service that's already stopped, matching D-15's flow where `update_gtfs.sh` already stopped the service before the destructive step).

**Re-bootstrap entry point to reuse unmodified:**
```python
# backend/app/bootstrap.py — call via: (cd backend && uv run python -m app.bootstrap)
def main():
    settings = get_settings()
    init_db(settings.db_path)
    gtfs_zip = Path(settings.gtfs_path) / "gtfs.zip"
    if not gtfs_zip.exists():
        gtfs_zip = Path(settings.gtfs_path) / "bmtc.zip"
    ...
    with get_connection(settings.db_path) as conn:
        gtfs_version = parse_gtfs(str(gtfs_zip), conn)
```
`update_gtfs.sh` copies the operator-supplied zip to `${BMTC_GTFS_PATH}/bmtc.zip` then invokes `uv run python -m app.bootstrap` from `backend/` — do not reimplement GTFS parsing in bash (RESEARCH.md "Don't Hand-Roll").

**Full orchestration skeleton** — use RESEARCH.md's Pattern 3 code block verbatim as the starting draft (already validated against this repo's `backup.sh`/`restore.sh` contracts); treat exact variable names/`bc` invocations as adjustable, not fixed.

---

### `backend/tests/test_retention_cleanup.py` (test, CRUD)

**Analog:** `backend/tests/test_global_aggregation.py` pattern (seed via `temp_db`, run behavior, assert row-level effects) combined with the subprocess pattern from RESEARCH.md:

**`temp_db` fixture contract to build against** (`backend/tests/conftest.py:114-153`, full fixture read):
```python
@pytest.fixture
def temp_db(test_env, monkeypatch) -> Generator[tuple[str, sqlite3.Connection], None, None]:
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("BMTC_DB_PATH", db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    schema_path = Path(__file__).parent.parent / "app" / "schema.sql"
    with open(schema_path) as f:
        conn.executescript(f.read())
    yield db_path, conn
    conn.close()
    try:
        os.unlink(db_path)
    except OSError:
        pass
```
Note this fixture turns `PRAGMA foreign_keys = ON` for tests — unlike production (`db.py` never sets this pragma, per RESEARCH.md Pitfall 2). Seed data respecting FK order (parents before children) to avoid test-only FK failures that wouldn't occur in production.

**subprocess invocation pattern** (from RESEARCH.md Code Examples, to follow directly):
```python
import subprocess

def test_retention_cleanup_removes_orphaned_rides(temp_db):
    db_path, conn = temp_db
    # seed a ride with all its ride_segments past the retention window
    result = subprocess.run(
        ["bash", "backend/scripts/retention_cleanup.sh"],
        env={"BMTC_DB_PATH": db_path, "BMTC_RETENTION_DAYS": "90",
             "BMTC_REJECTION_LOG_RETENTION_DAYS": "30", "PATH": "/usr/bin:/bin"},
        capture_output=True, text=True,
    )
    assert result.returncode == 0
    remaining = conn.execute("SELECT COUNT(*) FROM rides").fetchone()[0]
    assert remaining == 0
```
Apply the same shape for `test_migrations.py` (subprocess `apply_migrations.sh`, assert `schema_migrations` rows) and `test_rate_limit_cleanup_script.py` (subprocess `rate_limit_cleanup.sh`, assert bucket deletion) — all three are thin wrappers around this one subprocess-against-`temp_db` idiom.

---

### `backend/tests/test_gtfs_update.py` (test, file-I/O/event-driven)

**Analog:** `backend/tests/test_integration.py` for the "exercise a multi-step flow end-to-end via `temp_db`" shape, extended with a subprocess call to `scripts/update_gtfs.sh` and a small synthetic GTFS zip fixture (`backend/tests/fixtures/mini_gtfs.zip`, does not exist yet — must be created as test data, not copied from `gtfs/bmtc.zip` which is too large per RESEARCH.md Wave 0 Gaps). Stub or skip real `systemctl` calls in the test environment (e.g. `BMTC_SKIP_SERVICE_CONTROL=1` escape hatch, or accept that `systemctl stop/start bmtc-api` fails harmlessly in CI where no such unit is installed) — no existing test in this repo exercises `systemctl`, so this stub mechanism is new and should be added directly inside `update_gtfs.sh` itself (an early `if [[ "${BMTC_SKIP_SERVICE_CONTROL:-0}" == "1" ]]; then ... skip ...`) rather than only in the test.

## Shared Patterns

### Script header/config/logging convention
**Source:** `backend/scripts/rate_limit_cleanup.sh` (full file)
**Apply to:** `retention_cleanup.sh`, `apply_migrations.sh`, `update_gtfs.sh`
```bash
set -euo pipefail
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
LOG_PREFIX="[$(date -Iseconds)] [<script-name>]"
if [[ ! -f "$DB_PATH" ]]; then
    echo "$LOG_PREFIX ERROR: Database not found at $DB_PATH" >&2
    exit 1
fi
```
All new scripts must read config exclusively via `${BMTC_*:-default}` env-var pattern so they work under both the `EnvironmentFile=/etc/bmtc-api/env` systemd convention and ad-hoc test invocation via `env={...}` in `subprocess.run`.

### systemd oneshot + timer pairing
**Source:** `backend/deploy/bmtc-backup.service` / `bmtc-backup.timer` (full files)
**Apply to:** `bmtc-rate-limit-cleanup.service`/`.timer` (new), `bmtc-retention.service`/`.timer` (modified)
```ini
[Service]
Type=oneshot
User=bmtc
Group=bmtc
EnvironmentFile=/etc/bmtc-api/env
ExecStart=<absolute-path-to-script>
```
```ini
[Timer]
OnCalendar=*-*-* HH:MM:SS   # explicit time, not bare "daily"/"hourly" (D-09, Pitfall 4)
Persistent=true

[Install]
WantedBy=timers.target
```

### Idempotent-seed-on-startup convention
**Source:** `backend/app/db.py:21-26` (`response_body` column guard)
**Apply to:** `init_db()`'s new `schema_migrations` pre-seeding step (Pitfall 1 fix)
```python
existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(<table>)").fetchall()}
if "<col>" not in existing_cols:
    conn.execute("ALTER TABLE <table> ADD COLUMN <col> ...")
```
Structural idiom to mirror: check current state via a `PRAGMA`/`SELECT`, act only if the state doesn't already reflect the desired outcome — same idea applies to seeding `schema_migrations` (`INSERT OR IGNORE` guards against re-seeding on every app restart).

### Backup-before-destructive-op reuse
**Source:** `backend/scripts/backup.sh` + `backend/scripts/restore.sh` (full files)
**Apply to:** `update_gtfs.sh` exclusively — do not duplicate `.backup`/gzip logic anywhere else (RESEARCH.md "Don't Hand-Roll" table, row 1).

### Test fixture reuse
**Source:** `backend/tests/conftest.py:114-153` (`temp_db` fixture, full definition read above)
**Apply to:** `test_migrations.py`, `test_retention_cleanup.py`, `test_rate_limit_cleanup_script.py`, `test_gtfs_update.py` — all four new test files should take `temp_db` as a fixture parameter and invoke the relevant script via `subprocess.run(..., env={"BMTC_DB_PATH": db_path, ...})` rather than inventing a new DB-setup helper.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/scripts/apply_migrations.sh` (core diff-and-apply loop logic) | utility | batch | No migration runner has ever existed in this codebase (`003_*`/`004_*` were written but never executed by any runner per D-01) — functional logic must come from RESEARCH.md's Pattern 1 sketch (synthesized from external sqlite-migrate/Flyway conventions), not an internal analog. Script-level conventions (header, logging, exit codes) still come from `rate_limit_cleanup.sh`. |
| `scripts/update_gtfs.sh` (validation + rollback orchestration branch) | utility | batch + file-I/O | No existing script in this repo combines backup + destructive-op + validate + auto-rollback in one flow; composed from `backup.sh` + `restore.sh` + `bootstrap.py` per RESEARCH.md Pattern 3, not a single direct analog. |
| Sudoers drop-in for `systemctl stop/start bmtc-api` | config (deploy, out of repo) | — | No existing sudoers file in this repo (`restore.sh` already calls `systemctl` unguarded assuming root/manual invocation) — this is a host-config task flagged as `checkpoint:human-verify` in RESEARCH.md Open Question 2, not a file this phase's planner should treat as having an in-repo analog. |

## Metadata

**Analog search scope:** `backend/scripts/`, `backend/deploy/`, `backend/app/` (`db.py`, `bootstrap.py`, `gtfs_bootstrap.py`, `config.py`, `schema.sql`), `backend/tests/` (`conftest.py` fixtures + existing test modules)
**Files scanned:** `rate_limit_cleanup.sh`, `backup.sh`, `restore.sh`, `bmtc-retention.service`/`.timer`, `bmtc-backup.service`/`.timer`, `db.py`, `bootstrap.py`, `config.py`, `conftest.py`, `backend/app/migrations/{003,004}_*.sql` (existence only, D-01 archive targets)
**Pattern extraction date:** 2026-07-03

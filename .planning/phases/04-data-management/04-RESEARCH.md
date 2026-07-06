# Phase 4: Data Management - Research

**Researched:** 2026-07-03
**Domain:** Operational data-lifecycle infrastructure (SQLite migration runner, systemd timers, backup/rollback bash scripting)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `backend/app/migrations/003_rate_limit_up.sql`, `003_rate_limit_down.sql`, `004_idempotency_bodyhash_up.sql`, `004_idempotency_bodyhash_down.sql` are orphaned artifacts (Oct 2025) — their changes are already baked directly into `schema.sql`, and no runner ever executed them. Archive them (e.g. move to `backend/app/migrations/archive/`) as historical record. `schema.sql` is treated as the current baseline going forward. The next real schema change gets migration `001`.
- **D-02:** New `schema_migrations` tracking table (columns: filename, applied_at) records exactly which migrations have run on a given DB. `apply_migrations.sh` diffs `migrations/*.sql` against this table to determine what to apply next — standard Alembic/Flyway-style pattern, not per-migration schema introspection.
- **D-03:** Migrations are **up-only** in the automated runner. Down-migration scripts, if written, are for manual/emergency use only — not wired into `apply_migrations.sh`.
- **D-04:** `apply_migrations.sh` is invoked manually — e.g. from `bootstrap.py` or documented deploy steps (`docs/deploy.md`) — not wired into `main.py`'s lifespan/app-startup.
- **D-05:** New `backend/scripts/retention_cleanup.sh` fully replaces the current inline `sqlite3` command in `bmtc-retention.service`. Runs three ordered deletes in one script, following `rate_limit_cleanup.sh`'s existing pattern (before/after row counts, timestamped log lines, error handling): (1) `ride_segments` older than `BMTC_RETENTION_DAYS` (90d), (2) `rides` rows with zero remaining `ride_segments` (DATA-03 fix, no separate age gate needed), (3) `rejection_log` older than `rejection_log_retention_days` (30d) — drive-by fix, already documented in `backend/scripts/README.md` but never wired in.
- **D-06:** `bmtc-retention.service`'s `ExecStart` becomes a single call to `retention_cleanup.sh` instead of the inline `sqlite3` command.
- **D-07:** New `bmtc-rate-limit-cleanup.service` / `bmtc-rate-limit-cleanup.timer` wire up the already-working `rate_limit_cleanup.sh` — filenames and daily cadence match what the script's own header comment already documents.
- **D-08:** Leave `rate_limit_cleanup.sh`'s commented-out `VACUUM` block commented out. Stays a manual/future opt-in.
- **D-09:** Stagger `bmtc-retention.timer` and `bmtc-rate-limit-cleanup.timer` by a few minutes (e.g. `00:00:00` vs `00:15:00`) to avoid both hitting the single-writer SQLite DB at the exact same instant. Belt-and-suspenders, not a correctness requirement (WAL handles simultaneous writes safely).
- **Carried forward from Phase 1 (BUGFIX-07):** `idempotency_keys` (24h TTL) cleanup remains **startup-only** via `cleanup_expired_keys()` in the `main.py` lifespan handler — NOT reopened or moved to a timer in this phase.
- **D-10:** `scripts/update_gtfs.sh <path-to-new-gtfs.zip>` takes a **local zip file path as an argument** — no network fetch/curl/wget code.
- **D-11:** "GTFS-table clear" truncates only the 7 GTFS-source tables: `agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`, `gtfs_metadata`. `segments`, `segment_stats`, `rides`, `ride_segments` are never touched by the clear step.
- **D-12:** The `segments` table stays **append-only** — same `INSERT OR IGNORE` behavior as today, never cleared/rebuilt. Orphaned `segment_stats` rows after a `route_id` change across GTFS versions are an **accepted, documented limitation**. Route-id reconciliation is out of scope — see Deferred.
- **D-13:** Row-count validation after re-bootstrap checks **sanity thresholds** on the 7 GTFS tables only (not zero, not >50% delta from pre-refresh count) — not exact match. Does not check `segments`/`segment_stats` continuity.
- **D-14:** On validation failure, the script **automatically restores** the pre-refresh backup (reusing `backup.sh`'s `.backup` mechanism, taken as the script's first step) over the live DB and exits non-zero. No manual recovery steps required.
- **D-15:** The `bmtc-api` systemd service is **stopped** before the clear + re-bootstrap steps and **restarted** after validation passes (or after a rollback completes) — a planned ~30-60 second outage. Chosen over running live to avoid serving empty/partial route or stop data mid-refresh.

### Claude's Discretion

- Exact wiring point for `apply_migrations.sh` (bootstrap.py call vs. documented deploy step) — not locked, see Common Pitfalls for the recommended approach (fresh-bootstrap seeding problem).
- Whether `update_gtfs.sh` needs a sudoers entry or runs as a privileged user to call `systemctl stop/start bmtc-api` — explicitly flagged in CONTEXT.md as "a technical detail for research/planning, not decided in discussion." Resolved below in Common Pitfalls / Security Domain.
- Row-count validation implementation detail (bash arithmetic vs `bc`) — no constraint given beyond the >50% threshold semantics.

### Deferred Ideas (OUT OF SCOPE)

- **Route-id reconciliation across GTFS refreshes** — fuzzy-matching orphaned `segment_stats` rows to new `route_id` values via `route_short_name` when BMTC republishes GTFS with different IDs. Out of scope for D-12.
- **Automated GTFS feed download from a real BMTC URL** — no stable, scriptable feed URL exists today; `update_gtfs.sh`'s local-path argument can be extended with an optional `--url` fetch step later without changing the pipeline.
- **VACUUM scheduling** — stays commented out (D-08); revisit only if disk growth becomes an actual operational problem.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | DB migration framework in place (versioned SQL scripts in `backend/app/migrations/`) | Migration runner pattern (schema_migrations table + diff), fresh-bootstrap seeding pitfall, archive-orphans procedure — see Architecture Patterns, Code Examples, Common Pitfalls |
| DATA-02 | Rate limit bucket cleanup wired to a systemd timer | `bmtc-rate-limit-cleanup.service`/`.timer` skeletons modeled on existing `bmtc-backup.*`/`bmtc-retention.*` units — see Code Examples |
| DATA-03 | Retention script cleans parent `rides` table in addition to `ride_segments` | `retention_cleanup.sh` design (3 ordered deletes, before/after counts) — see Architecture Patterns, Code Examples |
| DATA-04 | GTFS update workflow script (`scripts/update_gtfs.sh`) | Backup→stop-service→clear→re-bootstrap→validate→rollback-or-restart pipeline; FK-enforcement finding; sudoers permission gap — see Architecture Patterns, Common Pitfalls, Security Domain |

</phase_requirements>

## Summary

This phase adds no new API surface and no new third-party dependencies — it is pure operational tooling on top of an already-working stack (bash, `sqlite3` CLI, systemd, Python stdlib `sqlite3`). All four requirements have a working reference implementation to model from already in the repo: `rate_limit_cleanup.sh` (logging/error-handling pattern), `backup.sh`/`restore.sh` (backup/restore mechanics), and `bmtc-backup.service`/`.timer` + `bmtc-retention.service`/`.timer` (oneshot+timer pairing). The work is almost entirely "replicate an established local pattern," not "research an unfamiliar technology."

Three findings from direct codebase inspection materially change how the plan should be scoped, beyond what CONTEXT.md's decisions already cover:

1. **Foreign keys are never enabled in this codebase** (`PRAGMA foreign_keys=ON` appears nowhere in `db.py`). This contradicts CLAUDE.md's "Common Gotchas" claim that "Foreign keys: Enabled by default." In practice, `DELETE FROM routes/stops/trips/...` during the GTFS-table clear step (D-11) will **not** raise FK violations even though `segments`/`stop_times`/`ride_segments` rows reference the cleared tables — this makes the clear step mechanically simple (plain `DELETE FROM`, no need to disable constraints), but it also means SQLite provides zero referential-integrity backstop, reinforcing why D-12's orphaned-row acceptance is the right call rather than something the DB will catch for you.
2. **Re-running `compute_segments_and_baselines()` (already called by `parse_gtfs()` inside `bootstrap.py`) is verified-safe for the D-11/D-12 GTFS refresh scenario.** Its `segment_stats` upsert (`INSERT ... ON CONFLICT(segment_id, bin_id) DO UPDATE SET schedule_mean=excluded.schedule_mean`) only ever writes to `schedule_mean` — `welford_mean`, `n`, `m2`, `ema_mean`/`ema_var` columns are never touched by this UPDATE clause. This means simply re-invoking the existing `bootstrap.py` entry point after clearing the 7 GTFS tables is sufficient to refresh schedule baselines while preserving 100% of learned Welford history — no new "preserve learning data" logic needs to be written for `update_gtfs.sh`; it can reuse `bootstrap.py` unmodified.
3. **A fresh `schema.sql`-based bootstrap and an `apply_migrations.sh`-upgraded older DB must converge on an identical, non-duplicated schema state.** Because `schema.sql` is the "current baseline" (D-01) and already contains every schema change including future ones, running `apply_migrations.sh` naively against a *freshly bootstrapped* DB would try to re-execute migration SQL whose effects already exist (e.g. `ALTER TABLE ... ADD COLUMN` failing with "duplicate column"). The standard fix (used by Flyway/Alembic-style "baseline" migrations) is to **seed `schema_migrations` with every existing migration filename, marked as pre-applied, as part of the fresh-bootstrap path** — so `apply_migrations.sh` only ever executes migrations that are genuinely missing from an *older* DB's history. This must be an explicit task in the plan; it is not something the diff-against-table pattern (D-02) handles automatically without this seeding step.

**Primary recommendation:** Build all four scripts as small, `set -euo pipefail` bash scripts that read config exclusively from `EnvironmentFile=/etc/bmtc-api/env` (matching `rate_limit_cleanup.sh`'s existing convention), reuse `backup.sh`/`restore.sh` verbatim rather than re-implementing backup logic, and test every script via `subprocess.run()` against the existing `temp_db` pytest fixture (`backend/tests/conftest.py:114`) rather than inventing a new shell-testing framework.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema migration execution | Database / Storage (bash + sqlite3 CLI) | — | Pure DDL application against the SQLite file; no API or app-server involvement by design (D-04) |
| Migration invocation/orchestration | Deploy tooling (docs/deploy.md, optionally `bootstrap.py`) | — | Manual, operator-triggered per D-04; not app-server lifespan |
| Rate-limit bucket cleanup | Database / Storage (bash + sqlite3 CLI) | OS scheduling (systemd timer) | Pure DELETE against `rate_limit_buckets`; systemd owns *when*, script owns *what* |
| Retention sweep (`ride_segments`/`rides`/`rejection_log`) | Database / Storage (bash + sqlite3 CLI) | OS scheduling (systemd timer) | Same pattern as rate-limit cleanup; reuses `bmtc-retention.timer`'s existing schedule ownership |
| GTFS refresh pipeline | Deploy tooling / Database (bash orchestrator calling Python `bootstrap.py`) | OS scheduling (systemd service control) | Orchestration lives in bash; actual GTFS parsing stays in existing `app.gtfs_bootstrap`/`app.bootstrap` Python modules — do not reimplement parsing in bash |
| API availability during refresh | API / Backend (`bmtc-api.service`) | — | D-15's stop/start is systemd-level; the FastAPI app itself has no role in the refresh beyond being paused |

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `bash` | system (`set -euo pipefail`) | All 4 new/modified scripts | Matches 100% of existing operational scripts in `backend/scripts/` — no justification exists to introduce Python for shell-level orchestration here |
| `sqlite3` CLI | system (already a runtime dependency per `health_check.sh`/`backup.sh`/`rate_limit_cleanup.sh`) | DDL execution, row counts, DELETEs | Already the exclusive DB-access tool for every existing operational script |
| `systemd` (`Type=oneshot` + `.timer`) | system | Scheduling for rate-limit cleanup and retention | Identical to `bmtc-backup.service`/`.timer` and `bmtc-retention.service`/`.timer`, already in production |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `gzip` | system | Backup compression | Already used by `backup.sh`; `update_gtfs.sh` reuses `backup.sh` directly rather than re-implementing |
| `bc` | system | Floating-point arithmetic for row-count delta % | Already a documented dependency of `health_check.sh` — reuse for D-13's threshold math rather than introducing a new dependency |
| `sudo` (via `/etc/sudoers.d/` drop-in) | system | Grant the `bmtc` user permission to run `systemctl stop/start bmtc-api` | Required by D-15 — see Common Pitfalls and Security Domain |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bash + `sqlite3` CLI migration runner | Alembic (Python) | CONTEXT.md/STATE.md explicitly reject this: "lightweight versioned SQL scripts (not Alembic) — keep deps minimal." Alembic would add a new dependency and ORM-adjacent tooling this project has deliberately avoided |
| sudoers NOPASSWD entry for `systemctl stop/start bmtc-api` | polkit rule | Polkit is the more "systemd-native" mechanism but requires authoring a `.rules` file in a non-trivial DSL; a scoped sudoers line is simpler to review, audit, and matches the project's single-server, single-purpose deployment model [CITED: web] |
| Row-count % threshold in `bc` | Python one-liner via `uv run python -c "..."` | Either works; `bc` keeps the entire script dependency-free (no need to invoke the app's Python environment for a comparison), consistent with `health_check.sh`'s existing choice |

**Installation:** No new packages. All tools (`bash`, `sqlite3`, `gzip`, `bc`, `systemd`) are already present on the deploy target per `docs/deploy.md` and existing scripts.

**Version verification:** Not applicable — no versioned language packages are introduced by this phase.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new Python, npm, or system packages. All new files are bash scripts, SQL migration files, and systemd unit files using tools already present in the deployed environment (`bash`, `sqlite3`, `gzip`, `bc`, `sudo`, `systemd`). No `package-legitimacy check` run is required.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────┐
                     │   Operator (manual trigger)  │
                     └───────────────┬──────────────┘
                                     │ 1. runs after code deploy
                                     ▼
                     ┌─────────────────────────────┐
                     │  apply_migrations.sh          │
                     │  - reads migrations/*.sql     │
                     │  - diffs vs schema_migrations │
                     │  - runs missing ones in order │
                     └───────────────┬──────────────┘
                                     │ writes
                                     ▼
                          ┌─────────────────┐
                          │   bmtc.db (WAL)  │◄────────────┐
                          └───┬─────────┬────┘             │
                              │         │                  │
        ┌─────────────────────┘         └───────────┐       │
        │ 2. daily 00:00                3. daily 00:15│       │
        ▼                                             ▼       │
┌───────────────────┐                      ┌───────────────────┐
│ bmtc-retention.timer│                     │bmtc-rate-limit-    │
│  → retention_       │                     │cleanup.timer        │
│    cleanup.sh        │                     │ → rate_limit_       │
│  DELETE ride_segments│                     │   cleanup.sh         │
│  DELETE orphan rides │                     │  DELETE stale        │
│  DELETE old rejection│                     │  rate_limit_buckets  │
│  _log                │                     │                       │
└───────────────────┘                      └───────────────────┘
                                                                │
                     ┌─────────────────────────────┐            │
                     │ 4. Operator hands new zip     │            │
                     ▼                                          │
        ┌───────────────────────────────────────┐               │
        │ update_gtfs.sh <new-gtfs.zip>            │              │
        │  a. backup.sh (pre-refresh snapshot)      │              │
        │  b. systemctl stop bmtc-api               │              │
        │  c. DELETE FROM 7 GTFS tables              │             │
        │  d. uv run python -m app.bootstrap         │─────────────┘
        │     (re-parses zip → gtfs tables +         │
        │      segment_stats.schedule_mean refresh,  │
        │      welford_mean/n/m2 untouched)           │
        │  e. row-count sanity check (>50% delta?)   │
        │     ├─ PASS → systemctl start bmtc-api     │
        │     └─ FAIL → restore.sh <backup> +        │
        │               exit 1 (bmtc-api stays down  │
        │               until operator investigates, │
        │               OR restart after restore)    │
        └───────────────────────────────────────┘
```

### Recommended Project Structure

```
backend/
├── app/
│   └── migrations/
│       ├── archive/                          # D-01: orphaned 003/004 files moved here
│       │   ├── 003_rate_limit_up.sql
│       │   ├── 003_rate_limit_down.sql
│       │   ├── 004_idempotency_bodyhash_up.sql
│       │   └── 004_idempotency_bodyhash_down.sql
│       ├── 001_<next_schema_change>_up.sql    # only created when a real schema change lands
│       └── 001_<next_schema_change>_down.sql  # manual/emergency use only (D-03)
├── scripts/
│   ├── apply_migrations.sh                    # NEW (DATA-01)
│   ├── retention_cleanup.sh                   # NEW (DATA-02/03), replaces inline sqlite3 in service
│   ├── rate_limit_cleanup.sh                  # EXISTING, unchanged (D-07 just wires the timer)
│   ├── update_gtfs.sh                         # NEW (DATA-04)
│   ├── backup.sh                              # EXISTING, reused verbatim
│   └── restore.sh                             # EXISTING, reused verbatim
└── deploy/
    ├── bmtc-retention.service                 # MODIFIED (D-06): ExecStart → retention_cleanup.sh
    ├── bmtc-retention.timer                   # MODIFIED (D-09): explicit OnCalendar time
    ├── bmtc-rate-limit-cleanup.service         # NEW (D-07)
    └── bmtc-rate-limit-cleanup.timer           # NEW (D-07, D-09)
```

### Pattern 1: schema_migrations diff-and-apply runner (DATA-01)

**What:** A tracking table plus a runner that lists migration files, checks which filenames are absent from the tracking table, and executes only those, each in its own transaction, recording success immediately after.

**When to use:** Every schema change after the `schema.sql` baseline (D-01).

**Example:**
```sql
-- Source: pattern synthesized from sqlite-utils' sqlite-migrate tool
-- (github.com/simonw/sqlite-migrate) [CITED: github.com/simonw/sqlite-migrate]
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```bash
#!/bin/bash
# Source: synthesized from Flyway/Alembic "diff against tracking table" convention
# [CITED: web — schema_migrations tracking-table pattern]
set -euo pipefail

DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
MIGRATIONS_DIR="$(dirname "$0")/../app/migrations"
LOG_PREFIX="[$(date -Iseconds)] [apply-migrations]"

sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);"

applied_count=0
for f in "$MIGRATIONS_DIR"/*_up.sql; do
    [ -e "$f" ] || continue   # no migrations yet — glob didn't match
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

**Critical companion step (fresh-bootstrap seeding — see Common Pitfalls):** `bootstrap.py`'s `init_db()` must, immediately after loading `schema.sql`, seed `schema_migrations` with every filename currently present in `migrations/*_up.sql` so a fresh install never tries to re-execute changes `schema.sql` already contains.

### Pattern 2: Staggered oneshot + timer pairing (DATA-02/03)

**What:** `Type=oneshot` service units with no `[Install]` `WantedBy` on the service itself (the timer owns activation), paired 1:1 with a `.timer` unit carrying an explicit (not bare `daily`) `OnCalendar=` time to avoid simultaneous-start contention on the single-writer DB.

**When to use:** Both the retention timer (D-06/D-09) and the new rate-limit-cleanup timer (D-07/D-09).

**Example:**
```ini
# Source: modeled directly on existing backend/deploy/bmtc-retention.service
# and backend/deploy/bmtc-backup.service (verified via Read)
[Unit]
Description=BMTC API Rate Limit Bucket Cleanup

[Service]
Type=oneshot
User=bmtc
Group=bmtc
EnvironmentFile=/etc/bmtc-api/env
ExecStart=/opt/bmtc-api/backend/scripts/rate_limit_cleanup.sh
```

```ini
[Unit]
Description=BMTC API Daily Rate Limit Bucket Cleanup Timer

[Timer]
# Staggered 15 minutes after bmtc-retention.timer's 00:00 (D-09).
# Explicit time avoids the "daily"/"hourly" simultaneous-start footgun
# documented for systemd timers. [CITED: wiki.archlinux.org/title/Systemd/Timers]
OnCalendar=*-*-* 00:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

Update `bmtc-retention.timer` similarly to an explicit `OnCalendar=*-*-* 00:00:00` (currently bare `daily`) so the two timers' relative offset is guaranteed rather than incidental.

### Pattern 3: Backup → destructive step → validate → auto-rollback (DATA-03/DATA-04)

**What:** Every script that performs an irreversible operation takes a restore point first, performs the operation, validates the result, and restores automatically on any failure signal.

**When to use:** `update_gtfs.sh` end-to-end (D-14); `retention_cleanup.sh` does NOT need this pattern — its deletes are bounded by the existing retention windows and are not considered catastrophic/irreversible in the same sense (matches D-05's scope, which has no rollback requirement).

**Example:**
```bash
#!/bin/bash
# Source: pattern synthesized from bash `set -euo pipefail` + trap ERR
# conventions; backup/restore mechanics reused from this repo's existing
# backend/scripts/backup.sh and restore.sh (verified via Read)
set -euo pipefail

NEW_GTFS_ZIP="$1"
DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
BACKUP_DIR="${BMTC_BACKUP_DIR:-/var/lib/bmtc-api/backups}"
LOG_PREFIX="[$(date -Iseconds)] [update-gtfs]"
GTFS_TABLES="agency routes stops trips stop_times calendar gtfs_metadata"

if [ ! -f "$NEW_GTFS_ZIP" ]; then
    echo "$LOG_PREFIX ERROR: GTFS zip not found: $NEW_GTFS_ZIP" >&2
    exit 1
fi

# Step 1: backup (reuse existing script, capture its output filename)
echo "$LOG_PREFIX Taking pre-refresh backup..."
BACKUP_FILE=$("$(dirname "$0")/backup.sh" | grep -oP '(?<=Backup complete: ).*')

# Snapshot pre-refresh row counts for D-13 validation
declare -A BEFORE_COUNTS
for t in $GTFS_TABLES; do
    BEFORE_COUNTS[$t]=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $t;")
done

rollback_and_exit() {
    echo "$LOG_PREFIX VALIDATION FAILED — restoring from $BACKUP_FILE" >&2
    "$(dirname "$0")/restore.sh" "$BACKUP_FILE" "$DB_PATH"
    systemctl start bmtc-api || true
    exit 1
}

# Step 2: stop API (D-15)
echo "$LOG_PREFIX Stopping bmtc-api..."
sudo systemctl stop bmtc-api

# Step 3: clear GTFS tables only (D-11) — order deletes child-before-parent
# defensively even though FKs are unenforced in this DB (see Common Pitfalls).
for t in stop_times trips calendar routes stops agency gtfs_metadata; do
    sqlite3 "$DB_PATH" "DELETE FROM $t;"
done

# Step 4: re-bootstrap (reuses app.gtfs_bootstrap unmodified — verified safe
# for schedule_mean-only upsert, see Summary finding #2)
mkdir -p "$(dirname "${BMTC_GTFS_PATH:-/var/lib/bmtc-api/gtfs}")/bmtc.zip")" 2>/dev/null || true
cp "$NEW_GTFS_ZIP" "${BMTC_GTFS_PATH:-/var/lib/bmtc-api/gtfs}/bmtc.zip"
if ! (cd /opt/bmtc-api/backend && uv run python -m app.bootstrap); then
    rollback_and_exit
fi

# Step 5: row-count sanity check (D-13 — threshold, not exact match)
for t in $GTFS_TABLES; do
    AFTER=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $t;")
    BEFORE=${BEFORE_COUNTS[$t]}
    if [ "$AFTER" -eq 0 ] && [ "$BEFORE" -gt 0 ]; then
        echo "$LOG_PREFIX $t is empty after refresh (was $BEFORE)" >&2
        rollback_and_exit
    fi
    if [ "$BEFORE" -gt 0 ]; then
        DELTA_PCT=$(echo "scale=2; 100 * ($AFTER - $BEFORE) / $BEFORE" | bc | tr -d -)
        if (( $(echo "$DELTA_PCT > 50" | bc -l) )); then
            echo "$LOG_PREFIX $t changed by ${DELTA_PCT}% (before=$BEFORE after=$AFTER) — exceeds 50% threshold" >&2
            rollback_and_exit
        fi
    fi
done

# Step 6: restart API
echo "$LOG_PREFIX Validation passed. Restarting bmtc-api..."
sudo systemctl start bmtc-api
echo "$LOG_PREFIX GTFS refresh complete."
exit 0
```

*(This is a research-stage sketch to establish the pattern and pitfalls — the planner/implementer should treat exact variable names, `bc` invocations, and error paths as a starting point, not a copy-paste-final script.)*

### Anti-Patterns to Avoid

- **Wiring `apply_migrations.sh` into `main.py`'s lifespan startup:** explicitly rejected by D-04. Keep it a manually-invoked, out-of-band step.
- **Writing a bespoke backup mechanism inside `update_gtfs.sh`:** `backup.sh`/`restore.sh` already exist and are exercised in production — reuse them, do not duplicate `.backup`/gzip logic.
- **Exact-match row-count validation:** D-13 explicitly calls this out as wrong for real GTFS updates (routes/stops routinely change slightly between publishes).
- **`DROP TABLE` + `CREATE TABLE` for the GTFS-table clear step:** use `DELETE FROM` instead — dropping and recreating would also drop the indexes defined in `schema.sql` unless the script re-runs the full schema, which is unnecessary churn versus a plain `DELETE FROM`.
- **Hardcoding TTL values in scripts instead of reading `EnvironmentFile` settings:** `rate_limit_cleanup.sh` currently hardcodes `RETENTION_HOURS=24` rather than reading it from a `BMTC_*` setting (there is no `rate_limit_bucket_ttl_hours` field in `config.py` today). This is pre-existing and out of scope to "fix" per CONTEXT.md's boundary (D-07 says "no design decision needed... beyond building what the script already expects"), but `retention_cleanup.sh` MUST follow the config-driven pattern (reading `BMTC_RETENTION_DAYS`/`BMTC_REJECTION_LOG_RETENTION_DAYS` from `EnvironmentFile`) since those settings already exist in `config.py`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite backup/restore mechanics | A new backup routine inside `update_gtfs.sh` | `backend/scripts/backup.sh` / `restore.sh` (existing, working) | Already handles `.backup` + gzip + retention pruning; duplicating this logic risks subtle divergence (e.g. different compression, different `.old` suffix convention) between the hourly-backup path and the GTFS-refresh path |
| GTFS parsing / segment computation | Bash-level CSV/zip parsing for the re-bootstrap step | `uv run python -m app.bootstrap` (existing `app.gtfs_bootstrap.parse_gtfs`) | 410-line, already-tested Python module handles GTFS zip parsing, time-bin computation, and the schedule_mean upsert correctly (verified via Read at `backend/app/gtfs_bootstrap.py:227-346`) — a bash reimplementation would be strictly worse and untested |
| ORM/migration framework | Alembic | Lightweight bash + `schema_migrations` table (D-02) | Explicitly rejected in STATE.md's Key Decisions: "keep deps minimal" |
| Full DB-lock coordination for concurrent writer safety | Custom file-locking around `sqlite3` calls | SQLite WAL mode (already enabled) + the D-09 stagger | WAL already permits concurrent readers during writes; staggering timers by 15 minutes is a belt-and-suspenders measure, not a strict requirement — do not build additional locking machinery |

**Key insight:** Every piece of "hard" logic this phase needs (GTFS parsing, backup/restore, WAL concurrency) already exists and is exercised in production. The actual new work is thin orchestration glue (bash scripts + systemd units) — resist the temptation to make any of the four deliverables more sophisticated than "call the existing tool, check the exit code, log the result."

## Common Pitfalls

### Pitfall 1: Fresh-bootstrap vs. upgrade-path double-application of migrations

**What goes wrong:** `apply_migrations.sh`, run against a DB that was just created fresh from `schema.sql` (which already contains every schema change), tries to re-execute migration `001_*_up.sql` and fails (e.g. "duplicate column name" on an `ALTER TABLE ADD COLUMN`).

**Why it happens:** The `schema_migrations` tracking table starts empty on a brand-new DB, so the diff-against-table logic (D-02) sees every migration file as "not yet applied" — even though `schema.sql` already contains those changes by definition (D-01: "schema.sql is treated as the current baseline going forward").

**How to avoid:** `bootstrap.py`'s `init_db()` (or a small addition to it) must seed `schema_migrations` with every filename found in `migrations/*_up.sql` immediately after applying `schema.sql`, marking them pre-applied. Only a DB that predates a given migration (i.e., was never through this seeding step at that schema version) will have that filename genuinely missing and will execute it for real.

**Warning signs:** `apply_migrations.sh` failing on a machine that was recently freshly bootstrapped rather than upgraded from an older version.

### Pitfall 2: Assuming foreign keys protect the GTFS-table clear step

**What goes wrong:** Planning assumes `DELETE FROM routes` will fail (or needs `PRAGMA foreign_keys=OFF`) because `segments.route_id REFERENCES routes(route_id)`.

**Why it happens:** CLAUDE.md's "Common Gotchas" section states "Foreign keys: Enabled by default" — but `PRAGMA foreign_keys=ON` is never called anywhere in `backend/app/db.py` [VERIFIED: codebase grep, `backend/app/db.py`]. SQLite's actual default is FK enforcement OFF unless a connection explicitly turns it on.

**How to avoid:** The `update_gtfs.sh` clear step can use plain `DELETE FROM <table>;` for each of the 7 GTFS tables with no special FK handling. Still delete child tables before parent tables as defensive style (in case FK enforcement is added in a future phase), but do not add `PRAGMA foreign_keys=OFF` — it doesn't need to be turned off since it was never on.

**Warning signs:** None expected at runtime today; this is a documentation/mental-model correction, not a live bug. Consider flagging the CLAUDE.md inaccuracy as a drive-by doc fix if the plan touches that file anyway.

### Pitfall 3: `update_gtfs.sh` running as the `bmtc` user cannot control `bmtc-api.service`

**What goes wrong:** `systemctl stop bmtc-api` / `systemctl start bmtc-api` inside `update_gtfs.sh` fails with a permission error when the script is executed as the non-root `bmtc` system user (the same user all other operational scripts and services run as, per `docs/deploy.md`'s `useradd -r ...bmtc` and every `deploy/*.service`'s `User=bmtc`).

**Why it happens:** A non-root systemd-managed user has no default permission to control units other than ones it directly owns; `restore.sh` already calls `systemctl stop/start bmtc-api` unguarded (line 23, 30) which only works today because `restore.sh` is invoked manually by a human with `sudo`/root, not automatically. `update_gtfs.sh` is D-10's "operator hands the script a local zip" workflow — also human-triggered, but this needs to be an explicit documented requirement, not an assumption.

**How to avoid:** Document (in `docs/deploy.md`) that `update_gtfs.sh` must be run with `sudo`, OR add a scoped `/etc/sudoers.d/bmtc-gtfs-update` drop-in granting exactly:
```
bmtc ALL=(root) NOPASSWD: /usr/bin/systemctl stop bmtc-api, /usr/bin/systemctl start bmtc-api
```
[CITED: til.simonwillison.net/linux/allow-sudo-without-password-specific-command] Each command+argument pair must be listed explicitly — sudoers does not glob `systemctl * bmtc-api`. This must be flagged as a manual deploy-config step (adding a sudoers file is not something `apply_migrations.sh`/git can automate) — recommend a `checkpoint:human-verify` task in the plan for "confirm sudoers/sudo access is configured on the target host before `update_gtfs.sh` is first run in production."

**Warning signs:** `update_gtfs.sh` exits with "Failed to stop bmtc-api.service: Access denied" the first time it's run in production if this isn't addressed ahead of time.

### Pitfall 4: Simultaneous timer start under bare `daily`/`hourly` OnCalendar values

**What goes wrong:** `bmtc-retention.timer` (currently bare `OnCalendar=daily`) and a naively-added `bmtc-rate-limit-cleanup.timer` (also bare `daily`) fire at the exact same instant (midnight), both hitting the SQLite file concurrently.

**Why it happens:** systemd's named calendar shortcuts (`daily`, `hourly`, `weekly`) all resolve to the same fixed instant for every timer using them [CITED: wiki.archlinux.org/title/Systemd/Timers].

**How to avoid:** D-09 already locks the resolution — give the two timers distinct explicit `OnCalendar=*-*-* HH:MM:SS` values (e.g. `00:00:00` and `00:15:00`) rather than both using bare `daily`. WAL mode would tolerate simultaneous writes correctly regardless, so this is defense-in-depth, not a correctness fix.

**Warning signs:** `journalctl` showing both `bmtc-retention.service` and `bmtc-rate-limit-cleanup.service` starting within the same second.

### Pitfall 5: Row-count validation threshold too tight or checking the wrong tables

**What goes wrong:** Validation compares against an exact row count, or accidentally includes `segments`/`segment_stats` in the "must not shrink" check, causing every legitimate GTFS refresh to trigger a false-positive rollback.

**Why it happens:** GTFS publishers routinely add/remove a handful of routes, stops, or trips between feed versions — a `>50%` delta threshold (D-13) is deliberately generous to avoid false alarms, and D-13 explicitly scopes validation to only the 7 GTFS-source tables, not `segments`/`segment_stats` (which are append-only per D-12 and expected to only ever grow, never shrink, across a refresh).

**How to avoid:** Only validate `agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`, `gtfs_metadata` against the before/after row counts; use a `>50%` delta as the rollback trigger (both directions — a table going to zero unexpectedly, or growing/shrinking by more than half).

**Warning signs:** `update_gtfs.sh` rolling back on every run despite the new GTFS file being valid.

## Code Examples

### Retention cleanup script skeleton (DATA-02/03)

```bash
#!/bin/bash
# Source: pattern replicated directly from backend/scripts/rate_limit_cleanup.sh
# (verified via Read — same log-prefix, before/after-count, set -euo pipefail style)
set -euo pipefail

DB_PATH="${BMTC_DB_PATH:-/var/lib/bmtc-api/bmtc.db}"
RETENTION_DAYS="${BMTC_RETENTION_DAYS:-90}"
REJECTION_LOG_RETENTION_DAYS="${BMTC_REJECTION_LOG_RETENTION_DAYS:-30}"
LOG_PREFIX="[$(date -Iseconds)] [retention-cleanup]"

if [[ ! -f "$DB_PATH" ]]; then
    echo "$LOG_PREFIX ERROR: Database not found at $DB_PATH" >&2
    exit 1
fi

echo "$LOG_PREFIX Starting retention cleanup..."

# 1. ride_segments older than retention window
BEFORE_SEGMENTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ride_segments;")
sqlite3 "$DB_PATH" "DELETE FROM ride_segments WHERE timestamp_utc < strftime('%s','now') - ($RETENTION_DAYS * 86400);"
AFTER_SEGMENTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ride_segments;")
echo "$LOG_PREFIX ride_segments: $BEFORE_SEGMENTS -> $AFTER_SEGMENTS"

# 2. orphaned rides (DATA-03 fix) — zero remaining ride_segments
BEFORE_RIDES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rides;")
sqlite3 "$DB_PATH" "DELETE FROM rides WHERE NOT EXISTS (SELECT 1 FROM ride_segments WHERE ride_id = rides.id);"
AFTER_RIDES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rides;")
echo "$LOG_PREFIX rides (orphan cleanup): $BEFORE_RIDES -> $AFTER_RIDES"

# 3. rejection_log older than its retention window (drive-by fix, D-05)
BEFORE_REJECTIONS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rejection_log;")
sqlite3 "$DB_PATH" "DELETE FROM rejection_log WHERE submitted_at < strftime('%s','now') - ($REJECTION_LOG_RETENTION_DAYS * 86400);"
AFTER_REJECTIONS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM rejection_log;")
echo "$LOG_PREFIX rejection_log: $BEFORE_REJECTIONS -> $AFTER_REJECTIONS"

echo "$LOG_PREFIX Retention cleanup complete."
exit 0
```

*(Note: exact column names for `rides`'s primary key and `ride_segments.ride_id`/`rejection_log.submitted_at` should be confirmed against `schema.sql` at implementation time — the CONTEXT.md decision already specifies the `NOT EXISTS` join condition and both TTL columns exist in `config.py` today: `retention_days`, `rejection_log_retention_days`.)*

### Testing pattern (subprocess against the existing `temp_db` fixture)

```python
# Source: pattern extends backend/tests/conftest.py's existing `temp_db` fixture
# (verified via Read — file-based tempfile.mkstemp DB, not :memory:, because
# a subprocess needs a real file path to open)
import subprocess

def test_retention_cleanup_removes_orphaned_rides(temp_db):
    db_path, conn = temp_db
    # ... seed a ride with all its ride_segments past the retention window ...
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Inline `sqlite3` DELETE in `bmtc-retention.service`'s `ExecStart` | Dedicated `retention_cleanup.sh` script invoked by `ExecStart` | This phase (D-06) | Enables the 3-way ordered delete (ride_segments → rides → rejection_log), testable in isolation, matching `rate_limit_cleanup.sh`'s already-established pattern |
| Ad-hoc guarded `ALTER TABLE` in `db.py:21-26` for one-off column additions | `schema_migrations`-tracked versioned SQL scripts (D-02) | This phase (DATA-01) | Future schema changes get a reviewable, ordered, re-runnable script instead of inline Python patching `init_db()` |
| `rate_limit_buckets` growing unboundedly (no cleanup ever scheduled) | Daily `bmtc-rate-limit-cleanup.timer` | This phase (DATA-02) | Bounds table size; script already existed and worked, just wasn't scheduled |
| No GTFS refresh path (manual re-bootstrap only, undocumented risk to `segment_stats`) | `update_gtfs.sh` with backup/validate/rollback | This phase (DATA-04) | Turns a risky manual operation into a scripted, auditable, self-healing-on-failure one |

**Deprecated/outdated:**
- The `backend/app/migrations/003_*`/`004_*` files: superseded by direct `schema.sql` edits before any runner existed; archived per D-01, not deleted (historical record).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A scoped sudoers `NOPASSWD` entry (rather than polkit) is the simplest correct fix for the `bmtc` user's `systemctl stop/start bmtc-api` permission gap | Common Pitfalls / Security Domain | Low — this is standard, widely-documented Linux ops practice [CITED: til.simonwillison.net], but the exact sudoers syntax should be tested on the actual target OS/sudo version during implementation, not assumed to work verbatim |
| A2 | No project-specific reason exists to prefer polkit over sudoers for this single-server deployment | Standard Stack (Alternatives Considered) | Low — if the deploy target already uses polkit for other privilege delegation, that convention should be followed instead for consistency; not verified against the actual production host in this research pass |

**If this table is empty:** N/A — two low-risk assumptions logged above; everything else in this research (migration pattern, FK-enforcement finding, `schedule_mean`-only upsert behavior, existing script/unit contents) was verified directly by reading the codebase.

## Open Questions

1. **Should `apply_migrations.sh` be called automatically from `bootstrap.py`, or purely documented as a manual `docs/deploy.md` step?**
   - What we know: D-04 locks that it must NOT run from `main.py`'s app-startup lifespan. CONTEXT.md's "Claude's Discretion" section leaves the exact invocation point (bootstrap.py vs. docs-only) open.
   - What's unclear: Whether the planner should add one line to `bootstrap.py`'s `main()` (`subprocess.run(["bash", "apply_migrations.sh"])` before `init_db()`) or leave it as a separate, documented deploy-sequence step.
   - Recommendation: Keep them separate — `bootstrap.py` is for *fresh* installs (schema.sql already has everything); `apply_migrations.sh` is for *upgrading an existing* DB. Document both paths explicitly in `docs/deploy.md`'s upgrade section rather than conflating them in one script, to avoid the fresh-vs-upgrade seeding confusion described in Pitfall 1.

2. **Does the target production host already have a sudoers/polkit convention for other privilege delegation?**
   - What we know: `restore.sh` already calls `systemctl stop/start bmtc-api` today with no visible sudoers setup in the repo — meaning either it has never actually been run automated in production, or an out-of-repo sudoers config already exists.
   - What's unclear: Whether a sudoers entry already exists on the real production host (outside this repo) that would already cover `update_gtfs.sh`'s needs.
   - Recommendation: Add a `checkpoint:human-verify` task in the plan asking the operator to confirm/add the sudoers entry before the first production run of `update_gtfs.sh`, rather than assuming either state.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `bash` | All 4 scripts | ✓ (used by all existing `backend/scripts/*.sh`) | system | — |
| `sqlite3` CLI | All 4 scripts | ✓ (used by `backup.sh`, `rate_limit_cleanup.sh`, `health_check.sh`) | system | — |
| `gzip` | `update_gtfs.sh` (via `backup.sh`) | ✓ (used by `backup.sh` today) | system | — |
| `bc` | `update_gtfs.sh` row-count delta math | ✓ (documented dependency of `health_check.sh`) | system | Python one-liner via `uv run python -c` if `bc` is ever unavailable on a target host |
| `systemd` (`systemctl`, timers) | DATA-02/03 timers, `update_gtfs.sh`'s service stop/start | ✓ (existing `bmtc-api.service`, `bmtc-backup.timer`, `bmtc-retention.timer` already deployed) | system | — |
| `sudo` + sudoers config for `bmtc` user | `update_gtfs.sh`'s `systemctl stop/start bmtc-api` | ✗ (not present in repo; must be configured on target host — see Pitfall 3) | — | Run `update_gtfs.sh` manually as root instead of as the `bmtc` user, if sudoers config is not set up |

**Missing dependencies with no fallback:** None — all missing items have a documented fallback (manual root execution) or are a one-time host-config task, not a hard blocker.

**Missing dependencies with fallback:**
- sudoers entry for `bmtc` → `systemctl stop/start bmtc-api`: fallback is running `update_gtfs.sh` as root directly (`sudo bash update_gtfs.sh ...`) until the sudoers drop-in is added.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 7.4.3 (existing) |
| Config file | `backend/pyproject.toml` (existing `[dependency-groups] dev` block) |
| Quick run command | `cd backend && uv run pytest tests/test_migrations.py tests/test_retention_cleanup.py tests/test_gtfs_update.py -v` (new test files — do not yet exist) |
| Full suite command | `cd backend && uv run pytest -n auto --dist loadfile -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | `apply_migrations.sh` applies a pending migration exactly once, is a no-op on re-run, and correctly seeds `schema_migrations` on a fresh bootstrap (Pitfall 1) | integration (subprocess against `temp_db`) | `uv run pytest tests/test_migrations.py -x` | ❌ Wave 0 |
| DATA-02 | `rate_limit_cleanup.sh` deletes buckets older than TTL (already covered indirectly?) + new systemd unit files exist and parse | unit (script) + static (unit file syntax) | `uv run pytest tests/test_rate_limit_cleanup_script.py -x`; `systemd-analyze verify deploy/bmtc-rate-limit-cleanup.service` | ❌ Wave 0 (script test); unit-file verify is a manual/CI step, not pytest |
| DATA-03 | `retention_cleanup.sh` deletes `ride_segments` past TTL, deletes `rides` with zero remaining segments, deletes `rejection_log` past TTL, in that order, in one script run | integration (subprocess against `temp_db`, seeded with orphan/non-orphan rides) | `uv run pytest tests/test_retention_cleanup.py -x` | ❌ Wave 0 |
| DATA-04 | `update_gtfs.sh` completes backup→stop→clear→re-bootstrap→validate→restart on a passing GTFS zip, and backup→stop→clear→re-bootstrap→validate-FAIL→rollback→restart on a corrupt/empty GTFS zip, without touching `segment_stats`/`rides`/`ride_segments` row counts | integration (subprocess, small synthetic GTFS zip fixture) | `uv run pytest tests/test_gtfs_update.py -x` | ❌ Wave 0 |

*Note: `systemctl stop/start bmtc-api` calls inside `update_gtfs.sh` should be mockable/skippable in the test environment (e.g. via a `BMTC_SKIP_SERVICE_CONTROL=1` env escape hatch, or by not actually having a `bmtc-api.service` unit installed in CI/dev, causing `systemctl stop bmtc-api` to fail — the test harness will need to either stub this call or run the script in a mode that tolerates its absence).*

### Sampling Rate

- **Per task commit:** `cd backend && uv run pytest tests/test_migrations.py tests/test_retention_cleanup.py tests/test_gtfs_update.py tests/test_rate_limit_cleanup_script.py -v`
- **Per wave merge:** `cd backend && uv run pytest -n auto --dist loadfile -q`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_migrations.py` — covers DATA-01 (apply, no-op re-run, fresh-bootstrap seeding)
- [ ] `backend/tests/test_retention_cleanup.py` — covers DATA-03 (and the `ride_segments`/`rejection_log` portions of DATA-02's sibling script)
- [ ] `backend/tests/test_rate_limit_cleanup_script.py` — covers DATA-02's script behavior directly (the existing `rate_limit_cleanup.sh` has never had a subprocess-level test written against it)
- [ ] `backend/tests/test_gtfs_update.py` — covers DATA-04, needs a small synthetic GTFS zip fixture (a handful of stops/routes/trips, not the real 1.46M-row `stop_times` feed) plus a way to stub `systemctl` calls
- [ ] A tiny synthetic GTFS fixture zip (e.g. `backend/tests/fixtures/mini_gtfs.zip`) for `test_gtfs_update.py` — the real `gtfs/bmtc.zip` is too large/slow for a unit test and shouldn't be re-parsed in CI just to test the shell orchestration

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase adds no API endpoints |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | Scope the `bmtc` user's elevated privilege to the exact `systemctl stop bmtc-api` / `systemctl start bmtc-api` commands only, via a sudoers drop-in with fully-qualified paths and no wildcards — least-privilege principle (see Common Pitfalls Pitfall 3) |
| V5 Input Validation | Yes | `update_gtfs.sh`'s `$1` argument (path to GTFS zip) must be validated: reject if the file doesn't exist, reject if it's not a valid zip (e.g. `unzip -t` or `file` check) before it's copied into `$BMTC_GTFS_PATH` and handed to `app.bootstrap`, which will otherwise fail deep inside GTFS parsing with a less clear error |
| V6 Cryptography | No | No new cryptographic operations; `backup.sh`'s gzip is compression, not encryption — backups should already be protected by filesystem permissions on `/var/lib/bmtc-api/backups`, unchanged by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via `$1` (GTFS zip path) interpolated unsanitized into shell commands | Tampering | Always quote `"$NEW_GTFS_ZIP"`; avoid `eval`; validate the path is a regular file before use (matches existing `backup.sh`/`restore.sh` argument-handling style, which already quotes all path variables) |
| Privilege escalation via an overly broad sudoers rule (e.g. `bmtc ALL=(root) NOPASSWD: /usr/bin/systemctl *`) | Elevation of Privilege | Scope the sudoers rule to the two exact command+argument strings needed (`systemctl stop bmtc-api`, `systemctl start bmtc-api`) — never a wildcard `systemctl *` rule, which would let a compromised `bmtc` account control or stop arbitrary system services |
| Denial of service via a malformed/oversized GTFS zip that hangs `app.bootstrap`'s `stop_times` parse (1.46M-row scale operation) | Denial of Service | Not newly introduced by this phase (pre-existing bootstrap behavior) — but `update_gtfs.sh`'s auto-rollback-on-any-failure (D-14) already bounds the blast radius: if `app.bootstrap` exits non-zero or the row-count check fails, the pre-refresh backup is restored and `bmtc-api` is brought back up rather than being left down indefinitely |
| Backup file left world-readable, exposing ride/device data | Information Disclosure | Not new to this phase — `backup.sh`'s existing output directory permissions govern this; `update_gtfs.sh` should write its pre-refresh backup to the same `$BMTC_BACKUP_DIR` (inheriting existing permission conventions) rather than a new, potentially misconfigured location |

## Sources

### Primary (HIGH confidence)
- `backend/scripts/rate_limit_cleanup.sh`, `backup.sh`, `restore.sh`, `README.md` — read directly, verified working reference patterns
- `backend/deploy/bmtc-retention.service`/`.timer`, `bmtc-backup.service`/`.timer`, `bmtc-api.service` — read directly
- `backend/app/db.py`, `backend/app/schema.sql`, `backend/app/gtfs_bootstrap.py`, `backend/app/bootstrap.py`, `backend/app/config.py` — read directly (source of the FK-enforcement finding and the `schedule_mean`-only-upsert finding)
- `backend/tests/conftest.py` — read directly (source of the `temp_db` fixture pattern recommended for Validation Architecture)
- `.planning/phases/04-data-management/04-CONTEXT.md` — all 15 locked decisions (D-01 through D-15)
- `.planning/codebase/CONCERNS.md`, `.planning/codebase/INTEGRATIONS.md`, `NEXT_STEPS.md` — confirmed problem statements and pre-existing design intent for `update_gtfs.sh`

### Secondary (MEDIUM confidence)
- [ArchWiki: systemd/Timers](https://wiki.archlinux.org/title/Systemd/Timers) — OnCalendar staggering, RandomizedDelaySec
- [Simon Willison's TIL: sudo without password for specific command](https://til.simonwillison.net/linux/allow-sudo-without-password-specific-command) — sudoers NOPASSWD scoping syntax
- [github.com/simonw/sqlite-migrate](https://github.com/simonw/sqlite-migrate) — schema_migrations-style tracking table precedent in a real, actively-used SQLite migration tool

### Tertiary (LOW confidence)
- General web search results on "backup → destructive change → validate → rollback" bash scripting — no single canonical source found; the pattern documented here is synthesized from general `set -euo pipefail` + trap conventions and cross-checked against this repo's own `restore.sh` mechanics rather than an external authority

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, entirely modeled on working code already in this repo
- Architecture: HIGH — migration pattern and timer pairing corroborated by both existing repo patterns and external sources; GTFS refresh pipeline verified safe via direct read of `gtfs_bootstrap.py`'s upsert logic
- Pitfalls: HIGH for FK-enforcement and schedule_mean findings (directly verified via codebase grep/read); MEDIUM for the sudoers/systemctl permission gap (standard practice, but not verified against the actual production host's current sudoers state — flagged as Open Question 2)

**Research date:** 2026-07-03
**Valid until:** 2026-08-02 (30 days — stable domain: bash/sqlite3/systemd are mature, slow-moving tools; re-verify if the target deploy host's sudoers/polkit configuration changes, or if a real BMTC GTFS feed URL becomes available and D-10's manual-path-only scope is revisited)

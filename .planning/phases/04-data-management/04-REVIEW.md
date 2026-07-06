---
phase: 04-data-management
reviewed: 2026-07-04T04:18:44Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - backend/app/db.py
  - backend/app/migrations/archive/003_rate_limit_down.sql
  - backend/app/migrations/archive/003_rate_limit_up.sql
  - backend/app/migrations/archive/004_idempotency_bodyhash_down.sql
  - backend/app/migrations/archive/004_idempotency_bodyhash_up.sql
  - backend/deploy/bmtc-rate-limit-cleanup.service
  - backend/deploy/bmtc-rate-limit-cleanup.timer
  - backend/deploy/bmtc-retention.service
  - backend/deploy/bmtc-retention.timer
  - backend/scripts/apply_migrations.sh
  - backend/scripts/retention_cleanup.sh
  - backend/scripts/update_gtfs.sh
  - backend/tests/fixtures/make_mini_gtfs.py
  - backend/tests/fixtures/mini_gtfs.zip
  - backend/tests/test_gtfs_update.py
  - backend/tests/test_migrations.py
  - backend/tests/test_rate_limit_cleanup_script.py
  - backend/tests/test_retention_cleanup.py
  - docs/deploy.md
findings:
  critical: 3
  warning: 7
  info: 4
  total: 14
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-07-04T04:18:44Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

This phase adds a versioned SQL migration runner (`apply_migrations.sh` + `schema_migrations` seeding in `db.py`), a data-retention cleanup script, a rate-limit-bucket cleanup timer, and a GTFS-refresh orchestrator (`update_gtfs.sh`) with backup/rollback. The individual pieces are well-commented and the happy-path test coverage (subprocess-driven, against real SQLite files) is solid.

The main concerns are operational-safety gaps in the two scripts that touch production data destructively:

1. `update_gtfs.sh`'s "auto-rollback" (D-14) only fires on the handful of `if`-checked failure paths it explicitly anticipated. Any other command failure after the service is stopped (missing `bc`, a locked DB, a transient `sqlite3` error) exits via `set -e` with the service left stopped and no restart — a bigger outage than the failure that triggered it.
2. `retention_cleanup.sh` performs unconditional, irreversible `DELETE`s driven entirely by unvalidated environment variables (`BMTC_RETENTION_DAYS`, `BMTC_REJECTION_LOG_RETENTION_DAYS`). A misconfigured negative value silently deletes far more than intended.
3. `update_gtfs.sh` takes its pre-refresh backup *before* stopping the service, so ride submissions accepted in that window are lost if the run later rolls back.

These are all script-level, ops-triggered issues rather than request-path bugs, but each can cause data loss or an unplanned outage in production, so they are flagged as blockers. Documentation (`docs/deploy.md`) also drifted: the new rate-limit-cleanup timer isn't wired into the install steps, and the sample env file still lists env vars removed in LEARN-01 while omitting the new retention knob added by this phase.

## Critical Issues

### CR-01: `update_gtfs.sh` has no safety net for unanticipated failures — the service can be left stopped forever

**File:** `backend/scripts/update_gtfs.sh:26,116-160`
**Issue:** `set -euo pipefail` (line 26) means any command that fails between "stop bmtc-api" (line 117) and "restart bmtc-api" (line 164) terminates the script immediately. `rollback_and_exit` is only invoked from three explicit `if` checks (re-bootstrap failure at line 136, empty-table check at line 149, delta-threshold check at line 157). It is **not** wired up as a global trap, so any other failure in that window — `bc` not installed (used at line 153/155), a transient `sqlite3 "database is locked"` error, disk full during `cp` (line 132), etc. — causes the script to exit via `set -e` with `bmtc-api` still stopped and **no rollback, no restart**. This defeats the documented "auto-rollback (D-14)" guarantee and turns a transient failure into an unplanned outage that requires manual intervention to fix.
**Fix:**
```bash
# Right after the pre-refresh backup succeeds (after line 106), before
# stopping the service:
trap 'rollback_and_exit' ERR

# and inside rollback_and_exit, disable the trap first to avoid
# re-entrant firing while restore.sh itself runs:
rollback_and_exit() {
    trap - ERR
    echo "$LOG_PREFIX VALIDATION FAILED -- restoring pre-refresh backup from $BACKUP_FILE" >&2
    ...
}
```

### CR-02: `retention_cleanup.sh` performs irreversible deletes with no validation of its retention-window inputs

**File:** `backend/scripts/retention_cleanup.sh:20-22,35,50`
**Issue:** `RETENTION_DAYS` and `REJECTION_LOG_RETENTION_DAYS` are read straight from environment variables (`BMTC_RETENTION_DAYS`, `BMTC_REJECTION_LOG_RETENTION_DAYS`) with no numeric/range validation before being interpolated into `DELETE ... WHERE timestamp_utc < strftime('%s','now') - ($RETENTION_DAYS * 86400)`. If an operator ever sets one of these to a negative number (e.g. a typo `BMTC_RETENTION_DAYS=-90`, or a sign flip during a config refactor), the threshold shifts into the *future*, and the `DELETE` removes essentially **all** rows in `ride_segments` / `rejection_log` — permanently destroying the crowd-sourced learning history this whole project exists to build. A non-numeric value (e.g. `"90 days"`) also produces silently-wrong arithmetic rather than a clear failure. This runs unattended, daily, via `bmtc-retention.timer`, so there is no human in the loop to catch a bad value before data is gone.
**Fix:**
```bash
RETENTION_DAYS="${BMTC_RETENTION_DAYS:-90}"
REJECTION_LOG_RETENTION_DAYS="${BMTC_REJECTION_LOG_RETENTION_DAYS:-30}"

for var_name in RETENTION_DAYS REJECTION_LOG_RETENTION_DAYS; do
    value="${!var_name}"
    if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ]; then
        echo "$LOG_PREFIX ERROR: $var_name must be a positive integer, got '$value'" >&2
        exit 1
    fi
done
```

### CR-03: `update_gtfs.sh` backs up before stopping the service — a rollback can silently lose rides submitted in that window

**File:** `backend/scripts/update_gtfs.sh:97-117`
**Issue:** The pre-refresh backup (Step 1, lines 97-106) is taken while `bmtc-api` is still running and accepting `POST /v1/ride_summary`. The service is only stopped afterwards (Step 2, line 117). Any ride accepted between the backup snapshot and the service stop is committed to the live DB but absent from the backup. If validation later fails (Step 5) and `rollback_and_exit` restores that backup, those ride submissions are silently discarded — a real, if narrow, data-loss window on the one code path whose entire purpose is to be a safety net.
**Fix:** Either stop the service before taking the backup (accepting a longer outage), or re-run `backup.sh` immediately before `restore.sh` inside `rollback_and_exit` so the restore path always captures writes accepted after the original backup:
```bash
rollback_and_exit() {
    echo "$LOG_PREFIX VALIDATION FAILED -- restoring pre-refresh backup from $BACKUP_FILE" >&2
    # Service is already stopped at this point (Step 2), so no further
    # writes can occur once we get here; the only real fix is stopping
    # the service BEFORE the Step 1 backup so BACKUP_FILE is guaranteed
    # to reflect the exact state we resume from.
    ...
}
```

## Warnings

### WR-01: `init_db()` does not guarantee connection cleanup on failure

**File:** `backend/app/db.py:9-65`
**Issue:** `get_connection()` was deliberately hardened (BUGFIX-01, see its docstring) to close the connection on every exit path via `try`/`finally`. `init_db()` has no equivalent: if `conn.executescript(schema)` (line 20), the `ALTER TABLE` (line 27), or the migration-seeding block (lines 36-49) raises, `conn.close()` (line 65) is never reached and the sqlite3 connection object (and its underlying WAL/journal file handles) leaks. This is lower-risk than the request-path case since `init_db()` runs once at startup, but it's an inconsistent application of a pattern the codebase already established as important.
**Fix:**
```python
def init_db(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        ...
        conn.commit()
    finally:
        conn.close()
```

### WR-02: Guarded-ALTER pattern covers `response_body` but not `body_hash` — a latent gap for any DB that predates it

**File:** `backend/app/db.py:22-27`
**Issue:** The comment explains this guard exists specifically because `CREATE TABLE IF NOT EXISTS` is a no-op against an already-existing table, so a DB created before `response_body` was added to `schema.sql` would never get the column without this explicit check-and-`ALTER`. The exact same problem applies to `idempotency_keys.body_hash` (added for the H1 tampering fix, `schema.sql:210`) — but there is no guarded `ALTER TABLE ... ADD COLUMN body_hash` for it. Per commit `41e3b26`, no currently-deployed DB is missing this column today (it was baked into `schema.sql` before any runner ever executed the archived migration), so this is not an active incident — but it is a landmine: the very next time a genuinely-legacy DB needs a similar column added, the codebase has one correct example (`response_body`) and one incorrect one (`body_hash`) to imitate, and future authors are as likely to copy the broken pattern as the working one.
**Fix:** Add the same guard used for `response_body`:
```python
if "body_hash" not in existing_cols:
    conn.execute("ALTER TABLE idempotency_keys ADD COLUMN body_hash TEXT")
```

### WR-03: `apply_migrations.sh` is not resilient to a partially-applied migration, and interpolates filenames unescaped into SQL

**File:** `backend/scripts/apply_migrations.sh:34-46`
**Issue:** Two related gaps:
1. `name="$(basename "$f")"` is spliced directly into `WHERE filename = '$name'` (line 38) and `VALUES ('$name')` (line 43) without any escaping. A filename containing a single quote breaks the query (or worse). The trust boundary here is "developer adds a file to the repo," which is low risk today, but the pattern is unsafe by construction.
2. Migrations are applied with `sqlite3 "$DB_PATH" < "$f"` (line 42) and only marked as applied *after* that succeeds. But nothing guarantees the `.sql` file itself is atomic — e.g. `004_idempotency_bodyhash_up.sql` runs a raw `ALTER TABLE` followed by a `CREATE INDEX IF NOT EXISTS` with no surrounding `BEGIN`/`COMMIT`. If the `ALTER TABLE` succeeds but a later statement in the same file fails, `set -e` aborts the whole runner without recording the migration as applied. The *next* invocation re-runs the same file from the top, and the already-applied `ALTER TABLE ADD COLUMN` now fails with "duplicate column name" — permanently wedging the runner for every migration after that point until someone manually intervenes.
**Fix:** Require (and document) that every `*_up.sql` file wraps its body in `BEGIN TRANSACTION; ... COMMIT;` (as `003_rate_limit_up.sql` already does) so a mid-file failure never leaves partial state; and quote/parameterize the filename comparison, e.g. via a `sqlite3 -batch -bail` invocation using `.param` or a bind-safe wrapper instead of string interpolation.

### WR-04: `docs/deploy.md` setup steps never install the new rate-limit-cleanup timer

**File:** `docs/deploy.md:56-66`
**Issue:** Step 5 ("Install systemd services") copies `bmtc-api.service`, `bmtc-backup.{service,timer}`, and `bmtc-retention.{service,timer}`, but never mentions `bmtc-rate-limit-cleanup.service` / `bmtc-rate-limit-cleanup.timer` (added by this phase, DATA-02). A fresh production deployment that follows this guide end-to-end will never enable rate-limit bucket cleanup, so `rate_limit_buckets` grows unbounded exactly as this phase set out to prevent.
**Fix:** Add to Step 5:
```bash
sudo cp deploy/bmtc-rate-limit-cleanup.{service,timer} /etc/systemd/system/
...
sudo systemctl enable --now bmtc-rate-limit-cleanup.timer
```

### WR-05: `docs/deploy.md` sample env file is stale — lists removed vars, omits a new one

**File:** `docs/deploy.md:33-47`
**Issue:** The Step 3 `/etc/bmtc-api/env` template still sets `BMTC_EMA_ALPHA=0.1` and `BMTC_HALF_LIFE_DAYS=30` (line 39-40), both of which were removed from `Settings` in LEARN-01 per `CLAUDE.md` — setting them now has zero effect and misleads operators into thinking EMA is still tunable/active. Conversely, the template omits `BMTC_REJECTION_LOG_RETENTION_DAYS`, the new retention knob this phase introduces for `rejection_log` (used by `retention_cleanup.sh:22` and `config.py`'s `rejection_log_retention_days`), so operators following the doc won't know it exists (it does have a safe default of 30, but per CR-02 above, undocumented tunables that feed directly into destructive deletes deserve explicit documentation).
**Fix:** Remove the two dead `BMTC_EMA_ALPHA`/`BMTC_HALF_LIFE_DAYS` lines and add `BMTC_REJECTION_LOG_RETENTION_DAYS=30` to the sample env block.

### WR-06: New maintenance systemd units skip the project's documented sandboxing directives

**File:** `backend/deploy/bmtc-rate-limit-cleanup.service:1-9`, `backend/deploy/bmtc-retention.service:1-9`
**Issue:** `.claude/CLAUDE.md`'s Infrastructure section documents `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, and `ProtectHome` as the hardening convention for services running as the `bmtc` user. Both new oneshot units run as `User=bmtc`/`Group=bmtc` and execute a script that runs arbitrary `sqlite3` DDL/DML against the production DB, but neither sets any of those directives, leaving them with a larger attack/blast-radius surface than the convention the rest of the deployment aims for.
**Fix:**
```ini
[Service]
Type=oneshot
User=bmtc
Group=bmtc
EnvironmentFile=/etc/bmtc-api/env
ExecStart=/opt/bmtc-api/scripts/retention_cleanup.sh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/bmtc-api
```

### WR-07: `update_gtfs.sh`'s row-count check depends on `bc` with no upfront dependency check

**File:** `backend/scripts/update_gtfs.sh:153-155`
**Issue:** `DELTA_PCT=$(echo "scale=2; ..." | bc)` and the subsequent `bc -l` comparison assume `bc` is installed. Unlike `unzip`/`sqlite3` (used earlier, so a missing binary fails fast at Step 0/1 before any destructive action), `bc` is only exercised at Step 5 — after the service has been stopped and the GTFS tables cleared and repopulated. A host without `bc` fails here, and per CR-01, that failure is not routed through `rollback_and_exit`, compounding the outage risk.
**Fix:** Check for `bc` alongside the other prerequisite checks at the top of the script (Step 0), before any side effect occurs:
```bash
for bin in unzip sqlite3 bc; do
    command -v "$bin" >/dev/null 2>&1 || { echo "$LOG_PREFIX ERROR: required command '$bin' not found" >&2; exit 1; }
done
```

## Info

### IN-01: Archived `004_idempotency_bodyhash_down.sql` recreates a stale 3-column table

**File:** `backend/app/migrations/archive/004_idempotency_bodyhash_down.sql:10-18`
**Issue:** The rollback recreates `idempotency_keys` with only `key, submitted_at, response_hash` — the shape the table had before *both* `body_hash` and `response_body` (added later by BUGFIX-03) existed. If this archived script were ever actually executed against the current schema, it would silently drop `response_body` data too, not just `body_hash`. Harmless today since the file is archived/dead (per commit `41e3b26`, never executed by any runner and superseded by `schema.sql`), but worth a comment noting it's stale relative to the current table shape so nobody resurrects it as-is.
**Fix:** Add a header comment noting the rollback predates `response_body` and would need updating before any real use, or delete the archived `_down.sql` files entirely if they're guaranteed never to run.

### IN-02: Non-portable `tr -d -` in `update_gtfs.sh`

**File:** `backend/scripts/update_gtfs.sh:154`
**Issue:** `ABS_DELTA_PCT=$(echo "$DELTA_PCT" | tr -d -)` relies on a bare, unquoted `-` as `tr`'s delete-set argument. This works with GNU `tr` but is fragile — some `tr` implementations/argument parsers treat a lone `-` as "read from stdin" or emit a usage error.
**Fix:** Quote the character class explicitly: `tr -d '-'`.

### IN-03: Count queries swallow real DB errors as "0"

**File:** `backend/scripts/retention_cleanup.sh:34,36,43,45,49,51`
**Issue:** The `BEFORE_*`/`AFTER_*` count queries use `... 2>&1 || echo "0"`, which means a genuine failure (locked DB, corrupted table, permission error) is logged as a plausible-looking `0` instead of a visible error. Because these counts are logging-only (the actual `DELETE` statements below aren't guarded this way and will still fail loudly under `set -e`), this doesn't hide the failure entirely, but it does make the printed before/after summary misleading when something does go wrong. `rate_limit_cleanup.sh` (out of scope, unchanged) uses the same pattern, so this is a pre-existing idiom this phase perpetuated into `retention_cleanup.sh` rather than something newly introduced.
**Fix:** Drop the `2>&1 || echo "0"` fallback for the count queries, or at minimum use a distinct sentinel value (e.g. `"ERR"`) instead of `"0"` so a real failure doesn't read like a legitimate empty table.

### IN-04: `retention_cleanup.sh`'s orphan-cleanup comment overstates its own invariant

**File:** `backend/scripts/retention_cleanup.sh:39-42`
**Issue:** The comment claims "a ride only reaches zero segments after all its segments aged out in step 1," used to justify skipping a separate age gate on the `rides` orphan-delete. This is only true if every ride submission is guaranteed to insert at least one `ride_segments` row (even rejected ones). If some future/edge submission path ever creates a `rides` row with zero `ride_segments` (e.g. a request rejected before any segment row is written), that ride would be deleted on the very next daily run regardless of age, silently contradicting the stated invariant. Not a bug against current behavior as far as this review can confirm (routes.py insert path is out of scope here), but the comment asserts more than the query itself guarantees.
**Fix:** Either verify and cross-reference the invariant against `routes.py`'s ride-insertion path, or soften the comment to describe what the query actually does rather than an unverified guarantee.

---

_Reviewed: 2026-07-04T04:18:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

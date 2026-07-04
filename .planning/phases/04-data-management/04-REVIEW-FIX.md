---
phase: 04-data-management
fixed_at: 2026-07-04T04:35:00Z
review_path: .planning/phases/04-data-management/04-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-07-04T04:35:00Z
**Source review:** .planning/phases/04-data-management/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (CR-01, CR-02, CR-03, WR-01 through WR-07)
- Fixed: 10
- Skipped: 0

Info-level findings (IN-01 through IN-04) were out of scope for this pass per `fix_scope: critical_warning` and were not attempted.

## Fixed Issues

### CR-01: `update_gtfs.sh` has no safety net for unanticipated failures — the service can be left stopped forever

**Files modified:** `backend/scripts/update_gtfs.sh`
**Commit:** `7b3e1ba`
**Applied fix:** Armed a global `trap 'rollback_and_exit' ERR` immediately after the pre-refresh backup succeeds (before the destructive stop/clear/re-bootstrap window begins), so any unanticipated command failure — not just the three explicit `if`-checked failure paths — now triggers the same auto-restore path. `rollback_and_exit()` disables the trap first (`trap - ERR`) to prevent re-entrant firing if `restore.sh` itself fails, and the trap is explicitly cleared again on the successful-completion path before restarting the service. Verified against `tests/test_gtfs_update.py` (4/4 passing).

### CR-02: `retention_cleanup.sh` performs irreversible deletes with no validation of its retention-window inputs

**Files modified:** `backend/scripts/retention_cleanup.sh`
**Commit:** `bebba27`
**Applied fix:** Added a validation loop that rejects `BMTC_RETENTION_DAYS`/`BMTC_REJECTION_LOG_RETENTION_DAYS` unless each is a positive integer (regex `^[0-9]+$` plus a `-lt 1` check), run before any `DELETE` executes. A negative, zero, or non-numeric value now fails the script with a clear error instead of silently deleting far more data than intended. Verified against `tests/test_retention_cleanup.py` (5/5 passing).

### CR-03: `update_gtfs.sh` backs up before stopping the service — a rollback can silently lose rides submitted in that window

**Files modified:** `backend/scripts/update_gtfs.sh`, `docs/deploy.md`
**Commit:** `d266a0a`
**Applied fix:** Reordered the script so `service_control stop` (formerly Step 2) now runs before the pre-refresh `backup.sh` invocation (formerly Step 1). This guarantees the backup always reflects the exact state a rollback resumes from, eliminating the window where a ride accepted between backup and stop could be silently discarded on restore. Added a restart-and-exit fallback for the case where the backup itself fails to produce a usable file (service was already stopped by this point but nothing destructive has happened yet, so it's safe to just restart and bail). Updated `docs/deploy.md`'s "What it does" numbered list and outage-window description to match the new step order. Verified against `tests/test_gtfs_update.py` (4/4 passing, including `test_update_gtfs_happy_path_preserves_learning_data`).

### WR-01: `init_db()` does not guarantee connection cleanup on failure

**Files modified:** `backend/app/db.py`
**Commit:** `762df70`
**Applied fix:** Wrapped the entire body of `init_db()` (schema execution, guarded ALTERs, migration seeding, time-bin inserts, commit) in `try`/`finally`, moving `conn.close()` into the `finally` block — mirroring the pattern `get_connection()` already uses (BUGFIX-01). Verified against `tests/test_idempotency.py`, `tests/test_startup_cleanup.py`, `tests/test_migrations.py` (11/11 passing) and full-suite regression check.

### WR-02: Guarded-ALTER pattern covers `response_body` but not `body_hash`

**Files modified:** `backend/app/db.py`
**Commit:** `216b52a`
**Applied fix:** Added the same guarded-`ALTER TABLE` pattern used for `response_body` to `idempotency_keys.body_hash`, checking `existing_cols` before issuing `ALTER TABLE idempotency_keys ADD COLUMN body_hash TEXT`. Closes the landmine where a genuinely legacy DB missing this column would never get it, and removes the inconsistent example future authors could copy. Verified against `tests/test_idempotency.py`, `tests/test_startup_cleanup.py`, `tests/test_migrations.py` (11/11 passing) plus a full-suite run confirming the same 11 pre-existing failures (unrelated to this change — reproduced identically via `git stash` before the edit).

### WR-03: `apply_migrations.sh` is not resilient to a partially-applied migration, and interpolates filenames unescaped into SQL

**Files modified:** `backend/scripts/apply_migrations.sh`
**Commit:** `3a2f3fe`
**Applied fix:** Escaped embedded single quotes in the migration filename (`${name//\'/\'\'}`, standard SQL-literal doubling) before interpolating it into both the `SELECT COUNT(*)` and `INSERT` queries. Added a header comment documenting the requirement that every future `*_up.sql` file wrap its body in `BEGIN TRANSACTION; ... COMMIT;` (referencing `003_rate_limit_up.sql` as the correct example), so a mid-file failure can no longer leave partial state that permanently wedges the runner. Verified against `tests/test_migrations.py` (4/4 passing).

### WR-04: `docs/deploy.md` setup steps never install the new rate-limit-cleanup timer

**Files modified:** `docs/deploy.md`
**Commit:** `f6999f7`
**Applied fix:** Added `sudo cp deploy/bmtc-rate-limit-cleanup.{service,timer} /etc/systemd/system/` and `sudo systemctl enable --now bmtc-rate-limit-cleanup.timer` to Step 5 ("Install systemd services"), alongside the existing backup/retention timer install lines.

### WR-05: `docs/deploy.md` sample env file is stale — lists removed vars, omits a new one

**Files modified:** `docs/deploy.md`
**Commit:** `3249908`
**Applied fix:** Removed the dead `BMTC_EMA_ALPHA=0.1` / `BMTC_HALF_LIFE_DAYS=30` lines from the Step 3 sample env block (both removed from `Settings` in LEARN-01, per `CLAUDE.md`) and added `BMTC_REJECTION_LOG_RETENTION_DAYS=30`, the new retention knob this phase introduces for `rejection_log`.

### WR-06: New maintenance systemd units skip the project's documented sandboxing directives

**Files modified:** `backend/deploy/bmtc-rate-limit-cleanup.service`, `backend/deploy/bmtc-retention.service`
**Commit:** `05b7cc6`
**Applied fix:** Added `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`, and `ReadWritePaths=/var/lib/bmtc-api` to both units, matching the hardening convention already applied to `bmtc-api.service`. Verified with `systemd-analyze verify` — the only reported issue is the `ExecStart` binary not existing on this local dev host, unrelated to the added directives.

### WR-07: `update_gtfs.sh`'s row-count check depends on `bc` with no upfront dependency check

**Files modified:** `backend/scripts/update_gtfs.sh`
**Commit:** `3e346f4`
**Applied fix:** Added a `for bin in unzip sqlite3 bc; do command -v "$bin" ... done` prerequisite check at Step 0, before any side effect, so a missing `bc` now fails fast instead of surfacing after the service has already been stopped and GTFS tables cleared. Verified against `tests/test_gtfs_update.py` (4/4 passing).

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-07-04T04:35:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

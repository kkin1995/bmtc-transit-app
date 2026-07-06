# Phase 4: Data Management - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add operational data-lifecycle infrastructure that today is either missing or incomplete: a real versioned DB migration framework (`backend/app/migrations/` + a runner), a systemd timer for the already-existing but unwired `rate_limit_cleanup.sh`, a retention script that also cleans orphaned `rides` rows (and, per a drive-by fix discussed below, `rejection_log`), and a new `scripts/update_gtfs.sh` that safely refreshes GTFS data without losing learning history. Covers requirements DATA-01, DATA-02, DATA-03, DATA-04.

No new API endpoints, no learning-algorithm changes, no CI pipeline or performance tests (Phase 5), no rate-limit quota/header behavior changes (Phase 6) — this phase is purely about data lifecycle: schema versioning, cleanup scheduling, and GTFS refresh safety.

</domain>

<decisions>
## Implementation Decisions

### Migration Framework (DATA-01)
- **D-01:** `backend/app/migrations/003_rate_limit_up.sql`, `003_rate_limit_down.sql`, `004_idempotency_bodyhash_up.sql`, `004_idempotency_bodyhash_down.sql` are orphaned artifacts (Oct 2025) — their changes are already baked directly into `schema.sql`, and no runner ever executed them. Archive them (e.g. move to `backend/app/migrations/archive/`) as historical record. `schema.sql` is treated as the current baseline going forward. The next real schema change gets migration `001` — matches ROADMAP's literal wording ("a versioned migration script exists... for each schema change made after the baseline").
- **D-02:** New `schema_migrations` tracking table (columns: filename, applied_at) records exactly which migrations have run on a given DB. `apply_migrations.sh` diffs `migrations/*.sql` against this table to determine what to apply next — standard Alembic/Flyway-style pattern, not per-migration schema introspection.
- **D-03:** Migrations are **up-only** in the automated runner. Down-migration scripts, if written, are for manual/emergency use only — not wired into `apply_migrations.sh`. Matches this project's single-server, backup-then-restore operational model (`backup.sh`/`restore.sh` already exist for recovery).
- **D-04:** `apply_migrations.sh` is invoked manually — e.g. from `bootstrap.py` or documented deploy steps (`docs/deploy.md`) — not wired into `main.py`'s lifespan/app-startup. Matches the project's existing manual deployment model (no CI/CD, per `.planning/codebase/INTEGRATIONS.md`).

### Retention & Rate-Limit Cleanup (DATA-02, DATA-03)
- **D-05:** New `backend/scripts/retention_cleanup.sh` fully replaces the current inline `sqlite3` command in `bmtc-retention.service`. It runs three ordered deletes in one script, following `rate_limit_cleanup.sh`'s existing pattern (before/after row counts, timestamped log lines, error handling):
  1. `ride_segments` older than `BMTC_RETENTION_DAYS` (90d) — existing behavior, now in a script
  2. `rides` rows with zero remaining `ride_segments` (`NOT EXISTS (SELECT 1 FROM ride_segments WHERE ride_id = rides.id)`) — the core DATA-03 fix. No separate age gate on the `rides` row itself: a ride only reaches zero segments once ALL its segments have aged out past the retention window, so "zero remaining segments" is sufficient on its own.
  3. `rejection_log` older than `rejection_log_retention_days` (30d) — **drive-by fix**: this setting already exists in `config.py` and its cleanup SQL is already documented in `backend/scripts/README.md`, but it was never wired into any script or timer, so `rejection_log` grows unbounded today. Folded in because `retention_cleanup.sh` is being created anyway for the same "enforce documented retention TTLs" purpose — matches this project's established drive-by-fix precedent (Phases 1-3).
- **D-06:** `bmtc-retention.service`'s `ExecStart` becomes a single call to `retention_cleanup.sh` instead of the inline `sqlite3` command.
- **D-07:** New `bmtc-rate-limit-cleanup.service` / `bmtc-rate-limit-cleanup.timer` wire up the already-working `rate_limit_cleanup.sh` — filenames and daily cadence match what the script's own header comment already documents ("Schedule: Daily via systemd timer (deploy/bmtc-rate-limit-cleanup.timer)"). No design decision needed here beyond building what the script already expects.
- **D-08:** Leave `rate_limit_cleanup.sh`'s commented-out `VACUUM` block commented out. `VACUUM` rewrites the entire DB file and can pause reads against the 1.46M-row `stop_times` table — not something to silently auto-enable during a data-management hardening phase. Stays a manual/future opt-in.
- **D-09:** Stagger `bmtc-retention.timer` and `bmtc-rate-limit-cleanup.timer` by a few minutes (e.g. `00:00:00` vs `00:15:00`) to avoid both hitting the single-writer SQLite DB at the exact same instant. WAL mode would handle simultaneous writes safely regardless — this is a belt-and-suspenders choice, not a correctness requirement.
- **Carried forward from Phase 1 (`01-CONTEXT.md`, BUGFIX-07):** `idempotency_keys` (24h TTL) cleanup remains **startup-only** via `cleanup_expired_keys()` in the `main.py` lifespan handler — already explicitly decided as sufficient in Phase 1, NOT reopened or moved to a timer in this phase.

### GTFS Update Workflow (DATA-04)
- **D-10:** `scripts/update_gtfs.sh <path-to-new-gtfs.zip>` takes a **local zip file path as an argument** — no network fetch/curl/wget code. No stable, known BMTC GTFS feed URL exists anywhere in the codebase or docs today (confirmed via grep: `gtfs/bmtc.zip` is checked into the repo and updated manually, per `.planning/codebase/INTEGRATIONS.md`). The operator obtains the new GTFS zip out-of-band and hands it to the script. If a real feed URL becomes known later, an automated fetch step can be added as a small follow-up without changing the rest of the pipeline.
- **D-11:** "GTFS-table clear" (ROADMAP success criterion #4) truncates only the 7 GTFS-source tables: `agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`, `gtfs_metadata`. `segments`, `segment_stats`, `rides`, `ride_segments` are never touched by the clear step — matching the literal ROADMAP wording, which protects exactly these tables from deletion.
- **D-12:** The `segments` table itself stays **append-only** — same `INSERT OR IGNORE` behavior as today, never cleared/rebuilt. If BMTC changes `route_id` values across GTFS versions, the resulting orphaned `segment_stats` rows (pointing at a `route_id` no longer present) are an **accepted, documented limitation**, not solved in this phase — matches `.planning/codebase/CONCERNS.md`'s existing framing of this exact gap. Route-id reconciliation (fuzzy-matching by `route_short_name`) is out of scope — see Deferred.
- **D-13:** Row-count validation after re-bootstrap checks **sanity thresholds** on the 7 GTFS tables only (e.g. row count not zero, not wildly different — say >50% — from the pre-refresh count) — not an exact match. Real GTFS updates routinely add/remove a handful of routes or stops between publish cycles, so exact-match validation would fail nearly every legitimate refresh. Validation does not check `segments`/`segment_stats` continuity (see D-12).
- **D-14:** On validation failure, the script **automatically restores** the pre-refresh backup (reusing `backup.sh`'s `.backup` mechanism, taken as the script's first step) over the live DB and exits non-zero. No manual recovery steps required — the operator ends up back at the exact pre-refresh state.
- **D-15:** The `bmtc-api` systemd service is **stopped** before the clear + re-bootstrap steps and **restarted** after validation passes (or after a rollback completes) — a planned ~30-60 second outage (per `gtfs_bootstrap.py`'s own comment that `stop_times` loading "may take 30-60 seconds"). Chosen over running live to avoid a request landing between "GTFS tables cleared" and "re-bootstrap complete" and seeing empty/partial route or stop data.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Known issues driving this phase
- `.planning/codebase/CONCERNS.md` §"No database migration framework" — orphaned `migrations/` directory context; §"Rate limit bucket table grows unboundedly" — `rate_limit_cleanup.sh` exists but unwired (DATA-02); §"Retention script only cleans ride_segments, not rides" (DATA-03); §"No GTFS update workflow" — the segment-identity-continuity gap this phase's D-12 explicitly accepts rather than solves (DATA-04)
- `.planning/codebase/INTEGRATIONS.md` §"Data Sources" — confirms GTFS is checked into the repo with "manual re-bootstrap" as the only update mechanism today, and no automated feed source exists (grounds D-10)
- `backend/scripts/README.md` — already documents the `rejection_log` cleanup SQL that D-05 wires up as a drive-by fix

### Project-level requirements and roadmap
- `.planning/REQUIREMENTS.md` §"Data Management" — DATA-01, DATA-02, DATA-03, DATA-04 definitions
- `.planning/ROADMAP.md` §"Phase 4: Data Management" — goal and 4 literal success criteria this phase's decisions are locked against (note: criterion #4's protected-table list — `segment_stats`, `rides`, `ride_segments` — directly grounds D-11/D-12's scope)
- `.planning/PROJECT.md` — constraints (SQLite-only, single-writer transaction pattern, backward compatibility)

### Existing scripts referenced/extended by this phase
- `backend/scripts/rate_limit_cleanup.sh` — working script, pattern to replicate in `retention_cleanup.sh` (D-05); its own header comment names the timer files to create (D-07)
- `backend/scripts/backup.sh` / `backend/scripts/restore.sh` — reused by `update_gtfs.sh` for the backup-before/rollback-on-failure steps (D-14)
- `backend/deploy/bmtc-retention.service` / `.timer`, `backend/deploy/bmtc-backup.service` / `.timer` — existing systemd unit patterns that `bmtc-rate-limit-cleanup.service`/`.timer` (D-07) and the updated `bmtc-retention.service` (D-06) follow

### Prior phase precedent
- `.planning/phases/01-backend-correctness/01-CONTEXT.md` — established the "drive-by fix for tightly-coupled adjacent bugs" precedent this phase's D-05 (rejection_log cleanup) follows; also locked BUGFIX-07's startup-only idempotency cleanup decision, carried forward (not reopened) in this phase
- `.planning/phases/02-learning-algorithm-integrity/02-CONTEXT.md` D-05 — explicitly deferred the real migration framework to "Phase 4" when discussing why `ema_mean`/`ema_var` columns weren't dropped via migration; this phase is that deferred work

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/scripts/rate_limit_cleanup.sh` — complete, working reference implementation for `retention_cleanup.sh`'s logging/error-handling/before-after-count pattern (D-05).
- `backend/scripts/backup.sh` (`.backup` + gzip) and `backend/scripts/restore.sh` — reused directly by `update_gtfs.sh` for pre-refresh backup and failure rollback (D-14). Do not reinvent a separate backup mechanism.
- `backend/app/bootstrap.py` — existing entry point (`init_db()` + `parse_gtfs()`) that `update_gtfs.sh` re-invokes after clearing GTFS tables; also the natural place to call `apply_migrations.sh` per D-04.
- `backend/app/gtfs_bootstrap.py:227` `compute_segments_and_baselines()` — uses `INSERT OR IGNORE INTO segments` (line 314) and `INSERT OR REPLACE` for GTFS tables — confirms today's append-only, non-destructive upsert behavior that D-12 explicitly preserves.

### Established Patterns
- `backend/app/db.py:21-26` — existing guarded `ALTER TABLE ... ADD COLUMN` pattern (try/except swallowing "duplicate column") for the `response_body` column — this ad-hoc pattern is what the new `schema_migrations`-tracked runner (D-02) replaces going forward; do not extend this ad-hoc pattern for future schema changes.
- `backend/deploy/bmtc-retention.service` — currently a `Type=oneshot` unit with an inline `ExecStart=/bin/bash -c 'sqlite3 ...'` command; D-06 changes `ExecStart` to point at the new script instead, keeping the same `Type=oneshot` + `EnvironmentFile=/etc/bmtc-api/env` structure.
- `backend/app/config.py` — already has `retention_days: int = 90`, `idempotency_ttl_hours: int = 24`, `rejection_log_retention_days: int = 30` as existing settings; `retention_cleanup.sh` reads these via `EnvironmentFile` (same pattern `rate_limit_cleanup.sh` uses for `BMTC_DB_PATH`).

### Integration Points
- `backend/app/schema.sql` — the migration framework's baseline (D-01); new migrations must keep this file in sync so a *fresh* bootstrap (schema.sql) and an *upgraded* older DB (schema.sql + migrations 001+) converge on the same schema.
- `backend/deploy/` — where the new `bmtc-rate-limit-cleanup.service`/`.timer` files land, alongside existing `bmtc-backup.*` and `bmtc-retention.*` units.
- `systemctl stop/start bmtc-api` — `update_gtfs.sh` (D-15) needs sudo/service-control permissions; confirm the `bmtc` deploy user has appropriate systemd permissions during planning (may need a sudoers entry or running the script as a privileged user — a technical detail for research/planning, not a locked decision here).

</code_context>

<specifics>
## Specific Ideas

User wanted every ambiguity resolved before planning (consistent with Phases 1-3) and specifically drilled into: what the two skipped migration-file numbers (003/004) actually were and where they came from (clarified: orphaned Oct-2025 artifacts predating this GSD roadmap, already superseded by direct `schema.sql` edits) before confirming the "archive, start fresh" resolution; the exact scope of "GTFS-table clear" versus the `segments`/`segment_stats` continuity gap that CONCERNS.md already flags as a known, accepted limitation; and the real-world absence of an automatable BMTC GTFS feed URL, resolved toward a manual-local-path script rather than inventing a download mechanism against a URL that doesn't exist. A genuine drive-by gap (unwired `rejection_log` TTL cleanup) was discovered during scouting and folded into `retention_cleanup.sh` rather than left as a separate untracked issue.

</specifics>

<deferred>
## Deferred Ideas

- **Route-id reconciliation across GTFS refreshes** — fuzzy-matching orphaned `segment_stats` rows to new `route_id` values via `route_short_name` when BMTC republishes GTFS with different IDs. Explicitly out of scope for D-12; would need its own research/design given the complexity of matching stop sequences across shape variants (echoes the branch-matching problem already solved narrowly for `GET /v1/routes/{route_id}` in Phase 3).
- **Automated GTFS feed download from a real BMTC URL** — if BMTC (or a public GTFS aggregator) publishes a stable, scriptable feed URL in the future, `update_gtfs.sh`'s local-path argument can be extended with an optional `--url` fetch step without changing the backup/clear/re-bootstrap/validate/rollback pipeline itself.
- **VACUUM scheduling** — `rate_limit_cleanup.sh`'s commented-out weekly VACUUM block stays commented out (D-08); revisit if disk growth from cleanup deletes becomes an actual operational problem.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`gsd-tools query todo.match-phase 4` returned zero matches).

</deferred>

---

*Phase: 4-Data Management*
*Context gathered: 2026-07-03*

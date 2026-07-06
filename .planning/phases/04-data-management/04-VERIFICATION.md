---
phase: 04-data-management
verified: 2026-07-04T10:15:00Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 4: Data Management Verification Report

**Phase Goal:** Schema changes are tracked via versioned migration scripts, rate-limit buckets are cleaned up automatically, retention sweeps remove orphaned rides rows, and GTFS data can be refreshed without losing learning history.
**Verified:** 2026-07-04T10:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A versioned migration script exists in `backend/app/migrations/` for each schema change after baseline; `apply_migrations.sh` brings an older DB current without manual ALTER TABLE | ✓ VERIFIED | `backend/scripts/apply_migrations.sh` diffs `migrations/*_up.sql` against `schema_migrations` and applies only missing files in order (D-02/D-03); the four pre-existing 003/004 files were `git mv`'d to `backend/app/migrations/archive/` (confirmed via `git log --stat`, renames not adds/deletes) so the runner's glob starts from a clean baseline; `backend/app/db.py:45-65` seeds `schema_migrations` on fresh bootstrap (Pitfall 1 fix) inside a `try/finally` (WR-01 fix). `backend/tests/test_migrations.py` — 4/4 tests pass, exercising apply-once, no-op re-run, fresh-bootstrap seeding preventing double-apply, and empty-migrations-dir bootstrap. `apply_migrations.sh` is not invoked from `main.py`/`bootstrap.py` (confirmed via grep — zero matches), matching D-04 manual-invocation-only. |
| 2 | `rate_limit_buckets` cleaned by a systemd timer on schedule; timer unit exists, is enabled, cleanup script removes rows older than TTL | ✓ VERIFIED | `backend/deploy/bmtc-rate-limit-cleanup.timer` (`OnCalendar=*-*-* 00:15:00`, `WantedBy=timers.target`) + `backend/deploy/bmtc-rate-limit-cleanup.service` (`Type=oneshot`, `ExecStart=/opt/bmtc-api/scripts/rate_limit_cleanup.sh`, hardened with `NoNewPrivileges`/`PrivateTmp`/`ProtectSystem=strict`/`ProtectHome` per WR-06 fix). `backend/deploy/bmtc-retention.timer` staggered to `00:00:00` (D-09) so the two timers never fire simultaneously. `docs/deploy.md` Step 5 now installs and `enable --now`s the new timer (WR-04 fix, confirmed present). `backend/tests/test_rate_limit_cleanup_script.py` — 3/3 tests pass: deletes stale (>24h) buckets, keeps fresh ones, and statically asserts the unit-file shape/stagger. |
| 3 | Retention script deletes `rides` with no remaining `ride_segments` after the segment sweep; no orphaned `rides` rows accumulate | ✓ VERIFIED | `backend/scripts/retention_cleanup.sh` runs three ordered deletes in one pass: (1) `ride_segments` past `BMTC_RETENTION_DAYS`, (2) `rides WHERE NOT EXISTS (... WHERE ride_id = rides.ride_id)` — keyed on the actual PK `ride_id` (not `id`), (3) `rejection_log` past `BMTC_REJECTION_LOG_RETENTION_DAYS` (drive-by D-05). Order is segments-then-orphans-then-rejections, confirmed by reading the script and by `test_single_run_performs_all_three_deletes_in_order`. Env-var inputs are validated as positive integers before any DELETE runs (CR-02 fix — a negative/non-numeric TTL now fails closed instead of deleting everything). `bmtc-retention.service`'s `ExecStart` now calls `retention_cleanup.sh` (D-06), not an inline `sqlite3` command. `backend/tests/test_retention_cleanup.py` — 5/5 tests pass: orphan removed, non-orphan kept, ride_segments TTL boundary, rejection_log TTL boundary, single-run ordering. |
| 4 | `update_gtfs.sh` on a production-like DB completes backup→download→clear→re-bootstrap→validate cycle without deleting rows from `segment_stats`/`rides`/`ride_segments` | ✓ VERIFIED | `backend/scripts/update_gtfs.sh` validates the zip (V5) before any side effect, stops the service, takes a backup (order flipped by CR-03 fix so the backup always reflects the post-stop state), clears only the 7 named GTFS tables (`stop_times trips calendar routes stops agency gtfs_metadata` — `segments`/`segment_stats`/`rides`/`ride_segments` never referenced, D-11/D-12), re-bootstraps via unmodified `app.bootstrap`, validates row-count deltas (>50% threshold, D-13) on the 7 GTFS tables only, and restarts the service. A global `trap 'rollback_and_exit' ERR` (CR-01 fix) is armed right after the backup succeeds so any unanticipated failure — not just the three explicit checks — triggers the same restore path; `rollback_and_exit` checkpoints the WAL before `restore.sh`'s file-swap and disables its own trap to avoid re-entrancy. `backend/tests/test_gtfs_update.py` — 4/4 tests pass: happy path proves `segment_stats`/`rides`/`ride_segments` row counts are byte-for-byte unchanged across a successful refresh, invalid-zip triggers rollback, non-existent path and non-zip file both fail fast with zero side effects. |

**Score:** 4/4 roadmap success criteria verified, 0 present-but-behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/scripts/apply_migrations.sh` | New diff-and-apply migration runner | ✓ VERIFIED | Exists, `bash -n` parses, exercised by 4 passing tests, wired to `schema_migrations` |
| `backend/app/migrations/archive/003_*`, `004_*` (4 files) | Relocated orphaned migrations | ✓ VERIFIED | All 4 present under `archive/`, none remain under `migrations/` directly; `migrations/*_up.sql` glob matches nothing at the archive level |
| `backend/tests/test_migrations.py` | Migration runner tests | ✓ VERIFIED | 4 tests, all passing |
| `backend/deploy/bmtc-rate-limit-cleanup.service` / `.timer` | New oneshot unit + daily timer | ✓ VERIFIED | Both exist, correct `OnCalendar`/`WantedBy`, hardened |
| `backend/deploy/bmtc-retention.timer` | Explicit `00:00:00` stagger | ✓ VERIFIED | Confirmed `OnCalendar=*-*-* 00:00:00` |
| `backend/tests/test_rate_limit_cleanup_script.py` | Cleanup deletion + unit-shape tests | ✓ VERIFIED | 3 tests, all passing |
| `backend/scripts/retention_cleanup.sh` | New three-delete retention script | ✓ VERIFIED | Exists, `bash -n` parses, input validation added (CR-02) |
| `backend/deploy/bmtc-retention.service` | ExecStart → retention_cleanup.sh | ✓ VERIFIED | Confirmed no `sqlite3` inline command remains |
| `backend/tests/test_retention_cleanup.py` | Retention tests | ✓ VERIFIED | 5 tests, all passing |
| `backend/scripts/update_gtfs.sh` | Backup/stop/clear/re-bootstrap/validate/rollback orchestrator | ✓ VERIFIED | Exists, `bash -n` parses, ERR trap safety net (CR-01), backup-after-stop ordering (CR-03), `bc` upfront dependency check (WR-07) |
| `backend/tests/fixtures/make_mini_gtfs.py` + `mini_gtfs.zip` | Synthetic GTFS fixture | ✓ VERIFIED | Zip contains all required GTFS files, parseable |
| `backend/tests/test_gtfs_update.py` | GTFS update integration tests | ✓ VERIFIED | 4 tests, all passing (happy path, invalid-zip rollback, 2 arg-validation paths) |
| `docs/deploy.md` (upgrade + GTFS-refresh + sudoers section) | Operator documentation | ✓ VERIFIED | Contains `apply_migrations.sh`, `update_gtfs.sh`, `sudoers.d`, both scoped `systemctl stop/start bmtc-api` lines, and the rate-limit-cleanup timer install step (WR-04) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `init_db()` | `schema_migrations` | Seeds from `migrations/*_up.sql` glob immediately after `executescript(schema)` | ✓ WIRED | `backend/app/db.py:45-65`, inside `try/finally` |
| `apply_migrations.sh` | `schema_migrations` | Diffs `*_up.sql` filenames against table rows | ✓ WIRED | Confirmed by reading script + passing tests |
| `bmtc-rate-limit-cleanup.timer` | `bmtc-rate-limit-cleanup.service` | Timer activates the oneshot unit | ✓ WIRED | Standard systemd timer→service unit-name pairing (same basename) |
| `bmtc-rate-limit-cleanup.service` | `rate_limit_cleanup.sh` | `ExecStart=/opt/bmtc-api/scripts/rate_limit_cleanup.sh` | ✓ WIRED | Script unchanged (D-08), already TTL-correct |
| `bmtc-retention.service` | `retention_cleanup.sh` | `ExecStart=/opt/bmtc-api/scripts/retention_cleanup.sh` | ✓ WIRED | Old inline `sqlite3` command removed |
| `retention_cleanup.sh` | `rides`/`ride_segments`/`rejection_log` | Three ordered DELETEs in one script invocation | ✓ WIRED | Order confirmed: segments → orphan rides → rejection_log |
| `update_gtfs.sh` | `backup.sh`/`restore.sh` | Reused verbatim for pre-refresh backup and rollback | ✓ WIRED | No bespoke backup logic (D-14); `restore.sh` invoked from `rollback_and_exit` |
| `update_gtfs.sh` | `app.bootstrap` | `(cd "$BACKEND_DIR" && uv run python -m app.bootstrap)` after GTFS clear | ✓ WIRED | Unmodified re-bootstrap, `schedule_mean`-only upsert preserves Welford state |
| `docs/deploy.md` | `apply_migrations.sh` / `update_gtfs.sh` / sudoers | Documented operator steps | ✓ WIRED | grep-confirmed sections present with exact commands |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration runner tests | `uv run pytest tests/test_migrations.py -q` | 4 passed | ✓ PASS |
| Rate-limit cleanup tests | `uv run pytest tests/test_rate_limit_cleanup_script.py -q` | 3 passed | ✓ PASS |
| Retention cleanup tests | `uv run pytest tests/test_retention_cleanup.py -q` | 5 passed | ✓ PASS |
| GTFS update tests | `uv run pytest tests/test_gtfs_update.py -q` | 4 passed | ✓ PASS |
| All four scripts parse | `bash -n apply_migrations.sh retention_cleanup.sh update_gtfs.sh` | no errors | ✓ PASS |
| No debt markers in phase-modified files | `grep -n TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER` across all 04-01..04-05 modified files | 0 matches | ✓ PASS |
| Full backend suite regression | `cd backend && uv run pytest -n auto --dist loadfile -q` | 229 passed, 6 failed | ✓ PASS — failure set matches the documented Phase 1 baseline exactly (`test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2), tracked for Phase 6, not a Phase 4 regression |
| `systemd-analyze verify` on new/modified units | `systemd-analyze verify bmtc-rate-limit-cleanup.service bmtc-retention.service` | only "ExecStart binary not found" (expected — `/opt/bmtc-api` doesn't exist on this dev host) | ✓ PASS — no directive/syntax errors |

### Code Review → Fix Trail

`04-REVIEW.md` found 3 critical + 7 warning findings (`status: issues_found`). `04-REVIEW-FIX.md` (`status: all_fixed`) closed all 10 in a follow-up commit series (`7b3e1ba` … `3e346f4`). Verified directly against current file contents on disk (not the fix report's narrative):

- **CR-01** (no ERR-trap safety net) — confirmed fixed: `trap 'rollback_and_exit' ERR` present in `update_gtfs.sh:151`, disabled first inside `rollback_and_exit` (`trap - ERR`, line 102) and again on the success path (line 204).
- **CR-02** (unvalidated retention env vars) — confirmed fixed: positive-integer validation loop present in `retention_cleanup.sh:39-45`, runs before any DELETE.
- **CR-03** (backup before stop, ride-loss window) — confirmed fixed: `update_gtfs.sh` now stops the service (Step 1, line 127) *before* taking the backup (Step 2, line 132) — the reverse of the original order.
- **WR-01** (`init_db` leak on failure) — confirmed fixed: `db.py`'s `init_db()` body is wrapped in `try/finally` with `conn.close()` in `finally` (lines 20-82).
- **WR-02** (missing `body_hash` guard) — confirmed fixed: `db.py:42-43` guards `body_hash` the same way as `response_body`.
- **WR-03** (unescaped filename interpolation) — confirmed fixed: `apply_migrations.sh:51` escapes embedded single quotes before interpolation.
- **WR-04** (deploy.md missing rate-limit-cleanup install step) — confirmed fixed: `docs/deploy.md:61-66` installs and enables the new timer.
- **WR-05** (stale sample env) — confirmed fixed: no `BMTC_EMA_ALPHA`/`BMTC_HALF_LIFE_DAYS` found in `docs/deploy.md`'s env sections (grep 0 matches); `BMTC_REJECTION_LOG_RETENTION_DAYS` present.
- **WR-06** (missing sandboxing directives) — confirmed fixed: both new/modified maintenance units carry `NoNewPrivileges`/`PrivateTmp`/`ProtectSystem=strict`/`ProtectHome`/`ReadWritePaths`.
- **WR-07** (`bc` dependency check too late) — confirmed fixed: `update_gtfs.sh:56-58` checks `unzip sqlite3 bc` at Step 0, before any side effect.

Info-level findings (IN-01..IN-04) were explicitly out of scope for the fix pass (`fix_scope: critical_warning`) and remain open as documented low-severity notes (e.g. `tr -d -` on `update_gtfs.sh:195` is still unquoted — cosmetic, GNU `tr` handles it correctly, not a blocker).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-01 | 04-01, 04-05 | DB migration framework in place | ✓ SATISFIED | `apply_migrations.sh` + `schema_migrations` + archived legacy migrations + `docs/deploy.md` upgrade-path section |
| DATA-02 | 04-02 | Rate limit bucket cleanup wired to systemd timer | ✓ SATISFIED | `bmtc-rate-limit-cleanup.{service,timer}` + staggered retention timer + install step in deploy docs |
| DATA-03 | 04-03 | Retention script cleans parent `rides` table | ✓ SATISFIED | `retention_cleanup.sh` orphan-delete + `bmtc-retention.service` rewire |
| DATA-04 | 04-04, 04-05 | GTFS update workflow script | ✓ SATISFIED | `update_gtfs.sh` full backup→stop→clear→re-bootstrap→validate→restart/rollback cycle + deploy docs |

No orphaned requirements — `.planning/REQUIREMENTS.md`'s Phase 4 row (DATA-01..04) exactly matches the four IDs declared across the five plans' frontmatter.

### Anti-Patterns Found

None. Scanned all files modified across 04-01 through 04-05 (scripts, `db.py`, systemd units, test modules, `docs/deploy.md`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub-return patterns — zero matches.

### Human Verification Required

None required to close this phase. One item was explicitly deferred (not failed) by the user during plan 04-05 and is tracked separately, not as a phase gap:

- **Sudoers/service-control confirmation on target production host** (plan 04-05, Task 2 `checkpoint:human-verify`) — the operator deferred this blocking checkpoint on 2026-07-04 because the target production host is not yet provisioned. This is captured as a standalone pending todo at `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md`, intentionally without a `resolves_phase` tag, and `docs/deploy.md` documents both the scoped-sudoers path and the run-as-root fallback. Since `update_gtfs.sh` supports `BMTC_SKIP_SERVICE_CONTROL=1` for testing and the checkpoint concerns a host that doesn't exist yet (not a codebase defect), this is a pre-production prerequisite outside the scope of "is the Phase 4 codebase correct," not a phase gap.

### Gaps Summary

No gaps. All four ROADMAP.md success criteria are met, backed by passing tests executed directly during this verification (16/16 phase-specific tests pass; 229/235 full suite passes with the 6 failures matching the exact pre-existing Phase-1-documented baseline). All 10 code-review findings (3 critical, 7 warning) were confirmed fixed by direct inspection of current file contents, not by trusting the fix report's narrative. The one deferred item (production sudoers confirmation) is an accepted, explicitly-tracked pre-production prerequisite, not a defect in the delivered phase work.

---

_Verified: 2026-07-04T10:15:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 04-data-management
plan: 04
subsystem: infra
tags: [bash, sqlite, gtfs, backup, rollback, systemd, testing]

# Dependency graph
requires:
  - phase: 04-data-management (04-01, 04-03)
    provides: schema_migrations tracking table pattern, retention_cleanup.sh's config-driven bash script conventions
provides:
  - "backend/scripts/update_gtfs.sh — backup/stop/clear/re-bootstrap/validate/rollback-or-restart GTFS refresh orchestrator"
  - "backend/tests/fixtures/make_mini_gtfs.py + mini_gtfs.zip — deterministic synthetic GTFS feed for fast tests"
  - "backend/tests/test_gtfs_update.py — 4 integration tests covering happy path, rollback, and arg validation"
  - "WAL-safe rollback pattern: PRAGMA wal_checkpoint(TRUNCATE) before any restore.sh-based file-level DB swap"
affects: [04-05 (deploy/sudoers plan), future GTFS-refresh operational runbooks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backup -> destructive-op -> validate -> auto-rollback bash orchestration reusing existing backup.sh/restore.sh verbatim"
    - "BMTC_SKIP_SERVICE_CONTROL env escape hatch for testing systemctl-dependent scripts without a live unit"
    - "Script's own $(dirname \"${BASH_SOURCE[0]}\")/.. resolution for the backend dir instead of hardcoding /opt/bmtc-api, so the same script works in prod and under test"

key-files:
  created:
    - backend/scripts/update_gtfs.sh
    - backend/tests/fixtures/make_mini_gtfs.py
    - backend/tests/fixtures/mini_gtfs.zip
    - backend/tests/test_gtfs_update.py
  modified: []

key-decisions:
  - "Rule 1 bugfix: restore.sh's raw file-level `mv` swap doesn't account for a stale non-empty `-wal` file left by the clear step under WAL mode — fixed via PRAGMA wal_checkpoint(TRUNCATE) in update_gtfs.sh's rollback path, without modifying restore.sh itself"
  - "Test A seeds pre-refresh GTFS state by parsing the same mini_gtfs.zip the script re-applies (0% delta) rather than arbitrary small seed counts, avoiding false-positive >50% threshold trips on tiny row counts (RESEARCH.md Pitfall 5)"
  - "BACKEND_DIR resolved from the script's own path, not a BMTC_* env override or hardcoded /opt/bmtc-api — works identically in production and test invocation"

patterns-established:
  - "Any new operational bash script controlling systemd units should expose a BMTC_SKIP_SERVICE_CONTROL-style escape hatch for testability"
  - "Any script that swaps SQLite files at the filesystem level (restore-style) must checkpoint+truncate WAL first if journal_mode=WAL is in play"

requirements-completed: [DATA-04]

coverage:
  - id: D1
    description: "update_gtfs.sh completes backup -> stop-service -> clear-7-GTFS-tables -> re-bootstrap -> row-count validation -> restart, exiting 0, while leaving segment_stats/rides/ride_segments row counts (and exact Welford values) unchanged"
    requirement: "DATA-04"
    verification:
      - kind: integration
        ref: "backend/tests/test_gtfs_update.py::test_update_gtfs_happy_path_preserves_learning_data"
        status: pass
    human_judgment: false
  - id: D2
    description: "On re-bootstrap failure (structurally valid zip missing required GTFS files), update_gtfs.sh restores the pre-refresh backup and exits non-zero, with the DB — GTFS and learning tables alike — matching its pre-refresh state"
    requirement: "DATA-04"
    verification:
      - kind: integration
        ref: "backend/tests/test_gtfs_update.py::test_update_gtfs_invalid_zip_triggers_rollback"
        status: pass
    human_judgment: false
  - id: D3
    description: "A non-existent zip path or a non-zip file argument fails fast (non-zero exit, clear error) with zero backup/clear side effects (V5, T-04-07)"
    requirement: "DATA-04"
    verification:
      - kind: integration
        ref: "backend/tests/test_gtfs_update.py::test_update_gtfs_nonexistent_path_fails_fast_with_no_side_effects"
        status: pass
      - kind: integration
        ref: "backend/tests/test_gtfs_update.py::test_update_gtfs_non_zip_file_fails_fast_with_no_side_effects"
        status: pass
    human_judgment: false
  - id: D4
    description: "The clear step touches only the 7 GTFS-source tables; segments/segment_stats/rides/ride_segments are never referenced by update_gtfs.sh's DELETE statements"
    requirement: "DATA-04"
    verification:
      - kind: unit
        ref: "manual source review: backend/scripts/update_gtfs.sh clear-step loop (`for t in stop_times trips calendar routes stops agency gtfs_metadata`) contains no reference to segments/segment_stats/rides/ride_segments"
        status: pass
    human_judgment: false
  - id: D5
    description: "Sudoers/production `systemctl stop/start bmtc-api` privilege configuration for the bmtc user (Common Pitfall 3 / Open Question 2)"
    verification: []
    human_judgment: true
    rationale: "Requires configuring a real production host's sudoers drop-in and confirming it works with the non-root bmtc user — cannot be verified from this sandboxed dev environment. Explicitly deferred to plan 04-05 per RESEARCH.md."

# Metrics
duration: 16min
completed: 2026-07-04
status: complete
---

# Phase 4 Plan 04: GTFS Update Workflow Summary

**`update_gtfs.sh` — a backup/stop/clear/re-bootstrap/validate/rollback bash orchestrator that refreshes GTFS static data from an operator-supplied local zip without losing any Welford learning history, with a WAL-safe auto-rollback fix discovered and applied along the way**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-07-04T09:13:20+05:30 (previous plan's metadata commit)
- **Completed:** 2026-07-04T09:29:00+05:30
- **Tasks:** 3 (1 fixture-generation task, 1 TDD RED task, 1 TDD GREEN task)
- **Files modified:** 4 created, 0 modified

## Accomplishments

- `backend/tests/fixtures/make_mini_gtfs.py` generates a deterministic, minimal, VALID synthetic GTFS feed (1 agency, 2 routes, 4 stops, 2 calendar rows, 2 trips, 6 stop_times, feed_info) — verified parseable end-to-end by `app.bootstrap` without touching the real 1.46M-row `gtfs/bmtc.zip`
- `backend/scripts/update_gtfs.sh` (DATA-04): validates `$1` (existing file + `unzip -t`, V5/T-04-07) before any side effect, takes a pre-refresh backup via `backup.sh`, stops `bmtc-api` (with a `BMTC_SKIP_SERVICE_CONTROL` test escape hatch), clears exactly the 7 GTFS-source tables via plain `DELETE FROM` (D-11), re-bootstraps via unmodified `uv run python -m app.bootstrap`, validates row counts against a >50% delta threshold on the 7 GTFS tables only (D-13), and on any failure automatically restores the pre-refresh backup via `restore.sh` and exits non-zero (D-14), otherwise restarts the service
- `segments`, `segment_stats`, `rides`, `ride_segments` are provably never touched — a segment's exact Welford `(n, welford_mean, welford_m2)` triple is asserted byte-identical before and after a full refresh cycle in the happy-path test
- Found and fixed a real WAL-replay bug in the rollback path (see Deviations) that would otherwise have silently defeated the D-14 auto-rollback guarantee under production's `journal_mode=WAL` setting
- `backend/tests/test_gtfs_update.py`: 4 integration tests (happy path, rollback-on-bootstrap-failure, nonexistent-path, non-zip-file) — all green; full suite 229/235 passing (6 pre-existing failures, unchanged baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the minimal synthetic GTFS fixture + generator** - `50e6430` (feat)
2. **Task 2 (RED): Write failing GTFS-update integration tests** - `2cc4e6c` (test)
3. **Task 3 (GREEN): Implement update_gtfs.sh** - `13622d1` (feat) — includes the test-file fixes needed to make the RED tests genuinely correct (see Deviations)

## Files Created/Modified

- `backend/scripts/update_gtfs.sh` - NEW backup/stop/clear/re-bootstrap/validate/rollback orchestrator (DATA-04), executable, `bash -n` clean
- `backend/tests/fixtures/make_mini_gtfs.py` - NEW deterministic synthetic GTFS feed generator
- `backend/tests/fixtures/mini_gtfs.zip` - NEW generated fixture (7 GTFS .txt files, fixed zip-entry timestamps for reproducibility)
- `backend/tests/test_gtfs_update.py` - NEW 4 integration tests (happy path, rollback, 2x arg-validation)

## Decisions Made

- Reused `backup.sh`/`restore.sh` verbatim as subprocess calls rather than reimplementing backup/restore logic inside `update_gtfs.sh`, per RESEARCH.md's "Don't Hand-Roll" guidance
- `BACKEND_DIR` is derived from the script's own location (`$(dirname "${BASH_SOURCE[0]}")/..`) rather than a hardcoded `/opt/bmtc-api` path or a new env var — this means the exact same script resolves correctly to `/opt/bmtc-api/backend` in production and to `<repo>/backend` under test, with zero special-casing
- Row-count validation is scoped to exactly the 7 GTFS-source tables (D-13); `segments`/`segment_stats` are explicitly excluded since they are append-only and expected to only grow across a refresh (D-12)
- Test A's pre-refresh GTFS state is seeded by parsing the identical `mini_gtfs.zip` the script re-applies, producing a realistic 0%-delta happy path instead of tuning arbitrary seed-row counts against the 50% threshold

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WAL file replay silently defeats D-14 rollback under `journal_mode=WAL`**
- **Found during:** Task 3 (GREEN) — Test B (`test_update_gtfs_invalid_zip_triggers_rollback`) failed with `agency: expected 1, got 0 after rollback` even though `restore.sh` reported "Restore complete"
- **Issue:** `restore.sh` performs a raw filesystem-level swap (`mv "$DB_PATH" "${DB_PATH}.old"` then `mv /tmp/bmtc_restore.db "$DB_PATH"`). Under WAL mode (production's `journal_mode=WAL`), the clear step's `DELETE FROM` statements can leave a non-empty `-wal` file that is *not* renamed or cleared by this swap (it's keyed to the DB filename, not content). The next connection to open the "restored" file replays that stale WAL, silently reapplying the destructive deletes on top of the just-restored backup — the DB ends up back in its cleared, post-failure state instead of its pre-refresh state.
- **Fix:** Added `sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"` as the first action inside `update_gtfs.sh`'s `rollback_and_exit()`, immediately before invoking `restore.sh`. This flushes and truncates any pending WAL frames so no stale WAL is left to replay once the restored file is in place. `restore.sh` itself was left completely unmodified (reused verbatim per RESEARCH.md's Anti-Patterns guidance) — the fix lives entirely in the new script.
- **Files modified:** `backend/scripts/update_gtfs.sh`
- **Verification:** `test_update_gtfs_invalid_zip_triggers_rollback` now asserts all 7 GTFS tables plus `rides`/`ride_segments`/`segments` are byte-identical to their pre-refresh counts after the rollback completes — passes.
- **Committed in:** `13622d1` (Task 3 commit)

**2. [Rule 1 - Bug] Test seed data triggered false-positive D-13 threshold rollback in the happy path**
- **Found during:** Task 3 (GREEN) — the happy-path test failed with `routes changed by 100.00% (before=1 after=2) — exceeds 50% threshold`, correctly caught by the script's own validation logic but exposing a flaw in the test's seed data (1 arbitrary seed row vs. the mini feed's 2 real routes is a 100% "change" even though nothing is actually wrong)
- **Issue:** RESEARCH.md's own Pitfall 5 warned about exactly this class of false positive with small counts; the test as originally written didn't heed it
- **Fix:** Test A now seeds its pre-refresh GTFS state by calling `parse_gtfs()` directly against the same `mini_gtfs.zip` the script will re-apply, producing an honest 0% delta — a realistic "operator re-publishes the same/similar-sized feed" scenario rather than an artificially mismatched one. Also added a `_seed_all_time_bins()` helper (matching `app.db.init_db()`'s production seeding) since `compute_segments_and_baselines()`'s `segment_stats` insert has an FK on `time_bins(bin_id)` that the bare `temp_db` fixture doesn't populate.
- **Files modified:** `backend/tests/test_gtfs_update.py`
- **Verification:** All 4 tests green; full suite 229/235, no new regressions.
- **Committed in:** `13622d1` (Task 3 commit, alongside the GREEN implementation)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug fixes essential to the correctness of the D-14 rollback guarantee and the test's own validity)
**Impact on plan:** No scope creep. Both fixes were required to make the plan's own must-have truths ("On validation failure ... restores the pre-refresh backup ... exiting non-zero") actually hold under the production `journal_mode=WAL` setting this codebase uses everywhere else.

## Issues Encountered

- `uv run python -m app.bootstrap` inside the subprocess-of-a-subprocess (pytest -> bash update_gtfs.sh -> uv run) needed `uv`'s own directory on `PATH` plus `BMTC_API_KEY` in the test environment (the `Settings` model has no default for it) — resolved via `shutil.which("uv")` in the test's `_test_path()` helper and adding the key to the subprocess env dict. No production impact; `EnvironmentFile=/etc/bmtc-api/env` already supplies both in deployment.

## User Setup Required

None - no external service configuration required. Note: production `sudo` access for the `bmtc` user to run `systemctl stop/start bmtc-api` (Pitfall 3 / Open Question 2 in 04-RESEARCH.md) is explicitly deferred to plan 04-05's `checkpoint:human-verify` task — `update_gtfs.sh` already tolerates its absence via `BMTC_SKIP_SERVICE_CONTROL` for testing, but production first-run requires that sudoers drop-in (or root execution) to be confirmed.

## Next Phase Readiness

- DATA-04 fully satisfied: `update_gtfs.sh` exists, is executable, `bash -n` clean, and its full backup->clear->re-bootstrap->validate->restart-or-rollback cycle is proven never to touch `segment_stats`/`rides`/`ride_segments` — even down to exact Welford values — across both a passing and a failing refresh
- Phase 4 (Data Management) is now 4/5 plans complete; only plan 04-05 (deploy/sudoers checkpoint) remains
- No blockers for 04-05: this plan's `BMTC_SKIP_SERVICE_CONTROL` escape hatch and the WAL-checkpoint rollback fix are both already in place and don't require any further changes from 04-05, which is scoped purely to the human-verified sudoers configuration step

---
*Phase: 04-data-management*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commits (`50e6430`, `2cc4e6c`, `13622d1`) verified present in git history.

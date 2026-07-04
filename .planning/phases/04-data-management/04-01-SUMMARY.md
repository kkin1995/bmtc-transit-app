---
phase: 04-data-management
plan: 01
subsystem: database
tags: [sqlite, migrations, schema-versioning, bash, tdd]

# Dependency graph
requires:
  - phase: 01-backend-correctness
    provides: "SQLite WAL init_db()/get_connection() foundation and guarded-ALTER precedent this plan replaces with a versioned runner"
provides:
  - "schema_migrations-tracked diff-and-apply migration runner (backend/scripts/apply_migrations.sh)"
  - "init_db() fresh-bootstrap seeding of schema_migrations, preventing double-application on a new DB"
  - "Archived historical record of the four orphaned Oct-2025 migration files"
affects: [04-02, 04-03, 04-04, 04-05, phase-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "schema_migrations tracking table (filename PRIMARY KEY, applied_at) diffed against migrations/*_up.sql glob"
    - "Fresh-bootstrap baseline seeding: init_db() marks every migration filename present at bootstrap time as pre-applied so schema.sql remains the single source of truth for a new DB"

key-files:
  created:
    - backend/scripts/apply_migrations.sh
    - backend/app/migrations/archive/003_rate_limit_up.sql
    - backend/app/migrations/archive/003_rate_limit_down.sql
    - backend/app/migrations/archive/004_idempotency_bodyhash_up.sql
    - backend/app/migrations/archive/004_idempotency_bodyhash_down.sql
    - backend/tests/test_migrations.py
  modified:
    - backend/app/db.py

key-decisions:
  - "Archived (git mv, not deleted) the four orphaned 003_/004_ migration files as historical record per D-01 — schema.sql is now the current baseline; the next real schema change is authored as 001_<name>_up.sql"
  - "apply_migrations.sh is up-only (D-03) and invoked manually only — not wired into main.py's app-startup lifespan (D-04)"
  - "init_db() resolves the migrations dir via BMTC_MIGRATIONS_DIR override or app/migrations/, using a non-recursive glob so migrations/archive/ is never re-seeded or re-applied"

patterns-established:
  - "Pattern 1 (RESEARCH.md): schema_migrations diff-and-apply runner — every future schema change ships as migrations/NNN_<name>_up.sql (+ optional _down.sql for manual/emergency use) and is picked up automatically by apply_migrations.sh"

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "apply_migrations.sh applies a migration missing from schema_migrations exactly once, recording the filename"
    requirement: "DATA-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_apply_migrations_applies_pending_migration_exactly_once"
        status: pass
    human_judgment: false
  - id: D2
    description: "Re-running apply_migrations.sh after all migrations are applied is a no-op (applies 0, no duplicate row)"
    requirement: "DATA-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_apply_migrations_rerun_is_noop"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fresh bootstrap (init_db) seeds schema_migrations with every existing migration filename so apply_migrations.sh never re-applies a change schema.sql already contains (Pitfall 1)"
    requirement: "DATA-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_fresh_bootstrap_seeds_schema_migrations_preventing_double_apply"
        status: pass
    human_judgment: false
  - id: D4
    description: "Plain bootstrap with an empty migrations dir still creates the schema_migrations table (zero seeded rows)"
    requirement: "DATA-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_plain_bootstrap_creates_empty_schema_migrations_table"
        status: pass
    human_judgment: false
  - id: D5
    description: "Four orphaned Oct-2025 migration files relocated to migrations/archive/ as pure git renames, byte-identical content"
    requirement: "DATA-01"
    verification:
      - kind: other
        ref: "git show --stat 41e3b26 (renames, not delete+add)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-07-04
status: complete
---

# Phase 4 Plan 1: DB Migration Framework Summary

**Versioned `schema_migrations`-tracked diff-and-apply migration runner (`apply_migrations.sh`) replacing the ad-hoc guarded `ALTER TABLE` pattern, with fresh-bootstrap seeding to prevent double-application.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-04T03:07:00Z
- **Completed:** 2026-07-04T03:25:00Z
- **Tasks:** 3 (1 auto + TDD RED/GREEN pair)
- **Files modified:** 7 (4 archived + 1 new script + 1 modified module + 1 new test file)

## Accomplishments
- Archived the four orphaned `003_rate_limit_*`/`004_idempotency_bodyhash_*` migration files to `backend/app/migrations/archive/` via pure `git mv` (D-01) — `schema.sql` is now the authoritative baseline
- Built `backend/scripts/apply_migrations.sh`: a `set -euo pipefail` runner that creates `schema_migrations` if missing, diffs `migrations/*_up.sql` against it, and applies only missing migrations in filename order (D-02/D-03), never wired into app startup (D-04)
- Added fresh-bootstrap seeding to `init_db()` in `backend/app/db.py` — every migration filename found in the resolved migrations directory is marked pre-applied immediately after `schema.sql` loads, closing RESEARCH.md's documented Pitfall 1 (fresh DB vs. upgraded DB divergence)
- Full TDD cycle (RED → GREEN) with 4 new integration tests covering apply-once, no-op re-run, fresh-bootstrap seeding, and empty-migrations-dir bootstrap

## Task Commits

Each task was committed atomically:

1. **Task 1: Archive orphaned migration files (D-01)** - `41e3b26` (chore)
2. **Task 2: Write failing migration-runner tests (RED)** - `c956a1b` (test)
3. **Task 3: Implement apply_migrations.sh + init_db seeding (GREEN)** - `cfe4130` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `backend/app/migrations/archive/003_rate_limit_up.sql` - relocated, byte-identical (git rename)
- `backend/app/migrations/archive/003_rate_limit_down.sql` - relocated, byte-identical (git rename)
- `backend/app/migrations/archive/004_idempotency_bodyhash_up.sql` - relocated, byte-identical (git rename)
- `backend/app/migrations/archive/004_idempotency_bodyhash_down.sql` - relocated, byte-identical (git rename)
- `backend/scripts/apply_migrations.sh` - new diff-and-apply migration runner
- `backend/app/db.py` - `init_db()` gains `schema_migrations` creation + fresh-bootstrap seeding step
- `backend/tests/test_migrations.py` - new test module (4 integration tests)

## Decisions Made
- Followed RESEARCH.md's Pattern 1 verbatim for the runner shape (schema_migrations table + `*_up.sql` glob diff)
- Resolved `BMTC_MIGRATIONS_DIR` in both `init_db()` and `apply_migrations.sh` so the fresh-vs-upgrade interplay is fully testable end-to-end via temp directories, without ever creating a real migration file under `backend/app/migrations/` in this plan (none was needed — the next real schema change authors migration `001`)
- Used `pathlib.Path.glob("*_up.sql")` (non-recursive) in `init_db()` so `migrations/archive/` is never re-scanned or re-seeded

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DATA-01 fully satisfied: an older DB missing a migration is brought current by `apply_migrations.sh` with no manual `ALTER TABLE`; a fresh bootstrap never double-applies
- Remaining Phase 4 plans (04-02 rate-limit cleanup timer, 04-03 retention script, 04-04 GTFS update workflow, 04-05 — per ROADMAP) can proceed independently; none of them depend on this plan's specific files beyond the general migration convention now established
- Full backend suite: 217 passed / 6 pre-existing failures (same baseline as Phase 1-3, no new regressions) — 4 new tests added by this plan, zero regressions

---
*Phase: 04-data-management*
*Completed: 2026-07-04*

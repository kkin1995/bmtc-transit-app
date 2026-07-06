---
phase: 05-quality-operations
plan: 01
subsystem: testing
tags: [pytest, sqlite, schema-verification, gtfs-bootstrap, foreign-keys]

# Dependency graph
requires:
  - phase: 04-data-management
    provides: versioned migration framework (schema_migrations table), mini_gtfs.zip fixture precedent
provides:
  - backend/tests/test_bootstrap.py — automated schema-drift smoke test suite
  - Verified literal 17-table/3-view name list against live schema.sql
affects: [05-02, 05-03, 05-04, future schema-change phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Literal name-set assertion against sqlite_master instead of bare table-count assertion"
    - "PRAGMA foreign_keys = ON explicitly before PRAGMA foreign_key_check (per-connection, not persisted)"

key-files:
  created: [backend/tests/test_bootstrap.py]
  modified: []

key-decisions:
  - "EXPECTED_TABLES/EXPECTED_VIEWS sourced from the verified live schema.sql (17 tables + 3 views), not the stale '11 tables' figure in ROADMAP.md/CLAUDE.md"
  - "schema_migrations table explicitly excluded from the sqlite_master query with an inline comment — it's DATA-01 migration bookkeeping created by init_db(), not a domain table defined in schema.sql"

patterns-established:
  - "Pattern 6 (RESEARCH.md): assert literal name sets, never `len(...) == N`, so a rename/drop fails loudly instead of silently passing a stale count"

requirements-completed: [OPS-02]

coverage:
  - id: D1
    description: "Bootstrap-produced DB contains exactly the 17 named domain tables and 3 named views (schema-drift detection)"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_bootstrap.py::test_bootstrap_creates_all_tables_and_views"
        status: pass
    human_judgment: false
  - id: D2
    description: "A fresh mini-fixture GTFS bootstrap populates a gtfs_version row in gtfs_metadata"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_bootstrap.py::test_bootstrap_populates_gtfs_metadata"
        status: pass
    human_judgment: false
  - id: D3
    description: "PRAGMA foreign_key_check reports zero violations after a mini-fixture bootstrap, with FK enforcement explicitly turned on"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_bootstrap.py::test_bootstrap_foreign_keys_valid"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-05
status: complete
---

# Phase 5 Plan 01: Bootstrap Schema Smoke Tests Summary

**`backend/tests/test_bootstrap.py` added with 3 tests proving a fresh bootstrap produces exactly the verified 17-table/3-view schema, populates GTFS metadata from the mini fixture, and has zero FK violations with enforcement explicitly on.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-05T08:53:41Z (session start per STATE.md)
- **Completed:** 2026-07-05T09:08:00Z (approx.)
- **Tasks:** 2 completed
- **Files modified:** 1 (`backend/tests/test_bootstrap.py`, created)

## Accomplishments
- `test_bootstrap_creates_all_tables_and_views` asserts a fresh `init_db()` bootstrap's `sqlite_master` contents against literal `EXPECTED_TABLES` (17 names) / `EXPECTED_VIEWS` (3 names) sets — a renamed or dropped table now fails loudly instead of silently passing a stale bare-count assertion
- `test_bootstrap_populates_gtfs_metadata` bootstraps `tests/fixtures/mini_gtfs.zip` via `parse_gtfs()` and confirms exactly one non-empty `gtfs_version` row lands in `gtfs_metadata`
- `test_bootstrap_foreign_keys_valid` runs `PRAGMA foreign_keys = ON` before `PRAGMA foreign_key_check` (the check is a documented no-op without this — `app.db.get_connection()` never sets it) and asserts zero violations after the mini-fixture bootstrap
- All 3 tests run inside the normal `uv run pytest -n auto --dist loadfile` suite (no opt-in marker), per D-08

## Task Commits

Each task was committed atomically:

1. **Task 1: Literal table/view existence test against sqlite_master (D-09)** - `b802b1d` (test)
2. **Task 2: GTFS-metadata-populated + foreign-key-integrity tests (D-10)** - `05c3742` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `backend/tests/test_bootstrap.py` - 3 pytest functions (table/view existence, GTFS metadata population, FK integrity) plus `EXPECTED_TABLES`/`EXPECTED_VIEWS` module-level constants

## Decisions Made
- Used the RESEARCH.md-verified 17-table/3-view literal list (not ROADMAP's/CLAUDE.md's stale "11 tables" figure) — confirmed independently by executing `schema.sql` and reading `app/schema.sql` directly during this execution
- `schema_migrations` excluded from the `sqlite_master` query with an explanatory code comment, per RESEARCH.md Open Question 1's recommendation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both tasks passed on first implementation attempt; full suite re-verified at 232 passed / 6 pre-existing failures (same baseline as documented in PROJECT.md/STATE.md, no new regressions) after both commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OPS-02 fully satisfied: bootstrap schema drift, GTFS metadata population, and FK integrity are now covered by fast, every-commit tests using the mini fixture
- No blockers for 05-02/05-03/05-04 (load testing, CI pipeline, structured logging), which do not depend on this plan's output
- Full backend test suite remains at the established 232-passing / 6-pre-existing-failure baseline

---
*Phase: 05-quality-operations*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: backend/tests/test_bootstrap.py
- FOUND: b802b1d (commit exists in git log)
- FOUND: 05c3742 (commit exists in git log)

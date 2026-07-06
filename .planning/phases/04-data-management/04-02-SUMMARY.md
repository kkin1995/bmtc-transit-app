---
phase: 04-data-management
plan: 02
subsystem: infra
tags: [systemd, sqlite, rate-limiting, cron, pytest]

# Dependency graph
requires:
  - phase: 04-data-management
    provides: "Plan 04-01's migration framework and schema_migrations conventions (not a functional dependency, same phase)"
provides:
  - "bmtc-rate-limit-cleanup.service/.timer wiring the existing rate_limit_cleanup.sh to a daily 00:15 systemd timer"
  - "Explicit OnCalendar stagger between bmtc-retention.timer (00:00) and bmtc-rate-limit-cleanup.timer (00:15) preventing simultaneous single-writer SQLite access"
  - "First subprocess-level characterization test for rate_limit_cleanup.sh's TTL-bounded deletion behavior"
affects: [05-testing-suite, deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "systemd oneshot service + timer pairing (Type=oneshot, EnvironmentFile=/etc/bmtc-api/env, ExecStart=/opt/bmtc-api/scripts/<script>.sh) mirrored from bmtc-backup.service/.timer"
    - "Explicit OnCalendar=*-*-* HH:MM:SS timers instead of bare daily/hourly keywords, to guarantee non-overlapping maintenance windows on the single-writer SQLite DB"
    - "subprocess.run against the temp_db fixture with env={BMTC_DB_PATH, PATH} for script-level characterization tests (matches test_migrations.py precedent from 04-01)"

key-files:
  created:
    - backend/deploy/bmtc-rate-limit-cleanup.service
    - backend/deploy/bmtc-rate-limit-cleanup.timer
    - backend/tests/test_rate_limit_cleanup_script.py
  modified:
    - backend/deploy/bmtc-retention.timer

key-decisions:
  - "ExecStart uses /opt/bmtc-api/scripts/rate_limit_cleanup.sh (matching the deployed bmtc-backup.service prefix convention), not the backend/scripts/ prefix from the original RESEARCH.md sketch"
  - "rate_limit_cleanup.sh itself was not modified (D-08) — its commented-out VACUUM block stays commented out; this plan only adds systemd glue and a test"
  - "bmtc-retention.timer's OnCalendar changed from bare daily to explicit *-*-* 00:00:00, and the new rate-limit-cleanup timer uses *-*-* 00:15:00, locking in a 15-minute stagger (D-09) rather than leaving it incidental"

patterns-established:
  - "Pattern: new maintenance timers must always use explicit OnCalendar=*-*-* HH:MM:SS values, never bare daily/hourly, to avoid simultaneous-start collisions on the single SQLite writer"

requirements-completed: [DATA-02]

coverage:
  - id: D1
    description: "rate_limit_cleanup.sh is wired to a systemd timer (bmtc-rate-limit-cleanup.service + .timer) that fires daily at 00:15"
    requirement: "DATA-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_rate_limit_cleanup_script.py#test_rate_limit_cleanup_units_have_staggered_schedule"
        status: pass
    human_judgment: false
  - id: D2
    description: "bmtc-retention.timer and bmtc-rate-limit-cleanup.timer have distinct explicit OnCalendar times (00:00 vs 00:15) so they never fire simultaneously against the single-writer SQLite DB"
    requirement: "DATA-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_rate_limit_cleanup_script.py#test_rate_limit_cleanup_units_have_staggered_schedule"
        status: pass
    human_judgment: false
  - id: D3
    description: "rate_limit_cleanup.sh deletes rate_limit_buckets whose last_refill is older than the 24h TTL and leaves fresh buckets intact"
    requirement: "DATA-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_rate_limit_cleanup_script.py#test_rate_limit_cleanup_deletes_stale_keeps_fresh"
        status: pass
      - kind: integration
        ref: "backend/tests/test_rate_limit_cleanup_script.py#test_rate_limit_cleanup_empty_table_is_noop"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-04
status: complete
---

# Phase 4 Plan 2: Rate-Limit Bucket Cleanup Timer Summary

**Wired the already-working `rate_limit_cleanup.sh` to a new `bmtc-rate-limit-cleanup.service`/`.timer` pair firing daily at 00:15, staggered 15 minutes after `bmtc-retention.timer`'s new explicit 00:00 schedule, with a subprocess-level characterization test proving the 24h TTL deletion boundary.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-04T03:32:00Z (approx, continuation from 04-01)
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- New `bmtc-rate-limit-cleanup.service` (Type=oneshot, EnvironmentFile=/etc/bmtc-api/env, ExecStart=/opt/bmtc-api/scripts/rate_limit_cleanup.sh) and `bmtc-rate-limit-cleanup.timer` (OnCalendar=*-*-* 00:15:00, Persistent=true, WantedBy=timers.target), mirroring the exact shape of `bmtc-backup.service`/`.timer`
- `bmtc-retention.timer`'s `OnCalendar=daily` replaced with the explicit `*-*-* 00:00:00`, locking in a 15-minute stagger against the new rate-limit-cleanup timer so the two never collide on the single-writer SQLite DB (D-09, RESEARCH.md Pitfall 4)
- First-ever subprocess-level test module for `rate_limit_cleanup.sh`: proves stale (48h-old) buckets are deleted while fresh buckets are kept, an empty table is a clean no-op, and the three unit files have the correct staggered `Type=oneshot`/`OnCalendar`/`WantedBy` shape

## Task Commits

Each task was committed atomically:

1. **Task 1: Create rate-limit-cleanup systemd units + stagger retention timer (D-07, D-09)** - `f3a510d` (feat)
2. **Task 2: Test rate_limit_cleanup.sh deletion behavior + unit-file correctness** - `4648681` (test)

**Plan metadata:** pending (docs: complete plan)

_Note: Task 2 was marked `tdd="true"` in the plan, but per the plan's own instructions this is characterization coverage for an already-working script (D-08) — tests were written and immediately passed (not RED→GREEN), which is the expected and correct behavior for characterization tests, not a TDD gate violation._

## Files Created/Modified
- `backend/deploy/bmtc-rate-limit-cleanup.service` - New oneshot unit invoking rate_limit_cleanup.sh
- `backend/deploy/bmtc-rate-limit-cleanup.timer` - New timer, fires daily at 00:15
- `backend/deploy/bmtc-retention.timer` - OnCalendar changed from bare `daily` to explicit `*-*-* 00:00:00`
- `backend/tests/test_rate_limit_cleanup_script.py` - 3 tests: stale/fresh deletion, empty-table no-op, static unit-file shape assertions

## Decisions Made
- ExecStart path uses `/opt/bmtc-api/scripts/rate_limit_cleanup.sh` matching the already-deployed `bmtc-backup.service` prefix convention, overriding the `backend/scripts/` prefix suggested in the original RESEARCH.md sketch (the plan explicitly flagged the existing backup unit's prefix as authoritative)
- `rate_limit_cleanup.sh` itself left untouched per D-08 — its commented-out `VACUUM` block remains commented out as a manual/future opt-in, not enabled by this plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (Production deployment of the new unit files — `systemctl enable --now bmtc-rate-limit-cleanup.timer` — is an operator action documented in `docs/deploy.md`, not required for this plan's automated verification.)

## Next Phase Readiness

- DATA-02 fully satisfied: the rate-limit-bucket cleanup script is now schedulable via systemd, staggered from the retention timer, and its deletion behavior is under automated test.
- Full backend suite: 220 passed, 6 pre-existing failures (same baseline as Phase 1/2/3/04-01 — no new regressions introduced by this plan).
- Phase 4 progress: 2/5 plans complete (04-01 migration framework, 04-02 rate-limit cleanup timer). Ready to proceed to 04-03.

---
*Phase: 04-data-management*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: backend/deploy/bmtc-rate-limit-cleanup.service
- FOUND: backend/deploy/bmtc-rate-limit-cleanup.timer
- FOUND: backend/tests/test_rate_limit_cleanup_script.py
- FOUND commit: f3a510d
- FOUND commit: 4648681

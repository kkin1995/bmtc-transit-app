---
phase: 04-data-management
plan: 05
subsystem: infra
tags: [deploy, sudoers, systemd, gtfs, migrations, operational-docs]

# Dependency graph
requires:
  - phase: 04-data-management (04-01)
    provides: apply_migrations.sh upgrade-path script
  - phase: 04-data-management (04-04)
    provides: update_gtfs.sh GTFS refresh orchestrator
provides:
  - docs/deploy.md upgrade-path section (apply_migrations.sh, D-04)
  - docs/deploy.md GTFS-refresh section (update_gtfs.sh usage, outage/backup/rollback notes)
  - docs/deploy.md scoped sudoers drop-in instructions (bmtc user, systemctl stop/start bmtc-api only)
  - Tracked open item: production sudoers confirmation deferred pending host provisioning
affects: [05-verification, deploy-runbook]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Sudoers drop-in scoped to exact fully-qualified command strings, no wildcards (least privilege)"]

key-files:
  created:
    - .planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md
  modified:
    - docs/deploy.md

key-decisions:
  - "Task 2's blocking human-verify checkpoint was answered as a deferral, not an approval — the target production host is not yet provisioned, so sudoers/service-control access cannot be confirmed today."
  - "The deferral is tracked as an independent pending todo (no resolves_phase tag) gated on first production update_gtfs.sh run, not on phase 4 completion — the operator explicitly asked that this not block phase closeout."
  - "T-04-08 (Elevation of Privilege) remains OPEN, not fully mitigated — the sudoers rule is documented and scoped correctly in docs/deploy.md, but human verification on the actual host is still outstanding."

patterns-established:
  - "Deferred blocking checkpoints are resolved via a tracked pending todo (not a resolves_phase-tagged one) when the blocker depends on external infrastructure timing outside the plan's control."

requirements-completed: [DATA-01, DATA-04]

coverage:
  - id: D1
    description: "docs/deploy.md documents apply_migrations.sh as a manual upgrade-path step, separate from fresh bootstrap"
    requirement: "DATA-01"
    verification:
      - kind: manual_procedural
        ref: "grep -q 'apply_migrations.sh' docs/deploy.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "docs/deploy.md documents update_gtfs.sh usage, outage window, backup/rollback, and learning-history preservation"
    requirement: "DATA-04"
    verification:
      - kind: manual_procedural
        ref: "grep -q 'update_gtfs.sh' docs/deploy.md"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs/deploy.md documents the scoped /etc/sudoers.d/bmtc-gtfs-update drop-in (no wildcard) for systemctl stop/start bmtc-api"
    verification:
      - kind: manual_procedural
        ref: "grep -q 'sudoers.d' docs/deploy.md && grep -q 'systemctl stop bmtc-api' docs/deploy.md && grep -q 'systemctl start bmtc-api' docs/deploy.md"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operator confirms scoped sudoers/service-control access is configured on the target production host before update_gtfs.sh's first production run"
    verification: []
    human_judgment: true
    rationale: "Cannot be verified from the repo — depends on the target host's actual sudoers state, which is not yet provisioned. Operator explicitly deferred this on 2026-07-04 and asked it be tracked as an open item (see .planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md) rather than block phase completion."

# Metrics
duration: 22min
completed: 2026-07-04
status: complete
---

# Phase 4 Plan 05: Deploy Docs (Upgrade Path, GTFS Refresh, Sudoers) Summary

**docs/deploy.md now documents the apply_migrations.sh upgrade path, update_gtfs.sh refresh workflow, and a scoped sudoers drop-in — with production sudoers confirmation deferred to a tracked todo rather than blocking phase 4's closeout.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-04T09:12:00+05:30 (approx, Task 1 start)
- **Completed:** 2026-07-04T09:34:21+05:30 (Task 1 commit) + continuation session
- **Tasks:** 2 (Task 1 executed; Task 2 checkpoint resolved as deferred)
- **Files modified:** 1 (docs/deploy.md) + 1 created (pending todo)

## Accomplishments
- Added three additive sections to `docs/deploy.md`: "Upgrading an existing database" (apply_migrations.sh, DATA-01), "Refreshing GTFS data" (update_gtfs.sh, DATA-04), and "Granting the bmtc user service-control permission" (scoped sudoers drop-in, no wildcard)
- Resolved the Task 2 blocking human-verify checkpoint as a **deferral**, not an approval, per explicit operator instruction — target production host is not yet provisioned
- Captured the deferred confirmation as a standalone pending todo, independent of phase completion, so it surfaces again before the first real `update_gtfs.sh` production run

## Task Commits

Each task was committed atomically:

1. **Task 1: Document upgrade path, GTFS refresh, and sudoers drop-in in docs/deploy.md** - `e93fad5` (docs)
2. **Task 2 (Checkpoint): Confirm scoped sudoers/service-control access** - resolved as deferred; no code change. Tracked via `6591280` (docs: capture todo)

**Plan metadata:** (this commit, docs: complete 04-05 plan)

## Files Created/Modified
- `docs/deploy.md` - Adds upgrade-path, GTFS-refresh, and sudoers-drop-in documentation (Task 1, unchanged since e93fad5)
- `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md` - New tracked todo for the deferred sudoers confirmation
- `.planning/STATE.md` - Active TODOs section updated with the deferred item

## Decisions Made
- The operator's response ("Not yet — defer to later") is treated as an explicit deferral, not a checkpoint approval. No approval language was recorded for Task 2.
- The deferral is tracked independently of phase 4 completion (no `resolves_phase` tag on the todo) because it is gated on production host provisioning timing, not on any remaining phase-4 work.
- T-04-08 (Elevation of Privilege, sudoers scope) is left explicitly OPEN in the threat register disposition below — the mitigation is documented and correctly scoped in code/docs, but the human verification step that closes the loop has not occurred.

## Deviations from Plan

None - Task 1 executed exactly as written. Task 2's checkpoint was resolved per explicit operator instruction to defer rather than approve; this is a documented checkpoint resolution, not a deviation from the plan's task list.

## Checkpoint Resolution

**Task 2 (blocking human-verify checkpoint) — DEFERRED, NOT APPROVED.**

- **Operator response (2026-07-04):** "Not yet — defer to later." The target production host is not yet provisioned, so the scoped `/etc/sudoers.d/bmtc-gtfs-update` drop-in (or the run-as-root fallback) cannot be confirmed today.
- **Explicit instruction:** This must not block Phase 4 from closing out. It is tracked as an open item to revisit before the **first production run** of `backend/scripts/update_gtfs.sh`.
- **Tracking artifact:** `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md` (no `resolves_phase` tag — stays open independent of phase 4's completion status).
- **Safety statement:** `update_gtfs.sh` MUST NOT be run against production until this todo is resolved (i.e., until an operator confirms via `sudo -l -U bmtc` + `sudo visudo -c` that the scoped rule is in place with no broader `systemctl *` grant, or explicitly accepts the run-as-root fallback).
- **Threat register status:** T-04-08 (Elevation of Privilege) is **NOT** marked fully mitigated/closed by this plan. The code-side mitigation (scoped, wildcard-free sudoers rule documented in `docs/deploy.md`) is in place, but the human-verification half of the mitigation plan remains outstanding pending production host provisioning.

## Issues Encountered
None beyond the checkpoint deferral documented above.

## User Setup Required

None for this plan directly. However, before the first production `update_gtfs.sh` run, an operator must complete the deferred sudoers confirmation tracked in `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md`.

## Next Phase Readiness
- Phase 4 (Data Management) is now complete: 5/5 plans (04-01 through 04-05).
- DATA-01 and DATA-04 requirements are satisfied at the documentation level; the one outstanding item (sudoers host confirmation) is tracked independently and does not block phase closeout per operator instruction.
- Recommend Phase 5 verification/planning surface the open todo if it audits production-readiness of the GTFS refresh workflow.

---
*Phase: 04-data-management*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: docs/deploy.md
- FOUND: .planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md
- FOUND: .planning/phases/04-data-management/04-05-SUMMARY.md
- FOUND commit: e93fad5 (Task 1)
- FOUND commit: 6591280 (todo capture)
- grep verified: sudoers.d, apply_migrations.sh, update_gtfs.sh, systemctl stop/start bmtc-api present in docs/deploy.md

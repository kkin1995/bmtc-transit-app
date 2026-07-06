# Phase 4: Data Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 4-Data Management
**Areas discussed:** Migration framework origin, Retention & rate-limit cleanup shape, GTFS update: download source, GTFS update: refresh safety semantics

---

## Migration Framework Origin

| Option | Description | Selected |
|--------|-------------|----------|
| Archive as historical, start fresh at 001 | Move 003/004 to archive/ or delete; schema.sql is the baseline; new migrations start at 001 | ✓ |
| Renumber as 001/002, backdate as applied | Rename 003→1, 004→2; new schema_migrations table records them as pre-applied | |
| Keep 003/004 as-is, start new ones at 005 | Leave files untouched, backdate 003+004 as applied, next migration is 005 | |

**User's choice:** Archive as historical, start fresh at 001 (confirmed after a clarifying round-trip — user first asked "What is 001/002/003/004?"; Claude explained the numbering scheme and the specific orphaned files, user then selected option 1).
**Notes:** First AskUserQuestion round on this topic timed out (60s, no response) — Claude proceeded with the recommended default and explicitly flagged the assumption to the user, then re-confirmed later in the session once the user was active again.

| Option | Description | Selected |
|--------|-------------|----------|
| New schema_migrations tracking table | Dedicated table (filename, applied_at) records applied migrations | ✓ |
| Introspect schema state per migration | Each migration checks its own effect via PRAGMA/sqlite_master | |

**User's choice:** New schema_migrations tracking table.
**Notes:** Also timed out on first ask; confirmed on re-ask.

| Option | Description | Selected |
|--------|-------------|----------|
| Up only | Only forward migrations wired into the runner; down scripts manual-only | ✓ (assumed default, not re-confirmed) |
| Up + down wired into runner | apply_migrations.sh supports rollback commands | |

**User's choice:** Up only (defaulted after timeout; not re-asked in the follow-up round — carried into CONTEXT.md as the recommended default).

| Option | Description | Selected |
|--------|-------------|----------|
| Manual, called from bootstrap.py / deploy docs | Run by hand during deploys | ✓ (assumed default, not re-confirmed) |
| Wired into app startup (main.py lifespan) | Migrations auto-apply on every boot | |

**User's choice:** Manual invocation (defaulted after timeout; not re-asked in the follow-up round).

---

## Retention & Rate-Limit Cleanup Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to a script file | New backend/scripts/retention_cleanup.sh, matching rate_limit_cleanup.sh's pattern | ✓ |
| Keep inline, add a second ExecStart line | Add a second inline sqlite3 DELETE to bmtc-retention.service | |

**User's choice:** Extract to a script file.

| Option | Description | Selected |
|--------|-------------|----------|
| bmtc-rate-limit-cleanup.service/.timer, daily | Matches script's own documented filename/cadence | ✓ |
| Something else | Different naming or cadence | |

**User's choice:** bmtc-rate-limit-cleanup.service/.timer, daily.

| Option | Description | Selected |
|--------|-------------|----------|
| Full extraction — one script does both | retention_cleanup.sh runs both ride_segments delete and rides delete in order | ✓ |
| Only add the new rides delete as a script | Leave ride_segments inline, add rides delete as separate script | |

**User's choice:** Full extraction — one script does both.

| Option | Description | Selected |
|--------|-------------|----------|
| Zero remaining segments is sufficient | No separate age gate on the rides row | ✓ |
| Require rides.submitted_at older than retention window too | Extra guard against deleting a very recent zero-segment ride | |

**User's choice:** Zero remaining segments is sufficient.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add rejection_log cleanup as a drive-by fix | Third delete step in retention_cleanup.sh for the unwired 30d TTL | ✓ |
| No, out of scope — defer | Leave rejection_log gap for a future phase | |

**User's choice:** Yes, add as a drive-by fix.
**Notes:** Genuine gap discovered during scouting (config setting + documented SQL exist, but never wired to any script/timer) — not anticipated by ROADMAP/REQUIREMENTS, folded in per the project's established drive-by-fix precedent.

| Option | Description | Selected |
|--------|-------------|----------|
| Leave commented out | VACUUM stays a manual/future opt-in | ✓ |
| Enable it, wire to a weekly timer | New bmtc-vacuum.timer running VACUUM weekly | |

**User's choice:** Leave commented out.

| Option | Description | Selected |
|--------|-------------|----------|
| Stagger by a few minutes | 00:00 for retention, 00:15 for rate-limit-cleanup | ✓ (assumed default after timeout) |
| Same time is fine, don't bother | Rely on SQLite WAL to serialize writers | |

**User's choice:** Stagger (defaulted after a 60s timeout on this specific question; not re-confirmed since the session moved on to GTFS topics per user's own request).

---

## GTFS Update: Download Source

| Option | Description | Selected |
|--------|-------------|----------|
| Accept a local zip path as input | Operator manually obtains GTFS zip, hands to script | ✓ |
| Fetch from a URL | Script curls a hardcoded/parameterized URL | |

**User's choice:** Accept a local zip path as input.

| Option | Description | Selected |
|--------|-------------|----------|
| No known stable URL — keep it manual | Confirms local-path approach | ✓ |
| Yes, I have a URL | Provide URL for automated fetch | |

**User's choice:** No known stable URL — keep it manual.

---

## GTFS Update: Refresh Safety Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Literal criterion only | GTFS-table clear touches only the 7 GTFS-source tables; segment-identity continuity is an accepted limitation | ✓ |
| Add basic reconciliation | Fuzzy-match segment_stats to new route_ids by route_short_name | |

**User's choice:** Literal criterion only.

| Option | Description | Selected |
|--------|-------------|----------|
| Leave append-only, never delete | segments keeps accumulating via INSERT OR IGNORE | ✓ |
| Clear and rebuild segments fresh each refresh | Would orphan all segment_stats rows — contradicts "without losing learning data" | |

**User's choice:** Leave append-only, never delete.

| Option | Description | Selected |
|--------|-------------|----------|
| Sanity thresholds on GTFS tables only | Row counts within reasonable range (not zero, not >50% different) | ✓ |
| Exact row-count match required | Too strict for real GTFS updates | |

**User's choice:** Sanity thresholds on GTFS tables only.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-restore from backup on failure | Script automatically restores pre-refresh backup on validation failure | ✓ |
| Backup only, manual restore on failure | Operator runs restore.sh themselves | |

**User's choice:** Auto-restore from backup on failure.

| Option | Description | Selected |
|--------|-------------|----------|
| Stop the service during refresh | systemctl stop/start bmtc-api around the clear+re-bootstrap steps | ✓ |
| Run live, no service interruption | Rely on WAL mode; risk of empty/partial reads mid-refresh | |

**User's choice:** Stop the service during refresh.

---

## Claude's Discretion

- Exact archive location for orphaned migration files (e.g. `backend/app/migrations/archive/`) — mechanical detail, not re-confirmed with user.
- Exact row-count validation threshold percentage (D-13 uses "say >50%" as an illustrative figure) — left for planner/researcher to size precisely against real GTFS version-to-version deltas.
- Whether `update_gtfs.sh` needs a sudoers entry or runs as a privileged user to call `systemctl stop/start bmtc-api` — flagged as a technical detail for research/planning, not decided in discussion.

## Deferred Ideas

- Route-id reconciliation across GTFS refreshes (fuzzy-matching by route_short_name) — needs its own research/design.
- Automated GTFS feed download from a real BMTC URL, if one becomes known later.
- VACUUM scheduling — revisit only if disk growth becomes an actual operational problem.

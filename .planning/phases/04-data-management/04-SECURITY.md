---
phase: 04
slug: data-management
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-04
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| operator → apply_migrations.sh | Operator manually triggers the runner post-deploy; migration SQL files are repo-controlled, not external input | Migration SQL (trusted, version-controlled) |
| script → bmtc.db (migrations) | DDL applied directly to the SQLite file via sqlite3 CLI | Schema DDL |
| systemd timer → rate_limit_cleanup.sh | Timer-triggered local script; no external input | None (local trigger only) |
| script → bmtc.db (rate limit cleanup) | Bounded DELETE against rate_limit_buckets | Row deletion, TTL-gated |
| systemd timer → retention_cleanup.sh | Timer-triggered local script; TTLs from EnvironmentFile, no external input | Config-sourced TTL values |
| script → bmtc.db (retention cleanup) | Three bounded DELETEs (ride_segments, orphan rides, rejection_log) | Row deletion, TTL-gated |
| operator → update_gtfs.sh ($1 zip path) | Operator supplies a local zip path — untrusted input crossing into shell + downstream GTFS parsing | Local file path, zip archive contents |
| bmtc user → systemd (systemctl stop/start bmtc-api) | Non-root user requests privileged service control via scoped sudoers rule | Service control commands |
| script → app.bootstrap → bmtc.db | Re-bootstrap parses the zip and writes GTFS tables + schedule_mean | GTFS static data |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Tampering | Migration SQL files | low | accept | Migration files are version-controlled and code-reviewed; not external input. No runtime untrusted data path. | closed |
| T-04-02 | Denial of Service | apply_migrations.sh applied to wrong/prod DB | low | mitigate | `backend/scripts/apply_migrations.sh:31-34` validates the DB file exists before running; migrations dir only globs `*_up.sql` (up-only), tracked via `schema_migrations`. | closed |
| T-04-03 | Denial of Service | Two timers writing the single-writer DB simultaneously | low | mitigate | `backend/deploy/bmtc-retention.timer` (OnCalendar=00:00:00) and `backend/deploy/bmtc-rate-limit-cleanup.timer` (OnCalendar=00:15:00) are staggered by 15 minutes; WAL mode tolerates concurrent writes regardless. | closed |
| T-04-04 | Tampering | systemd unit ExecStart path | low | accept | Unit files are repo-controlled and deployed by the operator; ExecStart points at a fixed repo script path, no dynamic input. | closed |
| T-04-05 | Denial of Service | Over-broad delete removing in-window data | low | mitigate | `backend/scripts/retention_cleanup.sh:51,66` gates deletes by explicit TTL windows (`RETENTION_DAYS`, `REJECTION_LOG_RETENTION_DAYS`) with positive-integer guards (lines 39-45); orphan delete requires zero remaining segments. | closed |
| T-04-06 | Repudiation | Silent deletion with no audit trail | low | accept | Script logs before/after counts per delete (matches rate_limit_cleanup.sh); journald captures oneshot output. | closed |
| T-04-07 | Tampering | `$1` zip path interpolated into shell commands | high | mitigate | `backend/scripts/update_gtfs.sh:60-70` — `$1` always double-quoted, no `eval` anywhere in the file (grep-confirmed), validated as an existing regular file passing `unzip -t` before any side effect. | closed |
| T-04-08 | Elevation of Privilege | sudoers rule for `systemctl stop/start bmtc-api` | high | accept | Code/docs mitigation in place: `/etc/sudoers.d/bmtc-gtfs-update` scoped to the two exact command strings, no wildcard (`docs/deploy.md`). Human verification on the production host (`sudo -l -U bmtc` + `sudo visudo -c`) explicitly deferred by operator 2026-07-04 — host not yet provisioned. See Accepted Risks Log. | closed (accepted) |
| T-04-09 | Denial of Service | Malformed/oversized zip hangs app.bootstrap's stop_times parse | medium | mitigate | `backend/scripts/update_gtfs.sh:67-70` validates via `unzip -t` before parsing; `rollback_and_exit` (lines 101-198, armed via `trap ... ERR` at line 151) restores backup and restarts the service on any failure. | closed |
| T-04-10 | Information Disclosure | Pre-refresh backup file readable by non-owners | low | accept | Backup written to existing `BMTC_BACKUP_DIR` via `backup.sh`, inheriting current filesystem permissions — unchanged by this phase. | closed |
| T-04-11 | Tampering | Destructive clear deletes learning tables | high | mitigate | `backend/scripts/update_gtfs.sh:43,165-167` — clear loop touches exactly the 7 GTFS tables, never learning tables. `backend/tests/test_gtfs_update.py:237-242` (`test_update_gtfs_happy_path_preserves_learning_data`) asserts rides/ride_segments/segment_stats counts unchanged across a refresh. | closed |
| T-04-12 | Spoofing | Broad pre-existing sudoers rule silently over-granting | medium | accept | Docs (`docs/deploy.md:260`) instruct the operator to confirm no broader `systemctl *` rule exists before first production use. Same deferred human-verification gap as T-04-08, same tracked todo. See Accepted Risks Log. | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-01 | Migration SQL files are version-controlled and code-reviewed, not external input. | Operator | 2026-07-04 |
| AR-04-02 | T-04-04 | systemd unit ExecStart paths are repo-controlled and fixed, no dynamic input. | Operator | 2026-07-04 |
| AR-04-03 | T-04-06 | Deletion audit trail via before/after count logging + journald is sufficient for this data-management phase; no dedicated audit table required. | Operator | 2026-07-04 |
| AR-04-04 | T-04-10 | Backup file permissions are inherited from existing filesystem conventions, unchanged by this phase; out of scope for phase 4. | Operator | 2026-07-04 |
| AR-04-05 | T-04-08, T-04-12 | Code/docs-side mitigation (scoped, wildcard-free sudoers rule) is correctly implemented and documented in `docs/deploy.md`. The remaining gap is host-specific human verification (`sudo -l -U bmtc` + `sudo visudo -c`, confirming no broader pre-existing `systemctl *` rule), which cannot be performed because the target production host is not yet provisioned. Operator explicitly deferred this on 2026-07-04 rather than approving it outright. Tracked independently via `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md`. `update_gtfs.sh`'s documented safety statement requires this todo be resolved (or the run-as-root fallback explicitly accepted) before any production run. | Operator | 2026-07-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-04 | 12 | 12 | 0 | /gsd-secure-phase (orchestrator grep-verification + operator risk acceptance) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-04

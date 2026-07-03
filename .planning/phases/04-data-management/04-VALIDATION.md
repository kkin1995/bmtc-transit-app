---
phase: 4
slug: data-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.4.3 with pytest-xdist 3.5.0, pytest-randomly 3.15.0 (existing) |
| **Config file** | `backend/pyproject.toml` |
| **Quick run command** | `cd backend && uv run pytest tests/test_migrations.py tests/test_retention_cleanup.py tests/test_gtfs_update.py tests/test_rate_limit_cleanup_script.py -v` |
| **Full suite command** | `cd backend && uv run pytest -n auto --dist loadfile -q` |
| **Estimated runtime** | ~10-15 seconds (full suite currently ~9-10s per CLAUDE.md baseline; new script-level tests add a small increment) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the file(s) touched by that task
- **After every plan wave:** Run `cd backend && uv run pytest -n auto --dist loadfile -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

*Task IDs are assigned by the planner (gsd-planner) — this map is seeded at requirement granularity from RESEARCH.md's "Phase Requirements → Test Map"; the planner must map each row onto concrete task IDs.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01 T2/T3 | 04-01 | 1 | DATA-01 | T-04-02 | `apply_migrations.sh` applies a pending migration exactly once, is a no-op on re-run, and fresh-bootstrap seeds `schema_migrations` (Pitfall 1) so it never double-applies | integration (subprocess vs `temp_db`) | `uv run pytest tests/test_migrations.py -x` | ❌ W0 (created in 04-01 T2) | ⬜ pending |
| 04-02 T2 | 04-02 | 1 | DATA-02 | T-04-03 | `rate_limit_cleanup.sh` deletes buckets older than TTL; `bmtc-rate-limit-cleanup.service`/`.timer` exist, parse, and are staggered from `bmtc-retention.timer` (D-09) | unit (script) + static (unit file syntax) | `uv run pytest tests/test_rate_limit_cleanup_script.py -x`; `systemd-analyze verify deploy/bmtc-rate-limit-cleanup.service` | ❌ W0 (created in 04-02 T2) | ⬜ pending |
| 04-03 T1/T2 | 04-03 | 1 | DATA-03 | T-04-05 | `retention_cleanup.sh` deletes `ride_segments` past TTL, then `rides` with zero remaining segments, then `rejection_log` past TTL, in one script run | integration (subprocess vs `temp_db`, seeded orphan/non-orphan rides) | `uv run pytest tests/test_retention_cleanup.py -x` | ❌ W0 (created in 04-03 T1) | ⬜ pending |
| 04-04 T2/T3 | 04-04 | 1 | DATA-04 | T-04-07/08/09/11 | `update_gtfs.sh` completes backup→stop→clear→re-bootstrap→validate→restart on a passing GTFS zip, and backup→stop→clear→re-bootstrap→validate-FAIL→rollback→restart on a corrupt/empty one, without touching `segment_stats`/`rides`/`ride_segments` row counts | integration (subprocess, synthetic GTFS zip fixture) | `uv run pytest tests/test_gtfs_update.py -x` | ❌ W0 (created in 04-04 T1/T2) | ⬜ pending |
| 04-05 T2 | 04-05 | 2 | DATA-04 | T-04-08 | Scoped sudoers for `systemctl stop/start bmtc-api` confirmed on target host (blocking human-verify — not automatable) | manual (checkpoint:human-verify) | n/a (see Manual-Only Verifications) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_migrations.py` — covers DATA-01 (apply, no-op re-run, fresh-bootstrap seeding per Pitfall 1)
- [ ] `backend/tests/test_retention_cleanup.py` — covers DATA-03 (and the `ride_segments`/`rejection_log` portions adjacent to DATA-02)
- [ ] `backend/tests/test_rate_limit_cleanup_script.py` — covers DATA-02's script behavior directly (existing `rate_limit_cleanup.sh` has never had a subprocess-level test)
- [ ] `backend/tests/test_gtfs_update.py` — covers DATA-04; needs a small synthetic GTFS zip fixture and a way to stub `systemctl` calls
- [ ] `backend/tests/fixtures/mini_gtfs.zip` — tiny synthetic GTFS fixture (handful of stops/routes/trips) for `test_gtfs_update.py`; the real `gtfs/bmtc.zip` is too large/slow for unit tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `bmtc` user has sudoers/polkit permission to run `systemctl stop bmtc-api` / `systemctl start bmtc-api` | DATA-04 | Requires access to the actual production host's sudoers state, which is outside the repo and outside any test environment (RESEARCH.md Open Question 2 / Pitfall 3) | Before first production run of `update_gtfs.sh`: confirm `/etc/sudoers.d/bmtc-gtfs-update` (or equivalent) grants exactly `systemctl stop bmtc-api` and `systemctl start bmtc-api` to the `bmtc` user, with no wildcard scope |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

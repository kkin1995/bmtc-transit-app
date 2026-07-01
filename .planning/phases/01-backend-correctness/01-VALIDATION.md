---
phase: 1
slug: backend-correctness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.4.3 with pytest-xdist 3.5.0 (`--dist loadfile -n auto`) and pytest-randomly |
| **Config file** | `backend/pytest.ini` |
| **Quick run command** | `cd backend && uv run pytest tests/test_idempotency.py tests/test_idempotency_bodyhash.py -v` |
| **Full suite command** | `cd backend && uv run pytest -q` |
| **Estimated runtime** | ~2-10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the targeted test file for the task's requirement (e.g. `uv run pytest tests/test_idempotency_bodyhash.py -v` after the BUGFIX-03 task)
- **After every plan wave:** Run `cd backend && uv run pytest -q` (full suite) — diff the failure list against the recorded 8-failure baseline below
- **Before `/gsd-verify-work`:** Full suite must be run; failure *count* must not exceed the baseline of 8 (fewer is fine if drive-by fixes are made; any failure not in the baseline list is a regression)
- **Max feedback latency:** ~10 seconds

**Baseline (recorded 2026-07-01, before any Phase 1 change): 174 passed, 8 failed.** The 8 pre-existing failures (none caused by Phase 1's scope):
- `test_idempotency.py::test_idempotency_key_store_and_retrieve`
- `test_idempotency.py::test_idempotency_key_replace`
- `test_idempotency_bodyhash.py::test_replay_with_reordered_json_keys_succeeds`
- `test_idempotency_bodyhash.py::test_replay_with_modified_segment_data_returns_409`
- `test_idempotency_bodyhash.py::test_replay_with_different_body_returns_409`
- `test_idempotency_bodyhash.py::test_expired_key_allows_new_submission`
- `test_rate_limit.py::test_fallback_to_ip_when_no_device_bucket`
- `test_rate_limit.py::test_rate_limit_error_structure`

---

## Per-Task Verification Map

*Task IDs are assigned once the planner creates PLAN.md files — this table maps requirement → verification approach ahead of that; the planner should carry these rows forward with concrete Task IDs.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | BUGFIX-01 | T-01-DoS-FDLeak | Connection closes on exception in `ride_summary`/`get_eta`/`get_stops`/`get_routes`/`get_stop_schedule`/`search_routes` | integration | New test: force a mid-handler exception (monkeypatch `update_segment_stats` to raise), assert connection closed / no `database is locked` under repeated forced failures | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-02 | T-02-CORS-Tampering | CORS rejects non-allowlisted origins; no `Access-Control-Allow-Credentials` header present for any origin | integration | `uv run pytest tests/test_cors.py -v` (new file) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-03 | T-03-Idempotency-DoS | Idempotent replay returns original `accepted_segments`/`rejected_segments`, not zeros | integration | `uv run pytest tests/test_idempotency_bodyhash.py -v` + new replay-value assertion test | ⚠️ partial | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-07 | — | `idempotency_keys` has 0 rows >24h old immediately after fresh startup | integration | `uv run pytest tests/test_idempotency.py::test_cleanup_expired_keys -v` + new startup-invocation test | ⚠️ partial | ⬜ pending |
| TBD | TBD | TBD | API-05 | — | `X-Deprecation-Warning` header present on POST `/v1/ride_summary` and GET `/v1/eta` when `timestamp_utc` used; absent otherwise | integration | New test asserting header presence/absence | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LEARN-03 | — | No `slowapi` import/usage anywhere in `backend/app/` | static/grep | `grep -rn "slowapi" backend/app/ --include="*.py"` returns zero matches | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_cors.py` — new file, covers BUGFIX-02 (origin allowlist enforcement, credentials header absence)
- [ ] New test in `backend/tests/test_integration.py` or a new `test_connection_leak.py` — covers BUGFIX-01 (forced-exception connection-close verification)
- [ ] New test(s) in `backend/tests/test_idempotency_bodyhash.py` or a new file — covers BUGFIX-03's replay-value assertion (existing tests check hash/conflict behavior, not the *value* of the replayed response body)
- [ ] New test asserting `cleanup_expired_keys()` runs at app startup (not just that the function works standalone) — covers BUGFIX-07's "on startup" requirement specifically
- [ ] New test(s) for `X-Deprecation-Warning` header presence — covers API-05
- [ ] Framework install: none — pytest/httpx/TestClient already present and sufficient for all of the above

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

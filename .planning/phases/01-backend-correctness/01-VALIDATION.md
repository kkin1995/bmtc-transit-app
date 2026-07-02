---
phase: 1
slug: backend-correctness
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-01
validated: 2026-07-02
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

**Original baseline (recorded 2026-07-01, before any Phase 1 change): 174 passed, 8 failed.** **Current baseline (post Phase 1 + validation gap-fill): 190 passed, 6 failed.** The 6 remaining pre-existing failures (out of Phase 1 scope, tracked for a later phase):
- `test_idempotency_bodyhash.py::test_replay_with_reordered_json_keys_succeeds`
- `test_idempotency_bodyhash.py::test_replay_with_modified_segment_data_returns_409`
- `test_idempotency_bodyhash.py::test_replay_with_different_body_returns_409`
- `test_idempotency_bodyhash.py::test_expired_key_allows_new_submission`
- `test_rate_limit.py::test_fallback_to_ip_when_no_device_bucket`
- `test_rate_limit.py::test_rate_limit_error_structure`

(The 2 `test_idempotency.py` failures from the original 8 were fixed as a drive-by in Plan 03.)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01/T1-T3 | 01 | — | BUGFIX-01 | T-01-DoS-FDLeak | `get_connection()` is an `@contextmanager` with try/finally; connection closes on every exit path incl. mid-handler exceptions | integration | `uv run pytest tests/test_connection_leak.py -v` | ✅ | ✅ green |
| 01-02/T1-T2 | 02 | — | BUGFIX-02 | T-02-CORS-Tampering | CORS uses explicit `BMTC_CORS_ORIGINS` allowlist; `allow_credentials` removed entirely | integration | `uv run pytest tests/test_cors.py -v` | ✅ | ✅ green |
| 01-03/T2-T4 | 03 | — | BUGFIX-03 | T-03-Idempotency-DoS | Idempotent replay returns original `accepted_segments`/`rejected_segments`, byte-for-byte, not zeros | integration | `uv run pytest tests/test_idempotency_bodyhash.py::test_replay_returns_original_accepted_count_not_zero -v` | ✅ | ✅ green |
| 01-03/T2-T4 (gap-fill) | 03 | — | BUGFIX-03 | T-03-Idempotency-DoS | Legacy `response_body IS NULL` rows (pre-migration) are treated as a cache miss and reprocessed fresh, not replayed as stale zeros | integration | `uv run pytest tests/test_idempotency_bodyhash.py::test_legacy_null_response_body_reprocesses_fresh -v` | ✅ | ✅ green |
| 01-02/T1-T2 | 02 | — | BUGFIX-07 | — | `cleanup_expired_keys()` invoked at application lifespan startup; `idempotency_keys` has 0 rows >24h old after fresh startup | integration | `uv run pytest tests/test_startup_cleanup.py -v` | ✅ | ✅ green |
| 01-03/T1-T4 | 03 | — | API-05 | — | `X-Deprecation-Warning` header present on POST `/v1/ride_summary` and GET `/v1/eta` when `timestamp_utc` used; absent otherwise; documented spec-first in `docs/api.md` | integration + docs | `uv run pytest tests/test_deprecation_header.py -v` + `grep -c 'X-Deprecation-Warning' docs/api.md` (≥2) | ✅ | ✅ green |
| 01-02/T3 | 02 | — | LEARN-03 | — | No `slowapi` import/usage anywhere in `backend/app/`; `RateLimitMiddleware` is sole rate limiter | static/grep | `grep -rn "slowapi" backend/app/ --include="*.py"` returns zero matches | N/A | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/tests/test_cors.py` — covers BUGFIX-02 (origin allowlist enforcement, credentials header absence)
- [x] `backend/tests/test_connection_leak.py` — covers BUGFIX-01 (forced-exception connection-close verification)
- [x] `backend/tests/test_idempotency_bodyhash.py::test_replay_returns_original_accepted_count_not_zero` — covers BUGFIX-03's replay-value assertion
- [x] `backend/tests/test_idempotency_bodyhash.py::test_legacy_null_response_body_reprocesses_fresh` — covers BUGFIX-03's legacy-row fallback (added during this validation pass, see Audit Trail below)
- [x] `backend/tests/test_startup_cleanup.py` — covers BUGFIX-07's "on startup" requirement specifically
- [x] `backend/tests/test_deprecation_header.py` — covers API-05
- [x] Framework install: none — pytest/httpx/TestClient already present and sufficient for all of the above

---

## Manual-Only Verifications

*All phase behaviors have automated verification. No manual-only items remain.*

---

## Validation Audit 2026-07-02

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

Retroactive audit against the completed phase's 3 PLAN/SUMMARY pairs. All 6 requirements (BUGFIX-01, BUGFIX-02, BUGFIX-03, BUGFIX-07, API-05, LEARN-03) already had passing automated tests recorded in SUMMARY `coverage` blocks; re-ran the full suite and each targeted test file to confirm (190 passed, 6 pre-existing out-of-scope failures unchanged, matching Plan 03's recorded baseline).

One gap found: BUGFIX-03's legacy-row fallback (`response_body IS NULL`) was verified only by code inspection in 01-03-SUMMARY.md (coverage id D2), with no dedicated regression test. Spawned `gsd-nyquist-auditor`, which added `test_legacy_null_response_body_reprocesses_fresh` to `backend/tests/test_idempotency_bodyhash.py` — seeds a legacy row via direct SQL (`response_body=NULL`, matching `body_hash`), POSTs with the same idempotency key, and asserts a fresh 200 response with correct non-zero `accepted_segments` (not a crash, not stale zeros, not a 409). Required one debug iteration to align the test's manually-computed `body_hash` with the app's exact `RideSummary(**data).model_dump()` hashing. Full suite after fix: 190 passed, 6 failed (net +1 passing, same 6 baseline failures).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-07-02 — Phase 1 is Nyquist-compliant, all 6 requirements have automated, passing verification.

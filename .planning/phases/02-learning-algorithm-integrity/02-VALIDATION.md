---
phase: 2
slug: learning-algorithm-integrity
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-02
validated: 2026-07-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.4.3 (confirmed installed via `uv run`), with pytest-xdist 3.5.0 + pytest-randomly 3.15.0 for parallel/order-independent execution |
| **Config file** | `backend/pyproject.toml` (dependency groups only; markers via module-level `pytestmark`) |
| **Quick run command** | `cd backend && uv run pytest tests/test_learning.py -v` |
| **Full suite command** | `cd backend && uv run pytest -n auto --dist loadfile -q` |
| **Estimated runtime** | ~1-10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the targeted test file for the task's requirement (e.g. `uv run pytest tests/test_learning.py -v` for BUGFIX-05/LEARN-01 unit changes; `uv run pytest tests/test_integration.py -k <keyword> -x` for BUGFIX-04/BUGFIX-06 integration changes)
- **After every plan wave:** Run `cd backend && uv run pytest -n auto --dist loadfile -q` (full suite) — diff the failure list against the recorded baseline below
- **Before `/gsd-verify-work`:** Full suite must be green or at/under the pre-existing baseline (no new regressions introduced)
- **Max feedback latency:** ~10 seconds

**Baseline (recorded end of Phase 1, 2026-07-02): 189 passed, 6 pre-existing failures** (per STATE.md's Performance Metrics — `test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2). Confirmed at audit time (2026-07-02): full suite is **198 passed, 6 pre-existing failures** — the same 6 pre-existing failures (`test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2), zero new regressions, +9 net new passing tests from Phase 2's four plans.

---

## Per-Task Verification Map

*Reconstructed from 02-01 through 02-04 PLAN/SUMMARY frontmatter. All commands re-run and confirmed green at audit time (2026-07-02).*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-02 | 02-01 (`a812bcd`) | 1 | BUGFIX-05 | — | `compute_variance` returns `m2/(n-1)` sample variance for n>=2, not `m2/n` population variance | unit | `uv run pytest tests/test_learning.py -k test_compute_variance_uses_sample_formula_not_population -x` | ✅ | ✅ green |
| 02-01-02 | 02-01 (`a812bcd`) | 1 | BUGFIX-05 (guard) | — | `n<2` guard preserved unchanged (n=0 and n=1 both return 0.0, no `ZeroDivisionError`) | unit | `uv run pytest tests/test_learning.py -k test_compute_variance_guards_n_less_than_2 -x` | ✅ | ✅ green |
| 02-01-01 | 02-01 (`707ebde`) | 1 | BUGFIX-05 (P90) | — | P90 ETA bound measurably wider with sample vs population variance after 10 observations | unit | `uv run pytest tests/test_learning.py -k test_p90_wider_with_sample_variance_than_population_variance -x` | ✅ | ✅ green |
| 02-02-02 | 02-02 (`b51d99b`) | 2 | BUGFIX-04 | — | New segment×bin seeds a row; triggering observation accepted (n becomes 1), never rejected as `missing_stats` | unit | `uv run pytest tests/test_learning.py -k test_update_segment_stats_seeds_new_bin_and_accepts -x` | ✅ | ✅ green |
| 02-02-02 | 02-02 (`b51d99b`) | 2 | BUGFIX-04 (D-10) | — | Zero existing `segment_stats` rows for segment falls back to `schedule_mean=0.0` (AVG NULL) | unit | `uv run pytest tests/test_learning.py -k test_seed_falls_back_to_zero_when_no_existing_bins -x` | ✅ | ✅ green |
| 02-02-02 | 02-02 (`b51d99b`) | 2 | BUGFIX-04 (outlier guard) | — | A freshly seeded n=0 row's first observation is never falsely rejected as an outlier | unit | `uv run pytest tests/test_learning.py -k test_seed_row_is_not_falsely_rejected_as_outlier -x` | ✅ | ✅ green |
| 02-02-02 | 02-02 (`b51d99b`) | 2 | LEARN-01 / D-07 | — | `update_ema`, `compute_time_based_alpha`, and `is_stale` no longer exist in `app.learning` | unit | `uv run pytest tests/test_learning.py -k test_update_ema_and_compute_time_based_alpha_and_is_stale_are_removed -x` | ✅ | ✅ green |
| 02-02-02 | 02-02 (`b51d99b`) | 2 | LEARN-01 | — | `update_segment_stats` no longer reads/writes `ema_mean`/`ema_var` or calls EMA helpers | unit | `uv run pytest tests/test_learning.py -k test_ema_columns_not_written_by_update_segment_stats -x` | ✅ | ✅ green |
| 02-02-03 | 02-02 (`49b866e`) | 2 | Regression (Pitfall #3) | — | `test_rejected_by_reason_breakdown` / `test_outlier_rejection` reflect post-BUGFIX-04 deterministic rejection reasons (no `missing_stats` tolerance) | integration | `uv run pytest tests/test_global_aggregation.py -k "rejected_by_reason_breakdown or outlier_rejection" -x` | ✅ | ✅ green |
| 02-03-01 | 02-03 (`d65ba59`) | 3 | LEARN-01 (D-14 config gap) | — | `GET /v1/config` returns 200 (not 500) after `config.py` field removal; `ema_alpha`/`half_life_days` present-but-`null` | integration | `uv run pytest tests/test_integration.py -k test_config_endpoint -x` / `uv run pytest tests/test_api_v1_alignment.py -k get_config -x` | ✅ | ✅ green |
| 02-04-02 | 02-04 (`090abf5`) | 4 | BUGFIX-06 | T-2-01 | 50-segment ride triggers exactly one `conn.commit()` for the whole transaction | integration | `uv run pytest tests/test_integration.py -k test_ride_with_50_segments_commits_exactly_once -x` | ✅ | ✅ green |
| 02-04-02 | 02-04 (`090abf5`) | 4 | BUGFIX-06 (D-13) | T-2-01 | `update_device_bucket` called exactly once per ride, not per segment | integration | `uv run pytest tests/test_global_aggregation.py -k test_device_bucket_updated_once_per_ride -x` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Audit result: 0 gaps.** Every requirement row from the pre-execution draft (BUGFIX-04, BUGFIX-05, BUGFIX-06, LEARN-01, D-07, D-10, D-13, D-14, Pitfall #3) has a corresponding automated test, confirmed passing at audit time. No `gsd-nyquist-auditor` spawn was needed.

---

## Wave 0 Requirements

- [x] `backend/tests/test_learning.py` — new unit tests landed: sample-formula + guard (BUGFIX-05, Plan 01), P90 widening comparison (BUGFIX-05, Plan 01), seed-and-fall-through behavior (BUGFIX-04, Plan 02), zero-existing-bins fallback (BUGFIX-04/D-10, Plan 02), EMA/`is_stale` removal verification (LEARN-01/D-03/D-07, Plan 02)
- [x] `backend/tests/test_integration.py` — new single-commit-per-ride test landed (BUGFIX-06, Plan 04) and a `GET /v1/config` non-500 test (D-14, Plan 03). **Deviation:** the commit-counting mechanism uses a `sqlite3.connect`-factory wrapper, not the `sqlite3.Connection.commit` monkeypatch originally specified — the latter raises `TypeError` on this build (Python 3.12.13 / sqlite3 3.50.4) because `sqlite3.Connection` is an immutable C type. Same intent (count real commits across the POST), build-compatible mechanism. See 02-04-SUMMARY.md.
- [x] `backend/tests/test_global_aggregation.py` — new `update_device_bucket` once-per-ride test landed (BUGFIX-06/D-13, Plan 04); existing `test_rejected_by_reason_breakdown` and `test_outlier_rejection` updated (Pitfall #3, Plan 02)
- [x] `backend/tests/test_api_v1_alignment.py` — `test_get_config_has_all_spec_fields`/`test_get_config_values_are_reasonable` updated per D-14 (Plan 03)
- [x] Deleted `backend/tests/test_learning.py::test_ema_update` and `::test_time_based_alpha` per D-03 (Plan 02)
- [x] Framework install: none needed — `pytest`, `pytest-xdist`, `pytest-randomly` already present per `pyproject.toml`

---

## Manual-Only Verifications

All phase behaviors have automated verification. This phase is pure backend algorithm/DB logic (no UI, no external service integration) — every success criterion in ROADMAP.md maps to a unit or integration test per the table above. Confirmed at audit time: zero manual-only escalations.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s (full suite runs in ~1.8s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (audit, 2026-07-02)

---

## Validation Audit 2026-07-02

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 (none needed — all 10 pre-execution requirement rows already had passing tests) |
| Escalated | 0 |

Re-ran all 12 targeted test commands from the Per-Task Verification Map plus the full suite (`cd backend && uv run pytest -n auto --dist loadfile -q`): **198 passed, 6 pre-existing failures** (`test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2 — same baseline as Phase 1, no new regressions). Auditor reconstructed the Per-Task Verification Map from `02-01` through `02-04` PLAN/SUMMARY coverage frontmatter since this VALIDATION.md predated plan execution (all rows were `TBD`/`⬜ pending` from the pre-planning draft). No `gsd-nyquist-auditor` subagent spawn was required — zero gaps found on first pass.

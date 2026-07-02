---
phase: 2
slug: learning-algorithm-integrity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
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

**Baseline (recorded end of Phase 1, 2026-07-02): 189 passed, 6 pre-existing failures** (per STATE.md's Performance Metrics — `test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2). This phase should not introduce new failures; it may also reduce or shift the baseline where it touches `test_api_v1_alignment.py` (D-14/Pitfall #1) and `test_global_aggregation.py` (Pitfall #3).

---

## Per-Task Verification Map

*Task IDs are not yet assigned — planning has not run. The table below maps requirements to concrete tests per RESEARCH.md's "Phase Requirements → Test Map"; Task ID/Plan/Wave columns will be filled once `/gsd-plan-phase` produces PLAN.md files, then re-verified by `gsd-nyquist-auditor`.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | BUGFIX-04 | — | New segment×bin seeds a row; triggering observation accepted (n becomes 1) | unit + integration | `uv run pytest tests/test_learning.py -k seed -x` / `uv run pytest tests/test_integration.py -k first_observation -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-04 (D-10) | — | Zero existing `segment_stats` rows for segment falls back to `schedule_mean=0.0` | unit | `uv run pytest tests/test_learning.py -k zero_existing_bins -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-05 | — | `compute_variance` returns `m2/(n-1)` for n>=2; `n<2` guard intact | unit | `uv run pytest tests/test_learning.py -k sample_formula -x` / `-k guards_n_less_than_2 -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-05 (P90) | — | P90 bound measurably wider with sample vs population variance after 10 observations | unit | `uv run pytest tests/test_learning.py -k p90_wider -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-06 | T-2-01 | 50-segment ride triggers exactly one `conn.commit()` | integration | `uv run pytest tests/test_integration.py -k commits_exactly_once -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | BUGFIX-06 (D-13) | T-2-01 | `update_device_bucket` called exactly once per ride, not per segment | integration | `uv run pytest tests/test_global_aggregation.py -k device_bucket_updated_once -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | LEARN-01 | — | `update_ema`/`compute_time_based_alpha` no longer exist; `ema_mean`/`ema_var` not written | unit | `uv run pytest tests/test_learning.py -k ema_removed -x` / `-k ema_columns_not_written -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | LEARN-01 (D-14 config gap) | — | `GET /v1/config` does not 500 after `config.py` field removal; `ema_alpha`/`half_life_days` return `null` | integration | `uv run pytest tests/test_integration.py -k test_config_endpoint -x` / updated `tests/test_api_v1_alignment.py -k get_config -x` | ⚠️ Exists, needs update | ⬜ pending |
| TBD | TBD | TBD | D-07 | — | `is_stale()` removed, zero callers remain | unit | `uv run pytest tests/test_learning.py -k is_stale_removed -x` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | Regression (Pitfall #3) | — | `test_rejected_by_reason_breakdown` reflects post-BUGFIX-04 rejection reasons (no `missing_stats` for unseeded bins) | integration | `uv run pytest tests/test_global_aggregation.py -k rejected_by_reason_breakdown -x` | ⚠️ Exists, needs update | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_learning.py` — new unit tests: sample-formula + guard (BUGFIX-05), P90 widening comparison (BUGFIX-05), seed-and-fall-through behavior (BUGFIX-04), zero-existing-bins fallback (BUGFIX-04/D-10), EMA/`is_stale` removal verification (LEARN-01/D-03/D-07)
- [ ] `backend/tests/test_integration.py` — new single-commit-per-ride test (BUGFIX-06, via `sqlite3.Connection.commit` monkeypatch-counting) and a `GET /v1/config` non-500 test (D-14)
- [ ] `backend/tests/test_global_aggregation.py` — new `update_device_bucket` once-per-ride test (BUGFIX-06/D-13); update existing `test_rejected_by_reason_breakdown` and `test_outlier_rejection` (Pitfall #3)
- [ ] `backend/tests/test_api_v1_alignment.py` — update `test_get_config_has_all_spec_fields`/`test_get_config_values_are_reasonable` per D-14
- [ ] Delete `backend/tests/test_learning.py::test_ema_update` and `::test_time_based_alpha` per D-03
- [ ] Framework install: none — `pytest`, `pytest-xdist`, `pytest-randomly` already present per `pyproject.toml`

---

## Manual-Only Verifications

All phase behaviors have automated verification. This phase is pure backend algorithm/DB logic (no UI, no external service integration) — every success criterion in ROADMAP.md maps to a unit or integration test per the table above.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

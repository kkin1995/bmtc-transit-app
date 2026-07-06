---
phase: 02-learning-algorithm-integrity
verified: 2026-07-02T00:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Learning Algorithm Integrity Verification Report

**Phase Goal:** The Welford+EMA learning model produces statistically correct outputs — new segments learn from their first observation, P90 bounds are not systematically underestimated, all segment writes commit in one transaction, and EMA is either used or removed
**Verified:** 2026-07-02
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submitting a ride segment for a never-seen `(segment_id, bin_id)` creates a `segment_stats` row and the observation is accepted (n becomes 1) — never rejected with `missing_stats` | ✓ VERIFIED | `backend/app/learning.py:224-249` — `update_segment_stats` seeds a new row via `INSERT INTO segment_stats (... n=0 ...)` on `row is None`, then falls through into the shared outlier/Welford path (no early `return False, "missing_stats"` remains: `grep -c missing_stats backend/app/learning.py` = 0). Behavioral proof: `tests/test_learning.py::test_update_segment_stats_seeds_new_bin_and_accepts` PASSED (ran directly) |
| 2 | Seed `schedule_mean` falls back to `0.0` when the segment has zero existing `segment_stats` rows (AVG returns NULL) | ✓ VERIFIED | `backend/app/learning.py:228-233` — `avg_row[0] if avg_row and avg_row[0] is not None else 0.0`. Behavioral proof: `tests/test_learning.py::test_seed_falls_back_to_zero_when_no_existing_bins` PASSED (ran directly) |
| 3 | The seeded n=0 row's first observation is never falsely rejected as an outlier | ✓ VERIFIED | `is_outlier()` short-circuits at `n <= 5` (learning.py:48-49), so the seeded n=0 row is exempt. Behavioral proof: `tests/test_learning.py::test_seed_row_is_not_falsely_rejected_as_outlier` PASSED (ran directly) |
| 4 | `compute_variance(m2, n)` returns `m2/(n-1)` sample variance for n>=2, not `m2/n` population variance; guard for n<2 preserved | ✓ VERIFIED | `backend/app/learning.py:38-40`: `if n < 2: return 0.0` / `return m2 / (n - 1)`. `grep -n 'return m2 / (n - 1)'` = 1 match, `grep -c 'return m2 / n$'` = 0. Behavioral proof: `test_compute_variance_uses_sample_formula_not_population` and `test_compute_variance_guards_n_less_than_2` both PASSED (ran directly) |
| 5 | After 10 observations, the P90 bound computed with sample variance is strictly wider than with population variance | ✓ VERIFIED | Behavioral proof: `tests/test_learning.py::test_p90_wider_with_sample_variance_than_population_variance` PASSED (ran directly) — computes both formulas inline and asserts strict inequality via `compute_percentiles_robust` |
| 6 | A ride with 50 segments triggers exactly one `conn.commit()` for the whole transaction, not ~100 | ✓ VERIFIED | `backend/app/routes.py:210` — single `conn.commit()` at end of the `with get_connection(...)` block, outside the per-segment loop. Behavioral proof: `tests/test_integration.py::test_ride_with_50_segments_commits_exactly_once` PASSED (ran directly), using a `sqlite3.connect`-factory counting wrapper |
| 7 | `update_device_bucket()` is called exactly once per ride, not once per segment | ✓ VERIFIED | `backend/app/routes.py:130-134` — the call is hoisted before the `for seq, segment in enumerate(...)` loop; `grep -c 'update_device_bucket(conn'` in routes.py = 1. Behavioral proof: `tests/test_global_aggregation.py::test_device_bucket_updated_once_per_ride` PASSED (ran directly) |
| 8 | `update_device_bucket()` and `log_rejection()` no longer call `conn.commit()` internally — the single outer commit at routes.py is the only commit | ✓ VERIFIED | `grep -c 'conn.commit()' backend/app/learning.py` = 0 (confirmed directly) |
| 9 | `update_ema`, `compute_time_based_alpha`, and `is_stale` no longer exist in `app.learning` (LEARN-01) | ✓ VERIFIED | `grep -c 'def update_ema\|def compute_time_based_alpha\|def is_stale' backend/app/learning.py` = 0 (confirmed directly). Behavioral proof: `test_update_ema_and_compute_time_based_alpha_and_is_stale_are_removed` PASSED (ran directly) |
| 10 | `update_segment_stats` no longer reads or writes `ema_mean`/`ema_var` and no longer calls the EMA helpers | ✓ VERIFIED | `grep -c 'ema_mean\|ema_var' backend/app/learning.py` = 0. Behavioral proof: `test_ema_columns_not_written_by_update_segment_stats` PASSED (ran directly, via `inspect.getsource`) |
| 11 | `GET /v1/config` returns 200 (not 500) after `ema_alpha`/`half_life_days` are removed from `Settings`; both fields present in the response body as `null` | ✓ VERIFIED | Live check: `TestClient(app).get('/v1/config')` → `200`, body includes `'half_life_days': None, 'ema_alpha': None`. `backend/app/config.py` has zero `ema_alpha`/`half_life_days` matches; `backend/app/models.py:145-146` defines both as `Optional[...] = None` with `# DEPRECATED` comments; `backend/app/routes.py:437-438` passes hardcoded `None`. Tests `test_config_endpoint`, `test_get_config_has_all_spec_fields`, `test_get_config_values_are_reasonable`, `test_get_config_does_not_include_removed_fields` all PASSED (ran directly) |
| 12 | Downstream rejection tests reflect post-seed-and-accept behavior; no `missing_stats` tolerance remains | ✓ VERIFIED | `grep -c missing_stats backend/tests/test_global_aggregation.py` = 0. `test_outlier_rejection` and `test_rejected_by_reason_breakdown` PASSED (ran directly) |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/learning.py` | `compute_variance` sample formula; seed-and-fall-through `update_segment_stats`; EMA/is_stale deleted; no internal `conn.commit()` | ✓ VERIFIED | All conditions confirmed via grep + direct file read |
| `backend/app/routes.py` | `update_device_bucket` hoisted out of loop; single `conn.commit()`; `get_config` passes `None` for deprecated fields | ✓ VERIFIED | Confirmed via direct file read (lines 130-134, 210, 437-438) |
| `backend/app/config.py` | No `ema_alpha`/`half_life_days` Settings fields | ✓ VERIFIED | grep returns 0 matches |
| `backend/app/models.py` | `ConfigResponse.half_life_days`/`.ema_alpha` soft-deprecated `Optional[...] = None` | ✓ VERIFIED | Lines 145-146 confirmed |
| `backend/tests/test_learning.py` | New sample-variance, guard, P90-widening, seed, EMA-removal tests; EMA unit tests deleted | ✓ VERIFIED | All named tests present and passing; `test_ema_update`/`test_time_based_alpha` absent (grep = 0) |
| `backend/tests/test_global_aggregation.py` | Rejection tests updated for post-BUGFIX-04 behavior; new device-bucket-once test | ✓ VERIFIED | Confirmed via direct test run |
| `backend/tests/test_integration.py` | New single-commit-per-ride test | ✓ VERIFIED | Confirmed via direct test run |
| `backend/tests/test_api_v1_alignment.py` | Config alignment tests accept `null` | ✓ VERIFIED | Confirmed via direct test run |
| `docs/api.md` | `GET /v1/config` documents deprecated nullable fields, spec-first | ✓ VERIFIED | Lines 1397-1398, 1413-1414, 1523 confirmed |
| `CLAUDE.md`, `.claude/CLAUDE.md`, `docs/architecture.md`, `docs/PROJECT_STRUCTURE.md`, `docs/gtfs-database.md` | Reframe EMA as removed/inert, not erased | ✓ VERIFIED | No stale "Welford + EMA" mentions found (grep = 0); EMA still mentioned with removal context in all 5 docs |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `update_segment_stats` seed path | Welford/outlier logic | shared variable unpack, fall-through (no early return) | ✓ WIRED | Seeded branch produces `(n, welford_mean, welford_m2, schedule_mean, last_update)` in the exact shape consumed by the existing outlier check + Welford update below |
| `compute_variance` | `is_outlier()`, `compute_percentiles_robust()`, `get_eta()` | divisor change propagates through both call sites | ✓ WIRED | Both consumers call `compute_variance()` directly; no intermediate caching of the old value found |
| D-02 (EMA call-site removal) | D-03 (EMA function deletion) | same commit `b51d99b` | ✓ WIRED | `import app.learning` succeeds with no `NameError`; confirmed live via `python -c "import app.learning"` equivalent (test suite collection succeeds) |
| D-04 (Settings field removal) | D-14 (`get_config` None args + `ConfigResponse` Optional) | same commit `d65ba59` | ✓ WIRED | Live `GET /v1/config` returns 200, not 500 — no `AttributeError` |
| routes.py `update_device_bucket` hoist | single-commit consolidation | both edits in commit `090abf5` | ✓ WIRED | Confirmed: hoisted call site (1 occurrence) + single `conn.commit()` for whole ride path |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite has no new regressions | `cd backend && uv run pytest -n auto --dist loadfile -q` | 198 passed, 6 failed (all 6 failures in `test_idempotency_bodyhash.py` and `test_rate_limit.py` — documented pre-existing baseline in `02-VALIDATION.md`, unrelated to learning.py/config.py/routes.py transaction changes) | ✓ PASS |
| `GET /v1/config` live behavior | `TestClient(app).get('/v1/config')` | `200`, `{'half_life_days': None, 'ema_alpha': None, ...}` | ✓ PASS |
| BUGFIX-04 seed-and-accept tests | `pytest tests/test_learning.py -k "seeds_new_bin_and_accepts or falls_back_to_zero or not_falsely_rejected"` | 3 passed | ✓ PASS |
| BUGFIX-05 variance/P90 tests | `pytest tests/test_learning.py -k "sample_formula or guards_n_less_than_2 or p90_wider"` | 3 passed | ✓ PASS |
| BUGFIX-06 transaction tests | `pytest tests/test_integration.py -k commits_exactly_once` + `tests/test_global_aggregation.py -k device_bucket_updated_once` | 2 passed (run separately — combined `-k` filter across two files silently matched only one) | ✓ PASS |
| LEARN-01 EMA removal tests | `pytest tests/test_learning.py -k "are_removed or ema_columns_not_written"` | 2 passed | ✓ PASS |
| Config alignment tests | `pytest tests/test_integration.py::test_config_endpoint tests/test_api_v1_alignment.py -k get_config` | 4 passed | ✓ PASS |
| Downstream rejection regression tests | `pytest tests/test_global_aggregation.py -k "rejected_by_reason_breakdown or outlier_rejection"` | 2 passed | ✓ PASS |
| Debt-marker scan on modified files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across learning.py, routes.py, config.py, models.py, and the 4 modified test files | No matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BUGFIX-04 | 02-02-PLAN.md | First observation on a new segment upserts a `segment_stats` row (not rejected as `missing_stats`) | ✓ SATISFIED | Truths 1-3, 12 verified; `test_update_segment_stats_seeds_new_bin_and_accepts` etc. all pass |
| BUGFIX-05 | 02-01-PLAN.md | Variance calculation uses sample formula `m2/(n-1)`, not population `m2/n` | ✓ SATISFIED | Truths 4-5 verified; three golden-value tests pass |
| BUGFIX-06 | 02-04-PLAN.md | All per-segment writes for a ride committed in a single transaction | ✓ SATISFIED | Truths 6-8 verified; single-commit + device-bucket-once tests pass |
| LEARN-01 | 02-02-PLAN.md, 02-03-PLAN.md | EMA incorporated into blend OR all EMA writes removed — no silent dead code | ✓ SATISFIED | Truths 9-11 verified; EMA fully removed (functions deleted, columns not written, config surface soft-deprecated, docs reframed) |

**Orphaned requirement check:** `.planning/REQUIREMENTS.md` line 19 maps `CORE-06` ("SQLite WAL database with GTFS + learning + audit tables") to "Phase 2" in its requirements-traceability table. This mapping does **not** appear in `ROADMAP.md`'s Phase 2 entry, nor in any of the four plans' `requirements:` frontmatter (which declare only `BUGFIX-04`, `BUGFIX-05`, `BUGFIX-06`, `LEARN-01`). Direct inspection confirms `backend/app/schema.sql` already contains 17 `CREATE TABLE` statements (full GTFS + learning + audit schema) predating this phase — this is pre-existing infrastructure, not new Phase 2 work. Classified as a **stale/orphaned entry in the REQUIREMENTS.md traceability table**, not a Phase 2 gap. Recommend correcting the table's phase mapping for CORE-06 in a future docs pass; not blocking for this phase.

**Traceability table staleness note:** The same table's "Status" column shows "Pending" for all four of this phase's requirement IDs (BUGFIX-04/05/06, LEARN-01) despite the dedicated checklist section above it (lines ~40-44) marking them `[x]` complete, and despite Phase 1's requirements showing the identical stale "Pending" status. This is a table-maintenance gap affecting the whole document, not specific to Phase 2 — the authoritative `[x]` checklist and this phase's ROADMAP.md/PLAN.md/SUMMARY.md evidence all agree the requirements are done.

### Anti-Patterns Found

None. Scanned `backend/app/learning.py`, `backend/app/routes.py`, `backend/app/config.py`, `backend/app/models.py`, and the four modified test files for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, empty implementations, and hardcoded stub returns. Zero matches.

### Human Verification Required

None. All must-haves are backed by passing automated tests or direct grep/live-endpoint confirmation. This phase is pure backend algorithm/DB/config logic with no UI, no external service integration, and no behavior that requires human judgment to assess.

### Gaps Summary

No gaps. All 4 phase requirements (BUGFIX-04, BUGFIX-05, BUGFIX-06, LEARN-01) and all 4 ROADMAP.md Phase 2 success criteria are verified against the actual codebase — not just SUMMARY.md claims. Every test named in the four plans' `<behavior>` sections was independently re-run in this verification and passed. The full backend suite (204 tests) shows 198 passed, 6 failed, with the 6 failures matching the exact pre-existing baseline documented in `02-VALIDATION.md` before Phase 2 began (`test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2) — no regressions introduced by this phase's changes.

One informational (non-blocking) finding: `REQUIREMENTS.md`'s requirement-traceability table has stale entries (CORE-06 misattributed to Phase 2; all Phase 2 IDs showing "Pending" despite being checked off elsewhere in the same document). This does not affect the phase's goal achievement and is recommended for cleanup in a future docs-sync pass, not a Phase 2 blocker.

---

*Verified: 2026-07-02*
*Verifier: Claude (gsd-verifier)*

# Phase 2: Learning Algorithm Integrity - Research

**Researched:** 2026-07-02
**Domain:** Statistical algorithm correctness (Welford online variance, EMA dead-code removal, SQLite single-transaction semantics) in a Python/FastAPI/SQLite backend
**Confidence:** HIGH

## Summary

This phase is a codebase-internal correctness fix, not a new-technology integration — there are no new libraries to evaluate and no external API to research. CONTEXT.md already locks the exact implementation decisions (D-01 through D-13) at file/line precision. The research value-add here is threefold: (1) design a concrete, TDD-compliant test strategy for four narrow but easy-to-get-wrong statistical/transactional behaviors, honoring this project's Strict TDD and Nyquist validation requirements; (2) surface a scope gap CONTEXT.md's decisions did not address — `GET /v1/config` publicly exposes `half_life_days` and `ema_alpha` as documented API contract fields (`docs/api.md`, `ConfigResponse` model, and an existing test), which D-04's config-field removal will silently break unless handled; and (3) confirm exact current signatures/line numbers for every function D-01–D-13 touches, plus the ride-submission loop, so the plan can reference precise code.

All four success criteria are independently testable with `pytest` + `unittest.mock.patch`/`monkeypatch` already used elsewhere in this codebase (`test_connection_leak.py`'s `monkeypatch.setattr("app.routes.update_segment_stats", ...)` pattern is the direct precedent for commit-counting tests). No new test framework or dependency is needed. The one edge case CONTEXT.md's D-11 flags for verification — the freshly-seeded `n=0` row flowing through the *same-pass* outlier check — is safe: `is_outlier()` returns `False` unconditionally for `n <= 5` (learning.py:65), so a seeded `n=0` row can never trigger a divide-by-zero or false outlier rejection on its first pass.

**Primary recommendation:** Implement BUGFIX-05 (variance divisor) and BUGFIX-06 (commit consolidation) first — they are isolated, low-risk, and unlock straightforward tests. Implement BUGFIX-04 (first-observation bootstrap) and LEARN-01 (EMA removal) together since both touch `update_segment_stats()`'s same code region. Before touching `config.py`/`models.py`, resolve the `GET /v1/config` `half_life_days`/`ema_alpha` field question (see Common Pitfalls #1) — this needs a spec-first decision under CLAUDE.md's Rule 1, and CONTEXT.md does not address it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Welford variance formula fix (BUGFIX-05) | API / Backend (learning.py) | — | Pure function, no I/O; owned entirely by the learning module |
| First-observation bootstrap (BUGFIX-04) | API / Backend (learning.py) | Database / Storage | Logic lives in `update_segment_stats()`; the extra `AVG()` SELECT and seed `INSERT` are DB-layer operations within the same function |
| Transaction consolidation (BUGFIX-06) | API / Backend (routes.py, learning.py) | Database / Storage | Commit boundary is an application-transaction concern; SQLite WAL is the storage substrate that benefits |
| EMA removal (LEARN-01) | API / Backend (learning.py, config.py) | API / Backend (routes.py `/v1/config` response) | Dead-code deletion in the learning module; the `/v1/config` field question is a secondary API-surface concern this phase must not ignore |
| Docs sync (D-06) | Documentation | — | `CLAUDE.md`, `docs/architecture.md`, `docs/api.md`, `docs/PROJECT_STRUCTURE.md`, `docs/gtfs-database.md` — no code tier involved |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUGFIX-04 | First observation on a new segment upserts a `segment_stats` row instead of rejecting `missing_stats` | Exact seed logic confirmed against `update_segment_stats()` (learning.py:241-324); outlier-check-on-seeded-row edge case verified safe (see Common Pitfalls #2); schema default (`schedule_mean REAL NOT NULL DEFAULT 0.0`) confirmed for D-10's NULL-AVG fallback |
| BUGFIX-05 | `compute_variance()` uses `m2/(n-1)` not `m2/n` | Confirmed no existing test hard-codes the old population-variance numeric values — only `variance > 0` is asserted (test_learning.py:46) — so the fix is safe for existing tests but needs *new* golden-value tests (see Validation Architecture) |
| BUGFIX-06 | All per-segment writes for a ride commit in one transaction | Confirmed exactly 3 inner `conn.commit()` call sites to remove (`learning.py:199` in `update_device_bucket`, `learning.py:238` in `log_rejection`, `learning.py:323` in `update_segment_stats`) plus the redundant per-iteration `update_device_bucket()` call (routes.py:134-135) to hoist outside the loop |
| LEARN-01 | EMA incorporated into blend or fully removed as dead code | Confirmed `update_ema()`, `compute_time_based_alpha()` have zero other callers beyond `update_segment_stats()`; confirmed `ema_alpha`/`half_life_days` settings leak into the public `GET /v1/config` contract (`routes.py:437-438`, `models.py:145-146`, `docs/api.md:1397-1398`, `test_api_v1_alignment.py:822-823,853-854`) — this is a gap CONTEXT.md's D-04 does not cover |

## Package Legitimacy Audit

**Not applicable to this phase.** No new external packages are introduced — all four requirements (BUGFIX-04/05/06, LEARN-01) are pure refactors/fixes within existing `backend/app/learning.py`, `backend/app/routes.py`, `backend/app/config.py`, and `backend/tests/test_learning.py`. The only test tooling potentially needed (`unittest.mock`, part of Python stdlib) requires no installation and no legitimacy check.

## Architecture Patterns

### System Architecture Diagram

```text
POST /v1/ride_summary
        │
        ▼
routes.py: ride_summary()
        │
        ├─► with get_connection(db_path) as conn:   ◄── single transaction scope (BUGFIX-06 target)
        │       │
        │       ├─► INSERT INTO rides (...)
        │       │
        │       ├─► update_device_bucket(conn, device_bucket)   ◄── D-13: move OUTSIDE the per-segment loop, call once
        │       │
        │       └─► for seq, segment in enumerate(ride.segments):
        │               │
        │               ├─► SELECT segment_id FROM segments WHERE (...)
        │               │       └─► not found → raise HTTPException(422)  [existing, unchanged]
        │               │
        │               ├─► compute_bin_id(timestamp_epoch, is_holiday)
        │               │
        │               ├─► update_segment_stats(conn, segment_id, bin_id, duration_sec, mapmatch_conf)
        │               │       │
        │               │       ├─► mapmatch_conf < threshold?  → return (False, "low_mapmatch_conf")
        │               │       │
        │               │       ├─► SELECT n, welford_mean, welford_m2, schedule_mean, last_update
        │               │       │   FROM segment_stats WHERE (segment_id, bin_id)
        │               │       │
        │               │       ├─► row is None?  (BUGFIX-04 target)
        │               │       │       │
        │               │       │       ├─► SELECT AVG(schedule_mean) FROM segment_stats
        │               │       │       │   WHERE segment_id = ?  (D-09)
        │               │       │       │       └─► NULL? → schedule_mean = 0.0  (D-10)
        │               │       │       │
        │               │       │       ├─► INSERT segment_stats (n=0, welford_mean=schedule_mean,
        │               │       │       │       welford_m2=0, schedule_mean=schedule_mean)  (D-09)
        │               │       │       │
        │               │       │       └─► fall through to SAME outlier-check + Welford-update
        │               │       │           logic below, using the just-seeded row (D-11) — NOT
        │               │       │           a separate return/reject path
        │               │       │
        │               │       ├─► variance = compute_variance(welford_m2, n)   ◄── BUGFIX-05: m2/(n-1)
        │               │       ├─► is_outlier(x, mean, variance, n)?  → return (False, "outlier")
        │               │       │       (n<=5 always False — safe for n=0 seeded row, see Pitfall #2)
        │               │       │
        │               │       ├─► update_welford(n, mean, m2, x)  → n_new, mean_new, m2_new
        │               │       │       (LEARN-01: no more update_ema()/compute_time_based_alpha() call)
        │               │       │
        │               │       └─► UPDATE segment_stats SET n=?, welford_mean=?, welford_m2=?,
        │               │               last_update=? WHERE (segment_id, bin_id)
        │               │               (no conn.commit() here — BUGFIX-06)
        │               │
        │               ├─► accepted? increment accepted_count : increment rejected_count
        │               │       └─► rejected → log_rejection(conn, ...)  (no conn.commit() here — BUGFIX-06)
        │               │
        │               └─► INSERT INTO ride_segments (...)
        │
        └─► conn.commit()   ◄── THE ONLY commit for the whole ride (routes.py:210, already outer-scoped)


GET /v1/eta
        │
        ▼
routes.py: get_eta()
        │
        ├─► SELECT n, welford_mean, welford_m2, schedule_mean, last_update FROM segment_stats
        ├─► compute_blended_mean(welford_mean, schedule_mean, n)   ◄── LEARN-01 D-01: stays Welford-only in v1
        ├─► compute_variance(welford_m2, n)                        ◄── BUGFIX-05 fix applies here too (wider P90)
        └─► compute_percentiles_robust(mean, variance, n, schedule_mean)


GET /v1/config
        │
        ▼
routes.py: get_config()
        │
        └─► ConfigResponse(..., half_life_days=settings.half_life_days, ema_alpha=settings.ema_alpha, ...)
                ▲
                └── BLOCKED by D-04 (removes these settings) unless resolved — see Common Pitfalls #1
```

### Recommended Project Structure

No new files or directories. All changes land in existing files:
```
backend/app/
├── learning.py       # BUGFIX-04, BUGFIX-05, BUGFIX-06 (partial), LEARN-01 — primary file
├── routes.py          # BUGFIX-06 (partial: D-13 dedupe), LEARN-01 (config field decision)
├── config.py          # LEARN-01 D-04 (remove ema_alpha, half_life_days settings)
├── models.py          # LEARN-01 (ConfigResponse field decision — see Pitfall #1)
└── schema.sql          # NO CHANGE (D-05: ema_mean/ema_var columns stay, inert)

backend/tests/
├── test_learning.py             # D-03 (delete EMA tests), BUGFIX-05 (new variance golden tests)
├── test_global_aggregation.py    # Update test_rejected_by_reason_breakdown (line 358) — missing_stats
│                                  # can no longer appear once BUGFIX-04 ships
├── test_integration.py           # test_config_endpoint (line 69) may need field assertions updated
└── test_api_v1_alignment.py      # test_get_config_has_all_spec_fields (line 811) hard-asserts
                                   # half_life_days/ema_alpha fields — MUST be updated per Pitfall #1

docs/
├── api.md                        # D-06 + config field decision (Pitfall #1)
├── architecture.md                # D-06 doc pass
├── PROJECT_STRUCTURE.md           # D-06 doc pass
└── gtfs-database.md               # D-06 doc pass (ema_var column comment)

CLAUDE.md                          # D-06 doc pass (multiple EMA mentions, see grep below)
```

### Pattern 1: Seed-then-fall-through (BUGFIX-04 / D-11)

**What:** When `update_segment_stats()` finds no row, INSERT a seed row and let control flow continue into the *same* outlier-check + Welford-update block that an existing row would use — not an early return.

**When to use:** Any "bootstrap on first write" scenario where the newly created record must also process the triggering event, matching ROADMAP.md's literal "the observation counted as accepted."

**Example (structure, not final code — planner encodes the actual diff):**
```python
# Source: backend/app/learning.py:279-283 (current) — planner replaces this block
row = cursor.fetchone()

if row is None:
    cursor.execute(
        "SELECT AVG(schedule_mean) FROM segment_stats WHERE segment_id = ?",
        (segment_id,),
    )
    avg_row = cursor.fetchone()
    seed_schedule_mean = avg_row[0] if avg_row and avg_row[0] is not None else 0.0

    cursor.execute(
        """
        INSERT INTO segment_stats
            (segment_id, bin_id, n, welford_mean, welford_m2, schedule_mean)
        VALUES (?, ?, 0, ?, 0.0, ?)
        """,
        (segment_id, bin_id, seed_schedule_mean, seed_schedule_mean),
    )
    # Do NOT return here — fall through using the freshly seeded values
    n, welford_mean, welford_m2, schedule_mean, last_update = (
        0, seed_schedule_mean, 0.0, seed_schedule_mean, None,
    )
else:
    n, welford_mean, welford_m2, schedule_mean, last_update = row

# Existing outlier-check + Welford-update logic runs unconditionally from here
variance = compute_variance(welford_m2, n)
if is_outlier(duration_sec, welford_mean, variance, n):
    ...
```

Note: the current `SELECT` at learning.py:271 fetches `ema_mean, ema_var` too — once LEARN-01/D-02 removes EMA from this function, that SELECT's column list shrinks correspondingly. The planner should sequence D-02 (drop EMA columns from SELECT/UPDATE) and D-09/D-11 (seed-and-fall-through) as edits to the *same* SELECT/UPDATE statements to avoid a double-edit of the same lines.

### Pattern 2: Single-commit-per-request (BUGFIX-06)

**What:** Remove all `conn.commit()` calls from functions invoked inside a request's per-item loop; commit exactly once at the outer request-handler scope after the loop completes.

**When to use:** Any SQLite handler under this project's "single DB writer" / "one transaction per POST" constraint (CLAUDE.md, PROJECT.md).

**Example:**
```python
# Source: backend/app/learning.py — remove conn.commit() from these 3 functions:
# 1. update_device_bucket() — currently learning.py:199
# 2. log_rejection() — currently learning.py:238
# 3. update_segment_stats() — currently learning.py:323
# The single conn.commit() at routes.py:210 (already outside the loop) becomes
# the only commit point for the entire ride-submission transaction.
```

**Risk if a caller elsewhere in the codebase depends on early commit inside these functions:** none found — `grep -rn "update_device_bucket\|log_rejection\|update_segment_stats" backend/app --include=*.py` shows all three are called exclusively from `routes.py`'s `ride_summary()` handler, which already wraps everything in one `with get_connection(...) as conn:` block ending in a single `conn.commit()`.

### Anti-Patterns to Avoid

- **Committing inside a loop-body helper function:** exactly what BUGFIX-06 fixes — never call `conn.commit()` inside a function that may be invoked N times within one logical request; commit belongs to the request-handler transaction boundary, not the per-item helper.
- **Returning early from a stats-lookup miss instead of seeding-and-continuing:** the old `missing_stats` rejection pattern. Any future "record not found" path in this learning pipeline should default to "bootstrap if it's a legitimate first-observation case," not "silently drop the data," unless there's a genuine validation failure (e.g., unknown segment, which correctly stays a 422 at routes.py:151-156 — that path is unaffected by this phase).
- **Leaving orphaned functions "just in case":** D-03 and D-07 both explicitly reject this — `update_ema()`, `compute_time_based_alpha()`, and `is_stale()` all get deleted rather than kept-but-unused, consistent with LEARN-01's "no silent dead code" requirement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Counting `conn.commit()` calls in a test | A custom SQLite proxy/wrapper class | `unittest.mock.patch.object` or `monkeypatch.setattr` on the `sqlite3.Connection` instance's `commit` method (see Validation Architecture) | Stdlib `unittest.mock`/pytest's `monkeypatch` already provide `call_count` tracking; this codebase already uses `monkeypatch.setattr("app.routes.update_segment_stats", ...)` in `test_connection_leak.py` — same pattern, different target |
| Testing "no dead code remains" | A custom AST-walker or hand-written regex script | Two-pronged: (1) `ImportError`-based test asserting `from app.learning import update_ema` raises, and (2) `grep -c` assertion via a `subprocess`-free approach — a plain Python test that reads `learning.py` source and asserts the function name string is absent | Simpler, no new tooling; matches the pattern already used for verifying `slowapi` removal in Phase 1 (LEARN-03) |
| Verifying variance formula correctness | A statistics library dependency (`scipy.stats`, `numpy`) just for one assertion | Hand-computed golden values in the test itself — variance of a small fixed sample set (e.g., `[100, 110, 90, 105, 95]`) computed by hand or via Python's stdlib `statistics.variance()` (sample) vs `statistics.pvariance()` (population) for cross-check | `statistics` is stdlib (already available, zero new dependency); avoids adding numpy/scipy for a single unit test |

**Key insight:** Every tool needed for this phase's validation (mock/monkeypatch, stdlib `statistics` module for golden-value cross-checks, plain source-string assertions for dead-code checks) already exists in the Python standard library or is already a project dependency (`pytest`, `pytest-cov`). No new packages, no `pip install`/`uv add` needed — reinforcing that Package Legitimacy Audit is N/A for this phase.

## Common Pitfalls

### Pitfall 1: `GET /v1/config` publicly documents `half_life_days` and `ema_alpha` — D-04 breaks the API contract if not addressed

**What goes wrong:** D-04 says "Remove the `ema_alpha` and `half_life_days` settings from `config.py`." But `routes.py:437-438` reads `settings.half_life_days` and `settings.ema_alpha` to populate `ConfigResponse` (defined in `models.py:140-153`), which is part of the documented `GET /v1/config` contract in `docs/api.md:1387-1422`. `backend/tests/test_api_v1_alignment.py:811-859` (`test_get_config_has_all_spec_fields`, `test_get_config_values_are_reasonable`) hard-asserts these fields exist with specific values (`half_life_days == 30`, `0.0 <= ema_alpha <= 1.0`). If `config.py`'s settings are deleted without updating `routes.py`, `models.py`, `docs/api.md`, and these two tests, `get_config()` will raise `AttributeError: 'Settings' object has no attribute 'half_life_days'` at request time — a 500 on a documented, unauthenticated, currently-passing endpoint.

**Why it happens:** CONTEXT.md's D-04 was scoped to "config.py fields" without tracing all readers. The discussion's `<code_context>` section flags `config.py` as an integration point but does not mention `routes.py:437-438`, `models.py:145-146`, or `docs/api.md`.

**How to avoid:** This is a spec-first decision under CLAUDE.md Rule 1 — the planner must choose one of two options and update `docs/api.md` FIRST per the mandatory workflow:
  - **Option A (recommended, consistent with D-06's "don't erase EMA, mark as inert" spirit):** Keep `half_life_days`/`ema_alpha` as hardcoded/static values in `ConfigResponse` (e.g., return the last-known defaults `30`/`0.1` as informational/legacy fields, or add a doc note that they are vestigial pending v2), OR remove them from `ConfigResponse` entirely and treat this as a breaking change to `GET /v1/config` (requires a `docs/api.md` version bump and updating both test files).
  - **Option B:** Keep the settings fields in `config.py` with hardcoded defaults (not read from env vars) purely to satisfy `ConfigResponse` — but this contradicts D-04's literal instruction to remove them and would leave dead settings, which D-03/D-07's dead-code philosophy argues against.
  - Recommendation for planning: treat this as a required clarification before execution — either loop back to CONTEXT.md/user for an explicit decision, or default to removing the fields from `ConfigResponse` + `docs/api.md` + both test assertions as a documented breaking change to a non-critical config-introspection endpoint (lowest blast radius, since `GET /v1/config` is informational, not used for request validation by any known client per PROJECT.md scope).

**Warning signs:** `test_api_v1_alignment.py` failing with `AttributeError` or `KeyError: 'half_life_days'` after `config.py` changes land; any mobile client code reading `config.ema_alpha`/`config.half_life_days` (none found in this backend-only research — mobile-side usage was out of scope for this research pass, flag as an Open Question).

### Pitfall 2: First-observation seeded row (`n=0`) flowing through the outlier check — verified SAFE, but must not be silently changed

**What goes wrong (hypothetical, verified NOT to occur):** If `is_outlier()` didn't guard low `n`, a freshly seeded `n=0, welford_m2=0` row could hit `compute_variance(0, 0)` → division involved → potential `ZeroDivisionError` or a `sqrt` of a nonsensical variance, causing the very first observation on a new segment to spuriously reject.

**Why it's actually safe:** `compute_variance()` (learning.py:53-58) already guards `if n < 2: return 0.0` — so `compute_variance(0, 0)` returns `0.0` cleanly, no division occurs. `is_outlier()` (learning.py:60-72) then checks `if n <= 5: return False` *before* computing `std_dev = math.sqrt(variance)` — so for the seeded `n=0` row, `is_outlier()` short-circuits to `False` without ever calling `math.sqrt(0.0)` (which would also be safe, but the short-circuit means it's not even reached). **No divide-by-zero, no crash, no false rejection.** This confirms D-11's assumption is correct and requires no special-case code — the seed-then-fall-through pattern (Pattern 1 above) works unmodified with the existing `compute_variance`/`is_outlier` guards.

**How to avoid regressing this:** When BUGFIX-05 changes `compute_variance`'s divisor to `m2/(n-1)`, the `n < 2` guard (returning `0.0`) MUST be preserved unchanged — the guard is what makes both `n=0` (seeded) and `n=1` (first real Welford update) safe. Do not "simplify" the guard to `n < 1` or remove it as part of the divisor edit; write a regression test explicitly covering `compute_variance(m2=0.0, n=0)`, `compute_variance(m2=0.0, n=1)`, and `compute_variance(m2=X, n=2)` (see Validation Architecture).

**Warning signs:** Any test failure with `ZeroDivisionError` or `ValueError: math domain error` in `compute_variance`/`is_outlier` after the BUGFIX-05 divisor change — indicates the `n < 2` guard was accidentally altered.

### Pitfall 3: `test_rejected_by_reason_breakdown` hard-codes the old `missing_stats` behavior

**What goes wrong:** `backend/tests/test_global_aggregation.py:358` asserts `"missing_stats" in reasons or "outlier" in reasons` — written when `missing_stats` was a plausible outcome for the test's third segment (which has `mapmatch_conf` defaulting to 1.0 and duration 330.0, hitting whatever `segment_stats` row exists). After BUGFIX-04, a never-seen `(segment_id, bin_id)` will be seeded-and-accepted, not rejected as `missing_stats` — so if this test's fixture setup relies on a bin gap, the assertion's `or "missing_stats"` branch becomes permanently false, and if the accepted-vs-rejected counts shift, `result["rejected_segments"] >= 1` (line 351) could also start failing.

**Why it happens:** The test was written to tolerate either outcome because `missing_stats` was a known bug at the time (see `.planning/codebase/CONCERNS.md`'s "missing_stats rejection silently discards data" entry) — it was defensive against the bug, not testing correct behavior.

**How to avoid:** Audit this test during planning (already flagged in CONTEXT.md's `<code_context>` "verify during planning" note) and update the assertion to reflect BUGFIX-04's new behavior — likely removing the `"missing_stats" in reasons` branch entirely, or restructuring the test's segment data to only produce `low_mapmatch_conf`/`outlier` rejections deliberately. Also check `test_global_aggregation.py:283` (`test_outlier_rejection`'s conditional) for the same stale-tolerance pattern.

**Warning signs:** `test_rejected_by_reason_breakdown` or `test_outlier_rejection` failing after BUGFIX-04 lands, with `rejected_by_reason` showing fewer total rejections than the test setup anticipated (because a previously-`missing_stats`-rejected segment is now accepted).

### Pitfall 4: Deleting `update_ema`/`compute_time_based_alpha` before removing their call site breaks the module at import time

**What goes wrong:** `update_segment_stats()` (learning.py:301-303) currently calls both `compute_time_based_alpha()` and `update_ema()` before the `UPDATE segment_stats` write. If the planner deletes the function *definitions* before removing these *call sites*, `learning.py` fails at runtime with `NameError` (not even an import error, since Python resolves names at call time) the next time a ride is submitted — but existing tests that only exercise pure functions (not the DB-backed `update_segment_stats`) might not catch this immediately depending on execution order.

**How to avoid:** Sequence the edit as: (1) remove the `update_ema()`/`compute_time_based_alpha()` call sites and the `ema_mean`/`ema_var` read/write in `update_segment_stats()`'s SQL (D-02) in the same commit/step as (2) deleting the function definitions (D-03) — do not split across separate plan tasks that could leave an intermediate broken state if the plan is interrupted mid-execution.

**Warning signs:** `NameError: name 'update_ema' is not defined` when running `test_integration.py::test_ride_submission_and_eta` or any test that actually calls the `/v1/ride_summary` endpoint end-to-end.

## Code Examples

### Golden-value variance test (BUGFIX-05)

```python
# Source: pattern derived from backend/tests/test_learning.py's existing style;
# uses Welford's algorithm cross-checked against Python stdlib `statistics` module
import statistics
from app.learning import update_welford, compute_variance

def test_compute_variance_uses_sample_formula_not_population():
    """BUGFIX-05: compute_variance must return m2/(n-1), not m2/n, for n>=2."""
    samples = [100.0, 110.0, 90.0, 105.0, 95.0, 102.0, 98.0, 107.0, 93.0, 101.0]  # n=10
    n, mean, m2 = 0, 0.0, 0.0
    for x in samples:
        n, mean, m2 = update_welford(n, mean, m2, x)

    sample_variance = compute_variance(m2, n)
    expected_sample_variance = statistics.variance(samples)   # ddof=1, i.e. n-1
    wrong_population_variance = statistics.pvariance(samples)  # ddof=0, i.e. n

    assert sample_variance == pytest.approx(expected_sample_variance, rel=1e-9)
    assert sample_variance != pytest.approx(wrong_population_variance, rel=1e-9)
    assert sample_variance > wrong_population_variance  # sample formula always >= population


def test_compute_variance_guards_n_less_than_2():
    """Guard must survive the divisor change — n=0 and n=1 both return 0.0."""
    assert compute_variance(m2=0.0, n=0) == 0.0
    assert compute_variance(m2=0.0, n=1) == 0.0
    assert compute_variance(m2=50.0, n=1) == 0.0  # m2 nonzero but n<2 still guarded
```

### P90 widening before/after comparison (success criterion #2's literal wording)

```python
# Source: pattern to satisfy ROADMAP.md Phase 2 criterion #2:
# "after 10 observations the P90 ETA bound is measurably wider than with the
# population formula, verifiable via unit test"
from app.learning import update_welford, compute_percentiles_robust

def test_p90_wider_with_sample_variance_than_population_variance():
    samples = [100.0, 110.0, 90.0, 105.0, 95.0, 102.0, 98.0, 107.0, 93.0, 101.0]  # n=10
    n, mean, m2 = 0, 0.0, 0.0
    for x in samples:
        n, mean, m2 = update_welford(n, mean, m2, x)

    population_variance = m2 / n           # the OLD (buggy) formula, inlined for comparison
    sample_variance = m2 / (n - 1)         # the NEW (correct) formula

    _, p90_old, _ = compute_percentiles_robust(mean, population_variance, n, schedule_mean=mean)
    _, p90_new, _ = compute_percentiles_robust(mean, sample_variance, n, schedule_mean=mean)

    assert p90_new > p90_old  # sample-variance P90 bound must be strictly wider
```

### Single-commit-per-ride test (BUGFIX-06)

```python
# Source: pattern derived from backend/tests/test_connection_leak.py's
# monkeypatch.setattr("app.routes.update_segment_stats", ...) precedent —
# same technique applied to sqlite3.Connection.commit instead of a route function.
import sqlite3

def test_ride_with_50_segments_commits_exactly_once(client, auth_headers, monkeypatch):
    """BUGFIX-06: a 50-segment ride must call conn.commit() exactly once, not ~100 times."""
    commit_calls = []
    original_commit = sqlite3.Connection.commit

    def _counting_commit(self, *args, **kwargs):
        commit_calls.append(1)
        return original_commit(self, *args, **kwargs)

    monkeypatch.setattr(sqlite3.Connection, "commit", _counting_commit)

    # ... set up 50 valid segments against a pre-seeded segment/segment_stats fixture ...
    payload = {"route_id": "ROUTE1", "direction_id": 0, "segments": [ /* 50 entries */ ]}
    response = client.post("/v1/ride_summary", json=payload, headers=auth_headers)

    assert response.status_code == 200
    assert len(commit_calls) == 1  # exactly one commit for the whole ride
```

**Note:** Patching `sqlite3.Connection.commit` globally via `monkeypatch` affects all connections opened during the test, including any fixture setup connections opened *before* the monkeypatch is applied in the test body — the plan should structure fixtures so the pre-seeded segment/segment_stats rows are committed in fixture setup *before* `monkeypatch.setattr` is applied, and only the `client.post(...)` call under test happens after patching. This avoids counting the fixture's own commits.

### EMA dead-code-removal verification test (LEARN-01 / D-03)

```python
# Source: pattern for verifying "no silent dead code remains" per LEARN-01's wording
import pytest

def test_update_ema_and_compute_time_based_alpha_are_removed():
    """LEARN-01/D-03: these functions must no longer exist in app.learning."""
    import app.learning as learning_module

    assert not hasattr(learning_module, "update_ema")
    assert not hasattr(learning_module, "compute_time_based_alpha")


def test_ema_columns_not_written_by_update_segment_stats(in_memory_db):
    """LEARN-01/D-02: ema_mean/ema_var must not be touched by the UPDATE statement."""
    import inspect
    from app import learning

    source = inspect.getsource(learning.update_segment_stats)
    assert "ema_mean" not in source
    assert "ema_var" not in source
    assert "update_ema(" not in source
    assert "compute_time_based_alpha(" not in source
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `compute_variance` = `m2/n` (population variance) | `compute_variance` = `m2/(n-1)` (sample/Bessel-corrected variance) | This phase (BUGFIX-05) | Welford's algorithm is canonically paired with the sample (n-1) formula when the observed data is treated as a sample of a larger population (which travel-time observations are) — this is the standard statistical convention, not a stylistic choice |
| `missing_stats` silent rejection on unseeded bins | Seed-on-first-observation with cross-bin `schedule_mean` fallback | This phase (BUGFIX-04) | Standard "lazy initialization" pattern for sparse per-key aggregate tables — common in online-learning systems where pre-seeding every possible key combinatorially (segments × 192 bins) is wasteful |
| Per-helper-function `conn.commit()` | Single commit at the outer request-handler transaction boundary | This phase (BUGFIX-06) | Standard "unit of work" pattern — matches the Phase 1 precedent (`get_connection()` context manager) already established in this codebase |
| EMA computed and stored but never read (dead code) | EMA either removed entirely or wired into the blend (this phase: removed per D-01) | This phase (LEARN-01) | Confirms the project's stated intent (`LEARN-V2-01`) to revisit time-decay weighting in v2 with proper algorithm research, rather than shipping an unused half-implementation |

**Deprecated/outdated:**
- `update_ema()`, `compute_time_based_alpha()`: removed per D-03, not merely deprecated — no replacement in this phase; `LEARN-V2-01` is the tracked future work.
- `is_stale()`: removed per D-07 as an unrelated drive-by fix — confirmed zero callers via `grep -rn "is_stale" backend/ --include=*.py` (only the definition itself at learning.py:159).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No mobile-app client code reads `GET /v1/config`'s `half_life_days`/`ema_alpha` fields in a way that would break if removed | Common Pitfalls #1 | If a mobile client does depend on these fields (research did not inspect `mobile/` source), removing them could break the running app silently; the planner should grep `mobile/` for `half_life_days`/`ema_alpha` before finalizing the config-field decision |
| A2 | Recommending "remove from `ConfigResponse` as a documented breaking change" is the lower-risk default absent an explicit user decision | Common Pitfalls #1 | If the user actually wants the fields retained (e.g., for forward-compat with v2 EMA work), a breaking removal would require re-adding them later; flagged as needing explicit confirmation, not silently decided by research |

**If this table is empty:** N/A — see entries above; both concern the one gap not covered by CONTEXT.md's decisions.

## Open Questions

1. **Does the mobile app read `GET /v1/config`'s `ema_alpha`/`half_life_days` fields?**
   - What we know: The backend defines and documents these fields; a backend test asserts their presence and value ranges.
   - What's unclear: This research pass did not inspect `mobile/` TypeScript source for any config-parsing code that might reference these field names.
   - Recommendation: Before executing D-04, `grep -rn "half_life_days\|ema_alpha" mobile/` — if no hits, proceed with removing the fields from `ConfigResponse`/`docs/api.md` as a documented breaking change to a non-critical introspection endpoint; if hits exist, escalate to the user for an explicit decision (matches this project's pattern of resolving ambiguity before implementation).

2. **Should `GET /v1/config`'s response schema change be treated as a version bump or a silent field removal?**
   - What we know: `docs/api.md` documents the current fields; `server_version` in `config.py` is currently hardcoded `"0.2.0"` and not tied to actual API contract versions.
   - What's unclear: Whether removing/changing `ConfigResponse` fields needs a `server_version` bump, given CLAUDE.md's "backward compatibility: v1 API contract must not break existing mobile clients" constraint (PROJECT.md).
   - Recommendation: Given the constraint's emphasis on the *mobile* client specifically, resolve Open Question #1 first — if no mobile dependency exists, a version bump is optional politeness, not a hard requirement, since no consumer breaks.

## Environment Availability

Skipped — this phase has no external tool/service dependencies. All work is within the existing Python/FastAPI/SQLite stack already running in this repo; `pytest`, `sqlite3` (stdlib), and `unittest.mock` (stdlib) are already available and verified present (`pytest==7.4.3` confirmed via `uv run python -c "import pytest"`).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 7.4.3 (confirmed installed via `uv run`), with pytest-xdist 3.5.0 + pytest-randomly 3.15.0 for parallel/order-independent execution |
| Config file | `backend/pyproject.toml` (dependency groups only; no separate `pytest.ini` found — markers registered via `pytestmark` module-level assignment, e.g. `pytestmark = pytest.mark.unit`) |
| Quick run command | `cd backend && uv run pytest tests/test_learning.py -v` |
| Full suite command | `cd backend && uv run pytest -n auto --dist loadfile -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUGFIX-04 | New segment×bin seeds a row and the triggering observation is accepted (n becomes 1) | unit + integration | `uv run pytest tests/test_learning.py::test_update_segment_stats_seeds_new_bin_and_accepts -x` (unit, mocked conn) and `uv run pytest tests/test_integration.py -k first_observation -x` (integration, real in-memory DB via `client` fixture) | ❌ Wave 0 — both new |
| BUGFIX-04 (D-10 edge case) | Segment with zero existing `segment_stats` rows falls back to `schedule_mean=0.0` | unit | `uv run pytest tests/test_learning.py::test_seed_falls_back_to_zero_when_no_existing_bins -x` | ❌ Wave 0 |
| BUGFIX-05 | `compute_variance` returns `m2/(n-1)` for n>=2; guard intact for n<2 | unit | `uv run pytest tests/test_learning.py::test_compute_variance_uses_sample_formula_not_population -x` and `::test_compute_variance_guards_n_less_than_2 -x` | ❌ Wave 0 |
| BUGFIX-05 (P90 widening) | P90 bound measurably wider with sample vs population variance after 10 observations | unit | `uv run pytest tests/test_learning.py::test_p90_wider_with_sample_variance_than_population_variance -x` | ❌ Wave 0 |
| BUGFIX-06 | 50-segment ride triggers exactly one `conn.commit()` | integration | `uv run pytest tests/test_integration.py::test_ride_with_50_segments_commits_exactly_once -x` | ❌ Wave 0 |
| BUGFIX-06 (D-13) | `update_device_bucket` is called exactly once per ride, not once per segment | integration | `uv run pytest tests/test_global_aggregation.py::test_device_bucket_updated_once_per_ride -x` | ❌ Wave 0 |
| LEARN-01 | `update_ema`/`compute_time_based_alpha` no longer exist; `ema_mean`/`ema_var` not written by `update_segment_stats` | unit | `uv run pytest tests/test_learning.py::test_update_ema_and_compute_time_based_alpha_are_removed -x` and `::test_ema_columns_not_written_by_update_segment_stats -x` | ❌ Wave 0 |
| LEARN-01 (regression) | Existing `test_ema_update`/`test_time_based_alpha` tests deleted (D-03) | unit | N/A — deletion, verified by full suite passing without them | N/A |
| LEARN-01 (config gap) | `GET /v1/config` does not 500 after `config.py` field removal | integration | `uv run pytest tests/test_integration.py::test_config_endpoint -x` and updated `tests/test_api_v1_alignment.py::test_get_config_has_all_spec_fields -x` | ⚠️ Exists, needs update (Pitfall #1) |
| D-07 | `is_stale()` removed, zero callers remain | unit | `uv run pytest tests/test_learning.py::test_is_stale_removed -x` (new, analogous to the EMA-removal check above) | ❌ Wave 0 |
| Regression | `test_rejected_by_reason_breakdown` reflects post-BUGFIX-04 rejection reasons (no more `missing_stats` for unseeded bins) | integration | `uv run pytest tests/test_global_aggregation.py::test_rejected_by_reason_breakdown -x` | ⚠️ Exists, needs update (Pitfall #3) |

### Sampling Rate

- **Per task commit:** `cd backend && uv run pytest tests/test_learning.py -v` (fast, pure-function unit tests, <1s)
- **Per wave merge:** `cd backend && uv run pytest -n auto --dist loadfile -q` (full suite, ~9-10s per CLAUDE.md's documented baseline)
- **Phase gate:** Full suite green (target: 195/195 or better than the current 189/195 baseline — see STATE.md's "6 pre-existing failures" note; this phase should not introduce new failures and may reduce the pre-existing count if any relate to EMA/variance)

### Wave 0 Gaps

- [ ] New unit tests in `tests/test_learning.py` for: `compute_variance` sample-formula + guard (BUGFIX-05), P90 widening comparison (BUGFIX-05), seed-and-fall-through behavior for `update_segment_stats` (BUGFIX-04), zero-existing-bins fallback (BUGFIX-04/D-10), EMA/`is_stale` removal verification (LEARN-01/D-03/D-07)
- [ ] New integration test in `tests/test_integration.py` for single-commit-per-ride (BUGFIX-06) using the `sqlite3.Connection.commit` monkeypatch-counting pattern shown in Code Examples
- [ ] New integration test in `tests/test_global_aggregation.py` for `update_device_bucket` called exactly once per ride (BUGFIX-06/D-13)
- [ ] Update (not new) `tests/test_global_aggregation.py::test_rejected_by_reason_breakdown` (Pitfall #3) and `::test_outlier_rejection`'s conditional (line 283) to reflect BUGFIX-04's new seed-and-accept behavior
- [ ] Update (not new) `tests/test_api_v1_alignment.py::test_get_config_has_all_spec_fields` and `::test_get_config_values_are_reasonable` per the resolved Pitfall #1 decision
- [ ] Delete `tests/test_learning.py::test_ema_update` and `::test_time_based_alpha` per D-03 (after confirming the new removal-verification tests above cover the "no dead code" requirement)
- [ ] Framework install: none — `pytest`, `pytest-xdist`, `pytest-randomly` already present per `pyproject.toml`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Phase touches no auth code paths (Bearer token verification in `auth.py` is untouched) |
| V3 Session Management | No | No sessions in this stateless API |
| V4 Access Control | No | No new endpoints, no permission changes |
| V5 Input Validation | No (indirectly touched, not weakened) | `mapmatch_conf` threshold check and segment-existence validation (routes.py:151-156, unchanged 422 path) remain as-is; BUGFIX-04 only changes behavior for the *already-validated* `(segment_id, bin_id)` pair when the aggregate row is simply missing, not for invalid input |
| V6 Cryptography | No | No crypto/hashing logic touched (device_bucket SHA256 hashing lives in the mobile client and `models.py` validation, both unchanged) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Resource exhaustion via unbounded seed-row creation (BUGFIX-04 could theoretically be abused to INSERT many `segment_stats` rows for bogus `bin_id`s) | Denial of Service | Not a new risk — `bin_id` is server-computed via `compute_bin_id()` (0-191 range, not client-controlled) and `segment_id` is validated to exist in the `segments` table before `update_segment_stats()` is ever called (routes.py:138-156); the seed path can only create at most 192 rows per legitimate segment, bounded by the existing bin cardinality. No new mitigation needed — confirm this bound holds during test-writing by asserting `bin_id` remains in `[0, 191]` in the seed test |
| Transaction rollback partial-state exposure (BUGFIX-06's single-commit change) | Tampering / Repudiation | Consolidating to one commit is *strictly safer* than the current multi-commit pattern — if an exception occurs mid-loop under the new single-transaction design, SQLite rolls back the entire uncommitted transaction (nothing partially persisted), whereas today's per-segment commits mean a mid-ride failure leaves some segments already durably written and others not, which is itself a repudiation/consistency risk this phase's fix eliminates as a side effect |

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection via `Read`/`Bash grep` — `backend/app/learning.py` (full file), `backend/app/routes.py` (lines 100-230, 330-448), `backend/app/config.py` (full file), `backend/app/models.py` (lines 130-159), `backend/app/schema.sql` (lines 100-270), `backend/app/db.py` (lines 1-75), `backend/tests/test_learning.py` (full file), `backend/tests/test_global_aggregation.py` (relevant sections), `backend/tests/test_connection_leak.py` (relevant sections), `backend/tests/conftest.py` (lines 1-110), `backend/tests/test_api_v1_alignment.py` (lines 800-859), `backend/pyproject.toml`, `docs/api.md` (lines 1370-1428), `.planning/codebase/CONCERNS.md`, `.planning/ROADMAP.md`, `.planning/config.json`
- `uv run python -c "import pytest; print(pytest.__version__)"` — confirmed pytest 7.4.3 installed and importable in the actual project environment

### Secondary (MEDIUM confidence)
- None — this research required no external documentation lookups; all findings are codebase-internal and directly verified.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no new stack elements introduced
- Architecture: HIGH — every function signature, call site, and line number was read directly from the current codebase, not inferred
- Pitfalls: HIGH for Pitfalls #2-4 (directly verified via source reading); MEDIUM for Pitfall #1 (the `GET /v1/config` gap is confirmed as a real code/docs/test coupling, but the *correct resolution* depends on an unverified mobile-client dependency — see Open Question #1)

**Research date:** 2026-07-02
**Valid until:** No expiry concern — this research is tied to the exact current state of this codebase's `learning.py`/`routes.py`/`config.py`, not to any external library version. Re-verify only if the codebase changes materially before planning begins (e.g., if Phase 1 branch work is further amended).

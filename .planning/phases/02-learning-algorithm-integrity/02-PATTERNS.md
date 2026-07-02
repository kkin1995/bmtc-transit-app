# Phase 2: Learning Algorithm Integrity - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 8 (all existing, modified in place — no new files this phase)
**Analogs found:** 8 / 8 (self-referential — this phase edits existing functions using existing sibling functions in the same file as the pattern to follow)

**Note on approach:** Unlike a typical feature phase, Phase 2 introduces no new files, components, or endpoints. Every "pattern" here is "the existing code immediately surrounding the bug is the analog for the fix" — CONTEXT.md and RESEARCH.md already pin exact line numbers. This document exists to give the planner copy-paste-ready **current** source excerpts (confirmed against the live file, since RESEARCH.md's line numbers can drift slightly) plus the precise diff boundaries for each decision (D-01 through D-14).

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|----------------|------|-----------|-----------------|---------------|
| `backend/app/learning.py` (`compute_variance`) | utility (pure function) | transform | same function, existing `n < 2` guard | exact — one-line divisor edit |
| `backend/app/learning.py` (`update_segment_stats`) | service (DB read-modify-write) | CRUD | same function's existing row-found branch | exact — extend existing SELECT/INSERT/UPDATE pattern |
| `backend/app/learning.py` (`update_ema`, `compute_time_based_alpha`, `is_stale`) | utility (pure function) | transform | N/A — deletion target | exact — delete whole function bodies |
| `backend/app/learning.py` (`update_device_bucket`, `log_rejection`, `update_segment_stats`) | service (DB write helper) | CRUD | `routes.py`'s outer `with get_connection(...) as conn: ... conn.commit()` block | exact — remove inner commit, defer to outer transaction |
| `backend/app/routes.py` (`ride_summary` loop, lines 132-135) | route handler | request-response | same function's existing `with get_connection` transaction scope | exact — hoist call out of loop |
| `backend/app/config.py` (`Settings`) | config | CRUD (env-var read) | sibling settings fields (e.g. `outlier_sigma`, `mapmatch_min_conf`) already defined the same way | exact — delete 2 field declarations |
| `backend/app/models.py` (`ConfigResponse`) | model (Pydantic schema) | request-response | CLAUDE.md's documented deprecated-field convention: `timestamp_utc: Optional[int] = None  # DEPRECATED: use observed_at_utc` | exact — same soft-deprecate pattern, different fields |
| `backend/app/routes.py` (`get_config`, lines 417-446) | route handler | request-response | same function's existing `ConfigResponse(...)` construction | exact — change 2 kwargs to `None` |
| `backend/tests/test_learning.py` | test | transform (unit) | existing `test_welford_convergence`/`test_outlier_detection` style (arrange samples → call pure fn → assert) | exact — same test style for new golden-value + guard tests |
| `backend/tests/test_integration.py` | test | request-response (integration) | `backend/tests/test_connection_leak.py`'s `monkeypatch.setattr` commit/call-counting pattern | exact — same monkeypatch-counting technique, different target (`sqlite3.Connection.commit`) |
| `backend/tests/test_global_aggregation.py` | test | request-response (integration) | existing `test_rejected_by_reason_breakdown`/`test_outlier_rejection` (already in file, being updated not created) | exact — same fixture/assertion style, updated expected reasons |
| `docs/api.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/PROJECT_STRUCTURE.md`, `docs/gtfs-database.md` | docs | — | existing "Welford + EMA" prose blocks in each file | exact — text edit, not code |

## Pattern Assignments

### `backend/app/learning.py::compute_variance` (BUGFIX-05)

**Current code (learning.py:53-57, confirmed):**
```python
def compute_variance(m2: float, n: int) -> float:
    """Compute sample variance from Welford M2."""
    if n < 2:
        return 0.0
    return m2 / n
```

**Fix:** change `return m2 / n` to `return m2 / (n - 1)`. **Do not touch the `if n < 2: return 0.0` guard** — Pitfall #2 in RESEARCH.md confirms this guard is what keeps `is_outlier()` and the BUGFIX-04 seeded `n=0` row safe from `ZeroDivisionError`.

**Docstring note:** the function is already named/documented as "sample variance" despite implementing population variance — the docstring does not need to change, only the divisor.

---

### `backend/app/learning.py::update_segment_stats` (BUGFIX-04, D-09/D-10/D-11, plus BUGFIX-05 interaction, plus LEARN-01 D-02)

**Current code (learning.py:268-324, confirmed against live file):**
```python
    # Fetch current stats (include last_update for time-based alpha)
    cursor.execute(
        """
        SELECT n, welford_mean, welford_m2, ema_mean, ema_var, schedule_mean, last_update
        FROM segment_stats
        WHERE segment_id = ? AND bin_id = ?
        """,
        (segment_id, bin_id),
    )
    row = cursor.fetchone()

    if row is None:
        logger.warning(
            f"segment_stats not found for segment_id={segment_id}, bin_id={bin_id}"
        )
        return False, "missing_stats"

    n, welford_mean, welford_m2, ema_mean, ema_var, schedule_mean, last_update = row

    # Check for outlier
    variance = compute_variance(welford_m2, n)
    if is_outlier(duration_sec, welford_mean, variance, n):
        logger.info(
            f"Outlier rejected: segment_id={segment_id}, bin_id={bin_id}, "
            f"duration={duration_sec:.1f}, mean={welford_mean:.1f}, std={math.sqrt(variance):.1f}"
        )
        return False, "outlier"

    # Update Welford
    n_new, welford_mean_new, welford_m2_new = update_welford(
        n, welford_mean, welford_m2, duration_sec
    )

    # Update EMA with time-based alpha (prevents stale/volatile estimates)
    alpha = compute_time_based_alpha(last_update, settings.half_life_days)
    ema_mean_new, ema_var_new = update_ema(ema_mean, ema_var, duration_sec, alpha)

    # Write back
    cursor.execute(
        """
        UPDATE segment_stats
        SET n = ?, welford_mean = ?, welford_m2 = ?, ema_mean = ?, ema_var = ?, last_update = ?
        WHERE segment_id = ? AND bin_id = ?
        """,
        (
            n_new,
            welford_mean_new,
            welford_m2_new,
            ema_mean_new,
            ema_var_new,
            int(time.time()),
            segment_id,
            bin_id,
        ),
    )
    conn.commit()
    return True, None
```

**Target shape (composited from D-02, D-09, D-10, D-11, D-12 — planner encodes the real diff):**

1. **SELECT column list shrinks (D-02):** drop `ema_mean, ema_var` from the `SELECT` — only `n, welford_mean, welford_m2, schedule_mean, last_update` remain. This is the *same* SQL statement D-09's seed logic modifies, so sequence both edits together (RESEARCH.md line 189 / Pitfall #4).

2. **`if row is None:` branch replaced with seed-and-fall-through (D-09/D-10/D-11)** — analog is the existing row-found branch's variable-unpacking shape (`n, welford_mean, welford_m2, schedule_mean, last_update = row`), reused for the seeded case:
```python
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
        n, welford_mean, welford_m2, schedule_mean, last_update = (
            0, seed_schedule_mean, 0.0, seed_schedule_mean, None,
        )
    else:
        n, welford_mean, welford_m2, schedule_mean, last_update = row
```
   No `return False, "missing_stats"` remains anywhere in this function after this edit — `missing_stats` is fully retired as a rejection reason (confirms Pitfall #3's downstream test impact).

3. **EMA call site removed (D-02):** delete the two lines
```python
    alpha = compute_time_based_alpha(last_update, settings.half_life_days)
    ema_mean_new, ema_var_new = update_ema(ema_mean, ema_var, duration_sec, alpha)
```
   and drop `ema_mean_new, ema_var_new` from the `UPDATE ... SET` clause and its params tuple. `last_update` variable is now unused for alpha purposes but is still consumed by the seed/row-unpack tuple above — keep it in the unpack, just don't pass it to `compute_time_based_alpha`.

4. **`conn.commit()` removed (D-12/BUGFIX-06):** delete the trailing `conn.commit()` before `return True, None`. The outer `routes.py:210` commit is now the only commit.

5. **Docstring's rejection_reason enumeration** (line 255) must drop `'missing_stats'` from the list: `'low_mapmatch_conf', 'outlier', None if accepted`.

---

### `backend/app/learning.py` — EMA/`is_stale` deletion (LEARN-01 D-03, D-07)

**Analog:** the functions themselves are self-contained and have no internal deletion precedent needed — this is a pure removal. Delete these three function definitions in full, in the same edit as their call-site removal (Pitfall #4 sequencing):

- `update_ema()` — learning.py:36-50 (confirmed)
- `compute_time_based_alpha()` — learning.py:134-156 (confirmed)
- `is_stale()` — learning.py:159-166 (confirmed) — zero callers confirmed via grep; also uses `settings.stale_threshold_days`, which D-07 does not require removing from `config.py` (only `ema_alpha`/`half_life_days` are explicitly targeted by D-04) — **leave `stale_threshold_days` setting in place unless the planner finds another dead-code argument for it; it is out of this phase's explicit scope.**

Confirm no other reader of `update_ema`/`compute_time_based_alpha`/`is_stale` exists:
```bash
grep -rn "update_ema\|compute_time_based_alpha\|is_stale" backend/app backend/tests --include=*.py
```

---

### `backend/app/learning.py` — commit removal in `update_device_bucket` / `log_rejection` (BUGFIX-06 D-12)

**Analog:** `routes.py`'s single outer transaction scope (`with get_connection(settings.db_path) as conn: ... conn.commit()` at routes.py:115-210) is the pattern these two functions must defer to.

**Current `update_device_bucket` (learning.py:169-199, confirmed) — remove the trailing `conn.commit()`:**
```python
def update_device_bucket(conn, device_bucket: str) -> None:
    cursor = conn.cursor()
    now = int(time.time())
    cursor.execute(
        """
        UPDATE device_buckets
        SET last_seen = ?, observation_count = observation_count + 1
        WHERE bucket_id = ?
        """,
        (now, device_bucket),
    )
    if cursor.rowcount == 0:
        cursor.execute(
            """
            INSERT INTO device_buckets (bucket_id, first_seen, last_seen, observation_count)
            VALUES (?, ?, ?, 1)
            """,
            (device_bucket, now, now),
        )
    conn.commit()  # <-- DELETE this line (D-12)
```

**Current `log_rejection` (learning.py:202-238, confirmed) — same pattern, remove the trailing `conn.commit()` at line 238.**

---

### `backend/app/routes.py::ride_summary` loop — dedupe `update_device_bucket` call (BUGFIX-06 D-13)

**Current code (routes.py:129-136, confirmed):**
```python
        # Extract device_bucket from top-level (not from segments)
        device_bucket = ride.device_bucket

        for seq, segment in enumerate(ride.segments):
            # Update device bucket tracking (if provided at top level)
            if device_bucket:
                update_device_bucket(conn, device_bucket)

            # Validate segment exists
```

**Fix:** hoist the `if device_bucket: update_device_bucket(conn, device_bucket)` call to execute once, immediately after `device_bucket = ride.device_bucket` and before the `for seq, segment in enumerate(ride.segments):` loop starts. Analog for "one-time setup before the per-item loop" is the existing `INSERT INTO rides (...)` statement immediately above it (routes.py:122-127), which already runs once per ride, not per segment — follow that same placement convention.

---

### `backend/app/config.py::Settings` — remove `ema_alpha`/`half_life_days` (LEARN-01 D-04)

**Current code (config.py:14-17, confirmed):**
```python
    n0: int = 20
    ema_alpha: float = 0.1
    half_life_days: int = 30
    stale_threshold_days: int = 90
```

**Fix:** delete the `ema_alpha: float = 0.1` and `half_life_days: int = 30` lines. Keep `n0` and `stale_threshold_days` (D-07 leaves `stale_threshold_days` alone — see above). Analog for the deletion pattern is any of the sibling `float`/`int` settings fields with inline defaults (e.g. `outlier_sigma: float = 3.0`, `mapmatch_min_conf: float = 0.7`) — same declarative style, just removed rather than added.

---

### `backend/app/models.py::ConfigResponse` — soft-deprecate `half_life_days`/`ema_alpha` (D-14)

**Current code (models.py:140-154, confirmed):**
```python
class ConfigResponse(BaseModel):
    """GET /v1/config response."""

    n0: int
    time_bin_minutes: int
    half_life_days: int
    ema_alpha: float
    outlier_sigma: float
    mapmatch_min_conf: float
    max_segments_per_ride: int
    rate_limit_per_hour: int
    idempotency_ttl_hours: int
    gtfs_version: str
    server_version: str
```

**Analog — CLAUDE.md's documented deprecated-field convention** (referenced directly in project conventions, exact quote):
```python
timestamp_utc: Optional[int] = None  # DEPRECATED: use observed_at_utc
```

**Fix, following that exact convention:**
```python
    half_life_days: Optional[int] = None  # DEPRECATED: EMA removed from active pipeline, see LEARN-01
    ema_alpha: Optional[float] = None  # DEPRECATED: EMA removed from active pipeline, see LEARN-01
```
Requires `from typing import Optional` already present in `models.py` (verify) or add it. This is a **non-breaking** response-schema change (field stays present, type becomes nullable) per D-14's explicit resolution — do NOT remove the fields outright, per the resolved ambiguity in CONTEXT.md D-14 (this supersedes RESEARCH.md's Pitfall #1 "Option A/B" framing, which was written before D-14 resolved it).

---

### `backend/app/routes.py::get_config` — stop reading removed settings (D-14)

**Current code (routes.py:434-446, confirmed):**
```python
    return ConfigResponse(
        n0=settings.n0,
        time_bin_minutes=15,
        half_life_days=settings.half_life_days,
        ema_alpha=settings.ema_alpha,
        outlier_sigma=settings.outlier_sigma,
        mapmatch_min_conf=settings.mapmatch_min_conf,
        max_segments_per_ride=settings.max_segments_per_ride,
        rate_limit_per_hour=settings.rate_limit_per_hour,
        idempotency_ttl_hours=settings.idempotency_ttl_hours,
        gtfs_version=gtfs_version,
        server_version=settings.server_version,
    )
```

**Fix:** replace `half_life_days=settings.half_life_days` and `ema_alpha=settings.ema_alpha` with hardcoded `half_life_days=None` and `ema_alpha=None` (since the `Settings` fields no longer exist per D-04). This must land in the *same* commit/step as the `config.py` field removal (D-04) — otherwise `get_config()` raises `AttributeError` immediately (exact Pitfall #1 failure mode).

---

### `backend/tests/test_learning.py` — new golden-value tests (BUGFIX-05) and deletions (D-03)

**Analog for new tests — existing `test_welford_convergence` (test_learning.py:35-46, confirmed) and `test_outlier_detection` (test_learning.py:57-70, confirmed):**
```python
def test_welford_convergence():
    """Test Welford converges to correct mean and variance."""
    n, mean, m2 = 0, 0.0, 0.0
    samples = [100, 110, 90, 105, 95]

    for x in samples:
        n, mean, m2 = update_welford(n, mean, m2, x)

    assert n == 5
    assert abs(mean - 100.0) < 0.01  # Mean should be ~100
    variance = compute_variance(m2, n)
    assert variance > 0  # Should have non-zero variance
```
This "arrange samples list → loop `update_welford` → call the function under test → assert" shape is the exact template for the new `test_compute_variance_uses_sample_formula_not_population`, `test_compute_variance_guards_n_less_than_2`, and `test_p90_wider_with_sample_variance_than_population_variance` tests specified in RESEARCH.md's Code Examples section — copy that structure directly.

**Deletions (D-03):** remove `test_ema_update` (lines 49-54, confirmed) and `test_time_based_alpha` (lines 132-154, confirmed) in full. Also remove `update_ema` and `compute_time_based_alpha` from the `from app.learning import (...)` block at lines 12-22 (confirmed) — leaving them in the import after deleting the source functions causes an `ImportError` collection failure for the whole test file.

**Import block to edit (test_learning.py:12-22, confirmed):**
```python
from app.learning import (
    update_welford,
    update_ema,
    compute_variance,
    is_outlier,
    compute_blend_weight,
    compute_blended_mean,
    compute_percentiles,
    compute_percentiles_robust,
    compute_time_based_alpha,
)
```
→ drop `update_ema,` and `compute_time_based_alpha,` lines.

**New test — verify dead code fully gone (D-03/D-07), analog per RESEARCH.md Code Examples (exact template to reuse, already matches this project's `hasattr`-based style):**
```python
def test_update_ema_and_compute_time_based_alpha_are_removed():
    import app.learning as learning_module
    assert not hasattr(learning_module, "update_ema")
    assert not hasattr(learning_module, "compute_time_based_alpha")
    assert not hasattr(learning_module, "is_stale")
```

---

### `backend/tests/test_integration.py` — single-commit-per-ride test (BUGFIX-06)

**Analog:** `backend/tests/test_connection_leak.py`'s `monkeypatch.setattr("app.routes.update_segment_stats", ...)` pattern (confirmed present per RESEARCH.md; same file already used as precedent in CONTEXT.md's canonical refs). Apply the same monkeypatch technique to `sqlite3.Connection.commit` instead, per RESEARCH.md's fully-worked example:
```python
import sqlite3

def test_ride_with_50_segments_commits_exactly_once(client, auth_headers, monkeypatch):
    commit_calls = []
    original_commit = sqlite3.Connection.commit

    def _counting_commit(self, *args, **kwargs):
        commit_calls.append(1)
        return original_commit(self, *args, **kwargs)

    monkeypatch.setattr(sqlite3.Connection, "commit", _counting_commit)
    # fixture setup / pre-seeded segment rows MUST be committed BEFORE this monkeypatch line
    payload = {"route_id": "ROUTE1", "direction_id": 0, "segments": [ /* 50 entries */ ]}
    response = client.post("/v1/ride_summary", json=payload, headers=auth_headers)

    assert response.status_code == 200
    assert len(commit_calls) == 1
```
**Critical ordering constraint (RESEARCH.md, confirmed):** any fixture DB setup must commit *before* `monkeypatch.setattr` is applied, or the test will overcount.

---

## Shared Patterns

### Single-commit-per-request (BUGFIX-06)
**Source:** `backend/app/routes.py:115-210` — `with get_connection(settings.db_path) as conn: ... conn.commit()` (the one remaining commit)
**Apply to:** `update_device_bucket()`, `log_rejection()`, `update_segment_stats()` in `learning.py` — remove all three inner `conn.commit()` calls listed above.

### Deprecated-field convention (D-14)
**Source:** CLAUDE.md, quoted directly: `timestamp_utc: Optional[int] = None  # DEPRECATED: use observed_at_utc`
**Apply to:** `ConfigResponse.half_life_days` and `ConfigResponse.ema_alpha` in `models.py`.

### Dead-code-must-be-deleted-not-hidden (D-03/D-07)
**Source:** this phase's own explicit decisions, no prior codebase precedent needed (first instance of this pattern in the repo per CONTEXT.md's Phase 1 cross-reference to "drive-by fixes")
**Apply to:** `update_ema`, `compute_time_based_alpha`, `is_stale` in `learning.py`, plus their test counterparts in `test_learning.py`.

### Seed-then-fall-through for sparse aggregate tables (BUGFIX-04)
**Source:** this phase's `update_segment_stats()` row-found branch (existing code) — the seeded branch must produce variables in the exact same shape/order as the row-found branch so the remainder of the function (outlier check, Welford update, UPDATE statement) runs unmodified regardless of which branch executed.
**Apply to:** the `if row is None:` block only; no other file needs this pattern this phase.

## No Analog Found

None. Every file this phase touches is an existing file being edited in place, and every edit has a direct in-file or in-project precedent (documented above). No wholly new architectural pattern (e.g., new endpoint, new table, new middleware) is introduced.

## Metadata

**Analog search scope:** `backend/app/learning.py`, `backend/app/routes.py`, `backend/app/config.py`, `backend/app/models.py`, `backend/tests/test_learning.py`, `backend/tests/test_integration.py`, `backend/tests/test_global_aggregation.py`, `backend/tests/test_api_v1_alignment.py`, `CLAUDE.md`
**Files scanned:** 9 (all read directly, no Glob/Grep-only inference — every excerpt above is confirmed against live file contents as of 2026-07-02)
**Pattern extraction date:** 2026-07-02

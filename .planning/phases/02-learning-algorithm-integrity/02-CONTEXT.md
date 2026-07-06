# Phase 2: Learning Algorithm Integrity - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the Welford+EMA learning model so it produces statistically correct outputs: new segments learn from their first observation (not silently rejected), variance uses the sample formula, all per-segment writes for a ride commit in a single transaction, and the EMA dead-code question is resolved. Covers requirements BUGFIX-04, BUGFIX-05, BUGFIX-06, LEARN-01.

**Scope change during discussion:** LEARN-02 (`dwell_stats` resolution) was moved out of this phase to v2 (now `LEARN-V2-05` in REQUIREMENTS.md) — dwell-time learning needs algorithm research before implementation, same rationale as the EMA v2 deferral below. ROADMAP.md Phase 2 success criterion #5 was removed accordingly. This phase now delivers 4 success criteria, not 5.

No new endpoints, no dwell-time learning implementation, no P90 distribution model change (log-normal/gamma is LEARN-V2-02), no Welford `n` decay (LEARN-V2-03) — those are v2/future-phase territory.

</domain>

<decisions>
## Implementation Decisions

### EMA Fate (LEARN-01)
- **D-01:** Remove EMA from the active pipeline now; defer incorporation into the blend to v2 (`LEARN-V2-01` already reserves "EMA incorporated into blend with configurable time-decay weight"). Do not attempt to design the blend formula in this phase.
- **D-02:** In `update_segment_stats()` (`backend/app/learning.py`), stop calling `update_ema()` and `compute_time_based_alpha()`, and stop writing `ema_mean`/`ema_var` in the `UPDATE segment_stats` statement.
- **D-03:** Delete the `update_ema()` and `compute_time_based_alpha()` functions entirely from `learning.py` — not just their call sites. Delete their corresponding unit tests in `test_learning.py`. Matches LEARN-01's literal "no silent dead code" wording; keeping unused functions around is the same smell one level removed.
- **D-04:** Remove the `ema_alpha` and `half_life_days` settings from `config.py` (and their `BMTC_EMA_ALPHA` / `BMTC_HALF_LIFE_DAYS` env vars) — `half_life_days` has no other reader once `compute_time_based_alpha` is deleted.
- **D-05:** Keep the `ema_mean`/`ema_var` columns in `segment_stats` (schema.sql) — do NOT drop them via migration in this phase. No schema change, no migration needed; the migration framework (DATA-01) belongs to Phase 4. Columns become inert/unused until v2 EMA work resumes.
- **D-06:** Update CLAUDE.md and any docs describing "Welford + EMA" as the live algorithm — but do NOT delete the mention of EMA entirely. Correct the description to reflect that EMA is not currently part of the active blend, and add an explicit note that v2 requires research into the most effective algorithm for predicting bus schedules from mobile-app-submitted data (frames the EMA question as part of a broader "what's the right learning model" research item for v2, not just "EMA specifically").
- **D-07 (Claude's discretion, resolved):** `is_stale()` (`learning.py:159`) was discovered during this review to be dead code unrelated to EMA — defined but never called anywhere, using its own `stale_threshold_days` setting. User said "you decide as per industry best practice." Decision: remove it as a drive-by fix, same rationale as D-03 (no orphaned functions), mirroring the Phase 1 precedent of fixing adjacent issues found during a related change. If research/planning finds any hidden caller, keep it instead.
- **D-14 (research-discovered gap, resolved 2026-07-02):** RESEARCH.md found that `GET /v1/config`'s `ConfigResponse` (`models.py:145-146`) requires `ema_alpha`/`half_life_days` as non-Optional fields, documented in `docs/api.md` and asserted by `test_api_v1_alignment.py`. D-04's removal of these `Settings` fields would make `get_config()` raise `AttributeError`. Confirmed via grep that `mobile/` has zero references to either field (no client dependency). Resolution: **soft-deprecate**, following this project's existing deprecated-field convention (CLAUDE.md's `timestamp_utc: Optional[int] = None  # DEPRECATED` pattern) — change `ema_alpha`/`half_life_days` to `Optional[...] = None` in `ConfigResponse`, return `None` with a `# DEPRECATED: EMA removed from active pipeline, see LEARN-01` comment, update `docs/api.md` spec-first (per CLAUDE.md Rule 1), and relax `test_api_v1_alignment.py`'s field-presence/type assertions to accept `None`. No breaking response-schema change.

### `dwell_stats` Fate (LEARN-02 → moved to v2)
- **D-08:** Do not implement dwell-time learning and do not drop the `dwell_stats` table in this phase. `dwell_sec` continues to be collected from clients and stored in `ride_segments` as today, simply not aggregated. Requirement moved to `LEARN-V2-05` (REQUIREMENTS.md) pending research into the most effective dwell-prediction approach. ROADMAP.md Phase 2 success criterion #5 removed — see `<domain>` above.
- Downstream agents: do not touch `dwell_stats` schema or add any dwell aggregation code in this phase's plans.

### First-Observation Bootstrap Semantics (BUGFIX-04)
- **D-09:** When `update_segment_stats()` finds no `segment_stats` row for `(segment_id, bin_id)`, seed a new row instead of rejecting with `missing_stats`. Seed `schedule_mean` = `AVG(schedule_mean)` across all other existing `bin_id` rows for that `segment_id` (one extra `SELECT` before the `INSERT`) — same route/stop-pair, different time of day, is a reasonable baseline. Seed `n=0, welford_mean=schedule_mean, welford_m2=0`.
- **D-10:** Edge case — if the segment has zero existing `segment_stats` rows across all bins (the `AVG` query returns `NULL`; e.g. GTFS re-bootstrap dropped all trips for this segment but left the `segments` row), fall back to `schedule_mean = 0.0`. This matches the existing schema default (`schedule_mean REAL NOT NULL DEFAULT 0.0`) and is not worth a dedicated rejection path — the case requires a `segments` row to survive a re-bootstrap with zero surviving trips, which is out of this phase's scope (DATA-04 territory).
- **D-11:** After seeding, the SAME triggering observation flows through the normal outlier-check + Welford-update logic in one pass and is counted as accepted (`n` becomes 1) — not seeded-then-rejected-then-accepted-on-next-request. This matches ROADMAP.md Phase 2 success criterion #1's literal wording ("the observation counted as accepted").

### Variance Formula (BUGFIX-05)
- No open ambiguity — `compute_variance()` (`learning.py:53-58`) changes from `m2 / n` to `m2 / (n - 1)` for `n >= 2`, keeping the existing `n < 2 → 0.0` guard. Directly locked by ROADMAP.md success criterion #2.

### Transaction Consolidation (BUGFIX-06)
- **D-12:** Remove the inner `conn.commit()` calls from `update_device_bucket()`, `log_rejection()`, and `update_segment_stats()` (all in `learning.py`) — the single outer `conn.commit()` at `routes.py:204` becomes the only commit for the whole ride-submission transaction.
- **D-13:** Also move the `update_device_bucket(conn, device_bucket)` call in `routes.py`'s per-segment loop (currently called once per segment, redundantly, since `device_bucket` is the same top-level value every iteration) to execute exactly once per ride, outside the segment loop. In scope alongside D-12 because it's the same code path being touched for the same bug fix — leaving a known-redundant `UPDATE` in a loop that's already being refactored for transaction correctness would be an obvious miss.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Known issues driving this phase
- `.planning/codebase/CONCERNS.md` — EMA dead code (learning.py:303, routes.py:341), population-variance bug (learning.py:53-58), orphaned `dwell_stats` table (schema.sql:151-167), `missing_stats` silent rejection (learning.py:279-283), multi-commit-per-ride issue (routes.py:125-203, learning.py:197-199, 320-323)
- `.planning/codebase/ARCHITECTURE.md` — component responsibilities, concurrency/consistency model (single-writer, one-transaction-per-POST pattern this phase enforces)

### Project-level requirements and roadmap
- `.planning/REQUIREMENTS.md` §"Learning Algorithm Integrity" — BUGFIX-04, BUGFIX-05, BUGFIX-06, LEARN-01 definitions; §"v2 Requirements (Deferred)" — LEARN-V2-01 (EMA), LEARN-V2-05 (dwell_stats, new)
- `.planning/ROADMAP.md` §"Phase 2: Learning Algorithm Integrity" — goal and 4 success criteria (criterion 5 removed 2026-07-02, see note in that section)
- `.planning/PROJECT.md` — constraints (SQLite-only, single-writer transaction pattern, backward compatibility)

### Prior phase precedent
- `.planning/phases/01-backend-correctness/01-CONTEXT.md` — D-13/D-14 established the `get_connection()` context-manager pattern this phase's transaction fix builds on; also the precedent for in-phase "drive-by fixes" (D-07 above follows the same pattern as Phase 1's stale-test drive-by fix)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/learning.py:14-31` `update_welford()` — the exact Welford update logic to reuse for the D-09/D-11 first-observation path; no new algorithm needed, just correct sequencing (seed row, then call this).
- `backend/app/gtfs_bootstrap.py:298-344` — shows how `schedule_mean` is originally computed per `(segment_id, bin_id)` from GTFS `stop_times` at bootstrap; confirms there is no per-segment aggregate column anywhere, so D-09's `AVG()` fallback requires a fresh query, not a stored value.

### Established Patterns
- `backend/app/learning.py:53-58` `compute_variance()` — already has the `n < 2` guard; the fix is a one-line divisor change.
- `backend/app/learning.py:265-323` `update_segment_stats()` — single function where D-02, D-09, D-10, D-11, and D-12 all land; this is the primary file for this phase's core fix.
- `backend/app/routes.py:125-203` — the ride-submission loop; D-12 (remove log_rejection/update_segment_stats commits) and D-13 (dedupe device_bucket call) both land here, same loop already flagged in CONCERNS.md's multi-commit issue.

### Integration Points
- `backend/app/config.py` — `Settings` class; D-04 removes `ema_alpha`/`half_life_days` fields here.
- `backend/tests/test_learning.py` — existing Welford/EMA unit tests; D-03 removes EMA-specific tests, BUGFIX-05's variance fix likely changes expected values in existing variance/percentile tests (verify during planning).
- `CLAUDE.md` and any `docs/` files describing "Welford+EMA" — D-06 requires a docs pass; grep for "EMA" across `docs/*.md` and `CLAUDE.md` during planning to find every mention.

</code_context>

<specifics>
## Specific Ideas

User wants every ambiguity resolved before planning (same pattern as Phase 1) — drilled into EMA's exact deletion boundary (functions + config, not just call sites), the docs-update wording (keep EMA mentioned, frame as a v2 research item rather than erasing it), and the first-observation seed/accept sequencing. Two "you decide" delegations were made explicit: EMA vs. dwell_stats implementation depth (both resolved toward "defer, need research" — a consistent pattern: when the fix requires designing an algorithm rather than fixing a bug, defer to v2 and flag for research), and the `is_stale()` drive-by removal (resolved via "industry best practice" → remove, consistent with D-03's dead-code stance).

</specifics>

<deferred>
## Deferred Ideas

- **EMA incorporation into blend** — `LEARN-V2-01` (already existed in REQUIREMENTS.md v2 section). Needs research into the most effective recency-weighting approach before implementation.
- **`dwell_stats` / dwell-time learning** — newly added as `LEARN-V2-05` during this discussion. Needs research into the most effective dwell-prediction algorithm (data already being collected via `dwell_sec`, just not yet learned from).
- **Broader "what's the right learning algorithm" research** — user's docs note (D-06) frames EMA/dwell as instances of a larger open question: what algorithm best predicts bus schedules from the mobile-app-submitted data BMTC actually has. Worth scoping as a dedicated research phase or spike before attempting `LEARN-V2-01`/`LEARN-V2-05`, not folded into this phase.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 2-Learning Algorithm Integrity*
*Context gathered: 2026-07-02*

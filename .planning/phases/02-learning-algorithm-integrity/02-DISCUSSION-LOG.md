# Phase 2: Learning Algorithm Integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 2-Learning Algorithm Integrity
**Areas discussed:** EMA fate, dwell_stats fate, First-observation bootstrap semantics, Transaction consolidation scope

---

## EMA Fate

| Option | Description | Selected |
|--------|-------------|----------|
| Remove now, defer to v2 | Delete EMA calls/writes; matches LEARN-V2-01 already reserving blend incorporation for v2 | ✓ |
| Incorporate into blend now | Extend `compute_blended_mean` to mix in `ema_mean`; real design work, not a small fix | |
| You decide | Let planner/researcher pick based on effort | |

**User's choice:** Remove now, defer to v2 (recommended option)
**Notes:** —

| Option (EMA columns) | Description | Selected |
|--------|-------------|----------|
| Stop writing only, keep columns | No schema change/migration needed; Phase 4 owns migration framework | ✓ |
| Drop columns via migration now | Cleaner schema but risky ad-hoc DROP COLUMN outside migration framework | |

**User's choice:** Stop writing only, keep columns (recommended option)

| Option (EMA functions) | Description | Selected |
|--------|-------------|----------|
| Delete both functions | Matches "no silent dead code" literally; tests deleted too | ✓ |
| Keep functions, remove call sites only | Ready for v2 reuse, but leaves unused code | |

**User's choice:** Delete both functions (recommended option)

| Option (EMA config settings) | Description | Selected |
|--------|-------------|----------|
| Remove both settings | Avoids a config field that does nothing | ✓ |
| Keep both settings, unused | Documents intent for future v2 work at the cost of dead config | |

**User's choice:** Remove both settings (recommended option)

| Option (docs) | Description | Selected |
|--------|-------------|----------|
| Update docs as part of this phase | Correct CLAUDE.md/docs text to stop describing EMA as live | ✓ (modified) |
| Leave docs, note as follow-up | Defer doc updates entirely | |

**User's choice:** "Update the docs but do not remove reference to the EMA. Also make a note in the relevant document that in v2, we have to research about the most effective algorithm to predict bus schedules based on the data we get from the mobile app."
**Notes:** User wants EMA mentioned but clearly marked as not currently live, plus an explicit v2-research note framing this as a broader "what's the best algorithm" question, not just an EMA-specific one.

| Option (is_stale drive-by) | Description | Selected |
|--------|-------------|----------|
| Leave it, out of scope | Not named in any Phase 2 requirement | |
| Remove as drive-by fix | Same "no silent dead code" spirit; low-risk, adjacent code | (delegated) |

**User's choice:** "You decide as per industry best practice."
**Notes:** Resolved to "remove as drive-by fix" — consistent with the EMA dead-code removal stance (D-03) and the Phase 1 precedent of fixing adjacent issues found during a related change (captured as D-07 in CONTEXT.md).

---

## dwell_stats Fate

| Option | Description | Selected |
|--------|-------------|----------|
| Implement dwell learning now | Real feature work using the existing Welford pattern; needs bootstrap-fallback design too | |
| Drop the table (recommended) | Smallest change satisfying LEARN-02's literal wording; needs a migration | |
| Leave as-is, defer decision | Explicitly punts LEARN-02 out of Phase 2 | ✓ (initial) |

**User's choice (round 1):** Leave as-is, defer decision

**Follow-up flag raised:** ROADMAP.md Phase 2 success criterion #5 explicitly requires dwell_stats resolution; deferring means that criterion fails verification.

| Option (follow-up) | Description | Selected |
|--------|-------------|----------|
| Drop the table instead | Reconsider toward the smallest change that satisfies criterion #5 | |
| Amend ROADMAP.md to drop criterion #5 | Formally descope LEARN-02 from Phase 2 to keep the roadmap honest | |
| Confirmed: defer anyway | Proceed knowing verification will flag the gap | (closest match) |

**User's choice (round 2):** "Defer to v2 as we need to research about the algorithm."
**Notes:** Treated as the roadmap-amendment path — LEARN-02 formally moved to v2 as `LEARN-V2-05` in REQUIREMENTS.md, and ROADMAP.md Phase 2 success criterion #5 removed, so the roadmap accurately reflects what Phase 2 delivers. Mirrors the EMA v2-deferral rationale (needs algorithm research first).

---

## First-Observation Bootstrap Semantics

| Option (schedule_mean seed) | Description | Selected |
|--------|-------------|----------|
| Average of segment's other bins | Query AVG(schedule_mean) across existing bins for the segment | ✓ |
| Use the observed duration itself | Seed schedule_mean = duration_sec of the triggering observation | |
| Use 0.0 and let it self-correct | Simplest, matches schema default, but risks skewing the blend early | |

**User's choice:** Average of segment's other bins (recommended option)

| Option (zero-bin edge case) | Description | Selected |
|--------|-------------|----------|
| Fall back to 0.0 | Matches schema default; extremely rare edge case | ✓ |
| Reject with a new reason | Adds a new rejection_reason value distinct from missing_stats | |

**User's choice:** Fall back to 0.0 (recommended option)

| Option (accept timing) | Description | Selected |
|--------|-------------|----------|
| Seed then immediately accept in one pass | Matches ROADMAP criterion #1's "counted as accepted" wording | ✓ |
| Seed only, reject the triggering observation | Simpler code path but contradicts criterion #1 | |

**User's choice:** Seed then immediately accept in one pass (recommended option)

---

## Transaction Consolidation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Remove all inner commits + dedupe device_bucket call | Both changes touch the same loop already being refactored | ✓ |
| Remove inner commits only, leave device_bucket call as-is | Minimal fix, leaves a known-redundant UPDATE in the loop | |

**User's choice:** Remove all inner commits + dedupe device_bucket call (recommended option)

---

## Claude's Discretion

- Exact SQL phrasing of the `AVG(schedule_mean)` fallback query (D-09) and whether it's a separate SELECT or combined via a CTE/subquery.
- `is_stale()` removal (D-07) — delegated via "industry best practice"; resolved to remove, consistent with the EMA dead-code stance.
- Precise wording of the CLAUDE.md/docs EMA note (D-06) — user specified intent (keep mention, add v2-research note) but not exact phrasing.

## Deferred Ideas

- EMA incorporation into blend (`LEARN-V2-01`, pre-existing) — needs recency-weighting design research.
- `dwell_stats` / dwell-time learning (`LEARN-V2-05`, newly added this session) — needs dwell-prediction algorithm research.
- Broader "what's the right learning algorithm for bus schedule prediction" research question — user framed EMA/dwell as instances of this larger open question; worth its own research phase or spike before attempting LEARN-V2-01/LEARN-V2-05.

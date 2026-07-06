---
phase: 02-learning-algorithm-integrity
plan: 03
subsystem: api
tags: [config, soft-deprecation, ema-removal, docs-sync]

# Dependency graph
requires:
  - phase: 02-learning-algorithm-integrity
    plan: 02
    provides: update_segment_stats() with EMA fully removed from the active learning pipeline (update_ema, compute_time_based_alpha, is_stale deleted; ema_mean/ema_var no longer read or written)
provides:
  - "GET /v1/config returns 200 with ema_alpha and half_life_days present-but-null (soft-deprecated, backward-compatible)"
  - "Settings.ema_alpha and Settings.half_life_days fully removed from config.py"
  - "docs/api.md, CLAUDE.md, .claude/CLAUDE.md, docs/architecture.md, docs/PROJECT_STRUCTURE.md, docs/gtfs-database.md all reframe EMA as removed-from-active-pipeline / v2 research item, without erasing EMA mentions"
affects: [phase-05-testing-validation, "any future v2 EMA research plan (LEARN-V2-01)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Soft-deprecate convention reused: Optional[T] = None with a `# DEPRECATED: ... see <REQ-ID>` comment, matching the existing timestamp_utc precedent in models.py"
    - "Spec-first sequencing: docs/api.md edited before models.py/routes.py/config.py in the same commit, per CLAUDE.md Rule 1"
    - "Same-commit sequencing for a field-removal + response-model soft-deprecation pair, to avoid an intermediate AttributeError window (D-04 + D-14 landed together)"

key-files:
  created: []
  modified:
    - docs/api.md
    - backend/app/models.py
    - backend/app/routes.py
    - backend/app/config.py
    - backend/tests/test_api_v1_alignment.py
    - CLAUDE.md
    - .claude/CLAUDE.md
    - docs/architecture.md
    - docs/PROJECT_STRUCTURE.md
    - docs/gtfs-database.md

key-decisions:
  - "D-04 + D-14 landed in one commit (Task 1): config.py field deletion and get_config's hardcoded None args, plus ConfigResponse's Optional fields, all in the same commit — prevents the AttributeError window RESEARCH.md's Pitfall #1 warned about"
  - "D-14 test relaxation: presence assertions for half_life_days/ema_alpha were kept (not deleted) — only the type/value expectations were relaxed to accept None, preserving the contract that these keys must still exist in the response"
  - "D-06 docs pass scoped to the 5 files explicitly named in the plan's files_modified frontmatter; .planning/codebase/*.md mapper-output docs and CONCERNS.md (a point-in-time record) were left untouched as out of scope"

requirements-completed: [LEARN-01]

coverage:
  - id: D1
    description: "GET /v1/config returns 200 (not 500) after Settings.ema_alpha/half_life_days removal; response body has ema_alpha=null, half_life_days=null"
    requirement: "LEARN-01"
    verification:
      - kind: unit
        ref: "backend/tests/test_integration.py::test_config_endpoint, backend/tests/test_api_v1_alignment.py::test_get_config_has_all_spec_fields, test_get_config_values_are_reasonable"
        status: pass
    human_judgment: false
  - id: D2
    description: "config.py Settings no longer defines ema_alpha or half_life_days"
    requirement: "LEARN-01"
    verification:
      - kind: unit
        ref: "grep -c 'ema_alpha|half_life_days' backend/app/config.py returns 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs/api.md updated spec-first (before models/routes/config) documenting the two fields as deprecated/nullable"
    requirement: "LEARN-01"
    verification:
      - kind: manual
        ref: "docs/api.md:1397-1398 (null example), :1413-1414 (deprecated field descriptions), :1523 (defaults note)"
        status: pass
    human_judgment: true
  - id: D4
    description: "Primary docs (CLAUDE.md, .claude/CLAUDE.md, architecture.md, PROJECT_STRUCTURE.md, gtfs-database.md) describe EMA as removed from the active pipeline, not erased"
    requirement: "LEARN-01"
    verification:
      - kind: unit
        ref: "grep -rln -i 'welford + ema|welford+ema' <5 files> returns empty; grep -rlc -i ema CLAUDE.md docs/architecture.md still finds matches"
        status: pass
    human_judgment: true

duration: 11min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 3: Config Surface + Docs Reframe (LEARN-01 completion) Summary

**`GET /v1/config` soft-deprecates `ema_alpha`/`half_life_days` (present, always `null`) after their `Settings` fields were deleted, and five primary docs now describe EMA as removed from the active pipeline instead of implying it's live**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-02 (continued session from Plan 02)
- **Completed:** 2026-07-02
- **Tasks:** 3 completed
- **Files modified:** 10

## Accomplishments

- Completed LEARN-01's config-surface half: `Settings.ema_alpha` and `Settings.half_life_days` deleted from `backend/app/config.py`; `get_config()` no longer reads either attribute, eliminating the `AttributeError: 'Settings' object has no attribute 'half_life_days'` risk flagged as Pitfall #1 in RESEARCH.md
- `ConfigResponse.half_life_days`/`.ema_alpha` soft-deprecated to `Optional[...] = None` with a `# DEPRECATED: ... see LEARN-01` comment, following the exact convention already established for `timestamp_utc` in `models.py` — the endpoint remains backward-compatible (fields present as keys, values now `null`) rather than removing them outright
- `docs/api.md` updated spec-first (before any code change), per CLAUDE.md Rule 1: the `GET /v1/config` example now shows `"half_life_days": null, "ema_alpha": null`, field descriptions flag both as deprecated with a pointer to a future v2 research item (`LEARN-V2-01`), and the validation-defaults note updated accordingly
- `backend/tests/test_api_v1_alignment.py`'s three `get_config` tests relaxed to accept `None` for both fields while still asserting their presence as response keys — all three pass, plus `test_integration.py::test_config_endpoint`
- D-06 docs pass completed across `CLAUDE.md`, `.claude/CLAUDE.md`, `docs/architecture.md`, `docs/PROJECT_STRUCTURE.md`, and `docs/gtfs-database.md`: every "Welford + EMA" (or "Welford/EMA") mention describing the **live** algorithm now clarifies EMA was removed from the active pipeline in Phase 2 (LEARN-01) and is deferred to v2 research (LEARN-V2-01) — EMA is not erased from any doc, and `ema_mean`/`ema_var` schema columns are annotated as retained-but-inert
- Full backend suite: 196 passed, 6 pre-existing failures (unchanged baseline — no new regressions from this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Spec-first config.py/models.py/routes.py soft-deprecation** - `d65ba59` (feat)
2. **Task 2: Relax test_api_v1_alignment.py config assertions** - `b3914bc` (test)
3. **Task 3: D-06 docs pass — reframe EMA as removed/v2 research item** - `48c55fc` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified

- `docs/api.md` — `GET /v1/config` example JSON shows `half_life_days`/`ema_alpha` as `null`; field descriptions and the validation-defaults note flag both as DEPRECATED with a `LEARN-V2-01` forward reference
- `backend/app/models.py` — `ConfigResponse.half_life_days`/`.ema_alpha` changed from required `int`/`float` to `Optional[...] = None` with `# DEPRECATED` comments (`Optional` was already imported)
- `backend/app/routes.py` — `get_config()`'s `ConfigResponse(...)` construction now passes hardcoded `half_life_days=None, ema_alpha=None` instead of reading `settings.half_life_days`/`settings.ema_alpha`
- `backend/app/config.py` — `Settings.ema_alpha: float = 0.1` and `Settings.half_life_days: int = 30` deleted; `n0` and `stale_threshold_days` unchanged (D-07 explicitly leaves `stale_threshold_days`)
- `backend/tests/test_api_v1_alignment.py` — `test_get_config_has_all_spec_fields`'s `required_fields` dict changed to `(int, type(None))`/`(int, float, type(None))` for the two fields; `test_get_config_values_are_reasonable` now asserts `data["half_life_days"] is None` and `data["ema_alpha"] is None`; `test_get_config_does_not_include_removed_fields` untouched (different, genuinely-removed fields)
- `CLAUDE.md` — project one-liner, directory listing, Learning Algorithm Details, and Environment Variables sections reframed; `BMTC_EMA_ALPHA`/`BMTC_HALF_LIFE_DAYS` env-var bullets removed with a note explaining the soft-deprecated `GET /v1/config` behavior
- `.claude/CLAUDE.md` — project description, Code Organization, Configuration Patterns, and Architecture Component Responsibilities table reframed the same way (this file is GSD-managed via `<!-- GSD:*-start/end -->` markers sourced from `.planning/codebase/*.md`, but the plan's explicit `files_modified` scope names this file directly, so it was edited in place; the underlying `.planning/codebase/*.md` mapper-output docs were left untouched as out of scope for this plan)
- `docs/architecture.md` — top-level summary, Components section, ride-submission data-flow step 6, Data Model stats/index descriptions, and the Configuration (env) table all reframed; `BMTC_EMA_ALPHA`/`BMTC_HALF_LIFE_DAYS` rows removed from the config table with an explanatory note
- `docs/PROJECT_STRUCTURE.md` — `learning.py` directory-listing comment and the ride-submission Data Flow diagram step reframed
- `docs/gtfs-database.md` — `ema_mean`/`ema_var` column comments in the `segment_stats` `CREATE TABLE` block, and the "Learning algorithm" numbered list, annotated as retained-but-inert; `dwell_stats` prose (D-08, out of scope) left untouched

## Decisions Made

- D-04 + D-14 landed in a single commit (Task 1) exactly as the plan's critical_note #1 required — no intermediate state exists where `config.py` lacks the fields but `get_config()` still reads them
- Kept the presence assertions in `test_get_config_has_all_spec_fields` rather than deleting the two fields from `required_fields` — the soft-deprecate contract requires the keys to still exist in the JSON response, only their values/types relaxed
- Scoped the D-06 docs pass strictly to the 5 files named in the plan's `files_modified` frontmatter (`CLAUDE.md`, `.claude/CLAUDE.md`, `docs/architecture.md`, `docs/PROJECT_STRUCTURE.md`, `docs/gtfs-database.md`); did not extend to `.planning/codebase/*.md` (mapper-output source docs) or `CONCERNS.md` (a point-in-time record of Phase-1-era findings, not a live-algorithm description) — those are out of this plan's explicit scope

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-4 auto-fixes were needed; all acceptance criteria were met on first pass.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Note for ops: if `/etc/bmtc-api/env` (or any deployed `.env`) still sets `BMTC_EMA_ALPHA`/`BMTC_HALF_LIFE_DAYS`, those env vars are now silently ignored by `pydantic-settings` (no `Settings` field consumes them) — no action required, but they can be removed from deployment env files as housekeeping.

## Next Phase Readiness

- LEARN-01 is now fully resolved across both halves: Plan 02 removed EMA from the learning core (`app/learning.py`), and this plan (03) removed EMA from the config surface (`Settings`/`ConfigResponse`/`get_config`) plus completed the D-06 docs reframe
- `GET /v1/config` remains a stable, backward-compatible, unauthenticated contract — no mobile client breaks; the two deprecated fields are always present and always `null`
- Plan 04 (per STATE.md's Phase 2 roadmap) is scoped to BUGFIX-06's remaining commit removals (`update_device_bucket`, `log_rejection`) and the `ride_summary` loop dedupe (D-13) — unaffected by this plan's changes
- Full backend suite: 196 passed, 6 pre-existing failures (unchanged baseline vs. Plan 02)

---
*Phase: 02-learning-algorithm-integrity*
*Completed: 2026-07-02*

## Self-Check: PASSED

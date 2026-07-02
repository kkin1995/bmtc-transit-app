---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 3 — API Surface Completion
status: planning
stopped_at: Completed 02-04-PLAN.md (BUGFIX-06 transaction consolidation + D-13 device_bucket dedupe) — Phase 2 complete, ready for verification
last_updated: "2026-07-02T12:08:49.157Z"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 7
  completed_plans: 7
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Riders get progressively more accurate bus ETAs as more trips are observed
**Current phase:** 3 — API Surface Completion
**Status:** Ready to plan

---

## Current Position

| Field | Value |
|-------|-------|
| Active phase | Phase 2: Learning Algorithm Integrity |
| Active plan | Plan 4 of 4 complete (02-04) |
| Phase status | Phase complete — ready for verification |
| Overall progress | 1/6 phases complete (Phase 1 executed + verified; 6/6 must-haves passed) |

```
Progress: [ Phase 1 ][ Phase 2 ][ Phase 3 ][ Phase 4 ][ Phase 5 ][ Phase 6 ]
           [   Done  ][  Done   ][  Queued ][  Queued ][  Queued ][  Queued ]
```

---

## Phase History

| Phase | Name | Plans | Verification | Completed |
|-------|------|-------|---------------|-----------|
| 1 | Backend Correctness | 3/3 | Passed (6/6 must-haves) | 2026-07-01 |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 1/6 (Phase 2 executed, pending verification) |
| Plans complete | 7 |
| Tests passing | 198/204 (198 passed, 6 pre-existing failures — same baseline as Phase 1, no new failures) |
| Open blockers | 0 |

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 14min | 3 tasks | 13 files |
| Phase 01 P02 | 27min | 3 tasks | 5 files |
| Phase 01 P03 | 33min | 4 tasks | 9 files |
| Phase 02 P01 | 6min | 2 tasks | 2 files |
| Phase 02 P02 | 13min | 3 tasks | 3 files |
| Phase 02 P03 | 11min | 3 tasks | 10 files |
| Phase 02 P04 | 5min | 2 tasks | 4 files |

---

## Accumulated Context

### Key Decisions

- EMA dead code: resolve in Phase 2 (either incorporate or remove — not both)
- `dwell_stats` orphaned table: resolve in Phase 2 (implement or drop with migration)
- CORS: lock origins in Phase 1; `allow_credentials` removal depends on auth review
- Migration framework: lightweight versioned SQL scripts (not Alembic) — keep deps minimal
- [Phase 01-01]: `get_connection()` converted to `@contextmanager` (BUGFIX-01) — all 15 app + 24 test call sites migrated to `with` syntax; zero manual `conn.close()` remain in `routes.py`
- [Phase 01-02]: CORS now reads an explicit allowlist from `BMTC_CORS_ORIGINS` with `allow_credentials` fully removed (BUGFIX-02) — Bearer-header auth only, no cookies
- [Phase 01-02]: `cleanup_expired_keys()` wired into `lifespan` startup after `init_db()` (BUGFIX-07) — expired idempotency rows purged on every restart
- [Phase 01-02]: All `slowapi` dead code removed from `main.py`/`routes.py`/`pyproject.toml` (LEARN-03) — `RateLimitMiddleware` is the sole active rate limiter
- [Phase 01-03]: `response_body TEXT` column added to `idempotency_keys` via `schema.sql` + guarded `ALTER TABLE` in `db.py`'s `init_db()` (BUGFIX-03) — idempotent replay returns the original response; legacy `response_body IS NULL` rows fall through to fresh reprocessing (D-09)
- [Phase 01-03]: `X-Deprecation-Warning` header delivered via `JSONResponse` on both `POST /v1/ride_summary` and `GET /v1/eta` when `timestamp_utc` is used (API-05) — documented spec-first in `docs/api.md` per CLAUDE.md Rule 1
- [Phase 01-03]: 2 stale `test_idempotency.py` tests (old 2-arg `store_idempotency_key()` signature) fixed as a drive-by — full suite baseline reduced from 8 to 6 pre-existing failures
- [Phase 02-01]: `compute_variance()` divisor changed from `m2/n` to `m2/(n-1)` (BUGFIX-05) — sample variance is the canonical convention paired with Welford's algorithm; `n < 2` guard preserved exactly to protect the BUGFIX-04 seeded `n=0` row and first Welford update (`n=1`) from ZeroDivisionError
- [Phase 02-02]: `update_segment_stats()` seeds a new segment_stats row (n=0, welford_mean/schedule_mean = AVG(schedule_mean) across the segment's other bins, or 0.0 fallback) for a never-seen (segment_id, bin_id), then falls through into the existing outlier-check + Welford-update logic so the triggering observation is accepted (BUGFIX-04) — `missing_stats` fully retired as a rejection reason
- [Phase 02-02]: `update_ema`, `compute_time_based_alpha`, and `is_stale` deleted entirely from `app.learning` (LEARN-01) — zero remaining callers; `ema_mean`/`ema_var` no longer read or written by `update_segment_stats`; trailing `conn.commit()` removed from `update_segment_stats` (BUGFIX-06, this function only)
- [Phase 02-03]: `Settings.ema_alpha`/`Settings.half_life_days` removed from `config.py`; `ConfigResponse` soft-deprecated to `Optional[...] = None` (D-04/D-14) — `GET /v1/config` returns 200 with null values, no mobile client breaks
- [Phase 02-03]: D-06 docs pass reframed "Welford + EMA" prose across `CLAUDE.md`, `.claude/CLAUDE.md`, `docs/architecture.md`, `docs/PROJECT_STRUCTURE.md`, `docs/gtfs-database.md` as EMA-removed-from-active-pipeline / v2 research item (LEARN-V2-01), without erasing EMA mentions
- [Phase 02-04]: Removed trailing `conn.commit()` from `update_device_bucket()` and `log_rejection()` in `learning.py` (D-12); hoisted the `update_device_bucket` call out of the per-segment loop in `routes.py::ride_summary` so it runs once per ride, not once per segment (D-13) — BUGFIX-06 fully resolved, a ride of any size now issues exactly one `conn.commit()`
- [Phase 02-04]: RESEARCH.md's documented `monkeypatch.setattr(sqlite3.Connection, "commit", ...)` test pattern is incompatible with this Python 3.12.13/sqlite3 3.50.4 build (immutable C type); substituted a `sqlite3.connect`-factory counting wrapper achieving the identical commit-counting assertion

### Active TODOs

- None yet

### Blockers

None

---

## Session Continuity

**Last session:** 2026-07-02T11:51:50Z
**Stopped at:** Completed 02-04-PLAN.md (BUGFIX-06 transaction consolidation + D-13 device_bucket dedupe) — Phase 2 complete, ready for verification
**Resume file:** None

**Last updated:** 2026-07-02
**Next action:** Verify Phase 2 (all 4 plans complete)

---

## Notes

Brownfield project initialized 2026-07-01. Phases 1–3 of prior work validated (CORE-01 through CORE-12 delivered). Active roadmap starts at new Phase 1 (Backend Correctness) with 24 requirements spanning BUGFIX, LEARN, API, DATA, and OPS categories.

CONCERNS.md documents the following P0 issues that Phase 1 must address first:

- SQLite connection leak in all route handlers (no try/finally)
- CORS wildcard + credentials (production risk)
- Idempotency replay returns stale zeros (broken guarantee)
- `slowapi` dead code (two competing rate-limit mechanisms)

Phase 2 addresses the algorithmic correctness issues that affect data quality.
Phases 3–4 can proceed in parallel after Phase 1 unblocks the codebase.
Phase 5 depends on Phase 2 (to test corrected algorithms) and Phase 4 (to test migrations).

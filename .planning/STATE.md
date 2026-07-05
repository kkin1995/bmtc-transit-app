---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 6 — Rate-Limit Hardening & API Docs Completeness
status: planning
stopped_at: "05-04-PLAN.md fully complete — `.github/workflows/ci.yml` pushed via PR #1, verified green (`Backend test suite: pass`, run 28747654025) after fixing 5 issues surfaced by the first real CI runs (bad action tag, uncommitted lockfile, missing .env fallback, 2 stale tests, 1 real middleware bug). All 4 plans in Phase 5 now complete; full backend suite is 246/246 passing."
last_updated: "2026-07-05T18:30:58.763Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 20
  completed_plans: 20
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Riders get progressively more accurate bus ETAs as more trips are observed
**Current phase:** 6 — Rate-Limit Hardening & API Docs Completeness
**Status:** Ready to plan

---

## Current Position

| Field | Value |
|-------|-------|
| Active phase | Phase 6: Rate-Limit Hardening & API Docs Completeness (not yet planned) |
| Active plan | none — Phase 5 fully complete and verified; Phase 6 has no plans yet |
| Phase status | Phase 5: 4/4 plans complete, verified 4/4 must-haves passed (05-VERIFICATION.md) |
| Overall progress | 4/6 phases complete + verified (Phase 1 + Phase 2 + Phase 3 + Phase 5); Phase 4 plans complete, awaiting verification; Phase 6 not yet started |

```
Progress: [ Phase 1 ][ Phase 2 ][ Phase 3 ][ Phase 4 ][ Phase 5 ][ Phase 6 ]
           [   Done  ][  Done   ][  Done   ][ Started ][   Done  ][  Queued ]
```

---

## Phase History

| Phase | Name | Plans | Verification | Completed |
|-------|------|-------|---------------|-----------|
| 1 | Backend Correctness | 3/3 | Passed (6/6 must-haves) | 2026-07-01 |
| 2 | Learning Algorithm Integrity | 4/4 | Passed (17/17 UAT checks; security threats_open: 0) | 2026-07-02 |
| 3 | API Surface Completion | 4/4 | Passed (8/8 must-haves) | 2026-07-03 |
| 5 | Quality & Operations | 4/4 | Passed (4/4 must-haves) | 2026-07-05 |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 3/6 verified (Phase 4 plans complete, pending verification) |
| Plans complete | 19 |
| Tests passing | 240/246 (240 passed, 6 pre-existing failures — same baseline as Phase 1/2/3/04-01/04-02/04-03/04-05/05-01/05-02/05-03, no new failures) |
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
| Phase 03 P01 | 15min | 3 tasks | 5 files |
| Phase 03 P02 | 10min | 3 tasks | 5 files |
| Phase 03 P03 | 12min | 3 tasks | 3 files |
| Phase 03 P04 | 8min | 3 tasks | 4 files |
| Phase 04 P01 | 18min | 3 tasks | 7 files |
| Phase 04 P02 | 15min | 2 tasks | 4 files |
| Phase 04 P03 | 10min | 3 tasks | 3 files |
| Phase 04 P04 | 16min | 3 tasks | 4 files |
| Phase 04 P05 | 22min | 2 tasks | 3 files |
| Phase 05 P01 | 15min | 2 tasks | 1 files |
| Phase 05 P02 | 12min | 3 tasks | 4 files |
| Phase 05 P03 | 8min | 2 tasks | 2 files |
| Phase 05 P04 | 5min | 1 tasks | 1 files |

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
- [Phase 03-01]: Corrected an incorrect nested-error-envelope assumption in planning artifacts (03-01-PLAN.md/03-RESEARCH.md/03-PATTERNS.md) — new `HTTPException(detail={...})` endpoints produce the same FLAT `{error,message,details}` wire shape as `JSONResponse`-style endpoints, verified via `app/main.py`'s `http_exception_handler` and the existing `test_eta_segment_not_found` precedent
- [Phase 03-02]: `GET /v1/routes/{route_id}` (API-02) implemented per D-01..D-06 and D-23 — stops-only `directions` array, most-common-shape representative trip for branch variants, zero-trip route returns `200 + directions: []`, zero-trip direction omitted entirely; `get_route_detail()` registered at the end of `routes.py` (after `search_routes()`) to avoid shadowing `/routes/search`; carried forward 03-01's flat-error-envelope correction with no new deviation
- [Phase 03-03]: `GET /v1/stops` extended with `lat`/`lon`/`radius_m` radius search (API-03) per D-12..D-17 — `haversine_m()`/`bounding_box()` pure helpers added, SQL bbox pre-filter + exact Haversine second pass excludes bbox-corner false positives; fixed validation order (mutual exclusivity D-13 -> all-or-nothing D-14 -> range D-16 -> cap D-15) returning the canonical `JSONResponse(400, {error,message,details})` envelope; D-17 drive-by closed the gap where `docs/api.md` already claimed bbox range validation but the code did not implement it
- [Phase 03-04]: `GET /v1/eta`'s nested `SegmentInfo` extended with `from_stop_name`/`to_stop_name`/`route_short_name` (API-04) per D-18..D-21 — resolved via a `LEFT JOIN` (never `INNER JOIN`) keyed on the already-resolved `segment_id`; an orphaned `from_stop_id`/`to_stop_id`/`route_id` nulls only that field and the endpoint still returns 200 (D-20); `route_long_name` intentionally excluded (D-19); flat deprecated ETA fields untouched (D-18); `docs/api.md`'s misleading `"route_id": "335E"` example replaced with a realistic compound `route_id` + separate `route_short_name` (D-21). Phase 3 (API Surface Completion) is now fully complete: 4/4 plans.
- [Phase 04-01]: `backend/app/migrations/003_rate_limit_*`/`004_idempotency_bodyhash_*` archived to `migrations/archive/` via `git mv` (D-01) — `schema.sql` is now the current baseline; `backend/scripts/apply_migrations.sh` added as the `schema_migrations`-tracked diff-and-apply runner (D-02/D-03), invoked manually only, never from app startup (D-04); `init_db()` seeds `schema_migrations` with every migration filename in the resolved migrations dir immediately after loading `schema.sql`, preventing double-application on a fresh bootstrap (RESEARCH.md Pitfall 1). DATA-01 satisfied.
- [Phase 04-02]: `rate_limit_cleanup.sh` wired to new `bmtc-rate-limit-cleanup.service`/`.timer` (daily 00:15, D-07); `bmtc-retention.timer` changed from bare `OnCalendar=daily` to explicit `*-*-* 00:00:00`, locking in a 15-minute stagger (D-09) so the two maintenance timers never collide on the single-writer SQLite DB; `rate_limit_cleanup.sh` itself left unmodified per D-08. DATA-02 satisfied.
- [Phase 04-03]: `retention_cleanup.sh` (D-05/D-06) replaces `bmtc-retention.service`'s inline `sqlite3` DELETE with three ordered deletes — `ride_segments` TTL, orphaned `rides` via `NOT EXISTS` keyed on `rides.ride_id`, `rejection_log` TTL — in one scheduled run; DATA-03 satisfied. Test subprocess path resolved via `Path(__file__).parent.parent` (matching `test_rate_limit_cleanup_script.py`'s 04-02 precedent), correcting RESEARCH.md's repo-root-relative example which breaks under this project's own `cd backend && uv run pytest` invocation convention.
- [Phase 04-04]: `update_gtfs.sh` (DATA-04) implements backup->stop->clear-7-GTFS-tables->re-bootstrap->row-count-validate->restart-or-rollback (D-10..D-15), reusing `backup.sh`/`restore.sh` verbatim and `uv run python -m app.bootstrap` unmodified; `BACKEND_DIR` resolved from the script's own location, not a hardcoded `/opt/bmtc-api` path. Rule 1 bugfix: added `PRAGMA wal_checkpoint(TRUNCATE)` before `restore.sh`'s file-level swap in the rollback path — under `journal_mode=WAL`, a stale non-empty `-wal` file left by the clear step would otherwise be replayed on the restored file, silently reapplying the destructive deletes and defeating D-14's rollback guarantee. Segment Welford values (`n`/`welford_mean`/`welford_m2`) proven byte-identical across a full refresh cycle in tests. DATA-04 satisfied.

### Active TODOs

- `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md` — Confirm bmtc sudoers drop-in before first production `update_gtfs.sh` run (deferred by operator 2026-07-04; target host not yet provisioned; not gated on phase completion)

### Blockers

None

---

## Session Continuity

**Last session:** 2026-07-05T18:30:58.763Z
**Stopped at:** Phase 5 (Quality & Operations) fully complete and verified — 4/4 plans, 4/4 must-haves passed (05-VERIFICATION.md), code review clean after fixing a critical pre-existing bug (CR-01) found along the way. ROADMAP/STATE/REQUIREMENTS updated; phase marked complete via `phase.complete`.
**Resume file:** none — Phase 6 (Rate-Limit Hardening & API Docs Completeness) has no plans yet

**Last updated:** 2026-07-05
**Next action:** `/gsd-discuss-phase 6` or `/gsd-plan-phase 6` to start Phase 6. (Phase 4 Data Management verification is still separately pending.)

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

## Decisions

- [Phase 04-05]: Task 2's blocking checkpoint (sudoers/service-control confirmation) was deferred by the operator (target host not yet provisioned), not approved -- tracked via .planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md, gated on first production update_gtfs.sh run rather than phase completion; T-04-08 remains open pending human verification. Phase 4 (Data Management) now complete: 5/5 plans.
- [Phase 05]: [Phase 05-01]: backend/tests/test_bootstrap.py added (OPS-02) — 3 tests asserting the verified 17-table/3-view literal schema against sqlite_master (not ROADMAP's stale 11-table count), gtfs_metadata population from mini_gtfs.zip, and zero FK violations with PRAGMA foreign_keys=ON explicitly set
- [Phase 05-02]: `backend/app/logging_config.py` (`JsonFormatter` + `configure_logging()`) and `TimingMiddleware` in `main.py` deliver OPS-04 — one JSON access log line per request (`request_latency_ms`/`method`/`path`/`status`); `TimingMiddleware` registered as the LAST `app.add_middleware()` call (after `RateLimitMiddleware`) to be truly outermost, correcting D-17's own "added first" rationale text per RESEARCH.md Pitfall 2; `configure_logging()` called at import time fixes RESEARCH.md Pitfall 3 (root logger previously had no handlers, defaulted to WARNING); `--no-access-log` added to `bmtc-api.service`'s ExecStart to avoid duplicate uvicorn access-log lines. `error_rate` intentionally not emitted as a field — derived by the operator from `status` (D-18).
- [Phase 05-03]: backend/tests/perf/load_test.py delivers OPS-01 (custom asyncio/httpx load test, zero new deps) - seeds a scratch DB directly (PERF_ROUTE segment + all-192-bin segment_stats, mirroring conftest's db_with_test_segment) instead of reusing generate_sample_data.py's synthetic IDs which 422; each simulated client derives a distinct SHA256 device_bucket exercising the real RateLimitMiddleware path (D-04); POST and GET run separately (D-05) against /tmp/perf.db on 127.0.0.1:8001, never bmtc_dev.db (D-02/T-05-06); results committed to backend/tests/perf/results.txt as manual evidence, intentionally excluded from CI (D-03) - actual run: POST p99=88.29ms (<200ms), GET p99=78.47ms (<100ms), both PASS. Phase 5 now 3/4 plans complete.
- [Phase 05-04]: `.github/workflows/ci.yml` delivers OPS-03 — backend-only pytest suite on push/PR to main, uv-cached, Python 3.12 pinned, `permissions: contents: read`, `pull_request` (never `pull_request_target`). Pushing the branch was confirmed with the user first (shared-state/remote action), then PR #1 was opened and iterated to green across 4 real CI failures: (1) `astral-sh/setup-uv@v8` doesn't resolve — no rolling `v8` major tag exists yet, pinned exact `v8.3.0`; (2) `backend/uv.lock` was gitignored in both `.gitignore` files and never committed — un-ignored and committed it; (3) 5 extra failures beyond the local baseline, all `Settings` `ValidationError` — several `test_learning.py` tests silently depended on a gitignored local `.env` for `BMTC_API_KEY`, fixed with a process-wide `os.environ.setdefault()` fallback in `conftest.py`; (4) the known "6 pre-existing" local failures, all root-caused as stale test expectations (flat vs nested error envelope, a hardcoded timestamp that aged past the 7-day window, an invalid hex `device_bucket`, an assertion on a field removed by the H3 IP-fallback-removal fix) plus one real bug (`RateLimitMiddleware` let `HTTPException` propagate unhandled instead of returning a `JSONResponse`, since `BaseHTTPMiddleware` sits outside FastAPI's exception-handling middleware) — all fixed per explicit user direction to fix rather than quarantine. PR #1 run 28747654025: `Backend test suite: pass`. Full suite: 246/246 passing. Phase 5 now 4/4 plans complete.
- [Phase 05]: Post-execution code review (05-REVIEW.md) surfaced a critical, pre-existing, empirically-reproduced bug adjacent to the rate_limit.py fix above: `RateLimitMiddleware`'s idempotent-replay short-circuit fabricated a response body (`{"accepted": True, ...}`, wrong schema vs. `routes.py`'s real `accepted_segments`/`rejected_segments`) and returned before `call_next()`, entirely bypassing `routes.py`'s H1 body-hash tamper check — a key reused with a genuinely different body under `rate_limit_enabled=true` (the production default) silently got a fake 200 instead of the correct 409, with new data never processed. Fixed per explicit user direction (commit `d81b453`): middleware now only computes rate-limit headers and forwards to `call_next()`, letting `routes.py` own body-hash verification and replay as it already does on the non-rate-limited path. Added `test_idempotency_replay_with_rate_limiting_enforces_body_hash_check` (verified it fails against the old code, passes against the fix). WR-01 (CORS middleware ordering drops CORS headers on 429/400 responses), WR-02 (broad `except Exception` in `extract_bucket_id`), and WR-03 (`results.txt` committed as an ever-appending artifact — actually intentional per D-03/05-03-PLAN.md) remain open, out of Phase 5's scope. Phase 5 verified complete: 4/4 must-haves passed (05-VERIFICATION.md).

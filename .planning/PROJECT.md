# BMTC Transit App

## What This Is

A crowd-sourced ETA learning system for Bengaluru Metropolitan Transport Corporation (BMTC) buses. The backend API ingests ride observations from a mobile app, learns travel time statistics per segment×time-bin using Welford + schedule-blend algorithms (EMA removed from the active pipeline, Phase 2 LEARN-01), and returns blended ETAs (incorporating GTFS schedule data). A React Native mobile app provides real-time ETA lookup, stop scheduling, and trip tracking with stop detection.

## Core Value

Riders get progressively more accurate bus ETAs as more trips are observed — even when the GTFS schedule is wrong or stale.

## Requirements

### Validated

These capabilities exist and are working in the current codebase:

- ✓ **POST /v1/ride_summary** — accepts ride segments, runs Welford+EMA learning, auth-gated with Bearer + idempotency — Phase 1
- ✓ **GET /v1/eta** — returns blended ETA (Welford mean + GTFS schedule blend) with P50/P90 percentiles — Phase 1
- ✓ **GET /v1/config, /v1/health** — server config and liveness endpoints — Phase 1
- ✓ **SQLite WAL database** — 11 tables, 3 views: GTFS (6 tables, 1.46M stop_times), learning (5 tables), audit (4 tables) — Phase 2
- ✓ **Bearer token auth + idempotency** — body SHA256 verification, 409 on mismatch — Phase 1
- ✓ **Token-bucket rate limiting** — per device_bucket/IP, SQLite-backed, atomic UPSERT — Phase 1
- ✓ **GET /v1/stops, /v1/routes, /v1/routes/search** — GTFS discovery endpoints with filtering and pagination — Phase 3
- ✓ **GET /v1/stops/{stop_id}/schedule** — scheduled departures from GTFS stop_times — Phase 3
- ✓ **Standardized error responses** — `{error, message, details}` shape across all endpoints — Phase 3
- ✓ **182 tests across 10 test files** — full isolation (in-memory DB, settings cache cleared, env patched), parallel execution — Phase 1+
- ✓ **systemd deployment** — bmtc-api.service, hourly backup timer, daily retention timer — Phase 1
- ✓ **Mobile app (Expo/React Native)** — ETA query, stop schedule, trip tracking with stop detection, routes search with server-side endpoint — Phase 3+
- ✓ **SQLite connection leak fixed** — `get_connection()` is an `@contextmanager` closing on every exit path (try/finally); forced-exception regression test added — Phase 1
- ✓ **CORS locked to explicit allowlist** — `BMTC_CORS_ORIGINS` env-driven allowlist; `allow_credentials` fully removed — Phase 1
- ✓ **Idempotency replay returns correct stored response** — `response_body` persisted and replayed byte-for-byte; legacy NULL rows reprocess fresh — Phase 1
- ✓ **Expired idempotency keys purged on startup** — `cleanup_expired_keys()` wired into lifespan after `init_db()` — Phase 1
- ✓ **X-Deprecation-Warning header** — delivered on POST /v1/ride_summary and GET /v1/eta when deprecated `timestamp_utc` is used; documented spec-first in docs/api.md — Phase 1
- ✓ **Single rate-limiting mechanism** — dead `slowapi` Limiter code removed from main.py/routes.py/pyproject.toml; `RateLimitMiddleware` is sole limiter — Phase 1
- ✓ **First-observation learning works** — `update_segment_stats` seeds a new `segment_stats` row and falls through to accept the triggering observation instead of rejecting with `missing_stats` — Phase 2
- ✓ **Variance uses sample formula (n-1)** — `compute_variance()` returns Bessel-corrected sample variance, fixing systematically narrow P90 bounds — Phase 2
- ✓ **All segment writes in a single transaction per ride** — trailing `conn.commit()` calls removed from `update_device_bucket`/`log_rejection`/`update_segment_stats`; one commit per ride in `routes.py` — Phase 2
- ✓ **EMA dead code removed** — `update_ema`, `compute_time_based_alpha`, `is_stale` deleted; config surface (`ema_alpha`, `half_life_days`) soft-deprecated in `GET /v1/config` (returns null, not 500) — Phase 2
- ✓ **GET /v1/stops/{stop_id}** — single stop detail (name, coordinates, zone) plus every serving route as a full `RouteResponse` object, ordered by `route_short_name`, not deduplicated — Phase 3
- ✓ **GET /v1/routes/{route_id}** — route detail plus a per-direction ordered stop list, selecting the most-common `shape_id` branch when a direction has variants; stops-only, no trip/schedule data — Phase 3
- ✓ **Geospatial radius search on GET /v1/stops** — `lat`/`lon`/`radius_m` params; SQL bounding-box pre-filter + exact Haversine second pass; mutually exclusive with `bbox` — Phase 3
- ✓ **GET /v1/eta enriched with human-readable names** — `from_stop_name`/`to_stop_name`/`route_short_name` added to the nested segment object via `LEFT JOIN`; orphaned references null just that field, never 500 — Phase 3
- ✓ **Versioned DB migration framework** — `apply_migrations.sh` diff-and-apply runner tracked via `schema_migrations`; `init_db()` seeds the table on fresh bootstrap so a new DB never double-applies changes already in `schema.sql`; four orphaned Oct-2025 migrations archived as historical record — Phase 4
- ✓ **Rate-limit bucket cleanup on a systemd timer** — `bmtc-rate-limit-cleanup.timer` (00:15) wired to the existing `rate_limit_cleanup.sh`, staggered from `bmtc-retention.timer` (00:00) to avoid simultaneous SQLite writes — Phase 4
- ✓ **Retention sweep removes orphaned `rides` rows** — `retention_cleanup.sh` runs three ordered TTL deletes (`ride_segments`, orphaned `rides` with zero remaining segments, `rejection_log`) in one pass, replacing the old inline single-table DELETE — Phase 4
- ✓ **GTFS refresh without losing learning history** — `scripts/update_gtfs.sh <zip>` backs up, stops the service, clears only the 7 GTFS-source tables, re-bootstraps (refreshing `schedule_mean` only), validates row-count deltas, and auto-restores + exits non-zero on failure — Phase 4

### Active

Current work: quality/ops hardening (performance tests, monitoring, CI). Backend correctness (Phase 1), learning algorithm gaps (Phase 2), the API surface (Phase 3), and data management (Phase 4) are resolved — see Validated above.

- [ ] Performance tests (load tests) verifying POST p99 < 200ms, GET p99 < 100ms
- [ ] Monitoring/alerting integration
- [ ] CI pipeline

### Out of Scope

- Analytics dashboard — high effort, low priority for current user base; defer to dedicated tooling (Grafana) later
- Client SDK (TypeScript/Python) — users are internal only; not needed yet
- Property-based / mutation testing — valuable but not blocking production
- Multi-service GTFS (BMTC publishes single service_id='1') — not needed until GTFS changes
- Real-time vehicle tracking (GPS push) — requires infrastructure BMTC doesn't provide
- OAuth / social login — single-user internal tool; Bearer token sufficient

## Context

**Codebase state (as of 2026-07-04):**
- Backend: FastAPI + SQLite WAL, `uv` package manager, 235 tests (229 passing, 6 pre-existing failures — same baseline since before Phase 2), systemd deployed
- Mobile: Expo 54 / React Native 0.81, Tamagui, expo-location, expo-router
- 10 API endpoints, all live; Phase 1 resolved the P0 connection leak, idempotency replay, and CORS bugs; Phase 2 resolved the learning-algorithm correctness bugs (variance formula, first-observation rejection, per-segment commits, EMA dead code); Phase 3 completed the API surface (single-resource stop/route detail, geospatial radius search, human-readable ETA enrichment); Phase 4 added the data-management operational layer (versioned migrations, rate-limit + retention cleanup timers, GTFS refresh) — remaining known issues are quality/ops scoped (see ROADMAP.md Phases 5-6)
- 04-REVIEW.md (Phase 4) found 3 critical / 7 warning findings in the two scripts touching production data destructively (`update_gtfs.sh` missing a global rollback trap and backing up before stopping the service; `retention_cleanup.sh` accepting unvalidated negative retention-window env vars) — all 10 fixed same-session (04-REVIEW-FIX.md, `status: all_fixed`), verified independently against the full suite (no regressions)
- The one Phase 4 item requiring a human, off-repo action — confirming the scoped `bmtc` sudoers drop-in for `systemctl stop/start bmtc-api` on the production host — was explicitly deferred (host not yet provisioned) and is tracked as an open pre-production prerequisite, not a phase gap: `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md`
- 03-REVIEW.md (Phase 3) found 8 critical / 10 warning findings, all traced via `git blame` to pre-Phase-3 commits (`ride_summary` validation-envelope gaps, missing `RequestValidationError` handler, the `/stops/{id}/schedule` time-window filter being unimplemented) — none are Phase 3 regressions; deferred, no blockers for this phase
- 02-REVIEW.md (Phase 2) found 4 non-blocking warnings — stale `device_bucket` examples in docs/api.md, seed-quality drift on sparse segments, a dead import alias in routes.py — deferred, no blockers
- 01-REVIEW.md (Phase 1) found 3 pre-existing rate-limit/idempotency-error-shape defects (`rate_limit.py`, error response contract) explicitly deferred to Phase 6 — not phase-1-blocking, 6 tests remain red (same baseline through Phase 2)

**Key technical decisions already made:**
- SQLite WAL as the sole data store (no PostgreSQL, no Redis)
- Privacy-preserving device_bucket (SHA256 daily hash, never store device ID)
- GTFS as authoritative schedule source; custom learning blended on top
- Cloudflare Tunnel for external exposure (no direct public port)

**Known gaps driving the active roadmap:**
- No CI pipeline (tests run locally only)
- No performance or load tests despite stated p99 targets

## Constraints

- **Tech Stack**: SQLite only (no external DB) — keeps deployment simple; single server
- **Privacy**: Never persist raw device IDs; use device_bucket (SHA256 daily hash) everywhere
- **Single writer**: SQLite WAL pattern — one transaction per POST request; no concurrent writers
- **Backward compatibility**: v1 API contract must not break existing mobile clients
- **Performance**: GET /v1/eta p99 < 200ms (CF Tunnel); all writes in a single transaction

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite WAL (no external DB) | Simplest possible deployment; single server; no ops overhead | ✓ Good |
| Welford + EMA for learning | Numerically stable, online, no data retention needed | ✓ Good |
| Privacy: device_bucket via SHA256 | GDPR-adjacent; no user tracking | ✓ Good |
| n0=20 blend weight denominator | Blend converges to learned mean after ~40 observations | — Pending (not validated in production) |
| Bearer token + Idempotency-Key on POST | Prevents replay and rate-limit bypass | ✓ Good |
| EMA stored but not yet blended | Placeholder for future recency-weighting | ✓ Resolved — removed entirely in Phase 2 (LEARN-01); recency-weighting is a v2 research item if revisited |
| Normal distribution approximation for P90 | Simple, fast; known to underestimate for skewed distributions | ⚠️ Revisit — acceptable for now, revisit with real data |
| Client-side `is_holiday` flag | Simplicity; single BMTC service_id makes server-side compute redundant | ⚠️ Revisit — can be spoofed |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-04 after Phase 4 (Data Management) completion*

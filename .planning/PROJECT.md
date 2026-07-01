# BMTC Transit App

## What This Is

A crowd-sourced ETA learning system for Bengaluru Metropolitan Transport Corporation (BMTC) buses. The backend API ingests ride observations from a mobile app, learns travel time statistics per segment×time-bin using Welford+EMA algorithms, and returns blended ETAs (incorporating GTFS schedule data). A React Native mobile app provides real-time ETA lookup, stop scheduling, and trip tracking with stop detection.

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

### Active

Current work: fill learning algorithm gaps, complete the API surface, and add operational infrastructure. (Backend correctness bugs from Phase 1 are resolved — see Validated above.)

- [ ] First-observation learning works (missing_stats → upsert, not reject)
- [ ] Variance uses sample formula (n-1), fixing systematically narrow P90
- [ ] All segment writes in a single transaction per ride (not 100 commits)
- [ ] EMA either incorporated into blend or removed (not silent dead code)
- [ ] GET /v1/stops/{stop_id} and GET /v1/routes/{route_id} endpoints
- [ ] Geospatial stop search (radius_m parameter)
- [ ] Stop names returned in /v1/eta response
- [ ] GTFS update workflow (scripts/update_gtfs.sh)
- [ ] DB migration framework (versioned SQL scripts replacing empty migrations/)
- [ ] Rate limit bucket cleanup wired to systemd timer
- [ ] Retention script cleans parent `rides` table (not just `ride_segments`)
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

**Codebase state (as of 2026-07-01):**
- Backend: FastAPI + SQLite WAL, `uv` package manager, 195 tests (14 test files), systemd deployed
- Mobile: Expo 54 / React Native 0.81, Tamagui, expo-location, expo-router
- 9 API endpoints, all live; Phase 1 resolved the P0 connection leak, idempotency replay, and CORS bugs — remaining known issues are learning-algorithm and rate-limit-hardening scoped (see CONCERNS.md, ROADMAP.md Phase 6)
- CONCERNS.md documents EMA dead code, multiple commits-per-segment, variance formula error (Phase 2 territory)
- 01-REVIEW.md (Phase 1) found 3 pre-existing rate-limit/idempotency-error-shape defects (`rate_limit.py`, error response contract) explicitly deferred to Phase 6 — not phase-1-blocking, 6 tests remain red

**Key technical decisions already made:**
- SQLite WAL as the sole data store (no PostgreSQL, no Redis)
- Privacy-preserving device_bucket (SHA256 daily hash, never store device ID)
- GTFS as authoritative schedule source; custom learning blended on top
- Cloudflare Tunnel for external exposure (no direct public port)

**Known gaps driving the active roadmap:**
- Several CONCERNS.md issues affect data quality and production reliability
- `migrations/` directory exists but is empty — schema changes are manual
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
| EMA stored but not yet blended | Placeholder for future recency-weighting | ⚠️ Revisit — either use it or remove it |
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
*Last updated: 2026-07-01 after Phase 1 (Backend Correctness) completion*

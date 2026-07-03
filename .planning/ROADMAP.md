# Roadmap: BMTC Transit App

**Project:** ETA learning system for Bengaluru buses (brownfield — Phases 1–3 of prior work validated)
**Granularity:** Standard
**Active requirements:** 30 (BUGFIX-01 through APIDOC-02; LEARN-02 moved to v2 as LEARN-V2-05, 2026-07-02)
**Coverage:** 30/30 ✓

---

## Phases

- [x] **Phase 1: Backend Correctness** — Eliminate P0 connection leaks, broken idempotency replay, CORS misconfiguration, and dead code that undermines production reliability (completed 2026-07-01)
- [x] **Phase 2: Learning Algorithm Integrity** — Fix variance formula, first-observation bootstrapping, EMA dead code, and per-segment transaction commits so the learning model produces accurate outputs (completed 2026-07-02)
- [x] **Phase 3: API Surface Completion** — Add missing single-resource endpoints, geospatial stop search, enriched ETA response, and client-visible deprecation headers (completed 2026-07-03)
- [ ] **Phase 4: Data Management** — Establish a DB migration framework, wire rate-limit cleanup, fix retention orphans, and add a safe GTFS update workflow
- [ ] **Phase 5: Quality & Operations** — Add performance tests, bootstrap smoke tests, CI pipeline, and structured monitoring so production targets are verifiably met
- [ ] **Phase 6: Rate-Limit Hardening & API Docs Completeness** — Close the rate-limiting gaps flagged by the STRIDE security review (disabled-by-default, quota-check ordering, idempotency interaction) and fill the remaining privacy/error-model documentation gaps in docs/api.md

---

## Phase Details

### Phase 1: Backend Correctness

**Goal:** Every route handler closes its SQLite connection under all exit paths; idempotency replay returns the original response; CORS is safe for production; and dead slowapi code is removed
**Depends on:** Nothing (first active phase; prior codebase is the baseline)
**Requirements:** BUGFIX-01, BUGFIX-02, BUGFIX-03, BUGFIX-07, LEARN-03, API-05
**Success Criteria** (what must be TRUE):

  1. Submitting a ride that causes an internal exception (e.g., Pydantic validation error mid-handler) does not leak a SQLite file descriptor — verified by inspecting open FDs before and after a forced error
  2. A client that retries a POST /v1/ride_summary with the same Idempotency-Key receives the original accepted/rejected counts — not zeros
  3. The CORS configuration specifies an explicit origin list; `allow_credentials=True` is removed or scoped to a non-wildcard origin; the combination that browsers reject is gone
  4. Expired idempotency keys are removed on application startup — the `idempotency_keys` table has no rows older than 24h after a fresh server start
  5. The response to POST /v1/ride_summary includes an `X-Deprecation-Warning` header when the deprecated `timestamp_utc` field is used; clients receive the signal without reading server logs
  6. The `slowapi` `Limiter` instances in `routes.py` and `main.py` are deleted — the codebase has one rate-limiting mechanism (`RateLimitMiddleware`), not two

**Plans:** 3/3 plans complete
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — get_connection() context-manager conversion + all call-site updates (BUGFIX-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — CORS allowlist, startup idempotency cleanup, slowapi dead-code removal (BUGFIX-02, BUGFIX-07, LEARN-03)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — idempotency replay fix + X-Deprecation-Warning headers (BUGFIX-03, API-05)

### Phase 2: Learning Algorithm Integrity

**Goal:** The Welford+EMA learning model produces statistically correct outputs — new segments learn from their first observation, P90 bounds are not systematically underestimated, all segment writes commit in one transaction, and EMA is either used or removed
**Depends on:** Phase 1
**Requirements:** BUGFIX-04, BUGFIX-05, BUGFIX-06, LEARN-01
**Success Criteria** (what must be TRUE):

  1. Submitting a ride segment for a brand-new (never-seen) route segment results in a `segment_stats` row being created and the observation counted as accepted — not rejected with `missing_stats`
  2. The variance calculation returns `m2 / (n-1)` for n >= 2 — after 10 observations the P90 ETA bound is measurably wider than with the population formula, verifiable via unit test
  3. A ride with 50 segments triggers exactly one `conn.commit()` call — not ~100 — confirmed by a test that asserts a single transaction wraps all per-segment writes
  4. EMA values are either incorporated into `compute_blended_mean` (with a test asserting non-zero influence on the returned ETA) or all EMA write paths are removed from `learning.py` — no silent dead code remains

**Note (2026-07-02):** Criterion 5 (`dwell_stats` resolution) removed from this phase — LEARN-02 moved to v2 as LEARN-V2-05 during Phase 2 discussion; dwell-time learning needs algorithm research before implementation. See `.planning/REQUIREMENTS.md`.

**Plans:** 4/4 plans complete
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — BUGFIX-05: compute_variance sample formula m2/(n-1) + golden/guard/P90-widening tests

**Wave 2** *(blocked on Wave 1)*

- [x] 02-02-PLAN.md — BUGFIX-04 + LEARN-01 core: seed-on-first-observation in update_segment_stats, remove EMA/is_stale dead code, update rejection tests

**Wave 3** *(blocked on Wave 2)*

- [x] 02-03-PLAN.md — LEARN-01 config surface: remove ema_alpha/half_life_days settings, soft-deprecate GET /v1/config fields (D-14), docs pass (D-06)

**Wave 4** *(blocked on Waves 2 & 3)*

- [x] 02-04-PLAN.md — BUGFIX-06: consolidate ride writes into one transaction, dedupe device_bucket update (D-13)

### Phase 3: API Surface Completion

**Goal:** Mobile clients can fetch single stop/route detail, find nearby stops by radius, receive human-readable names in ETA responses, and act on deprecation warnings without parsing server logs
**Depends on:** Phase 1
**Requirements:** API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):

  1. GET /v1/stops/{stop_id} returns stop name, coordinates, and a list of routes serving that stop for any valid stop_id in the database; returns 404 with the standard error shape for an unknown stop_id
  2. GET /v1/routes/{route_id} returns route short name, long name, and the ordered list of stops for any valid route_id; returns 404 for an unknown route_id
  3. GET /v1/stops?lat=12.97&lon=77.59&radius_m=500 returns all stops within 500m of that coordinate — verified by confirming a known stop within range is included and a stop 600m away is excluded
  4. GET /v1/eta response body includes `from_stop_name`, `to_stop_name`, and `route_short_name` fields populated from GTFS data — clients no longer need a separate stop/route lookup to display human-readable ETA results

**Plans:** 4/4 plans complete
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — API-01: GET /v1/stops/{stop_id} stop detail + serving routes (D-07..D-11)

**Wave 2** *(blocked on Wave 1 — shared files: routes.py, models.py, docs/api.md, tests)*

- [x] 03-02-PLAN.md — API-02: GET /v1/routes/{route_id} route detail, most-common-shape stops per direction (D-01..D-06, D-23)

**Wave 3** *(blocked on Wave 2 — shared files)*

- [x] 03-03-PLAN.md — API-03: geospatial radius search on GET /v1/stops (Haversine + bbox pre-filter, D-12..D-17)

**Wave 4** *(blocked on Wave 3 — shared files)*

- [x] 03-04-PLAN.md — API-04: enrich GET /v1/eta segment with stop/route names via LEFT JOIN (D-18..D-22)

### Phase 4: Data Management

**Goal:** Schema changes are tracked via versioned migration scripts, rate-limit buckets are cleaned up automatically, retention sweeps remove orphaned rides rows, and GTFS data can be refreshed without losing learning history
**Depends on:** Phase 1
**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):

  1. A versioned migration script exists in `backend/app/migrations/` for each schema change made after the baseline; running `apply_migrations.sh` (or equivalent) on an older DB brings it to current schema without manual ALTER TABLE commands
  2. The `rate_limit_buckets` table is cleaned by a systemd timer on a schedule — the timer unit file exists, is enabled, and the cleanup script removes rows older than the TTL on each run
  3. The retention script deletes rows from `rides` that have no remaining `ride_segments` after the segment retention sweep — no orphaned `rides` rows accumulate beyond the retention window
  4. Running `scripts/update_gtfs.sh` on a production-like DB completes a full backup → download → GTFS-table clear → re-bootstrap → row-count validation cycle without deleting any rows from `segment_stats`, `rides`, or `ride_segments`

**Plans:** TBD

### Phase 5: Quality & Operations

**Goal:** The performance targets stated in CLAUDE.md are verified under concurrent load, bootstrap correctness is automatically tested, the full test suite runs in CI on every commit, and production latency/error rates are observable
**Depends on:** Phase 2, Phase 4
**Requirements:** OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):

  1. A load test script demonstrates POST /v1/ride_summary p99 latency < 200ms and GET /v1/eta p99 < 100ms under at least 20 concurrent clients — results are captured in a reproducible artifact (e.g., `tests/perf/results.txt`)
  2. `tests/test_bootstrap.py` exists and passes: verifies all 11 tables and 3 views exist after bootstrap, GTFS metadata row is populated, and `PRAGMA foreign_key_check` returns zero violations
  3. A GitHub Actions (or equivalent) CI workflow file exists that runs the full test suite (`uv run pytest -n auto`) on every push and pull request to `main` — the badge/status is visible
  4. Structured log fields `request_latency_ms` and `error_rate` are emitted on every request, OR a `/metrics` Prometheus endpoint exists — an operator can observe p95 latency and error counts without instrumenting the process externally

**Plans:** TBD

### Phase 6: Rate-Limit Hardening & API Docs Completeness

**Goal:** Rate limiting cannot be silently disabled in production, quota is checked before any state mutation, idempotent replays never double-spend quota, rate-limit headers are always present, and docs/api.md fully documents the privacy/retention model and error codes
**Depends on:** Phase 1
**Requirements:** RATELIMIT-01, RATELIMIT-02, RATELIMIT-03, RATELIMIT-04, RATELIMIT-05, APIDOC-01, APIDOC-02
**Success Criteria** (what must be TRUE):

  1. A request that exceeds quota produces zero writes to `segment_stats` or `rejection_log` — verified by asserting row counts are unchanged before/after a 429 response
  2. Concurrent POSTs to the same `device_bucket` never oversell quota — a load test with N concurrent requests against a bucket with `tokens < N` results in exactly `tokens` accepted and the rest 429'd
  3. Replaying a POST with the same `Idempotency-Key` and body does not decrement `tokens` a second time — verified by checking `tokens` is unchanged after a replay
  4. `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers are present on both 2xx and 429 POST responses
  5. `BMTC_RATE_LIMIT_ENABLED=false` is a real, working config toggle — quota checks are skipped (all requests succeed) but headers are still returned
  6. `docs/api.md` documents `device_bucket` privacy properties, all four retention windows, and all 7 error codes with worked examples — a reviewer can answer "what happens on a 409" from the doc alone

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Correctness | 3/3 | Complete    | 2026-07-01 |
| 2. Learning Algorithm Integrity | 4/4 | Complete    | 2026-07-02 |
| 3. API Surface Completion | 4/4 | Complete   | 2026-07-03 |
| 4. Data Management | 0/? | Not started | - |
| 5. Quality & Operations | 0/? | Not started | - |
| 6. Rate-Limit Hardening & API Docs Completeness | 0/? | Not started | - |

---

*Roadmap created: 2026-07-01*
*Brownfield project — prior Phases 1–3 validated; active roadmap starts at new Phase 1*
*Phase 6 added 2026-07-01 via `/gsd-ingest-docs --mode merge`*

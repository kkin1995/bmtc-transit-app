# Requirements: BMTC Transit App

**Defined:** 2026-07-01
**Core Value:** Riders get progressively more accurate bus ETAs as more trips are observed

---

## Validated (Already Shipped)

The following are built and working. Captured here for traceability; not included in the active roadmap.

| ID | Requirement | Phase Delivered |
|----|-------------|-----------------|
| CORE-01 | POST /v1/ride_summary accepts ride segments and runs Welford+EMA learning | Phase 1 |
| CORE-02 | GET /v1/eta returns blended ETA with P50/P90 percentiles | Phase 1 |
| CORE-03 | GET /v1/config and /v1/health endpoints | Phase 1 |
| CORE-04 | Bearer token auth + idempotency with body SHA256 on POST | Phase 1 |
| CORE-05 | Token-bucket rate limiting per device_bucket/IP | Phase 1 |
| CORE-06 | SQLite WAL database with GTFS (6 tables) + learning (5 tables) + audit tables | Phase 2 |
| CORE-07 | GET /v1/stops, /v1/routes, /v1/routes/search — GTFS discovery with filtering/pagination | Phase 3 |
| CORE-08 | GET /v1/stops/{stop_id}/schedule — scheduled departures from GTFS | Phase 3 |
| CORE-09 | Standardized error response format across all endpoints | Phase 3 |
| CORE-10 | 182 tests with full isolation, parallel execution | Phase 1+ |
| CORE-11 | systemd deployment with hourly backup + daily retention timers | Phase 1 |
| CORE-12 | Expo/React Native mobile app with ETA query, stop schedule, trip tracking, route search | Phase 3+ |

---

## v1 Requirements (Active Roadmap)

### Backend Correctness

- [ ] **BUGFIX-01**: SQLite connections are always closed even on unexpected exceptions (try/finally or context manager in all handlers — currently any exception between `get_connection()` and `conn.close()` leaks the FD)
- [ ] **BUGFIX-02**: CORS configuration locks `allow_origins` to an explicit list (not wildcard) before production; `allow_credentials` removed or scoped correctly
- [ ] **BUGFIX-03**: Idempotency replay returns the original stored response body (not stale `accepted_segments=0, rejected_segments=0`)
- [ ] **BUGFIX-04**: First observation on a new segment upserts a `segment_stats` row (not rejected as `missing_stats`); ensures new segments can learn from day one
- [ ] **BUGFIX-05**: Variance calculation uses sample formula `m2 / (n-1)` — not population `m2 / n` — fixing systematically narrow P90 bounds
- [ ] **BUGFIX-06**: All per-segment writes for a ride are committed in a single transaction (not ~100 commits per ride via per-segment `conn.commit()`)
- [ ] **BUGFIX-07**: Expired idempotency keys are cleaned up automatically (call `cleanup_expired_keys()` on startup or via systemd timer)

### Learning Algorithm Integrity

- [ ] **LEARN-01**: EMA values are either incorporated into the blend formula OR all EMA writes are removed — no silent dead code
- [ ] **LEARN-02**: `dwell_stats` table is either populated by dwell-time learning or dropped from schema — no orphaned tables
- [ ] **LEARN-03**: `slowapi` `Limiter` dead code removed from `routes.py` and `main.py` (actual limiting is in `RateLimitMiddleware`)

### API Surface

- [ ] **API-01**: GET /v1/stops/{stop_id} returns single stop detail (coordinates, name, routes serving it)
- [ ] **API-02**: GET /v1/routes/{route_id} returns single route detail (stops, trips, schedules)
- [ ] **API-03**: GET /v1/stops?lat=X&lon=Y&radius_m=500 — geospatial stop search (currently only bbox)
- [ ] **API-04**: GET /v1/eta response includes `from_stop_name`, `to_stop_name`, `route_short_name` (currently only IDs)
- [ ] **API-05**: Deprecated `timestamp_utc` field sends `Deprecation` or `X-Deprecation-Warning` header to clients (currently only logs server-side)

### Data Management

- [ ] **DATA-01**: DB migration framework in place (versioned SQL scripts in `backend/app/migrations/`; currently empty)
- [ ] **DATA-02**: Rate limit bucket cleanup wired to a systemd timer (script exists but is not scheduled)
- [ ] **DATA-03**: Retention script cleans parent `rides` table in addition to `ride_segments` (currently orphans `rides` rows)
- [ ] **DATA-04**: GTFS update workflow script (`scripts/update_gtfs.sh`) — backup → download → re-bootstrap → validate, without losing learning data

### Quality & Operations

- [ ] **OPS-01**: Performance tests demonstrating POST /v1/ride_summary p99 < 200ms and GET /v1/eta p99 < 100ms under concurrent load
- [ ] **OPS-02**: Bootstrap smoke tests verify all tables exist, GTFS metadata populated, and foreign keys valid after a fresh bootstrap
- [ ] **OPS-03**: CI pipeline runs the full 182-test suite on every commit (GitHub Actions or equivalent)
- [ ] **OPS-04**: Monitoring/alerting integration — structured log fields for request latency + error rate, or Prometheus metrics endpoint

---

## v2 Requirements (Deferred)

### Advanced Learning

- **LEARN-V2-01**: EMA incorporated into blend with configurable time-decay weight (extend `compute_blended_mean`)
- **LEARN-V2-02**: P90 uses log-normal or gamma distribution approximation (not normal) to better model right-skewed bus travel times
- **LEARN-V2-03**: Welford `n` resets or decays over time (prevents over-confidence after route changes)
- **LEARN-V2-04**: Property-based / fuzz testing for Welford/EMA edge cases (hypothesis library)

### Analytics

- **ANLY-01**: Analytics dashboard showing segment learning progress, rejection rates, ETA accuracy over time
- **ANLY-02**: Server-side `is_holiday` computation from a public holiday calendar (remove client-controlled flag)

### Client Integration

- **SDK-01**: TypeScript client SDK (`submitRide`, `getETA`, auto-retry, rate-limit handling)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| PostgreSQL / Redis | Single-server SQLite WAL sufficient; adding infra adds operational burden |
| Real-time vehicle tracking (GPS push) | BMTC doesn't publish real-time GTFS-RT feeds |
| OAuth / social login | Internal tool; Bearer token sufficient |
| Multi-tenant / multi-city | Single-city (Bengaluru) only; would require schema changes |
| Analytics dashboard (v1) | High effort, not core to ETA accuracy; defer to Grafana when needed |
| Client SDK (v1) | Internal use; not blocking any known use case |
| Mutation testing (mutmut) | Valuable but not blocking; add after CI is established |

---

## Traceability

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| BUGFIX-01 | Phase 1 | Backend Correctness | Pending |
| BUGFIX-02 | Phase 1 | Backend Correctness | Pending |
| BUGFIX-03 | Phase 1 | Backend Correctness | Pending |
| BUGFIX-07 | Phase 1 | Backend Correctness | Pending |
| LEARN-03 | Phase 1 | Backend Correctness | Pending |
| API-05 | Phase 1 | Backend Correctness | Pending |
| BUGFIX-04 | Phase 2 | Learning Algorithm Integrity | Pending |
| BUGFIX-05 | Phase 2 | Learning Algorithm Integrity | Pending |
| BUGFIX-06 | Phase 2 | Learning Algorithm Integrity | Pending |
| LEARN-01 | Phase 2 | Learning Algorithm Integrity | Pending |
| LEARN-02 | Phase 2 | Learning Algorithm Integrity | Pending |
| API-01 | Phase 3 | API Surface Completion | Pending |
| API-02 | Phase 3 | API Surface Completion | Pending |
| API-03 | Phase 3 | API Surface Completion | Pending |
| API-04 | Phase 3 | API Surface Completion | Pending |
| DATA-01 | Phase 4 | Data Management | Pending |
| DATA-02 | Phase 4 | Data Management | Pending |
| DATA-03 | Phase 4 | Data Management | Pending |
| DATA-04 | Phase 4 | Data Management | Pending |
| OPS-01 | Phase 5 | Quality & Operations | Pending |
| OPS-02 | Phase 5 | Quality & Operations | Pending |
| OPS-03 | Phase 5 | Quality & Operations | Pending |
| OPS-04 | Phase 5 | Quality & Operations | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

**Note:** BUGFIX-07 (idempotency key cleanup on startup) was reassigned from Phase 3 to Phase 1.
It belongs with backend correctness fixes — it is an operational reliability concern, not an API
surface addition. This corrects the initial traceability draft.

---

*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 — traceability updated after roadmap creation; BUGFIX-07 moved from Phase 3 to Phase 1*

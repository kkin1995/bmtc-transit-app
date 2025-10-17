# BMTC Transit Learning API - Execution Plan

**Status:** ✅ Phase 1 (MVP) Complete, ✅ Phase 2 (Global Aggregation) Complete
**Started:** 2025-10-16
**Phase 1 Completed:** 2025-10-16
**Phase 2 Completed:** 2025-10-17
**Server Version:** 0.2.0

---

## Original Requirements

Build a zero-cost backend MVP for a BMTC single-user-learning transit app with:

- **Region:** Bengaluru, Agency: BMTC, Static GTFS only
- **Client behavior:** Computes stop-to-stop segment times locally, uploads rounded summaries (no raw GPS)
- **Endpoints:** Exactly 4 (POST /v1/ride_summary, GET /v1/eta, GET /v1/config, GET /v1/health)
- **Learning algorithm:** Per (route_id, direction_id, from_stop_id, to_stop_id, time_bin)
  - Maintain Welford mean/variance and EMA mean/variance
  - Schedule blend: w(n) = n/(n+n₀), n₀≈20
  - Outlier rejection: |x-μ| > 3σ when n>5
  - Half-life decay for freshness
- **Time bins:** 15-min × {weekday, weekend} = 192 bins
- **DB:** SQLite (WAL), single file
- **Server:** FastAPI (Python), run under Cloudflare Tunnel or Tailscale Funnel
- **Security:** Single long API key (Bearer), rate limit POST, locked down

---

## Build Plan — Part A (Core Implementation)

✅ **1. Create project structure**
- requirements.txt, .env.example, README.md, .gitignore
- Switched to uv package manager + pyproject.toml

✅ **2. Write SQLite schema migration**
- 6 tables: segments, time_bins, segment_stats, dwell_stats, rides, ride_segments
- Indices on (route_id, direction_id), (segment_id, bin_id)
- WAL mode, busy_timeout=5000ms

✅ **3. Implement GTFS parser**
- Extract schedule_mean_sec per segment×bin from GTFS
- Handle BMTC's unified service pattern (runs all 7 days)
- Duplicate to weekday+weekend bins for coverage

✅ **4. Build FastAPI app skeleton**
- Config from env vars (pydantic-settings)
- Startup/shutdown hooks for DB init
- Router structure

✅ **5. Add Bearer token auth middleware**
- HTTPBearer security with single API key
- 401 on missing/invalid token

✅ **6. Implement Welford+EMA learning update**
- Welford: n'=n+1; δ=x−μ; μ'=μ+δ/n'; M2'=M2+δ(x−μ')
- EMA: α=0.1; μ'=αx+(1−α)μ; var'=α(x−μ')²+(1−α)var

✅ **7. Implement schedule blend**
- w = n/(n+20)
- final_mean = w·welford_mean + (1−w)·schedule_mean

✅ **8. Add outlier rejection**
- Reject if n>5 AND |x−μ|>3σ
- Log rejections, return rejected_count

✅ **9. Build POST /v1/ride_summary endpoint**
- Validate segments against GTFS
- Reject timestamps >7d old or future
- Update segment_stats, record ride_segments

✅ **10. Build GET /v1/eta endpoint**
- Query params: route_id, direction_id, from_stop_id, to_stop_id, timestamp_utc?
- Return: mean_sec, p50_sec, p90_sec, sample_count, blend_weight, last_updated
- P50=μ, P90=μ+1.28σ

✅ **11. Build GET /v1/config endpoint**
- Return: n0, time_bin_minutes, half_life_days, gtfs_version, server_version

✅ **12. Build GET /v1/health endpoint**
- Check DB read, return status (ok/degraded), uptime_sec
- 503 on DB failure

✅ **13. Add rate limiting**
- slowapi, 10/min per IP on POST

✅ **14. Write unit tests**
- Welford convergence, EMA correctness, blend at n=20 is 0.5
- Outlier rejects >3σ

✅ **15. Write integration tests**
- POST→stats change→GET reflects
- Auth required, unknown segment→422

✅ **16. Create sample-data generator**
- Generate 100 synthetic rides across 5 routes

✅ **17. Add backup script and systemd timer**
- backup.sh: SQLite .backup + gzip, prune old (7d retention)
- restore.sh: decompress + replace DB
- Hourly timer

✅ **18. Document Cloudflare Tunnel setup**
- Installation, tunnel creation, ingress config, DNS setup
- Alternative: Tailscale Funnel

---

## Build Plan — Part B (Enhancements)

✅ **19. Half-life decay/stale detection**
- is_stale(): check if last_update > 90d
- Flag stale data in responses

✅ **20. P50/P90 computation**
- Normal approximation: p50=μ, p90=μ+1.28σ

✅ **21. Config endpoint**
- Return server configuration and GTFS version

✅ **22. Database indices**
- (route_id, direction_id, from_stop_id, to_stop_id)
- (segment_id, bin_id)

✅ **23. Rate limiter**
- slowapi, 10/min on POST

✅ **24. Backup routine**
- Hourly cron, rsync to remote optional

✅ **25. Cloudflare Tunnel / Tailscale setup docs**
- Full deployment guide in docs/deploy.md

✅ **26. Smoke tests**
- Integration test suite covers POST→GET flow

✅ **27. Sample-data script**
- scripts/generate_sample_data.py

✅ **28. Minimal dashboard (optional)**
- Skipped - not required for MVP

---

## Build Plan — Part C (Global Aggregation - Phase 2)

**Goal:** Prepare for multi-device, crowd-sourced learning by adding quality controls, deduplication, and privacy-preserving tracking.

✅ **29. Idempotency key handling**
- Prevent duplicate ride submissions via `Idempotency-Key` header
- 24-hour TTL with response hash caching
- New table: `idempotency_keys` (key, submitted_at, response_hash)
- New module: `app/idempotency.py` with check/store/cleanup functions

✅ **30. Device bucket tracking**
- Privacy-preserving device identification via SHA256 hashes
- Track observation count and last seen timestamp per bucket
- New table: `device_buckets` (bucket_id, observation_count, last_seen)
- Rate limiting foundation (500/hour configured but not enforced)

✅ **31. Rejection logging**
- Track rejected observations with reasons (low_mapmatch_conf, outlier, missing_stats)
- 30-day retention for quality monitoring
- New table: `rejection_log` (segment_id, bin_id, reason, duration_sec, mapmatch_conf, device_bucket, timestamp)
- Response includes `rejected_count` and `rejected_by_reason` breakdown

✅ **32. Map-match confidence filtering**
- Reject observations with `mapmatch_conf < 0.7` (configurable)
- Defaults to 1.0 if not provided (perfect confidence)
- Prevents GPS drift/tunneling from contaminating learned ETAs
- Config setting: `BMTC_MAPMATCH_MIN_CONF`

✅ **33. Enhanced outlier detection**
- Made sigma threshold configurable (default: 3.0)
- Config setting: `BMTC_OUTLIER_SIGMA`
- Improved statistical robustness for sparse bins

✅ **34. Max segments per ride validation**
- Reject rides exceeding `max_segments_per_ride` (default: 50)
- Prevents abuse and ensures reasonable processing time
- Returns 400 Bad Request with clear error message

✅ **35. Database schema updates**
- Added 3 new tables (idempotency_keys, device_buckets, rejection_log)
- Extended `ride_segments` with device_bucket, mapmatch_conf, rejection_reason columns
- Maintained backward compatibility with existing data

✅ **36. Configuration endpoint enhancements**
- GET /v1/config now returns global aggregation settings:
  - mapmatch_min_conf
  - max_segments_per_ride
  - idempotency_ttl_hours
- Server version bumped to 0.2.0

✅ **37. Comprehensive test coverage**
- 6 new idempotency tests (check/store/TTL/cleanup/replace)
- 10 new global aggregation tests:
  - Idempotency header handling
  - Device bucket tracking and persistence
  - Map-match confidence rejection
  - Outlier rejection
  - Max segments validation
  - Rejection reason breakdown
  - Config endpoint validation
- Total test count: 33 (9 learning + 8 integration + 6 idempotency + 10 global)

✅ **38. Code quality improvements**
- Applied Ruff linting and formatting (Astral)
- Fixed all linting errors (unused imports, variables)
- Modernized pyproject.toml (dependency-groups.dev)
- Added test isolation infrastructure (conftest.py)

⏳ **39. Test isolation fix (PENDING)**
- Issue: Tests pass per-module but fail when run together
- Root cause: Settings cache contamination between test modules
- Recommended fix: pytest-xdist for process isolation
- Status: Documented in `backend/TODO.md`, not yet implemented
- See: `backend/README.md` for per-module test commands

⏳ **40. Device bucket rate limiting enforcement (PENDING)**
- Config setting exists (500/hour) but not enforced
- Requires middleware to check device_buckets table before accepting POST
- Status: Documented in `backend/TODO.md`

⏳ **41. API documentation update (PENDING)**
- Update `docs/api.md` with global aggregation features:
  - Idempotency-Key header
  - device_bucket field in RideSegment
  - mapmatch_conf field in RideSegment
  - rejected_by_reason response field
  - New config endpoint fields
- Status: Documented in `backend/TODO.md`

---

## ADR-0001: Stack & Architecture Decisions

### Stack Choices

**FastAPI**
- Async, typed contracts, auto OpenAPI
- <50ms overhead
- Excellent developer experience

**SQLite WAL**
- ACID guarantees
- Zero-config, handles 100 writes/sec
- Atomic backup (.backup command)
- No network overhead

**Welford Algorithm**
- O(1) update, numerically stable vs naïve Σ(x²)
- Computes running mean and variance

**EMA (Exponential Moving Average)**
- Recent rides weighted more (α=0.1 ≈ 20-sample window)
- Adapts faster to traffic pattern changes

**192 Time Bins**
- 15-min granularity × 2 day-types (weekday/weekend)
- Balances sparsity vs temporal precision

**Cloudflare Tunnel**
- No open ports required
- Auto HTTPS, free tier sufficient
- Better than exposing server directly

**Bearer Token Auth**
- Sufficient for single user
- <10 lines of code
- Rotate monthly

### Why NOT...

**Postgres:** Overkill for <1M rows, adds deployment complexity, network latency

**K8s:** VM fits Oracle/Hetzner free tier, restart=systemctl, no orchestration needed

**Redis:** SQLite fast enough for read cache, adds dependency

**JWT/OAuth:** Single user doesn't need multi-tenant auth

**REST framework alternatives:** FastAPI hits sweet spot of simplicity + performance

### Key Design Decisions

**Decay Strategy**
- 30d half-life keeps model fresh
- Tunable per route if needed
- Stale threshold at 90d

**Blend Formula**
- w = n/(n+20) ensures smooth transition
- At n=0: pure schedule
- At n=20: 50/50 blend
- At n=100: 83% learned, 17% schedule

**Outlier Threshold**
- 3σ is standard but may need tuning for Bengaluru traffic
- Only reject when n>5 (need stable statistics)

---

## ADR-0002: Global Aggregation Design Decisions (Phase 2)

### Goal
Transition from single-user to multi-device, crowd-sourced learning while maintaining:
- Privacy (no raw GPS tracking)
- Quality (reject bad observations)
- Reliability (prevent duplicate submissions)

### Key Decisions

**SHA256 Device Buckets (vs UUIDs)**
- Privacy: Hash prevents reverse lookup to device ID
- Configurable: Client can rotate salt to change bucket
- Rate limiting: Can track observations per bucket without identity
- Alternative rejected: Plain UUIDs expose device identity

**Idempotency Keys (24h TTL)**
- Prevents network retry storms from contaminating learned ETAs
- Response hash caching allows safe replay with same result
- 24h TTL balances storage vs reliability (client should cache responses)
- Alternative rejected: Server-generated dedup (requires client-side state)

**Map-Match Confidence Threshold (0.7)**
- GPS tunneling in urban corridors produces low-confidence matches
- Below threshold indicates possible route mismatch
- Default 1.0 assumes perfect matching (backward compatible)
- Alternative rejected: Accept all observations (contaminates learned ETAs)

**Rejection Logging (30d retention)**
- Separate table prevents production data pollution
- Enables quality monitoring and threshold tuning
- 30d retention balances storage vs analysis window
- Alternative rejected: Flag in ride_segments (harder to query/prune)

**Configurable Outlier Sigma**
- Different routes have different traffic variability
- Made threshold configurable for per-deployment tuning
- Default 3σ is conservative (99.7% inliers if normal)
- Alternative rejected: Fixed threshold (inflexible)

**Max Segments Per Ride (50)**
- Prevents abuse and ensures bounded processing time
- Longest BMTC routes have ~40 stops → ~39 segments
- Alternative rejected: Unbounded (DoS risk)

### Why NOT...

**Per-Device Learning:** Single global model is simpler, converges faster with shared data

**JWT/Session Auth:** Still single admin user, Bearer token sufficient

**Redis for Idempotency:** SQLite fast enough (<5ms lookups), fewer dependencies

**Real-time Feedback:** Batch learning is adequate for ETA use case

---

## API Contract

### POST /v1/ride_summary
**Request:**
```json
{
  "route_id": "104",
  "direction_id": 0,
  "segments": [{
    "from_stop_id": "20558",
    "to_stop_id": "29374",
    "duration_sec": 320.5,
    "dwell_sec": 25.0,
    "timestamp_utc": 1697654321,
    "device_bucket": "a7f5...",  // Optional: SHA256 hash for privacy-preserving tracking
    "mapmatch_conf": 0.95,        // Optional: 0.0-1.0, defaults to 1.0
    "is_holiday": false           // Optional: for holiday-specific bins
  }]
}
```
**Headers (optional):**
- `Idempotency-Key: <UUID>` - Prevents duplicate submissions (24h TTL)

**Response:**
```json
{
  "accepted": true,
  "rejected_count": 2,
  "rejected_by_reason": {
    "low_mapmatch_conf": 1,
    "outlier": 1
  }
}
```
**Codes:** 200/400/401/422/429
**Validation:** segments non-empty, duration_sec>0, timestamp ±7d, IDs in GTFS, max 50 segments

### GET /v1/eta
**Query:** route_id, direction_id, from_stop_id, to_stop_id, timestamp_utc?
**Response:** `{mean_sec, p50_sec, p90_sec, sample_count, blend_weight, last_updated}`
**Codes:** 200/404

### GET /v1/config
**Response:**
```json
{
  "n0": 20,
  "time_bin_minutes": 15,
  "half_life_days": 30,
  "gtfs_version": "2024-01-15",
  "server_version": "0.2.0",
  "mapmatch_min_conf": 0.7,
  "max_segments_per_ride": 50,
  "idempotency_ttl_hours": 24
}
```
**Codes:** 200

### GET /v1/health
**Response:** `{status: "ok"|"degraded", db_ok: bool, uptime_sec: int}`
**Codes:** 200/503

---

## DB Schema

```sql
-- Core Learning Tables (Phase 1)
-- segments: PK(route_id, dir_id, from_stop, to_stop)
-- idx(route_id, dir_id)

-- time_bins: PK(bin_id); weekday_type, hour, minute

-- segment_stats: PK(seg_fk, bin_id)
-- n, welford_μ, welford_M2, ema_μ, ema_var, sched_μ, last_update
-- idx(seg_fk, bin_id)

-- dwell_stats: PK(stop_id, bin_id); same stats columns

-- rides: PK(ride_id); submitted_at, segment_count

-- ride_segments: PK(ride_id, seq); FK(ride_id)
-- seg_fk, duration_sec, dwell_sec, ts_utc, accepted
-- device_bucket, mapmatch_conf, rejection_reason (Phase 2)

-- Global Aggregation Tables (Phase 2)
-- idempotency_keys: PK(key)
-- submitted_at, response_hash
-- idx(submitted_at) for TTL cleanup

-- device_buckets: PK(bucket_id)
-- observation_count, last_seen
-- SHA256 hash for privacy-preserving tracking

-- rejection_log: PK(log_id)
-- segment_id, bin_id, reason, duration_sec, mapmatch_conf
-- device_bucket, timestamp
-- 30d retention for quality monitoring
```

---

## Learning Spec

**Welford Update:**
```
n' = n + 1
δ = x - μ
μ' = μ + δ/n'
M2' = M2 + δ(x - μ')
σ² = M2 / n
```

**EMA Update (α=0.1):**
```
μ' = αx + (1-α)μ
var' = α(x-μ')² + (1-α)var
```

**Blend Rule:**
```
w = n / (n + 20)
final = w·μ_welford + (1-w)·μ_sched
```

**Outlier Predicate:**
```
reject if (n > 5) AND (|x - μ| > 3σ)
```

**Stale Threshold:** last_update > 90 days

**Min-n for "learned":** Use blend if n<5, else pure learned

---

## Test Checklist

✅ **Unit Tests (9 tests - test_learning.py)**
- Welford convergence to correct mean/variance
- EMA α=0.1 applied correctly
- Blend weight at n=20 equals 0.5
- Outlier rejection when >3σ

✅ **Integration Tests (8 tests - test_integration.py)**
- POST→segment_stats.n increments→GET eta.sample_count++
- GTFS bootstrap: schedule_mean_sec non-null for all bins
- Auth: missing token→401, wrong token→401, valid→200
- Rate-limit: 11th POST in 1min→429
- Health: normal→200, DB locked→503

✅ **Idempotency Tests (6 tests - test_idempotency.py)**
- Response hash computation is deterministic
- Non-existent keys return None
- Store and retrieve idempotency keys
- TTL expiration works correctly
- Cleanup deletes expired keys
- Key replacement updates timestamp

✅ **Global Aggregation Tests (10 tests - test_global_aggregation.py)**
- Idempotency-Key header handling and storage
- Device bucket tracking and persistence
- Low mapmatch_conf rejection (< 0.7)
- Outlier rejection with sufficient data
- Max segments validation (> 50)
- Rejected-by-reason breakdown accuracy
- Config returns global aggregation settings
- mapmatch_conf defaults to 1.0
- Global n counter increments correctly

✅ **GTFS Bootstrap**
- Segments table populated
- segment_stats seeded for 192 bins
- schedule_mean_sec computed from stop_times

⚠️ **Test Isolation Issue**
- All 33 tests pass individually (per-module)
- Tests fail when run together due to settings cache contamination
- Workaround: Run per-module (see backend/README.md)
- Fix pending: pytest-xdist for process isolation (see backend/TODO.md)

---

## Ops Checklist

✅ **Backup/Restore**
- Hourly backup to .gz
- Prune old backups (keep 7d)
- Restore drill: decompress, replace, restart

✅ **Log Rotation**
- logrotate daily, keep 7 days
- JSON structured logs

✅ **Secret Rotation**
- Generate new API key monthly: `openssl rand -hex 32`
- Update server .env and client

✅ **Retention Job**
- Daily cron: `DELETE FROM ride_segments WHERE ts_utc < now()-90d`

✅ **Monitoring**
- Health ping every 60s
- Alert on 503 or latency>500ms

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **GTFS version drift** | Validate IDs on POST, 422 on unknown; re-bootstrap on GTFS update |
| **Clock skew** | Reject timestamps >7d old or future; log client vs server delta |
| **Bad map-match** | Outlier filter; monitor rejected_count spike |
| **WAL deadlock** | PRAGMA busy_timeout=5000; retry once |
| **Disk full** | Alert at 80%; auto-prune old backups; retention job |
| **Key leak** | Per-key rate-limit; log IP; revoke & rotate if abuse detected |

---

## Go/No-Go Criteria

✅ **Performance**
- GET p99 < 100ms
- POST p99 < 200ms (10 concurrent)

✅ **Correctness**
- Blend converges to learned after 20 samples
- Schedule fallback when n=0

✅ **Security**
- Auth blocks unauthed requests
- No public IP (Tunnel/Funnel only)
- UFW deny all

✅ **Deployability**
- Single systemd unit
- DB in /var/lib
- Config in /etc
- Restart clean

✅ **Observability**
- /v1/health responds
- Logs JSON format
- Backup runs hourly

✅ **Bootstrap**
- GTFS seeded
- schedule_mean_sec != NULL for all seg×bin

---

## Lessons Learned

### What Worked Well (Phase 1 - MVP)
- **uv package manager:** 10-100x faster than pip, excellent DX
- **FastAPI:** Async + Pydantic validation caught bugs early
- **SQLite WAL:** Zero-config, fast enough for single user
- **Community GTFS:** Vonter's data was comprehensive and clean

### What Worked Well (Phase 2 - Global Aggregation)
- **Pydantic defaults:** `mapmatch_conf: float = 1.0` provided clean backward compatibility
- **Modular design:** Idempotency logic cleanly separated into `idempotency.py`
- **SHA256 device buckets:** Privacy-preserving without losing tracking capability
- **Rejection logging:** Separate table prevents production data contamination
- **Ruff linter:** 10-100x faster than flake8/black, caught real bugs

### What Could Be Improved
- **GTFS service patterns:** BMTC data has single service_id; real world likely has more variation
- **Test isolation:** Settings cache causes cross-module interference (needs pytest-xdist)
- **Rate limiting:** Device bucket limits configured but not enforced in middleware
- **Dashboard:** Optional Grafana setup would help visualize rejection rates and ETA accuracy

### Pending from Phase 2
- **Test isolation fix:** Add pytest-xdist for process-level isolation
- **Device bucket rate limiting:** Enforce 500/hour limit in middleware
- **API documentation:** Update docs/api.md with new fields and headers

### Future Enhancements (Out of Scope)
- Multi-segment route ETA (sum individual segments)
- Confidence intervals (use variance to compute ±95% bounds)
- Real-time GTFS-RT integration (if BMTC publishes)
- Trip planner (A* search over segment graph)
- Mobile app (Flutter/React Native client)
- Metrics endpoint for monitoring (rejection rates, device bucket stats)

---

## References

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [Welford's Algorithm](https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm)
- [GTFS Specification](https://gtfs.org/schedule/reference/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [uv Package Manager](https://github.com/astral-sh/uv)

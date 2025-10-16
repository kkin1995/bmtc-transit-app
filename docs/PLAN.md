# BMTC Transit Learning API - Execution Plan

**Status:** ✅ Completed
**Started:** 2025-10-16
**Completed:** 2025-10-16

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
    "timestamp_utc": 1697654321
  }]
}
```
**Response:** `{accepted: bool, rejected_count: int}`
**Codes:** 200/401/422/429
**Validation:** segments non-empty, duration_sec>0, timestamp ±7d, IDs in GTFS

### GET /v1/eta
**Query:** route_id, direction_id, from_stop_id, to_stop_id, timestamp_utc?
**Response:** `{mean_sec, p50_sec, p90_sec, sample_count, blend_weight, last_updated}`
**Codes:** 200/404

### GET /v1/config
**Response:** `{n0, time_bin_minutes, half_life_days, gtfs_version, server_version}`
**Codes:** 200

### GET /v1/health
**Response:** `{status: "ok"|"degraded", db_ok: bool, uptime_sec: int}`
**Codes:** 200/503

---

## DB Schema

```sql
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

✅ **Unit Tests**
- Welford convergence to correct mean/variance
- EMA α=0.1 applied correctly
- Blend weight at n=20 equals 0.5
- Outlier rejection when >3σ

✅ **Integration Tests**
- POST→segment_stats.n increments→GET eta.sample_count++
- GTFS bootstrap: schedule_mean_sec non-null for all bins
- Auth: missing token→401, wrong token→401, valid→200
- Rate-limit: 11th POST in 1min→429
- Health: normal→200, DB locked→503

✅ **GTFS Bootstrap**
- Segments table populated
- segment_stats seeded for 192 bins
- schedule_mean_sec computed from stop_times

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

### What Worked Well
- **uv package manager:** 10-100x faster than pip, excellent DX
- **FastAPI:** Async + Pydantic validation caught bugs early
- **SQLite WAL:** Zero-config, fast enough for single user
- **Community GTFS:** Vonter's data was comprehensive and clean

### What Could Be Improved
- **GTFS service patterns:** BMTC data has single service_id; real world likely has more variation
- **Stale detection:** Could add exponential backoff on blend weight for old data
- **Dashboard:** Optional Grafana setup would help visualize ETA accuracy over time

### Future Enhancements (Out of Scope)
- Multi-segment route ETA (sum individual segments)
- Confidence intervals (use variance to compute ±95% bounds)
- Real-time GTFS-RT integration (if BMTC publishes)
- Trip planner (A* search over segment graph)
- Mobile app (Flutter/React Native client)

---

## References

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [Welford's Algorithm](https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm)
- [GTFS Specification](https://gtfs.org/schedule/reference/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [uv Package Manager](https://github.com/astral-sh/uv)

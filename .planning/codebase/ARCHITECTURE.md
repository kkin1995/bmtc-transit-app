<!-- refreshed: 2026-07-01 -->
# Architecture

**Analysis Date:** 2026-07-01

## System Overview

```text
┌───────────────────────────────────────────────────────────────┐
│                  Mobile App (React Native / Expo)             │
│  `mobile/`                                                    │
└───────────────────────────────┬───────────────────────────────┘
                                │ HTTP (REST)
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                FastAPI Backend  `backend/app/`                │
│  ┌────────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐ │
│  │  routes.py │  │  auth.py │  │rate_limit  │  │idempoten-│ │
│  │  (9 endpts)│  │  Bearer  │  │Middleware  │  │cy.py     │ │
│  └─────┬──────┘  └──────────┘  └────────────┘  └──────────┘ │
│        │                                                      │
│  ┌─────▼──────┐  ┌──────────┐  ┌────────────┐               │
│  │ learning.py│  │   db.py  │  │  config.py │               │
│  │ Welford/EMA│  │ SQLite   │  │ env vars   │               │
│  └────────────┘  └──────────┘  └────────────┘               │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│   SQLite (WAL mode)  `backend/bmtc_dev.db`                   │
│   GTFS tables (6) + Learning tables (5) + Audit tables (4)   │
└───────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| FastAPI App | Startup, middleware, routing | `backend/app/main.py` |
| Route Handlers | 9 API endpoint implementations | `backend/app/routes.py` |
| Learning Engine | Welford, EMA, outlier detection, blend | `backend/app/learning.py` |
| DB Layer | SQLite connections, bin computation | `backend/app/db.py` |
| Auth | Bearer token verification | `backend/app/auth.py` |
| Idempotency | UUID key check + body-hash storage | `backend/app/idempotency.py` |
| Rate Limiting | Token-bucket middleware per device/IP | `backend/app/rate_limit.py` |
| Config | `BMTC_*` env-var settings (cached) | `backend/app/config.py` |
| Models | Pydantic request/response schemas | `backend/app/models.py` |
| State | Startup time tracking | `backend/app/state.py` |
| GTFS Bootstrap | Load `bmtc.zip` into SQLite | `backend/app/gtfs_bootstrap.py` |
| Bootstrap CLI | DB init + GTFS load entry point | `backend/app/bootstrap.py` |
| Errors | Structured error helpers | `backend/app/errors.py` |
| Mobile App | Expo/React Native transit UI | `mobile/` |

## Data Flow

### Ride Submission (Learning Path)

1. Mobile app POSTs to `POST /v1/ride_summary` with `Authorization: Bearer` and optional `Idempotency-Key` header (`backend/app/routes.py:52`)
2. `RateLimitMiddleware` checks token-bucket per device bucket / IP (`backend/app/rate_limit.py`)
3. `verify_token` dependency checks Bearer token (`backend/app/auth.py`)
4. `check_idempotency_key` checks for duplicate submission; returns 409 on body-hash mismatch (`backend/app/idempotency.py`)
5. For each segment: `compute_bin_id()` maps timestamp to 1 of 192 time bins (`backend/app/db.py`)
6. `update_segment_stats()` runs Welford + EMA update, rejects outliers, logs rejections (`backend/app/learning.py:233+`)
7. All DB writes committed in a single transaction (`backend/app/routes.py:204`)
8. `store_idempotency_key()` records key + body hash for replay protection

### ETA Query Path

1. Client GETs `GET /v1/eta?route_id=...&from_stop_id=...&to_stop_id=...` (no auth required)
2. `compute_bin_id()` determines time bin from `when` / `timestamp_utc` / now (`backend/app/db.py`)
3. `segment_stats` row is fetched for `(segment_id, bin_id)` (`backend/app/routes.py:324`)
4. `compute_blended_mean()` blends Welford mean with GTFS schedule mean (`backend/app/learning.py:85`)
5. `compute_percentiles_robust()` returns P50/P90 with low-n safety widening (`backend/app/learning.py`)
6. Response returned as `ETAResponseV11` with structured + flat (deprecated) fields

### GTFS Discovery Path

- `GET /v1/stops` and `GET /v1/routes` query GTFS tables directly with bbox/filter params
- `GET /v1/routes/search` loads all routes and filters in Python using normalized matching (`normalize_for_search()` at `backend/app/routes.py:745`)
- `GET /v1/stops/{stop_id}/schedule` joins `stop_times` + `trips` for scheduled departures

## Database Design

**Engine:** SQLite with WAL mode — single writer, multiple readers, no locking on reads.

**Location:** `backend/bmtc_dev.db` (dev), `/var/lib/bmtc-api/bmtc.db` (prod)

### GTFS Static Tables (6)

| Table | Purpose | Approx Rows |
|-------|---------|-------------|
| `agency` | Transit agency info | 1 |
| `routes` | Bus route definitions | ~2k |
| `stops` | Bus stop locations + coords | ~8k |
| `trips` | Individual scheduled trips | ~10k |
| `stop_times` | Arrival/departure per stop per trip | ~1.46M |
| `calendar` | Weekday/weekend service patterns | ~100s |
| `gtfs_metadata` | GTFS version tracking | few |

### Learning Tables (5)

| Table | Purpose |
|-------|---------|
| `segments` | Unique (route, direction, from_stop, to_stop) — ~110k rows |
| `segment_stats` | Welford + EMA stats per `(segment_id, bin_id)` — 3-5M rows (sparse) |
| `dwell_stats` | Per-stop dwell time stats per bin |
| `rides` | Ride submission metadata |
| `ride_segments` | Per-segment observations with acceptance flag |
| `time_bins` | 192 bins (96 × 2 day-types, 15-min granularity) |

### Global Aggregation / Audit Tables (4)

| Table | Purpose | TTL |
|-------|---------|-----|
| `idempotency_keys` | Dedup ride submissions by UUID | 24h |
| `device_buckets` | Privacy-preserving device tracking (SHA256 hash) | rolling |
| `rejection_log` | Outlier + quality rejection audit trail | 30d |
| `rate_limit_buckets` | Token-bucket counters per device/IP | rolling |

### Views (3)

- `route_summary` — routes with trip/stop counts
- `stop_summary` — stops with route/trip counts
- `segment_learning_progress` — segments with bin coverage and sample counts

### Key Indexes

```sql
idx_segments_route_dir ON segments(route_id, direction_id)
idx_segment_stats_lookup ON segment_stats(segment_id, bin_id)   -- hot path for ETA
idx_stop_times_stop ON stop_times(stop_id)
idx_stop_times_trip_seq ON stop_times(trip_id, stop_sequence)
idx_rejection_reason ON rejection_log(reason, submitted_at)
```

## Key Algorithms

### Welford Online Mean + Variance (`backend/app/learning.py:14`)

Numerically stable online statistics update. Used instead of two-pass algorithms to avoid storing all observations.

```python
n_new = n + 1
delta = x - mean
mean_new = mean + delta / n_new
delta2 = x - mean_new
m2_new = m2 + delta * delta2
# variance = m2 / n  (when n >= 2)
```

### Exponential Moving Average (`backend/app/learning.py:36`)

Recency-weighted mean with configurable alpha (default 0.1). Stored separately from Welford for potential time-decay blending.

```python
mean_new = alpha * x + (1 - alpha) * mean
var_new  = alpha * (x - mean_new)**2 + (1 - alpha) * var
```

### Schedule Blend (`backend/app/learning.py:75`)

Blends learned Welford mean with GTFS schedule mean. Weight converges to 1 as observations accumulate (n0=20 is the half-weight point).

```python
w = n / (n + n0)           # n0=20 by default
blended = w * welford_mean + (1 - w) * schedule_mean
```

### Outlier Detection (`backend/app/learning.py:60`)

Rejects observations only after n > 5 (enough samples to trust statistics). Also rejects on low map-matching confidence (threshold=0.7).

```python
if n > 5 and abs(x - mean) > 3 * sqrt(variance):
    reject_as_outlier()
if mapmatch_conf < settings.mapmatch_min_conf:
    reject_as_low_conf()
```

### Percentile Estimation (`backend/app/learning.py:91`)

Normal distribution approximation. Low-n safety: widens P90 for n < 8.

```python
p50 = mean
p90 = mean + 1.28 * sigma          # n >= 8 (high confidence)
p90 = mean + 1.5 * sigma           # n < 8  (safety margin)
```

### Time Binning (`backend/app/db.py`)

192 bins = 96 per day-type × 2 day-types (weekday=0, weekend=1). Each bin covers 15 minutes. `compute_bin_id(timestamp_epoch, is_holiday=False)` maps any UTC timestamp to the correct bin.

## API Layer

**All endpoints are prefixed `/v1`** (set in `backend/app/main.py:106`).

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| POST | `/v1/ride_summary` | Bearer | 10/min | Submit ride segments for learning |
| GET | `/v1/eta` | None | — | Query blended ETA (P50/P90) |
| GET | `/v1/config` | None | — | Server learning parameters |
| GET | `/v1/health` | None | — | DB liveness + uptime |
| GET | `/v1/stops` | None | — | Discover GTFS stops (bbox/route filter) |
| GET | `/v1/routes` | None | — | Discover GTFS routes |
| GET | `/v1/routes/search` | None | — | Full-text route search (normalized) |
| GET | `/v1/stops/{stop_id}/schedule` | None | — | Scheduled departures for a stop |

**Auth model:** `Authorization: Bearer <BMTC_API_KEY>` on POST only. `verify_token` is a FastAPI dependency (`backend/app/auth.py`).

**Idempotency:** Optional `Idempotency-Key: <UUID>` header on POST. Replays return cached response; body-hash mismatch returns HTTP 409.

**Rate limiting:** `RateLimitMiddleware` (`backend/app/rate_limit.py`) uses token-bucket counters stored in `rate_limit_buckets` SQLite table. Default 10 POST requests/min. Can be disabled via `BMTC_RATE_LIMIT_ENABLED=false`.

**Error format:** Structured `{"error": "...", "message": "...", "details": {...}}` enforced by custom `http_exception_handler` in `backend/app/main.py:71`.

**Versioning:** `X-API-Version: 1` header added to all responses by `APIVersionMiddleware`.

## Concurrency & Consistency

- **SQLite WAL mode** — readers don't block writers; multiple readers can proceed concurrently.
- **Single DB writer pattern** — all POST writes are batched in one `conn.commit()` call per request (`backend/app/routes.py:204`). No concurrent writers by design.
- **Connection-per-request** — each handler calls `get_connection()` and closes before returning. No connection pooling.
- **Atomic rate limit** — `rate_limit_buckets` uses `STRICT` table with `CHECK` constraints and SQLite's atomic UPSERT to prevent race conditions on token-bucket decrements.
- **Idempotency** — body SHA256 stored alongside UUID key; mismatch raises 409 before any state mutation.

---

*Architecture analysis: 2026-07-01*

# CLAUDE.md - BMTC Transit API Context

**Project:** ETA learning system for Bengaluru buses using Welford+EMA algorithms
**Stack:** FastAPI, SQLite WAL, uv package manager
**Working Dir:** `/home/karan-kinariwala/Dropbox/KARAN/1-Projects/bmtc-transit-app`

## Agent Workflow

This repo uses a **lean multi-agent flow** (A1–A8) to ship safe, small increments. Each “agent” is a role with explicit inputs/outputs. Claude should **select the minimal next agent**, perform its steps, and produce the required artifacts with a small, reviewable diff.

### Quick Rules
- Prefer **additive changes**; don’t break `docs/api.md` unless PRD says so.  
- **GETs open**, **POSTs Bearer + Idempotency**.  
- **No PII**, never expose `device_bucket`.  
- Default timestamps to **ISO-8601 UTC**; durations in seconds.  
- **Single DB writer**: batch work in one transaction per POST.

### When Claude Starts a Task
1. **Route** the task to one of A1–A8 below.  
2. **Restate** the task and constraints.  
3. **Follow** the agent’s step-by-step guide.  
4. **Emit** only the artifacts listed, with exact filenames.  
5. **Propose** a concise commit message and next agent.

### Agent Router (meta-prompt Claude should apply)
- If the ask is fuzzy → **A1 Product** (produce a one-page PRD).  
- If API shape changes → **A2 API Design**.  
- If schema changes → **A3 Data/Schema**.  
- If it’s pure code logic/UI of API → **A4 Implementation**.  
- If security/privacy implications → always run **A5** after A4.  
- If tests are missing/flaky → **A6 Testing/QA**.  
- If observability gaps → **A7 Observability**.  
- If ready to ship → **A8 Release/Ops**.

### Swimlane (Reference)
A1 → A2 → (A3 if needed) → A4 → A5 → A6 → A7 → A8

### Handoff Contracts
- **A1→A2:** PRD with ACs, NFRs, risks.  
- **A2→A3/A4:** Updated `docs/api.md` with examples & errors.  
- **A3→A4:** Up/down SQL migrations + index/EXPLAIN notes.  
- **A4→A6:** Code and unit tests; validators present; idempotency & rate-limit implemented.  
- **A5→A6:** Security review doc (findings + mitigations).  
- **A6→A7:** Green suite; gaps identified → metrics list.  
- **A7→A8:** Health checks and SQL for verification.

### Security & Privacy Gate (Claude must enforce)
- Require `Authorization: Bearer` on `POST /v1/ride_summary`; GETs open.  
- Require `Idempotency-Key` and store `body_sha256`; 409 on mismatch.  
- No logging of request payloads at INFO; avoid IP linkage.  
- Enforce request size and segment count limits.  
- Respect retention TTLs: `ride_segments` 90d, `rejection_log` 30d, `idempotency_keys` 24h.

### Performance & Ops Notes
- Use SQLite WAL; wrap POST updates in one transaction; use UPSERT.  
- Maintain indices for `(segment_id, bin_id, n, welford_mean, welford_m2, ema_mean, schedule_mean, last_update)`.  
- Backups hourly via systemd; retention sweeps daily.  
- Observe p95 of `GET /v1/eta` < 200 ms (CF Tunnel).

### Commit & PR Conventions
- Conventional Commits:  
  - `feat(api): add low_confidence and bin_window to GET /v1/eta`  
  - `fix(rate-limit): enforce per-device_bucket cap with headers`  
  - `docs(api): update examples and error model`  
- Keep PRs small; include a checklist of gates passed (A5/A6/A7 as applicable).

### Example “Task → Agent” Mappings
- “Smooth ETA near bin boundaries”: A1 → A2 → A3 (maybe) → A4 → A5 → A6 → A7 → A8  
- “Add device-bucket rate limit headers”: A2 → A4 → A5 → A6 → A7 → A8  
- “Fix flaky test due to settings cache”: A6 only (plus minor A4 refactor)

---

## How Claude Should Execute
1. **Choose agent** → announce choice and why.  
2. **Create/modify files** exactly as named in that agent’s output spec.  
3. **Show diff** (summarized) and **exact commands** to validate (pytest, curl).  
4. **State next agent** to continue the flow, or declare **Done** if gates are met.

---

## Minimal Validation Commands (for Claude to suggest)
```bash
# Health
curl -s https://<host>/v1/health | jq .

# Config
curl -s https://<host>/v1/config | jq .

# ETA (unauth)
curl -s "https://<host>/v1/eta?route_id=335E&direction_id=0&from_stop_id=20558&to_stop_id=29374" | jq .

# Tests (with isolation)
cd backend && uv run pytest -n auto --dist loadfile -q

---

## Quick Commands

```bash
# Bootstrap DB (from project root)
cd backend && uv run python -m app.bootstrap

# Run server
cd backend && uv run uvicorn app.main:app --reload

# Run tests
cd backend && uv run pytest -v
cd backend && uv run pytest tests/test_learning.py -v  # Unit tests only

# Health check
curl http://127.0.0.1:8000/v1/health
curl http://127.0.0.1:8000/v1/config

# Database inspection
sqlite3 backend/bmtc_dev.db
```

---

## Directory Structure

```
bmtc-transit-app/
├── backend/app/           # Core application code
│   ├── main.py           # FastAPI app + lifespan
│   ├── routes.py         # 4 endpoints: ride_summary, eta, config, health
│   ├── models.py         # Pydantic schemas
│   ├── learning.py       # Welford/EMA algorithms + outlier detection
│   ├── config.py         # Settings (BMTC_ env vars)
│   ├── db.py             # SQLite connection + bin computation
│   ├── auth.py           # Bearer token middleware
│   ├── idempotency.py    # Idempotency key handling
│   ├── gtfs_bootstrap.py # GTFS loader (1.46M stop_times)
│   ├── schema.sql        # Full DB schema (11 tables)
│   └── state.py          # App startup time tracking
├── backend/tests/        # pytest suite
│   ├── test_learning.py           # Welford/EMA unit tests
│   ├── test_integration.py        # End-to-end API tests
│   ├── test_idempotency.py        # Idempotency tests
│   └── test_global_aggregation.py # Outlier/mapmatch tests
├── backend/scripts/      # Operational scripts
│   ├── backup.sh                  # SQLite backup + gzip
│   ├── restore.sh                 # Restore from backup
│   └── generate_sample_data.py    # Synthetic ride data
├── backend/deploy/       # systemd units
│   ├── bmtc-api.service
│   ├── bmtc-backup.{service,timer}
│   └── bmtc-retention.{service,timer}
├── docs/                 # Documentation
│   ├── PLAN.md              # Original execution plan
│   ├── api.md               # API reference
│   ├── gtfs-database.md     # DB schema reference
│   └── deploy.md            # Production deployment
├── gtfs/                 # GTFS static data (bmtc.zip)
├── NEXT_STEPS.md         # Roadmap + enhancements
└── CLAUDE.md             # This file
```

---

## Key Files & What They Contain

| File | Contains |
|------|----------|
| `backend/app/routes.py:42-138` | POST /v1/ride_summary - accepts ride segments, updates stats |
| `backend/app/routes.py:141-210` | GET /v1/eta - returns blended ETA with P50/P90 |
| `backend/app/learning.py:13-30` | Welford algorithm implementation |
| `backend/app/learning.py:233-307` | update_segment_stats() - main learning logic |
| `backend/app/models.py:6-35` | RideSegment schema (duration, mapmatch_conf, device_bucket) |
| `backend/app/schema.sql:104-148` | segments + segment_stats tables (core learning) |
| `backend/app/config.py:7-38` | All settings (n0=20, half_life_days=30, outlier_sigma=3.0) |
| `backend/app/db.py` | compute_bin_id() - maps timestamp to 1 of 192 time bins |
| `backend/app/gtfs_bootstrap.py` | Loads GTFS from ../gtfs/bmtc.zip into SQLite |

---

## Database Schema (11 tables)

**GTFS Tables (6):**
- `agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`
- GTFS metadata in `gtfs_metadata` table

**Learning Tables (5):**
- `segments` - unique route+direction+from_stop+to_stop (110k rows)
- `segment_stats` - Welford/EMA stats per segment×bin (3-5M rows, sparse)
- `rides` - ride metadata
- `ride_segments` - individual observations
- `time_bins` - 192 bins (96/day × weekday/weekend)

**Global Aggregation Tables (3):**
- `idempotency_keys` - prevent duplicate submissions (24h TTL)
- `device_buckets` - privacy-preserving device tracking
- `rejection_log` - outlier/quality monitoring (30d TTL)

**Views (3):**
- `route_summary`, `stop_summary`, `segment_learning_progress`

**Location:** `backend/bmtc_dev.db` (dev), `/var/lib/bmtc-api/bmtc.db` (prod)

---

## API Endpoints (4)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/v1/ride_summary` | Yes | 10/min | Submit ride segments for learning |
| GET | `/v1/eta` | No | - | Query learned ETA (blended mean + P50/P90) |
| GET | `/v1/config` | No | - | Server config (n0, half_life, mapmatch_min_conf) |
| GET | `/v1/health` | No | - | Health check + uptime |

**Headers:**
- `Authorization: Bearer <API_KEY>` (POST only)
- `Idempotency-Key: <UUID>` (POST, optional but recommended)

---

## Learning Algorithm Details

**Time Binning:**
- 192 bins = 96 (per day, 15-min granularity) × 2 (weekday/weekend)
- Computed by `db.compute_bin_id(timestamp_utc, is_holiday=False)`

**Statistics Updates (per segment×bin):**
- **Welford:** Online mean + variance (stable, no overflow)
- **EMA:** Exponential moving average with time-based alpha (half-life=30d)
- **Blend:** `w·learned + (1-w)·schedule` where `w = n/(n+20)` (n0=20)

**Outlier Rejection:**
- Reject if `|x - μ| > 3σ` AND `n > 5`
- Also reject if `mapmatch_conf < 0.7` (configurable)
- Logged to `rejection_log` table

**Percentiles:**
- P50 = mean (normal approx)
- P90 = mean + 1.28σ (normal approx)
- Low-n warning if n < 8 (wider P90 = mean + 1.5σ for safety)

---

## Environment Variables

**Required:**
- `BMTC_API_KEY` - Bearer token for POST endpoints

**Paths (dev defaults):**
- `BMTC_DB_PATH` = `/var/lib/bmtc-api/bmtc.db` (override with `.env`)
- `BMTC_GTFS_PATH` = `/var/lib/bmtc-api/gtfs` (override with `.env`)

**Learning params:**
- `BMTC_N0` = 20 (blend weight denominator)
- `BMTC_EMA_ALPHA` = 0.1 (EMA smoothing)
- `BMTC_HALF_LIFE_DAYS` = 30 (time-based alpha decay)
- `BMTC_OUTLIER_SIGMA` = 3.0 (outlier threshold)
- `BMTC_MAPMATCH_MIN_CONF` = 0.7 (map-matching confidence threshold)

**See:** `backend/app/config.py` for all settings

---

## Testing

**Full Test Suite (Recommended):**
```bash
cd backend
uv run pytest -n auto --dist loadfile -q  # All 47 tests in parallel (~9-10s)
```

**Test Modules:**
```bash
uv run pytest tests/test_learning.py -v             # 9 unit tests (Welford/EMA algorithms)
uv run pytest tests/test_integration.py -v          # 8 integration tests (POST→GET flow)
uv run pytest tests/test_idempotency.py -v          # 6 tests (idempotency keys)
uv run pytest tests/test_global_aggregation.py -v   # 10 tests (outlier rejection)
uv run pytest tests/test_rate_limit.py -v           # 14 tests (rate limiting)
```

**Coverage:**
- Learning algorithms: 100%
- API endpoints: 90%+
- DB operations: 85%+

**Test Isolation:** All tests run with complete isolation (settings, DB, env). See `backend/tests/TEST_ISOLATION.md` for details.

---

## Deployment (Production)

**Paths:**
- Code: `/opt/bmtc-api`
- DB: `/var/lib/bmtc-api/bmtc.db`
- GTFS: `/var/lib/bmtc-api/gtfs/bmtc.zip`
- Config: `/etc/bmtc-api/env`
- User: `bmtc` (non-root)

**Services:**
```bash
sudo systemctl status bmtc-api           # Main API service
sudo systemctl status bmtc-backup.timer  # Hourly backups
sudo systemctl status bmtc-retention.timer  # Daily cleanup
```

**Logs:**
```bash
journalctl -u bmtc-api -f
```

**See:** `docs/deploy.md` for full deployment guide

---

## Common Gotchas

1. **Bootstrap location:** Must run from `backend/` dir, GTFS must be in `../gtfs/bmtc.zip`
2. **DB locks:** SQLite WAL mode enabled, but concurrent writes may retry (rare)
3. **Foreign keys:** Enabled by default, ensure GTFS is complete before bootstrap
4. **Time bins:** Timestamp validation rejects >7 days old or future timestamps
5. **Git status:** Modified files tracked, check `git status` before commits
6. **Tests:** Use in-memory DB (`:memory:`), independent from dev DB

---

## Git Status (as of 2025-10-17)

**Modified:**
- `backend/app/config.py` - Settings updates
- `backend/app/learning.py` - Learning algorithm refinements
- `backend/app/models.py` - Schema updates
- `backend/app/routes.py` - Idempotency + global aggregation
- `backend/app/schema.sql` - DB schema updates

**Untracked:**
- `backend/app/idempotency.py` - NEW idempotency handling
- `backend/tests/test_global_aggregation.py` - NEW tests
- `backend/tests/test_idempotency.py` - NEW tests
- `gtfs/` - GTFS data directory

**Recent commits:**
- e77e2db: Improve learning algorithms with mathematical refinements
- 81e2180: Add NEXT_STEPS guide
- affbc08: Add deployment configuration

---

## Documentation Index

| Doc | Purpose |
|-----|---------|
| `README.md` | Project overview + quick start |
| `NEXT_STEPS.md` | Roadmap + future enhancements |
| `docs/PLAN.md` | Original execution plan + ADR |
| `docs/api.md` | API endpoint reference |
| `docs/gtfs-database.md` | Complete DB schema reference |
| `docs/deploy.md` | Production deployment guide |
| `docs/quickstart.md` | 5-minute getting started |
| `docs/PROJECT_STRUCTURE.md` | Monorepo architecture |
| `backend/README.md` | Backend-specific setup |
| `backend/tests/TEST_ISOLATION.md` | Test isolation strategy + parallel execution |

---

## Useful SQL Queries

```sql
-- Check row counts
SELECT 'routes', COUNT(*) FROM routes
UNION SELECT 'stops', COUNT(*) FROM stops
UNION SELECT 'segments', COUNT(*) FROM segments
UNION SELECT 'segment_stats', COUNT(*) FROM segment_stats;

-- Learning progress for a route
SELECT * FROM segment_learning_progress
WHERE route_short_name = '335E' LIMIT 10;

-- Recent ride submissions
SELECT * FROM rides ORDER BY submitted_at DESC LIMIT 10;

-- Outlier rejection stats
SELECT reason, COUNT(*) FROM rejection_log
GROUP BY reason;

-- Device bucket activity
SELECT bucket_id, observation_count,
       datetime(last_seen, 'unixepoch') as last_seen
FROM device_buckets ORDER BY observation_count DESC LIMIT 10;
```

---

## Key Algorithms (Quick Reference)

**Welford Update:**
```python
n_new = n + 1
delta = x - mean
mean_new = mean + delta / n_new
delta2 = x - mean_new
m2_new = m2 + delta * delta2
```

**Blend Weight:**
```python
w = n / (n + n0)  # n0=20, converges to 1 as n→∞
blended_mean = w * learned_mean + (1-w) * schedule_mean
```

**Outlier Detection:**
```python
if n > 5 and abs(x - mean) > 3 * sqrt(variance):
    reject_as_outlier()
```

---

**Last Updated:** 2025-10-17
**Version:** 0.2.0 (Global Aggregation)

---

## ✅ Test Isolation (FIXED)

**All 47 tests now pass reliably in parallel** with full isolation.

Run full test suite:
```bash
cd backend
uv run pytest -n auto --dist loadfile -q   # 47 tests, ~9-10 seconds
```

**Implementation**:
- Settings cache automatically cleared before/after each test
- Isolated databases per test (in-memory for unit, temp file for integration)
- pytest-xdist with loadfile distribution for parallel execution
- pytest-randomly for order-independence verification

See `backend/tests/TEST_ISOLATION.md` for complete documentation.

---

**Last Updated:** 2025-10-22
**Version:** 0.2.0 (Global Aggregation + Test Isolation)

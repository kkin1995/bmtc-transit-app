# Next Steps - BMTC Transit API

## ✅ Completed

### Phase 1: Core Backend Implementation
- [x] FastAPI application with 4 endpoints (POST ride_summary, GET eta, GET config, GET health)
- [x] Welford + EMA learning algorithms with schedule blend
- [x] SQLite schema with WAL mode, 6 learning tables
- [x] Bearer token auth + rate limiting (10/min)
- [x] Unit tests for learning algorithms
- [x] Integration tests for POST→GET flow
- [x] Backup/restore scripts + systemd units
- [x] Deployment documentation (Cloudflare Tunnel + Tailscale)
- [x] Project structure (monorepo with backend/ subdirectory)
- [x] uv package manager migration

### Phase 2: GTFS Database Integration
- [x] Enhanced SQLite schema with 6 GTFS tables (agency, routes, stops, trips, stop_times, calendar)
- [x] Foreign key relationships between GTFS and learning tables
- [x] Comprehensive indices for performance
- [x] 3 views for common queries (route_summary, stop_summary, segment_learning_progress)
- [x] Refactored bootstrap to load full GTFS dataset (1.46M stop_times)
- [x] GTFS metadata tracking (version, dates)
- [x] Documentation: gtfs-database.md (complete schema reference)

### Phase 3: GTFS Discovery Endpoints (v1.1)
- [x] GET /v1/stops - Discover stops with bbox/route filtering and pagination
- [x] GET /v1/routes - Discover routes with stop_id/route_type filtering and pagination
- [x] GET /v1/stops/{stop_id}/schedule - Get scheduled departures from GTFS
- [x] Standardized error response format across all endpoints
- [x] Enhanced GET /v1/eta to v1.1 with separate schedule/prediction objects
- [x] Comprehensive test coverage (test_api_gtfs_alignment.py, test_api_errors_alignment.py)
- [x] Updated API documentation with GTFS compliance section
- [x] STRIDE security review documentation

---

## 🚀 Ready to Run

### Test Bootstrap

```bash
cd backend
uv sync                           # Install dependencies
uv run python -m app.bootstrap    # Bootstrap database (~60-90 sec)
```

Expected:
- Database: `backend/bmtc_dev.db`
- Size: ~500MB-1GB
- Tables: 11 GTFS + learning tables
- Rows: 1.5M+ across all tables

### Verify Database

```bash
sqlite3 backend/bmtc_dev.db
```

```sql
-- Check row counts
SELECT 'agency', COUNT(*) FROM agency
UNION SELECT 'routes', COUNT(*) FROM routes
UNION SELECT 'stops', COUNT(*) FROM stops
UNION SELECT 'trips', COUNT(*) FROM trips
UNION SELECT 'stop_times', COUNT(*) FROM stop_times
UNION SELECT 'segments', COUNT(*) FROM segments
UNION SELECT 'segment_stats', COUNT(*) FROM segment_stats;

-- Expected:
-- agency: 1
-- routes: 4,190
-- stops: 9,360
-- trips: 54,780
-- stop_times: 1,462,417
-- segments: ~110,000
-- segment_stats: ~3-5M (sparse, varies by GTFS)

-- Check a route
SELECT * FROM route_summary WHERE route_short_name='335E';

-- Check learning progress
SELECT * FROM segment_learning_progress LIMIT 5;
```

### Run Server

```bash
cd backend
uv run uvicorn app.main:app --reload
```

Test endpoints:
```bash
curl http://127.0.0.1:8000/v1/health
curl http://127.0.0.1:8000/v1/config
```

---

## 📋 Next Phase: Optional Enhancements

### Phase 4: Enhanced GTFS Queries (Optional)

Extend existing GTFS endpoints with additional features.

**Potential additions:**
- `GET /v1/routes/{route_id}` - Single route details
- `GET /v1/stops/{stop_id}` - Single stop details
- `GET /v1/trips/{trip_id}` - Trip details with full stop sequence
- Geospatial queries: `GET /v1/stops?lat=12.97&lon=77.57&radius_m=500`
- Route search: `GET /v1/routes?search=Majestic`

**Estimated effort:** 2-4 hours

---

### Phase 5: Update Existing API to Use GTFS Tables (Minor)

Current API validates segments by checking `segments` table. With GTFS loaded, we can:

**Enhancement:**
- Return stop names in `/v1/eta` response (currently only IDs)
- Return route_short_name in responses
- Validate that requested route_id exists in `routes` table

**Changes needed:**
- `app/routes.py`: Add JOINs to stops/routes in `/v1/eta`
- `app/models.py`: Extend `ETAResponse` with optional `from_stop_name`, `to_stop_name`, `route_short_name`

**Estimated effort:** 1-2 hours

---

### Phase 6: GTFS Update Workflow

Handle GTFS data refreshes without losing learning data.

**Script:** `scripts/update_gtfs.sh`
```bash
#!/bin/bash
# 1. Backup DB
# 2. Download new GTFS
# 3. Clear GTFS tables (preserve rides/ride_segments)
# 4. Re-run bootstrap
# 5. Validate row counts
```

**Estimated effort:** 2 hours

---

### Phase 7: Analytics Dashboard (Optional)

Simple web UI to visualize learning progress.

**Stack:** Grafana + SQLite datasource OR simple HTML + Chart.js

**Queries:**
- Segments with most/least samples
- ETA accuracy over time (predicted vs actual)
- Route coverage heatmap
- Peak hours distribution

**Estimated effort:** 8-12 hours

---

### Phase 8: Client SDK (Future)

Create TypeScript/Python SDK for easy integration.

**Features:**
- `submitRide(segments)`
- `getETA(route, from, to, time?)`
- Auto-retry with exponential backoff
- Rate limit handling

**Languages:** TypeScript (for web/mobile), Python (for analytics)

**Estimated effort:** 4-6 hours per language

---

## 🔬 Testing Recommendations

### 1. Unit Tests (Existing)
```bash
cd backend
uv run pytest tests/test_learning.py -v
```

### 2. Integration Tests (Existing)
```bash
uv run pytest tests/test_integration.py -v
```

### 3. Bootstrap Smoke Test (NEW)

Create `tests/test_bootstrap.py`:
```python
def test_bootstrap_creates_all_tables():
    # Run bootstrap
    # Check all 11 tables exist
    # Verify row counts > 0

def test_gtfs_metadata_populated():
    # Check gtfs_metadata has version

def test_foreign_keys_valid():
    # PRAGMA foreign_key_check
```

### 4. Performance Test (NEW)

Test at scale:
- 100 concurrent POST /v1/ride_summary
- Measure p50, p90, p99 latency
- Verify no DB locks (WAL should handle)

**Target:** POST p99 < 200ms, GET p99 < 100ms

---

## 📦 Deployment Checklist

### Pre-deployment
- [ ] Run bootstrap on production GTFS
- [ ] Generate secure API key: `openssl rand -hex 32`
- [ ] Update `.env` with production paths
- [ ] Test backup/restore cycle
- [ ] Verify UFW firewall rules

### Deploy
- [ ] Install uv on server
- [ ] Copy code to `/opt/bmtc-api`
- [ ] Set up systemd services
- [ ] Configure Cloudflare Tunnel
- [ ] Enable backup timer (hourly)
- [ ] Enable retention timer (daily)
- [ ] Set up monitoring (Uptime Robot / healthchecks.io)

### Post-deployment
- [ ] Smoke test all 4 endpoints
- [ ] Submit test ride, verify learning update
- [ ] Check logs: `journalctl -u bmtc-api -f`
- [ ] Verify backups running: `ls -lh /var/lib/bmtc-api/backups/`

---

## 📚 Documentation Index

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview + quick start |
| `backend/README.md` | Backend-specific setup |
| `docs/PLAN.md` | Original execution plan + ADR |
| `docs/gtfs-analysis.md` | BMTC GTFS data analysis |
| `docs/gtfs-database.md` | **NEW:** Complete DB schema reference |
| `docs/api.md` | API endpoint reference |
| `docs/deploy.md` | Production deployment guide |
| `docs/quickstart.md` | 5-minute getting started |
| `docs/PROJECT_STRUCTURE.md` | Monorepo architecture |
| `NEXT_STEPS.md` | This file |

---

## 🐛 Known Limitations

1. **Single service pattern:** BMTC GTFS has service_id='1' running all 7 days. Real world may have more variation.
2. **No realtime data:** Static GTFS only. If BMTC publishes GTFS-RT, integrate in Phase 7.
3. **Shapes not loaded:** 2.1M shape points skipped to save space. Add if map routing needed.
4. **Fare data not used:** fare_attributes/fare_rules loaded but not exposed in API.

---

## 🎯 Success Metrics

### Technical
- [x] Bootstrap completes in <2 minutes
- [ ] POST p99 latency < 200ms
- [ ] GET p99 latency < 100ms
- [ ] Database size < 2GB
- [ ] Uptime > 99.9%

### Learning
- [ ] 100+ rides submitted across 10+ routes
- [ ] Blend weight > 0.5 for 50+ segments
- [ ] Outlier rejection rate < 10%
- [ ] ETA accuracy within ±20% for learned segments

### Operational
- [ ] Hourly backups running
- [ ] Daily retention job pruning old rides
- [ ] Zero data loss incidents
- [ ] API key rotated monthly

---

## 🆘 Troubleshooting

### Bootstrap fails with "file is encrypted or is not a database"
- Delete `bmtc_dev.db*` files
- Re-run bootstrap

### stop_times load is slow
- Expected: 30-60 sec for 1.46M rows
- If >2min, check disk speed

### Foreign key constraint failed
- Ensure GTFS is complete (all trips reference valid routes/stops)
- Run: `PRAGMA foreign_key_check;`

### Database locked error
- Check for hung processes: `ps aux | grep python`
- WAL should prevent most locks, but concurrent writes may retry

---

## 📞 Support

- **Documentation:** See `docs/` directory
- **Issues:** Create GitHub issue with logs
- **GTFS Data:** Contact me@vonter.in (Vonter, GTFS maintainer)

---

Generated: 2025-10-16
Last Updated: 2025-10-16

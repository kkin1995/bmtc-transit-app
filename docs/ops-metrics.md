# Operational Metrics Guide

**Purpose:** Lightweight observability for BMTC Transit API using only `/v1/health` and direct SQLite queries.
**Target Audience:** Operators validating system health and feature acceptance criteria.
**Prerequisites:** Access to `/var/lib/bmtc-api/bmtc.db` and `sqlite3` CLI.

## Quick Health Check

```bash
# 1. Check service is responding
curl -s http://127.0.0.1:8000/v1/health | jq .

# Expected output:
# {
#   "status": "ok",
#   "db_ok": true,
#   "uptime_sec": 86400
# }

# 2. Verify learning is active (segment stats being updated)
# Run Query #1 below to confirm recent updates
```

---

## SQL Queries for Operational Validation

All queries below are designed to run directly on the production database:

```bash
sqlite3 /var/lib/bmtc-api/bmtc.db
```

### Query 1: Recent Learning Activity (Last 24 Hours)

**Purpose:** Verify that the learning system is actively processing ride submissions.

```sql
-- Check segment_stats updates in the last 24 hours
SELECT
  COUNT(*) as updated_segments,
  COUNT(DISTINCT segment_id) as unique_segments,
  MIN(datetime(last_update, 'unixepoch')) as earliest_update,
  MAX(datetime(last_update, 'unixepoch')) as latest_update,
  AVG(n) as avg_sample_count
FROM segment_stats
WHERE last_update > unixepoch('now') - 86400;

-- Interpretation:
-- updated_segments: Number of segment×bin combinations updated (expect >0)
-- unique_segments: Number of unique segments with updates (expect >0)
-- latest_update: Should be recent (within minutes/hours)
-- avg_sample_count: Should increase over time as more data arrives
--
-- RED FLAG: If updated_segments = 0 for >1 hour during peak traffic,
--           check ride_summary endpoint and logs
```

---

### Query 2: Rate Limiting Activity (Last 24 Hours)

**Purpose:** Monitor rate limit enforcement and identify high-volume device buckets.

```sql
-- Active rate limit buckets with current token count
SELECT
  COUNT(*) as active_buckets,
  AVG(tokens) as avg_tokens_remaining,
  MIN(tokens) as min_tokens,
  SUM(CASE WHEN tokens <= 0 THEN 1 ELSE 0 END) as exhausted_buckets,
  MAX(datetime(last_refill, 'unixepoch')) as most_recent_refill
FROM rate_limit_buckets
WHERE unixepoch('now') - unixepoch(last_refill) < 86400;

-- Interpretation:
-- active_buckets: Number of unique devices/IPs that posted in last 24h
-- avg_tokens_remaining: Average quota remaining (baseline ~250-400 for normal usage)
-- exhausted_buckets: Count with tokens=0/-1 (if >10% of active, investigate abuse)
-- most_recent_refill: Should be very recent if system is active
--
-- RED FLAG: If exhausted_buckets > 20% of active_buckets,
--           check for DDoS or legitimate high-frequency client
```

---

### Query 3: Rate Limit Enforcement Details

**Purpose:** Identify which buckets are hitting limits and whether they're device-based or IP-based.

```sql
-- Top 10 buckets by token consumption (lowest remaining tokens)
SELECT
  bucket_id,
  tokens as remaining_tokens,
  datetime(last_refill, 'unixepoch') as last_refill_time,
  CASE
    WHEN bucket_id LIKE 'ip:%' THEN 'IP-based'
    ELSE 'Device-based'
  END as bucket_type,
  (500 - tokens) as tokens_consumed  -- Assumes default limit of 500
FROM rate_limit_buckets
WHERE unixepoch('now') - unixepoch(last_refill) < 3600  -- Current hour only
ORDER BY tokens ASC
LIMIT 10;

-- Interpretation:
-- bucket_id: First 8-12 chars for privacy (full hash in DB)
-- remaining_tokens: <50 indicates heavy usage; <=0 means rate limited
-- bucket_type: 'IP-based' means device_bucket not provided (fallback)
-- tokens_consumed: ~500 means this bucket hit the limit
--
-- ACTION: If many IP-based buckets are exhausted, check if clients
--         are properly sending device_bucket in POST body
```

---

### Query 4: Idempotency Key Health

**Purpose:** Verify idempotency key TTL cleanup is working and detect duplicate submissions.

```sql
-- Idempotency key statistics
SELECT
  COUNT(*) as total_keys,
  COUNT(CASE WHEN unixepoch('now') - submitted_at > 86400 THEN 1 END) as stale_keys,
  MIN(datetime(submitted_at, 'unixepoch')) as oldest_key,
  MAX(datetime(submitted_at, 'unixepoch')) as newest_key,
  ROUND(AVG(unixepoch('now') - submitted_at) / 3600.0, 1) as avg_age_hours
FROM idempotency_keys;

-- Interpretation:
-- total_keys: Should be <10,000 (cleanup runs daily, TTL=24h)
-- stale_keys: Keys >24h old (should be 0 if retention cleanup ran)
-- avg_age_hours: Average key age (expect <12h if traffic is steady)
--
-- RED FLAG: If stale_keys > 1000, check systemd bmtc-retention.timer status:
--   sudo systemctl status bmtc-retention.timer
--   journalctl -u bmtc-retention.service --since "24 hours ago"
```

---

### Query 5: Rejection Analysis (Last 24 Hours)

**Purpose:** Understand why ride segments are being rejected (outliers, low confidence, etc.).

```sql
-- Rejection breakdown by reason
WITH recent_rejections AS (
  SELECT
    reason,
    COUNT(*) as count,
    ROUND(AVG(duration_sec), 1) as avg_duration,
    ROUND(AVG(mapmatch_conf), 2) as avg_confidence
  FROM rejection_log
  WHERE submitted_at > unixepoch('now') - 86400
  GROUP BY reason
),
total AS (
  SELECT SUM(count) as total_rejections FROM recent_rejections
)
SELECT
  r.reason,
  r.count,
  ROUND(100.0 * r.count / t.total_rejections, 1) as pct_of_rejections,
  r.avg_duration,
  r.avg_confidence
FROM recent_rejections r, total t
ORDER BY r.count DESC;

-- Interpretation:
-- reason: outlier | low_mapmatch_conf | missing_stats | stale_timestamp
-- count: Number of rejections for each reason
-- pct_of_rejections: Percentage of total rejections
-- avg_duration: Average duration of rejected segments (sanity check)
-- avg_confidence: Average map-matching confidence for rejected segments
--
-- BASELINE EXPECTATIONS:
-- - outlier: 1-5% of accepted segments (indicates healthy filtering)
-- - low_mapmatch_conf: <10% (if >20%, map-matching quality issue)
-- - missing_stats: Should be ~0 after bootstrap (indicates GTFS coverage gaps)
--
-- RED FLAG: If low_mapmatch_conf > 30%, investigate client GPS accuracy
```

---

### Query 6: Acceptance vs Rejection Rate (Last 24 Hours)

**Purpose:** Overall health metric for data quality and ingestion pipeline.

```sql
-- Acceptance rate calculation
SELECT
  SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) as accepted_segments,
  SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END) as rejected_segments,
  COUNT(*) as total_segments,
  ROUND(100.0 * SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as acceptance_rate_pct,
  COUNT(DISTINCT ride_id) as total_rides
FROM ride_segments
WHERE timestamp_utc > unixepoch('now') - 86400;

-- Interpretation:
-- acceptance_rate_pct: Should be >85% (healthy filtering + good data quality)
-- total_rides: Number of rides submitted in last 24h (traffic indicator)
--
-- RED FLAG: If acceptance_rate_pct < 70%, investigate:
--   1. Run Query #5 to see rejection reason breakdown
--   2. Check if outlier_sigma config is too aggressive (default=3.0)
--   3. Verify client map-matching confidence thresholds
```

---

### Query 7: ETA Coverage - High Confidence Segments

**Purpose:** Measure % of segment×bin combinations with sufficient data for reliable ETAs.

```sql
-- ETA prediction readiness (n >= 8 is "high confidence")
WITH stats AS (
  SELECT
    COUNT(*) as total_segment_bins,
    SUM(CASE WHEN n >= 8 THEN 1 ELSE 0 END) as high_confidence_bins,
    SUM(CASE WHEN n > 0 AND n < 8 THEN 1 ELSE 0 END) as low_confidence_bins,
    SUM(CASE WHEN n = 0 THEN 1 ELSE 0 END) as no_data_bins,
    AVG(n) as avg_sample_count,
    MAX(n) as max_sample_count
  FROM segment_stats
)
SELECT
  total_segment_bins,
  high_confidence_bins,
  low_confidence_bins,
  no_data_bins,
  ROUND(100.0 * high_confidence_bins / total_segment_bins, 1) as high_confidence_pct,
  ROUND(avg_sample_count, 1) as avg_n,
  max_sample_count
FROM stats;

-- Interpretation:
-- high_confidence_pct: % of segment×bins with n >= 8 (target: >40% after 30 days)
-- avg_n: Average sample count across all segment×bins (increases over time)
-- low_confidence_bins: Bins with 1-7 samples (still learning)
-- no_data_bins: Bins with 0 samples (cold start or sparse coverage)
--
-- GROWTH EXPECTATIONS:
-- Week 1:  high_confidence_pct ~5-10%
-- Week 4:  high_confidence_pct ~30-50%
-- Week 12: high_confidence_pct ~60-80% (mature system)
--
-- RED FLAG: If high_confidence_pct not increasing over weeks,
--           check ride submission volume and GTFS coverage
```

---

### Query 8: Retention Policy Compliance

**Purpose:** Verify TTL cleanups are running and database size is bounded.

```sql
-- Check data retention boundaries
SELECT
  'ride_segments' as table_name,
  COUNT(*) as row_count,
  MIN(datetime(timestamp_utc, 'unixepoch')) as oldest_record,
  MAX(datetime(timestamp_utc, 'unixepoch')) as newest_record,
  ROUND(CAST(COUNT(CASE WHEN timestamp_utc < unixepoch('now') - (90*86400) THEN 1 END) AS REAL) / COUNT(*) * 100, 1) as pct_beyond_ttl
FROM ride_segments
UNION ALL
SELECT
  'rejection_log',
  COUNT(*),
  MIN(datetime(submitted_at, 'unixepoch')),
  MAX(datetime(submitted_at, 'unixepoch')),
  ROUND(CAST(COUNT(CASE WHEN submitted_at < unixepoch('now') - (30*86400) THEN 1 END) AS REAL) / COUNT(*) * 100, 1)
FROM rejection_log
UNION ALL
SELECT
  'idempotency_keys',
  COUNT(*),
  MIN(datetime(submitted_at, 'unixepoch')),
  MAX(datetime(submitted_at, 'unixepoch')),
  ROUND(CAST(COUNT(CASE WHEN submitted_at < unixepoch('now') - 86400 THEN 1 END) AS REAL) / COUNT(*) * 100, 1)
FROM idempotency_keys;

-- Interpretation:
-- pct_beyond_ttl: % of records exceeding retention policy
--   - ride_segments: Should be 0% (TTL=90 days)
--   - rejection_log: Should be 0% (TTL=30 days)
--   - idempotency_keys: Should be 0% (TTL=24 hours)
--
-- RED FLAG: If pct_beyond_ttl > 5% for any table, check retention cleanup:
--   sudo systemctl status bmtc-retention.timer
--   sudo systemctl list-timers bmtc-retention.timer
--   journalctl -u bmtc-retention.service --since "48 hours ago"
```

---

### Query 9: Top Routes by Learning Activity

**Purpose:** Identify which routes are contributing most to the learning system.

```sql
-- Top 20 routes by segment update volume (last 7 days)
SELECT
  r.route_short_name,
  r.route_long_name,
  COUNT(DISTINCT ss.segment_id) as active_segments,
  SUM(ss.n) as total_observations,
  AVG(ss.n) as avg_n_per_segment_bin,
  MAX(datetime(ss.last_update, 'unixepoch')) as most_recent_update
FROM routes r
JOIN segments seg ON r.route_id = seg.route_id
JOIN segment_stats ss ON seg.segment_id = ss.segment_id
WHERE ss.last_update > unixepoch('now') - (7*86400)
GROUP BY r.route_id
ORDER BY total_observations DESC
LIMIT 20;

-- Interpretation:
-- active_segments: Number of unique segments with updates
-- total_observations: Total sample count across all bins for this route
-- avg_n_per_segment_bin: Average samples per segment×bin (maturity indicator)
--
-- USE CASE: Identify high-traffic routes for prioritization or outlier detection
```

---

### Query 10: Device Bucket Activity Summary

**Purpose:** Monitor device diversity and detect potential abuse patterns.

```sql
-- Device bucket health and diversity metrics
WITH bucket_stats AS (
  SELECT
    bucket_id,
    observation_count,
    ROUND((unixepoch('now') - first_seen) / 86400.0, 1) as days_active,
    ROUND((unixepoch('now') - last_seen) / 3600.0, 1) as hours_since_last_seen,
    CASE
      WHEN bucket_id LIKE 'ip:%' THEN 1
      ELSE 0
    END as is_ip_fallback
  FROM device_buckets
  WHERE last_seen > unixepoch('now') - (7*86400)  -- Active in last 7 days
)
SELECT
  COUNT(*) as active_devices_7d,
  SUM(is_ip_fallback) as ip_fallback_count,
  ROUND(100.0 * SUM(is_ip_fallback) / COUNT(*), 1) as ip_fallback_pct,
  AVG(observation_count) as avg_observations_per_device,
  MAX(observation_count) as max_observations_single_device,
  ROUND(AVG(days_active), 1) as avg_device_lifetime_days
FROM bucket_stats;

-- Interpretation:
-- active_devices_7d: Unique device buckets seen in last 7 days (diversity indicator)
-- ip_fallback_pct: % using IP-based buckets (clients not sending device_bucket)
-- max_observations_single_device: Highest contribution from one device (outlier check)
--
-- BASELINE EXPECTATIONS:
-- - ip_fallback_pct: <20% (most clients should send device_bucket)
-- - avg_observations_per_device: 50-500 (depends on usage patterns)
-- - max_observations_single_device: <5000 (if >10k, investigate for abuse)
--
-- ACTION: If ip_fallback_pct > 40%, update client app to send device_bucket
```

---

### Query 11: Route Search Analytics (Manual Verification)

**Purpose:** Verify route search functionality and coverage for acceptance criteria validation.

```sql
-- Example: Verify search matches for common queries
-- Test case: Query "335" should find routes like "335-E", "335A", "335D"
SELECT route_id, route_short_name, route_long_name
FROM routes
WHERE REPLACE(REPLACE(UPPER(route_short_name), ' ', ''), '-', '') LIKE '%335%'
   OR REPLACE(REPLACE(UPPER(route_long_name), ' ', ''), '-', '') LIKE '%335%'
LIMIT 10;

-- Expected results for "335" query:
-- route_id | route_short_name | route_long_name
-- ---------|------------------|------------------
-- 335E     | 335-E            | Kempegowda Bus Station to Sarjapura
-- 335A     | 335A             | Kempegowda Bus Station to Electronic City
-- ...

-- Interpretation:
-- This query mimics the normalization logic in GET /v1/routes/search
-- Use this to manually verify that search results match acceptance criteria
-- Replace '335' with any test query to validate search behavior
--
-- ACCEPTANCE CRITERIA VALIDATION:
-- - Query "335e" should find route "335-E" (case-insensitive)
-- - Query "electronic city" should find routes with "Electronic City" in name
-- - Search should ignore spaces and hyphens in matching
```

---

## Logging Keys for Troubleshooting

The API logs structured events to journald with grep-friendly key=value pairs.

### Key Pattern Reference

| Event | Log Pattern | Example |
|-------|-------------|---------|
| Outlier rejection | `event=outlier_rejected segment_id=<id> bin_id=<id> duration=<x> mean=<μ> std=<σ>` | Outlier rejected: segment_id=12345, bin_id=87, duration=600.0, mean=320.5, std=45.2 |
| Low confidence rejection | `event=low_confidence_rejected segment_id=<id> bin_id=<id> conf=<x> threshold=<t>` | Low mapmatch_conf rejected: segment_id=12345, bin_id=87, conf=0.65, threshold=0.70 |
| Rate limit hit | `event=rate_limit_exceeded bucket_id=<hash> bucket_type=<device\|ip>` | Rate limit exceeded for device bucket (id: 7a1f2b5c...) |
| Idempotency replay | `event=idempotent_replay key=<uuid>` | Idempotent replay detected: 550e8400-e29b-41d4-a716-446655440000 |
| Route search | `query_length=<n> results=<total> paginated=<returned>` | Route search completed: query_length=3, results=15, paginated=15 |

### Common Journalctl Queries

```bash
# Count outlier rejections by hour (last 24h)
journalctl -u bmtc-api --since "24 hours ago" | grep "Outlier rejected" | wc -l

# Find segments with highest rejection rates (last 24h)
journalctl -u bmtc-api --since "24 hours ago" \
  | grep "Outlier rejected" \
  | grep -oP "segment_id=\d+" \
  | sort | uniq -c | sort -rn | head -20

# Monitor rate limit events in real-time
journalctl -u bmtc-api -f | grep "Rate limit"

# Check idempotency cache hit rate (last hour)
journalctl -u bmtc-api --since "1 hour ago" | grep -c "Idempotent replay"

# View low confidence rejections with details
journalctl -u bmtc-api --since "6 hours ago" | grep "Low mapmatch_conf"

# Monitor route search activity (last hour)
journalctl -u bmtc-api --since "1 hour ago" | grep "Route search completed"

# Analyze search query patterns (last 24 hours)
journalctl -u bmtc-api --since "24 hours ago" \
  | grep "Route search completed" \
  | grep -oP "query_length=\d+" \
  | sort | uniq -c | sort -rn
```

---

## Health Check Enhancement (Optional)

The current `/v1/health` endpoint returns:

```json
{
  "status": "ok",
  "db_ok": true,
  "uptime_sec": 86400
}
```

**Recommendation:** Keep as-is (minimal). Complex health metrics should be queried via SQL.

If a simple boolean flag is needed for automated monitoring, consider adding:

```json
{
  "status": "ok",
  "db_ok": true,
  "uptime_sec": 86400,
  "learning_active": true  // True if any segment_stats updated in last 1 hour
}
```

**Implementation:** This would require a lightweight query in `routes.py:health_check()`:

```python
# Check if learning system is active (any updates in last hour)
learning_active = False
try:
    cursor.execute(
        "SELECT 1 FROM segment_stats WHERE last_update > ? LIMIT 1",
        (int(time.time()) - 3600,)
    )
    learning_active = cursor.fetchone() is not None
except Exception:
    pass
```

**Trade-off:** Adds ~5-10ms to health check latency. Only add if external monitoring (e.g., uptime checker) requires it.

---

## Validation Workflow for Operators

**5-Minute System Health Check:**

```bash
# 1. Health endpoint (1 second)
curl -s http://127.0.0.1:8000/v1/health | jq .

# 2. Recent learning activity (5 seconds)
sqlite3 /var/lib/bmtc-api/bmtc.db < query1.sql

# 3. Rate limiting status (5 seconds)
sqlite3 /var/lib/bmtc-api/bmtc.db < query2.sql

# 4. Rejection analysis (5 seconds)
sqlite3 /var/lib/bmtc-api/bmtc.db < query5.sql

# 5. Acceptance rate (5 seconds)
sqlite3 /var/lib/bmtc-api/bmtc.db < query6.sql

# 6. Retention compliance (5 seconds)
sqlite3 /var/lib/bmtc-api/bmtc.db < query8.sql
```

Save individual queries as `.sql` files for reuse:

```bash
# Extract Query 1 to file
cat > /tmp/query1.sql << 'EOF'
SELECT
  COUNT(*) as updated_segments,
  COUNT(DISTINCT segment_id) as unique_segments,
  MIN(datetime(last_update, 'unixepoch')) as earliest_update,
  MAX(datetime(last_update, 'unixepoch')) as latest_update,
  AVG(n) as avg_sample_count
FROM segment_stats
WHERE last_update > unixepoch('now') - 86400;
EOF

# Run it
sqlite3 /var/lib/bmtc-api/bmtc.db < /tmp/query1.sql
```

---

## Alerting Thresholds (Reference)

Use these thresholds for automated monitoring (e.g., cron + script):

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|--------|
| Learning active (Query 1) | No updates in 1h | No updates in 4h | Check ride_summary endpoint logs |
| Acceptance rate (Query 6) | <80% | <70% | Review rejection reasons (Query 5) |
| Stale idempotency keys (Query 4) | >1000 | >5000 | Check retention timer |
| High confidence % (Query 7) | <20% after 4 weeks | <10% after 8 weeks | Check ride volume and coverage |
| Rate limit exhaustion (Query 2) | >20% of buckets | >40% of buckets | Investigate abuse or adjust limit |
| DB size | >10 GB | >20 GB | Check retention cleanup and vacuum |

---

## Database Maintenance

```bash
# Check database size
du -h /var/lib/bmtc-api/bmtc.db

# Vacuum to reclaim space after retention cleanup
sqlite3 /var/lib/bmtc-api/bmtc.db "VACUUM;"

# Analyze for query optimizer statistics
sqlite3 /var/lib/bmtc-api/bmtc.db "ANALYZE;"

# Check integrity
sqlite3 /var/lib/bmtc-api/bmtc.db "PRAGMA integrity_check;"
```

---

## Troubleshooting Guide

### Issue: No recent segment_stats updates (Query 1 shows 0)

**Diagnosis:**
1. Check if ride_summary endpoint is accessible: `curl -X POST http://127.0.0.1:8000/v1/ride_summary` (expect 401)
2. Check logs: `journalctl -u bmtc-api --since "1 hour ago" | grep "POST /v1/ride_summary"`
3. Verify clients are submitting rides: `SELECT COUNT(*) FROM rides WHERE submitted_at > unixepoch('now') - 3600;`

**Resolution:**
- If no rides in DB: Client submission issue or network connectivity
- If rides in DB but no stats updates: Check learning.py exceptions in logs

---

### Issue: High rejection rate (Query 6 shows <70%)

**Diagnosis:**
1. Run Query 5 to see breakdown by rejection reason
2. If `low_mapmatch_conf` is high (>30%): GPS quality issue on clients
3. If `outlier` is high (>10%): Check outlier_sigma config or investigate traffic patterns
4. If `missing_stats` is high: GTFS coverage gaps or bootstrap issue

**Resolution:**
- Low confidence: Update client app to improve GPS accuracy or lower `mapmatch_min_conf` (default 0.7)
- Outliers: Investigate via Query 5 avg_duration to see if rejections are valid
- Missing stats: Re-run bootstrap or verify segment exists in `segments` table

---

### Issue: Stale idempotency keys (Query 4 shows >1000)

**Diagnosis:**
```bash
# Check retention timer status
sudo systemctl status bmtc-retention.timer

# Check last run
sudo systemctl list-timers bmtc-retention.timer

# Check logs for errors
journalctl -u bmtc-retention.service --since "48 hours ago"
```

**Resolution:**
- If timer not active: `sudo systemctl enable --now bmtc-retention.timer`
- If service failed: Check logs and verify DB permissions
- If DB locked: Check for long-running queries or concurrent writes

---

## Performance Notes

- **Query Execution Time:** All queries above execute in <100ms on production database (<5GB, 5M rows in segment_stats)
- **Index Coverage:** All queries use existing indices (see schema.sql)
- **Concurrency:** SQLite WAL mode allows queries during writes; run diagnostic queries during low-traffic periods if DB >10GB
- **Locking:** Avoid running long queries (>5s) during peak traffic to prevent write stalls

---

**Last Updated:** 2025-10-22
**Schema Version:** 0.2.0 (Global Aggregation)
**Related Docs:** `docs/api.md`, `docs/gtfs-database.md`, `backend/app/schema.sql`

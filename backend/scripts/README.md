# Operational Scripts

This directory contains scripts for operating and maintaining the BMTC Transit API.

## Scripts

### `health_check.sh`

**Purpose:** Quick operational health check combining API endpoint validation and SQL-based metrics.

**Usage:**
```bash
# Check production database
./health_check.sh

# Check custom database path
./health_check.sh /path/to/bmtc.db

# Check with custom API URL
BMTC_API_URL=https://api.example.com ./health_check.sh
```

**Output:** Color-coded health status for:
1. API health endpoint (`/v1/health`)
2. Database connectivity
3. Recent learning activity (last 24h)
4. Acceptance rate (last 24h)
5. Rate limiting status
6. Idempotency key cleanup
7. ETA coverage (high confidence %)
8. Database size

**Exit Codes:**
- `0`: All checks passed (green) or warnings (yellow)
- `1`: Critical failure (database not found or inaccessible)

**Dependencies:**
- `sqlite3` CLI tool
- `curl` for API checks
- `bc` for floating-point arithmetic

---

### `backup.sh`

**Purpose:** Create SQLite backup with compression.

**Usage:**
```bash
./backup.sh [db_path] [backup_dir]
```

**Default paths:**
- DB: `/var/lib/bmtc-api/bmtc.db`
- Backup dir: `/var/lib/bmtc-api/backups`

**Output:** `bmtc-YYYY-MM-DD-HHMMSS.db.gz`

**Retention:** Backups older than 30 days are automatically removed.

**Systemd Timer:** Runs hourly via `bmtc-backup.timer`

---

### `restore.sh`

**Purpose:** Restore SQLite database from compressed backup.

**Usage:**
```bash
./restore.sh [backup_file] [target_db_path]
```

**Example:**
```bash
./restore.sh /var/lib/bmtc-api/backups/bmtc-2025-10-22-140000.db.gz /var/lib/bmtc-api/bmtc.db
```

**Safety:** Creates a backup of existing DB before restore (suffixed with `.pre-restore`).

---

### `generate_sample_data.py`

**Purpose:** Generate synthetic ride data for testing and load simulation.

**Usage:**
```bash
# Generate 100 rides
uv run python generate_sample_data.py --count 100

# Generate rides for specific route
uv run python generate_sample_data.py --route 335E --count 50

# Generate with custom timestamp range
uv run python generate_sample_data.py --days-ago 7 --count 200
```

**Note:** Requires API to be running and `BMTC_API_KEY` environment variable set.

---

## Monitoring & Alerting

For detailed metrics and SQL queries, see [`docs/ops-metrics.md`](../../docs/ops-metrics.md).

### Quick Validation Commands

```bash
# 1. Health check (30 seconds)
./health_check.sh

# 2. Check recent errors in logs (5 seconds)
journalctl -u bmtc-api --since "1 hour ago" -p err

# 3. Check systemd timers status (5 seconds)
systemctl status bmtc-backup.timer bmtc-retention.timer

# 4. Database integrity check (10-60 seconds depending on size)
sqlite3 /var/lib/bmtc-api/bmtc.db "PRAGMA integrity_check;"
```

### Automated Monitoring Setup

To run health checks periodically via cron:

```bash
# Add to crontab (runs every 15 minutes)
*/15 * * * * /opt/bmtc-api/backend/scripts/health_check.sh >> /var/log/bmtc-health.log 2>&1

# Send email on critical failures
*/15 * * * * /opt/bmtc-api/backend/scripts/health_check.sh || echo "BMTC API health check failed" | mail -s "BMTC API Alert" ops@example.com
```

---

## Maintenance Tasks

### Daily
- Verify retention cleanup ran: `systemctl status bmtc-retention.service`
- Check database size: `du -h /var/lib/bmtc-api/bmtc.db`
- Review error logs: `journalctl -u bmtc-api --since "24 hours ago" -p err`

### Weekly
- Review acceptance rate trends (Query 6 in ops-metrics.md)
- Check ETA coverage growth (Query 7 in ops-metrics.md)
- Verify backup integrity: restore one backup to test DB and validate

### Monthly
- Database vacuum (reclaim space): `sqlite3 /var/lib/bmtc-api/bmtc.db "VACUUM;"`
- Update query optimizer stats: `sqlite3 /var/lib/bmtc-api/bmtc.db "ANALYZE;"`
- Review rate limiting patterns (Query 2-3 in ops-metrics.md)
- Check for stale data: Query 8 in ops-metrics.md

---

## Troubleshooting

### Issue: Health check shows no recent learning activity

**Diagnosis:**
```bash
# Check if rides are being submitted
sqlite3 /var/lib/bmtc-api/bmtc.db "SELECT COUNT(*) FROM rides WHERE submitted_at > unixepoch('now') - 3600;"

# Check for errors in ride processing
journalctl -u bmtc-api --since "1 hour ago" | grep -i error
```

**Common causes:**
- No client submissions (check client app connectivity)
- API authentication issues (check Bearer token)
- Rate limiting blocking submissions (check Query 2 in ops-metrics.md)

---

### Issue: High database size (>10GB)

**Diagnosis:**
```bash
# Check table sizes
sqlite3 /var/lib/bmtc-api/bmtc.db <<EOF
SELECT name, SUM(pgsize) / 1024 / 1024 as size_mb
FROM dbstat
GROUP BY name
ORDER BY size_mb DESC
LIMIT 10;
EOF

# Check if retention cleanup is running
systemctl status bmtc-retention.timer
journalctl -u bmtc-retention.service --since "48 hours ago"
```

**Resolution:**
```bash
# Manual retention cleanup (if timer failed)
sqlite3 /var/lib/bmtc-api/bmtc.db <<EOF
DELETE FROM ride_segments WHERE timestamp_utc < unixepoch('now') - (90*86400);
DELETE FROM rejection_log WHERE submitted_at < unixepoch('now') - (30*86400);
DELETE FROM idempotency_keys WHERE submitted_at < unixepoch('now') - 86400;
EOF

# Reclaim space
sqlite3 /var/lib/bmtc-api/bmtc.db "VACUUM;"
```

---

### Issue: Rate limit exhaustion (>20% of buckets)

**Diagnosis:**
```bash
# Identify top consumers (Query 3 in ops-metrics.md)
sqlite3 /var/lib/bmtc-api/bmtc.db <<EOF
SELECT bucket_id, tokens, datetime(last_refill, 'unixepoch')
FROM rate_limit_buckets
WHERE tokens <= 0
ORDER BY last_refill DESC
LIMIT 20;
EOF

# Check if legitimate high-frequency clients
journalctl -u bmtc-api --since "1 hour ago" | grep "Rate limit exceeded"
```

**Resolution:**
- If IP-based buckets: Clients not sending `device_bucket` field
- If same device repeatedly: Possible abuse or legitimate power user
- If widespread: Consider increasing limit or adding per-route quotas

---

## Related Documentation

- **API Reference:** [`docs/api.md`](../../docs/api.md)
- **Operational Metrics:** [`docs/ops-metrics.md`](../../docs/ops-metrics.md)
- **Database Schema:** [`docs/gtfs-database.md`](../../docs/gtfs-database.md)
- **Deployment Guide:** [`docs/deploy.md`](../../docs/deploy.md)

---

**Last Updated:** 2025-10-22

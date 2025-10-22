#!/bin/bash
# BMTC API Operational Health Check Script
# Usage: ./health_check.sh [db_path]
# Default db_path: /var/lib/bmtc-api/bmtc.db

set -euo pipefail

DB_PATH="${1:-/var/lib/bmtc-api/bmtc.db}"
API_URL="${BMTC_API_URL:-http://127.0.0.1:8000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "BMTC API Health Check"
echo "========================================="
echo "Database: $DB_PATH"
echo "API URL: $API_URL"
echo "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Check 1: API Health Endpoint
echo "1. API Health Endpoint"
echo "   Command: curl -s $API_URL/v1/health"
if response=$(curl -sf "$API_URL/v1/health" 2>/dev/null); then
    echo "   ${GREEN}✓${NC} API is responding"
    echo "   Response: $response"

    # Parse status
    status=$(echo "$response" | grep -oP '"status":"[^"]*"' | cut -d'"' -f4)
    db_ok=$(echo "$response" | grep -oP '"db_ok":(true|false)' | cut -d':' -f2)

    if [ "$status" = "ok" ] && [ "$db_ok" = "true" ]; then
        echo "   ${GREEN}✓${NC} Status: $status, DB: $db_ok"
    else
        echo "   ${YELLOW}⚠${NC} Status: $status, DB: $db_ok"
    fi
else
    echo "   ${RED}✗${NC} API is not responding"
fi
echo ""

# Check 2: Database Connectivity
echo "2. Database Connectivity"
if [ ! -f "$DB_PATH" ]; then
    echo "   ${RED}✗${NC} Database file not found: $DB_PATH"
    exit 1
fi

if sqlite3 "$DB_PATH" "SELECT 1;" >/dev/null 2>&1; then
    echo "   ${GREEN}✓${NC} Database is accessible"
else
    echo "   ${RED}✗${NC} Cannot connect to database"
    exit 1
fi
echo ""

# Check 3: Recent Learning Activity (Last 24h)
echo "3. Recent Learning Activity (Last 24 Hours)"
result=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM segment_stats WHERE last_update > unixepoch('now') - 86400;")
if [ "$result" -gt 0 ]; then
    echo "   ${GREEN}✓${NC} $result segment×bins updated in last 24h"
else
    echo "   ${YELLOW}⚠${NC} No segment updates in last 24h (low traffic or learning inactive)"
fi
echo ""

# Check 4: Acceptance Rate (Last 24h)
echo "4. Acceptance Rate (Last 24 Hours)"
if sqlite3 "$DB_PATH" "SELECT 1 FROM ride_segments LIMIT 1;" >/dev/null 2>&1; then
    result=$(sqlite3 "$DB_PATH" <<'EOF'
SELECT
  ROUND(100.0 * SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as acceptance_rate,
  COUNT(*) as total_segments,
  COUNT(DISTINCT ride_id) as total_rides
FROM ride_segments
WHERE timestamp_utc > unixepoch('now') - 86400;
EOF
)
    acceptance_rate=$(echo "$result" | cut -d'|' -f1)
    total_segments=$(echo "$result" | cut -d'|' -f2)
    total_rides=$(echo "$result" | cut -d'|' -f3)

    if [ -z "$acceptance_rate" ] || [ "$acceptance_rate" = "" ]; then
        echo "   ${YELLOW}⚠${NC} No ride data in last 24h"
    elif (( $(echo "$acceptance_rate >= 85.0" | bc -l) )); then
        echo "   ${GREEN}✓${NC} Acceptance rate: ${acceptance_rate}% ($total_segments segments, $total_rides rides)"
    elif (( $(echo "$acceptance_rate >= 70.0" | bc -l) )); then
        echo "   ${YELLOW}⚠${NC} Acceptance rate: ${acceptance_rate}% ($total_segments segments, $total_rides rides)"
    else
        echo "   ${RED}✗${NC} Acceptance rate: ${acceptance_rate}% ($total_segments segments, $total_rides rides)"
    fi
else
    echo "   ${YELLOW}⚠${NC} ride_segments table not found (schema not initialized)"
fi
echo ""

# Check 5: Rate Limiting (if table exists)
echo "5. Rate Limiting Status"
if sqlite3 "$DB_PATH" "SELECT 1 FROM rate_limit_buckets LIMIT 1;" >/dev/null 2>&1; then
    result=$(sqlite3 "$DB_PATH" <<'EOF'
SELECT
  COUNT(*) as active_buckets,
  SUM(CASE WHEN tokens <= 0 THEN 1 ELSE 0 END) as exhausted_buckets
FROM rate_limit_buckets
WHERE unixepoch('now') - unixepoch(last_refill) < 86400;
EOF
)
    active_buckets=$(echo "$result" | cut -d'|' -f1)
    exhausted_buckets=$(echo "$result" | cut -d'|' -f2)

    if [ "$active_buckets" -eq 0 ]; then
        echo "   ${YELLOW}⚠${NC} No active rate limit buckets in last 24h"
    else
        exhausted_pct=$(echo "scale=1; 100.0 * $exhausted_buckets / $active_buckets" | bc)
        echo "   ${GREEN}✓${NC} Active buckets: $active_buckets, Exhausted: $exhausted_buckets (${exhausted_pct}%)"

        if (( $(echo "$exhausted_pct > 20.0" | bc -l) )); then
            echo "   ${YELLOW}⚠${NC} High rate limit exhaustion rate (>20%)"
        fi
    fi
else
    echo "   ${YELLOW}⚠${NC} rate_limit_buckets table not found (feature not enabled)"
fi
echo ""

# Check 6: Idempotency Key Cleanup (if table exists)
echo "6. Idempotency Key Cleanup"
if sqlite3 "$DB_PATH" "SELECT 1 FROM idempotency_keys LIMIT 1;" >/dev/null 2>&1; then
    result=$(sqlite3 "$DB_PATH" <<'EOF'
SELECT
  COUNT(*) as total_keys,
  COUNT(CASE WHEN unixepoch('now') - submitted_at > 86400 THEN 1 END) as stale_keys
FROM idempotency_keys;
EOF
)
    total_keys=$(echo "$result" | cut -d'|' -f1)
    stale_keys=$(echo "$result" | cut -d'|' -f2)

    if [ "$total_keys" -eq 0 ]; then
        echo "   ${GREEN}✓${NC} No idempotency keys (clean state)"
    elif [ "$stale_keys" -gt 1000 ]; then
        echo "   ${RED}✗${NC} $stale_keys stale keys (>24h old) out of $total_keys total"
        echo "   ${YELLOW}⚠${NC} Check retention timer: sudo systemctl status bmtc-retention.timer"
    elif [ "$stale_keys" -gt 0 ]; then
        echo "   ${YELLOW}⚠${NC} $stale_keys stale keys (>24h old) out of $total_keys total"
    else
        echo "   ${GREEN}✓${NC} All $total_keys keys are fresh (<24h old)"
    fi
else
    echo "   ${YELLOW}⚠${NC} idempotency_keys table not found (feature not enabled)"
fi
echo ""

# Check 7: ETA Coverage
echo "7. ETA Coverage (High Confidence Segments)"
result=$(sqlite3 "$DB_PATH" <<'EOF'
WITH stats AS (
  SELECT
    COUNT(*) as total_segment_bins,
    SUM(CASE WHEN n >= 8 THEN 1 ELSE 0 END) as high_confidence_bins
  FROM segment_stats
)
SELECT
  total_segment_bins,
  high_confidence_bins,
  ROUND(100.0 * high_confidence_bins / total_segment_bins, 1) as high_confidence_pct
FROM stats;
EOF
)
total_bins=$(echo "$result" | cut -d'|' -f1)
high_conf_bins=$(echo "$result" | cut -d'|' -f2)
high_conf_pct=$(echo "$result" | cut -d'|' -f3)

if [ -z "$high_conf_pct" ] || [ "$high_conf_pct" = "" ]; then
    echo "   ${YELLOW}⚠${NC} No segment stats data"
elif (( $(echo "$high_conf_pct >= 40.0" | bc -l) )); then
    echo "   ${GREEN}✓${NC} High confidence coverage: ${high_conf_pct}% ($high_conf_bins of $total_bins)"
else
    echo "   ${YELLOW}⚠${NC} High confidence coverage: ${high_conf_pct}% ($high_conf_bins of $total_bins)"
    echo "   Note: Coverage improves over time (target: >40% after 30 days)"
fi
echo ""

# Check 8: Database Size
echo "8. Database Size"
db_size=$(du -h "$DB_PATH" | cut -f1)
db_size_mb=$(du -m "$DB_PATH" | cut -f1)
echo "   Size: $db_size"

if [ "$db_size_mb" -gt 20000 ]; then
    echo "   ${RED}✗${NC} Database size exceeds 20GB (critical)"
elif [ "$db_size_mb" -gt 10000 ]; then
    echo "   ${YELLOW}⚠${NC} Database size exceeds 10GB (warning)"
else
    echo "   ${GREEN}✓${NC} Database size is healthy"
fi
echo ""

echo "========================================="
echo "Health Check Complete"
echo "========================================="
echo ""
echo "For detailed metrics, see: docs/ops-metrics.md"
echo "For troubleshooting, run: journalctl -u bmtc-api --since '1 hour ago'"

# API Reference

## Authentication

All endpoints (except `/v1/health` and `/v1/config`) require Bearer token:

```
Authorization: Bearer <API_KEY>
```

---

## POST /v1/ride_summary

Submit ride segments for learning.

**Request:**
```json
{
  "route_id": "ROUTE_335E",
  "direction_id": 0,
  "segments": [
    {
      "from_stop_id": "STOP_A",
      "to_stop_id": "STOP_B",
      "duration_sec": 320.5,
      "dwell_sec": 25.0,
      "timestamp_utc": 1697654321
    }
  ]
}
```

**Response:**
```json
{
  "accepted": true,
  "rejected_count": 0
}
```

**Status codes:**
- `200` - Success
- `401` - Invalid/missing API key
- `422` - Unknown segment or invalid timestamp
- `429` - Rate limit exceeded (>10/min)

---

## GET /v1/eta

Query learned ETA for segment.

**Query params:**
- `route_id` (required)
- `direction_id` (required, 0 or 1)
- `from_stop_id` (required)
- `to_stop_id` (required)
- `timestamp_utc` (optional, defaults to now)

**Response:**
```json
{
  "mean_sec": 310.5,
  "p50_sec": 310.5,
  "p90_sec": 322.3,
  "sample_count": 42,
  "blend_weight": 0.677,
  "last_updated": 1697654321
}
```

**Status codes:**
- `200` - Success
- `404` - Segment not found

---

## GET /v1/config

Server configuration.

**Response:**
```json
{
  "n0": 20,
  "time_bin_minutes": 15,
  "half_life_days": 30,
  "gtfs_version": "2023-10-15",
  "server_version": "0.1.0"
}
```

---

## GET /v1/health

Health check.

**Response:**
```json
{
  "status": "ok",
  "db_ok": true,
  "uptime_sec": 86400
}
```

**Status codes:**
- `200` - Healthy
- `503` - Degraded (DB error)

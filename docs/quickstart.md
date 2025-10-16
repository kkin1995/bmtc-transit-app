# Quick Start Guide

Get the BMTC API running in <5 minutes.

## Prerequisites

- Linux/macOS (WSL on Windows)
- Python 3.9+
- BMTC GTFS zip file

## 1. Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc  # or ~/.zshrc
```

## 2. Clone and setup

```bash
git clone <repo> bmtc-transit-app
cd bmtc-transit-app/backend
cp .env.example .env
```

Edit `.env` and set `BMTC_API_KEY` to a secure random string:

```bash
# Generate a secure key
openssl rand -hex 32
```

## 3. Place GTFS data

```bash
mkdir -p ../gtfs
cp /path/to/bmtc.zip ../gtfs/
```

## 4. Bootstrap database

This parses GTFS and seeds schedule baselines (~30-60 sec for full BMTC dataset):

```bash
# From backend/ directory
uv run python -m app.bootstrap
```

Expected output:
```
Initializing database at bmtc_dev.db...
Parsing GTFS from gtfs/bmtc.zip...
Bootstrap complete. GTFS version: 20250902
Segments and segment_stats populated with schedule baselines.
```

## 5. Run the server

```bash
# From backend/ directory
uv run uvicorn app.main:app --reload
```

Server starts at `http://127.0.0.1:8000`

## 6. Test it

Health check:
```bash
curl http://127.0.0.1:8000/v1/health
```

Should return:
```json
{"status":"ok","db_ok":true,"uptime_sec":5}
```

Config:
```bash
curl http://127.0.0.1:8000/v1/config
```

Query ETA (replace with actual route/stop IDs from GTFS):
```bash
curl "http://127.0.0.1:8000/v1/eta?route_id=104&direction_id=0&from_stop_id=STOP1&to_stop_id=STOP2"
```

Submit ride (requires auth):
```bash
curl -X POST http://127.0.0.1:8000/v1/ride_summary \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "route_id": "104",
    "direction_id": 0,
    "segments": [{
      "from_stop_id": "STOP1",
      "to_stop_id": "STOP2",
      "duration_sec": 320.0,
      "timestamp_utc": 1697654321
    }]
  }'
```

## 7. Run tests

```bash
# From backend/ directory
uv run pytest -v
```

## Next Steps

- See `../docs/api.md` for full API reference
- See `../docs/deploy.md` for production deployment
- Check `scripts/generate_sample_data.py` to create synthetic rides for testing

## Troubleshooting

**"Segment not found" error on POST:**
- Ensure the route_id, from_stop_id, to_stop_id match GTFS data
- Check `segments` table: `sqlite3 bmtc_dev.db "SELECT * FROM segments LIMIT 10;"`

**Database locked:**
- Only one writer at a time (SQLite WAL limitation)
- Check for hung processes: `ps aux | grep uvicorn`

**Rate limit errors:**
- Default: 10 POST/min per IP
- Adjust in `app/routes.py` if needed for testing

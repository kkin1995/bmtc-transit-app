# BMTC Transit Learning API

Zero-cost backend MVP for single-user BMTC transit time learning.

## Setup

Install [uv](https://github.com/astral-sh/uv) (fastest Python package manager):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Setup project:

```bash
uv sync
cp .env.example .env
# Edit .env with your API key and paths
```

## GTFS Bootstrap

Place GTFS zip in `BMTC_GTFS_PATH` (default: `./gtfs/bmtc.zip`), then:

```bash
uv run python -m app.bootstrap
```

## Run

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Tests

Run per-module to avoid cross-module interference:

```bash
uv run pytest tests/test_learning.py -v
uv run pytest tests/test_integration.py -v
uv run pytest tests/test_idempotency.py -v
uv run pytest tests/test_global_aggregation.py -v
```

All 33 tests pass when run individually (8+9+6+10).

## API

- `POST /v1/ride_summary` - Upload ride segments
- `GET /v1/eta` - Query learned ETA
- `GET /v1/config` - Server config
- `GET /v1/health` - Health check

Auth: `Authorization: Bearer <BMTC_API_KEY>`

## Deploy

Use Cloudflare Tunnel or Tailscale Funnel. See `docs/deploy.md`.

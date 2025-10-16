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

```bash
uv run pytest
```

## API

- `POST /v1/ride_summary` - Upload ride segments
- `GET /v1/eta` - Query learned ETA
- `GET /v1/config` - Server config
- `GET /v1/health` - Health check

Auth: `Authorization: Bearer <BMTC_API_KEY>`

## Deploy

Use Cloudflare Tunnel or Tailscale Funnel. See `docs/deploy.md`.

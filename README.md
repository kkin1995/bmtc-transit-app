# BMTC Transit App

End-to-end transit time learning system for Bengaluru (BMTC) buses.

## Project Structure

```
bmtc-transit-app/
├── backend/          # FastAPI backend API for ETA learning
├── docs/             # Shared documentation
│   ├── PLAN.md              # Execution plan and ADR
│   ├── gtfs-analysis.md     # GTFS data analysis
│   ├── api.md               # API reference
│   ├── deploy.md            # Production deployment guide
│   └── quickstart.md        # Quick start guide
├── gtfs/             # BMTC GTFS static data
└── README.md         # This file
```

## Components

### Backend API

Zero-cost FastAPI backend that learns segment-level transit times from user-uploaded rides.

**Features:**
- Schedule-aware ETA predictions using Welford + EMA algorithms
- 192 time bins (15-min × weekday/weekend)
- Outlier rejection (>3σ)
- SQLite with WAL mode
- Bearer token auth + rate limiting

**Quick start:**
```bash
cd backend
uv sync
cp .env.example .env
# Edit .env with your API key
uv run python -m app.bootstrap
uv run uvicorn app.main:app --reload
```

See [backend/README.md](backend/README.md) for details.

### Documentation

- **[PLAN.md](docs/PLAN.md)** - Complete execution plan, architecture decisions, and lessons learned
- **[gtfs-analysis.md](docs/gtfs-analysis.md)** - BMTC GTFS data analysis (4,190 routes, 54,780 trips, 9,360 stops)
- **[api.md](docs/api.md)** - API reference for all 4 endpoints
- **[deploy.md](docs/deploy.md)** - Production deployment with Cloudflare Tunnel/Tailscale
- **[quickstart.md](docs/quickstart.md)** - Get running in <5 minutes

## Architecture

**Stack:**
- FastAPI (Python) - async API framework
- SQLite WAL - zero-config database
- uv - fast package manager
- Cloudflare Tunnel - zero-port ingress
- slowapi - rate limiting

**Learning Algorithm:**
- Welford online variance
- Exponential moving average (α=0.1)
- Schedule blend: w(n) = n/(n+20)
- Outlier rejection: |x-μ| > 3σ

## Getting Started

### Prerequisites
- Linux/macOS (or WSL)
- Python 3.9+
- [uv](https://github.com/astral-sh/uv) package manager

### Install uv
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Setup Backend
```bash
cd backend
uv sync
cp .env.example .env
# Generate API key
openssl rand -hex 32  # Copy to .env

# Place GTFS data
mkdir -p ../gtfs
cp /path/to/bmtc.zip ../gtfs/

# Bootstrap database
uv run python -m app.bootstrap

# Run server
uv run uvicorn app.main:app --reload
```

### Test
```bash
# Health check
curl http://127.0.0.1:8000/v1/health

# Config
curl http://127.0.0.1:8000/v1/config

# Run tests
cd backend
uv run pytest -v
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/ride_summary` | Upload ride segments for learning |
| GET | `/v1/eta` | Query learned ETA for a segment |
| GET | `/v1/config` | Server configuration |
| GET | `/v1/health` | Health check |

See [docs/api.md](docs/api.md) for full API reference.

## Data Source

BMTC GTFS data: [github.com/Vonter/bmtc-gtfs](https://github.com/Vonter/bmtc-gtfs)

**Dataset stats:**
- 4,190 routes
- 54,780 trips/day
- 9,360 stops
- 1.46M stop times
- Valid: 2025-09-02 to 2026-09-02

See [docs/gtfs-analysis.md](docs/gtfs-analysis.md) for detailed analysis.

## Deployment

Production deployment with Cloudflare Tunnel or Tailscale Funnel:

```bash
# See full guide in docs/deploy.md
curl -LsSf https://astral.sh/uv/install.sh | sh
cd backend
uv sync --frozen
uv run python -m app.bootstrap

# Install systemd services
sudo cp deploy/*.service /etc/systemd/system/
sudo systemctl enable --now bmtc-api

# Setup Cloudflare Tunnel
cloudflared tunnel create bmtc-api
# ... see docs/deploy.md for full steps
```

## Development

### Project Layout
```
backend/
├── app/                 # Application code
│   ├── main.py         # FastAPI entry point
│   ├── routes.py       # API endpoints
│   ├── models.py       # Pydantic models
│   ├── learning.py     # Learning algorithms
│   ├── gtfs_bootstrap.py  # GTFS parser
│   ├── db.py           # Database utils
│   ├── config.py       # Settings
│   └── auth.py         # Bearer token auth
├── tests/              # Unit + integration tests
├── scripts/            # Backup, restore, sample data
├── deploy/             # Systemd units
└── pyproject.toml      # Dependencies
```

### Testing
```bash
cd backend
uv run pytest -v                    # All tests
uv run pytest tests/test_learning.py  # Unit tests only
uv run pytest tests/test_integration.py  # Integration tests
```

### Generate Sample Data
```bash
cd backend
uv run python scripts/generate_sample_data.py
```

## License

MIT

## Contact

- GTFS Data: me@vonter.in
- Project Issues: [GitHub Issues](https://github.com/your-username/bmtc-transit-app/issues)

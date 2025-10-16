# Project Structure

This document describes the organization of the BMTC Transit App monorepo.

## Directory Layout

```
bmtc-transit-app/
├── backend/                  # FastAPI backend service
│   ├── app/                 # Application code
│   │   ├── main.py         # FastAPI entry point & lifespan
│   │   ├── routes.py       # API endpoint handlers
│   │   ├── models.py       # Pydantic request/response models
│   │   ├── learning.py     # Welford/EMA algorithms
│   │   ├── gtfs_bootstrap.py  # GTFS parser & seeding
│   │   ├── db.py           # SQLite connection & schema
│   │   ├── schema.sql      # Database schema (6 tables)
│   │   ├── config.py       # Settings from env vars
│   │   ├── auth.py         # Bearer token middleware
│   │   ├── bootstrap.py    # CLI bootstrap script
│   │   └── __init__.py
│   ├── tests/              # Test suite
│   │   ├── test_learning.py      # Unit tests for algorithms
│   │   ├── test_integration.py   # End-to-end API tests
│   │   └── __init__.py
│   ├── scripts/            # Operational scripts
│   │   ├── backup.sh              # SQLite backup + gzip
│   │   ├── restore.sh             # Restore from backup
│   │   └── generate_sample_data.py  # Synthetic test rides
│   ├── deploy/             # Deployment configs
│   │   ├── bmtc-api.service       # Main systemd unit
│   │   ├── bmtc-backup.{service,timer}    # Hourly backup
│   │   └── bmtc-retention.{service,timer} # Daily cleanup
│   ├── pyproject.toml      # uv/pip dependencies
│   ├── requirements.txt    # Backup dependency list
│   ├── pytest.ini          # Test configuration
│   ├── .env.example        # Environment template
│   ├── .env                # Local config (gitignored)
│   ├── .gitignore          # Backend-specific ignores
│   ├── .python-version     # Python 3.12
│   └── README.md           # Backend-specific docs
│
├── docs/                    # Shared documentation
│   ├── PLAN.md             # Execution plan & ADR
│   ├── gtfs-analysis.md    # BMTC GTFS data summary
│   ├── api.md              # API endpoint reference
│   ├── deploy.md           # Production deployment guide
│   ├── quickstart.md       # 5-minute getting started
│   └── PROJECT_STRUCTURE.md # This file
│
├── gtfs/                    # GTFS static data (shared)
│   └── bmtc.zip            # BMTC GTFS feed (41MB)
│
├── .gitignore              # Root-level ignores
└── README.md               # Project overview

```

## Key Design Decisions

### Monorepo Structure
- **backend/** is self-contained and can be deployed independently
- **docs/** are shared across components (future: mobile app, web dashboard)
- **gtfs/** is shared to avoid duplication if other components need GTFS

### Backend Organization
- **app/** follows FastAPI best practices (single router, dependency injection)
- **tests/** colocated with code for easy discovery
- **scripts/** for operational tasks (not part of runtime)
- **deploy/** for production systemd units

### Configuration Approach
- Environment variables via `.env` (dev) or `/etc/bmtc-api/env` (prod)
- Paths are relative to `backend/` directory in dev (`../gtfs`)
- Paths are absolute in production (`/var/lib/bmtc-api/gtfs`)

### Database Location
- Dev: `backend/bmtc_dev.db` (relative path)
- Prod: `/var/lib/bmtc-api/bmtc.db` (absolute path)

## File Counts

| Component | Files | LOC (approx) |
|-----------|-------|--------------|
| Backend app code | 10 | 1,200 |
| Backend tests | 2 | 200 |
| Scripts | 3 | 150 |
| Deployment configs | 5 | 100 |
| Documentation | 6 | 2,500 |
| **Total** | **26** | **4,150** |

## Dependencies

### Runtime (backend)
- fastapi==0.109.0 - Web framework
- uvicorn[standard]==0.27.0 - ASGI server
- pydantic==2.5.3 - Data validation
- pydantic-settings==2.1.0 - Config management
- slowapi==0.1.9 - Rate limiting
- python-multipart==0.0.6 - Form parsing

### Development
- pytest==7.4.3 - Testing framework
- httpx==0.25.2 - HTTP client for tests

### System
- uv - Fast package manager (installed globally)
- SQLite 3 - Embedded database (system package)
- Python 3.9+ - Runtime (3.12 recommended)

## Data Flow

```
[Client]
   ↓ POST /v1/ride_summary (with ride segments)
[FastAPI]
   ↓ Validate against GTFS segments
   ↓ Update Welford + EMA statistics
[SQLite]
   ↓ Store in ride_segments + update segment_stats
[Client]
   ← 200 {accepted: true, rejected_count: 0}

[Client]
   ↓ GET /v1/eta?route=104&from=STOP_A&to=STOP_B
[FastAPI]
   ↓ Query segment_stats for bin
   ↓ Compute blend: w·learned + (1-w)·schedule
   ↓ Compute P50/P90 from variance
[Client]
   ← 200 {mean_sec, p50_sec, p90_sec, sample_count, ...}
```

## Adding New Components

### Mobile App (Future)
```
bmtc-transit-app/
├── backend/        # Existing API
├── mobile/         # New: Flutter/React Native app
│   ├── lib/       # Dart source (Flutter)
│   ├── test/      # Mobile tests
│   └── README.md
├── docs/          # Shared docs
└── gtfs/          # Shared GTFS data
```

### Web Dashboard (Future)
```
bmtc-transit-app/
├── backend/       # API
├── dashboard/     # New: React/Svelte dashboard
│   ├── src/
│   ├── public/
│   └── README.md
├── docs/
└── gtfs/
```

## Build Commands

### Backend
```bash
cd backend
uv sync                         # Install deps
uv run python -m app.bootstrap  # Bootstrap DB
uv run uvicorn app.main:app     # Run server
uv run pytest                   # Run tests
```

### Documentation
- Markdown files in `docs/`
- No build step required
- View in any Markdown viewer or GitHub

## Deployment Paths

### Development
- Working dir: `backend/`
- DB: `backend/bmtc_dev.db`
- GTFS: `gtfs/bmtc.zip` (from `../gtfs`)
- Config: `backend/.env`

### Production
- Working dir: `/opt/bmtc-api`
- DB: `/var/lib/bmtc-api/bmtc.db`
- GTFS: `/var/lib/bmtc-api/gtfs/bmtc.zip`
- Config: `/etc/bmtc-api/env`
- User: `bmtc` (non-root)
- Service: `systemctl status bmtc-api`

## Git Workflow

```bash
# Typical workflow
cd bmtc-transit-app
git checkout -b feature/new-endpoint

# Work on backend
cd backend
# ... make changes ...
uv run pytest  # Ensure tests pass

# Commit
cd ..
git add backend/ docs/
git commit -m "Add new endpoint for route search"
git push origin feature/new-endpoint
```

## References

- [FastAPI Project Structure](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
- [uv Workspace Management](https://github.com/astral-sh/uv#workspaces)
- [SQLite Best Practices](https://www.sqlite.org/pragma.html)

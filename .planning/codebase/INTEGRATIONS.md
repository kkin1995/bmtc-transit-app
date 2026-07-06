# External Integrations

**Analysis Date:** 2026-07-01

## External APIs & Services

**Cloudflare Tunnel:**
- Purpose: Exposes the localhost API (`127.0.0.1:8000`) to the public internet without opening a firewall port
- Integration: Infrastructure-level (no SDK in code); p95 latency target < 200 ms for `GET /v1/eta`
- No Cloudflare API calls from application code

**No other third-party APIs are consumed.** The backend is intentionally self-contained.

## Data Sources

**GTFS Static Data:**
- Source: BMTC (Bengaluru Metropolitan Transport Corporation) official GTFS feed
- File: `gtfs/bmtc.zip` (checked into repo)
- Loader: `backend/app/gtfs_bootstrap.py` — parses and imports into SQLite (1.46M `stop_times` rows)
- Tables populated: `agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`, `gtfs_metadata`
- Production path: `/var/lib/bmtc-api/gtfs/bmtc.zip`
- Update mechanism: Manual re-bootstrap (no automated GTFS refresh integration)

**SQLite Database:**
- File: `/var/lib/bmtc-api/bmtc.db` (prod), `backend/bmtc_dev.db` (dev), `:memory:` (tests)
- WAL mode enabled for concurrent reads
- 11 tables, 3 views — schema at `backend/app/schema.sql`
- Client: Python stdlib `sqlite3` module directly (no ORM); `backend/app/db.py`

## Authentication & Security

**Bearer Token Auth:**
- Mechanism: Static API key via `Authorization: Bearer <token>` header
- Required on: `POST /v1/ride_summary` only; GET endpoints are open
- Implementation: `backend/app/auth.py` using FastAPI's `HTTPBearer` security scheme
- Key source: `BMTC_API_KEY` environment variable (loaded from `/etc/bmtc-api/env` in prod)

**Idempotency:**
- Mechanism: `Idempotency-Key` request header (UUID) with `body_sha256` fingerprint
- Storage: `idempotency_keys` table (24h TTL)
- Implementation: `backend/app/idempotency.py`
- Conflict response: HTTP 409 on body mismatch

**Optional HMAC Signing:**
- Config: `BMTC_HMAC_SECRET_KEY` env var (Optional[str], defaults to None)
- Not enforced by default; infrastructure for future request signing

**Rate Limiting:**
- Library: slowapi 0.1.9
- Default: 500 requests/hour per device bucket (`BMTC_RATE_LIMIT_PER_HOUR`)
- Toggle: `BMTC_RATE_LIMIT_ENABLED` (defaults to `true`)
- Implementation: `backend/app/rate_limit.py` + `RateLimitMiddleware` in `backend/app/main.py`

**Privacy:**
- `device_bucket` field is never exposed in API responses
- No PII logged; request payloads not logged at INFO level

## Monitoring & Observability

**Logging:**
- Framework: Python stdlib `logging` module
- Usage: `logger = logging.getLogger(__name__)` per module
- No structured logging library (no structlog, loguru, etc.)
- Production log sink: systemd journal (`journalctl -u bmtc-api`)

**Rejection Log:**
- Outlier/quality rejections written to `rejection_log` table in SQLite
- Retention: 30 days (`BMTC_REJECTION_LOG_RETENTION_DAYS`)
- Queryable via SQL: `SELECT reason, COUNT(*) FROM rejection_log GROUP BY reason`

**Health Endpoint:**
- `GET /v1/health` — returns uptime and server version; no external health check service

**No external monitoring integrations** (no Sentry, Datadog, Prometheus, OpenTelemetry, etc.).

## CI/CD & Deployment

**No CI pipeline detected** (no `.github/workflows/`, `.gitlab-ci.yml`, or equivalent).

**Deployment:** Manual — systemd service files in `backend/deploy/`; deployed to Linux host via documented steps in `docs/deploy.md`.

**Backups:**
- Script: `backend/scripts/backup.sh` — SQLite backup + gzip
- Schedule: hourly via `bmtc-backup.timer`
- Restore: `backend/scripts/restore.sh`

## Notable Absent Integrations

- **No message queue** (no Celery, Redis, RabbitMQ, Kafka) — all processing is synchronous in-request
- **No caching layer** (no Redis, Memcached) — settings cached via Python `lru_cache` only
- **No ORM** (no SQLAlchemy, Tortoise) — raw `sqlite3` stdlib throughout
- **No external auth provider** (no OAuth, Auth0, Firebase Auth) — static API key only
- **No APM/tracing** (no Sentry, OpenTelemetry, Datadog)
- **No CI/CD pipeline** — deployments are manual
- **No GTFS-RT** (real-time feed) — only static GTFS is used; live bus positions not integrated
- **No push notifications** — mobile app has no notification service (FCM/APNs) wired up
- **No analytics SDK** — no Mixpanel, Amplitude, Firebase Analytics in mobile

---

*Integration audit: 2026-07-01*

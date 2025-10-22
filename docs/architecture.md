````md
# BMTC Transit Backend — Architecture (v1)

**Goal:** A minimal, privacy-preserving ETA learning service for Bengaluru buses that you can self-host on a single VM and expose safely via **WireGuard** (for admin) and **Cloudflare Tunnel** (for public read APIs).

- **Tech:** FastAPI (Python), SQLite (WAL), `uv` package manager, systemd services
- **APIs:** `POST /v1/ride_summary` (auth + idempotent), `GET /v1/eta`, `GET /v1/config`, `GET /v1/health`
- **Privacy:** No PII, device tracking via salted client-side hash (`device_bucket`), anonymous GETs
- **Learning:** Welford (online mean/variance), EMA (half-life), schedule blending `w = n/(n+n0)`, outlier rejection

---

## 1) High-Level Overview

```mermaid
flowchart LR
    subgraph Client (Hobby cohort)
        A1[Mobile app / Browser]\n(collects ride summary\nclient-side; no raw GPS sent)
    end

    subgraph Public Edge
        CF[Cloudflare Tunnel]\nHTTPS → Wireguard exit
    end

    subgraph Host VM (Single box)
        WG[WireGuard]\n(admin-only VPN)
        SRV[FastAPI (Uvicorn)]
        DB[(SQLite WAL)\n/var/lib/bmtc-api/bmtc.db]
        BK[systemd timers\nbackup/retention]
        LOG[journald]
    end

    A1 -- GET /v1/eta | GET /v1/config | GET /v1/health --> CF --> SRV
    A1 -- POST /v1/ride_summary (Bearer + Idempotency) --> CF --> SRV
    SRV --- DB
    SRV --- LOG
    BK --- DB
    WG --- SRV
````

**Traffic paths**

* **Public read** (ETA/config/health) → Cloudflare Tunnel → FastAPI
* **Write** (ride submissions) → Cloudflare Tunnel → FastAPI (authN + idempotent)
* **Admin/SSH/DB access** → **WireGuard** only (no public ports)

---

## 2) Components

### 2.1 FastAPI Application

* **Entrypoint:** `backend/app/main.py` (lifespan: DB init, PRAGMAs, health state)
* **HTTP:** Uvicorn (async), JSON only
* **Routers:** `routes.py`
* **Models:** `models.py` (Pydantic)
* **Learning:** `learning.py` (Welford/EMA/outlier)
* **Storage:** `db.py` (SQLite conn + time-bin mapper)
* **Config:** `config.py` (env-backed)
* **Auth:** `auth.py` (Bearer on POST), `idempotency.py`

### 2.2 Database (SQLite, WAL)

* **Path (prod):** `/var/lib/bmtc-api/bmtc.db`
* **Schema:** `app/schema.sql`
* **Tables (key):** `segments`, `segment_stats`, `rides`, `ride_segments`, GTFS core (`stops`, `routes`, `trips`, `stop_times`, `calendar`, `gtfs_metadata`)
* **Ops tables:** `idempotency_keys`, `device_buckets`, `rejection_log`
* **Indices:** covering `(segment_id, bin_id, n, mean, m2, ema, schedule_mean, last_update)` for fast GETs

### 2.3 Background Ops (systemd)

* **Backup:** `bmtc-backup.timer` → gzip snapshot → `/var/backups/bmtc-api/`
* **Retention:** `bmtc-retention.timer` → prune `rejection_log` (30d), `idempotency_keys` (24h)
* **API:** `bmtc-api.service` (Uvicorn)

### 2.4 Edge & Access

* **Cloudflare Tunnel:** exposes `https://<subdomain>` → local `127.0.0.1:8000`
* **WireGuard:** admin VPN for SSH, journal logs, SQLite inspection; **no public inbound ports**

---

## 3) Request Lifecycle

### 3.1 `GET /v1/eta`

1. **Validate query** (`route_id`, `direction_id`, `from_stop_id`, `to_stop_id`, `when`=now default)
2. **Compute bin**: 192 slots (15-min × weekday/weekend)
3. **Fetch** `segment_stats[segment_id, bin_id]` (optional soft-blend with adjacent bins)
4. **Blend**: `w = n/(n+n0)` → `eta = w·learned + (1−w)·schedule`
5. **Return**: `eta_sec`, `p50/p90`, `n`, `blend_weight`, `schedule_sec`, `bin_window`, `low_confidence`, `cache_ttl_sec`

### 3.2 `POST /v1/ride_summary` (Bearer + Idempotency)

1. **AuthZ**: Bearer key → 401 if missing/invalid
2. **Idempotency**: `Idempotency-Key` required; check `(key, method, path, body_sha256)`:

   * same body → return stored result
   * different body → `409 conflict`
3. **Rate limit**: token bucket per `device_bucket` (fallback: client IP) → `429` on exceed
4. **Validate** segments: GTFS adjacency, duration bounds, `observed_at_utc` window (±7d), `mapmatch_conf ≥ threshold`
5. **Outliers**: reject if `|x−μ| > σ·k` (k=3) and `n > 5`
6. **Update** `segment_stats` (Welford/EMA) in a single transaction
7. **Return** ingest summary + rate-limit headers

---

## 4) Data Model (summary)

* **Segments:** unique `(route_id, direction_id, from_stop_id, to_stop_id)`
* **Time bins:** 192 (`0..191`): weekday(0)/weekend(1) × 96 slots (00:00..23:45)
* **Stats per (segment × bin):** `n, welford_mean, welford_m2, ema_mean, ema_var, schedule_mean, last_update`
* **Rides:** `rides`, `ride_segments` (retained ~90 days, configurable)
* **Ops tables:** `idempotency_keys`, `device_buckets`, `rejection_log`

**Indexes (minimum)**

* `segment_stats(segment_id, bin_id)` **PK**
* Covering index for GET: `(segment_id, bin_id, n, welford_mean, welford_m2, ema_mean, schedule_mean, last_update)`
* `segments(route_id, direction_id, from_stop_id, to_stop_id)` **UNIQUE** + lookup index
* `idempotency_keys(key)` **PK**
* `rejection_log(created_at)` for retention
* `ride_segments(segment_id)`, `ride_segments(observed_at_utc)`

---

## 5) Security & Privacy

* **No PII** by design. `device_bucket` is a **client-side salted hash** (stable per install), used only for rate limiting and abuse detection; never returned in GET.
* **Transport:** All public traffic via Cloudflare Tunnel (HTTPS). Admin over **WireGuard**. No open ports to WAN.
* **Logging:** Structured logs via journald; **do not** log request bodies at INFO. Avoid storing IP with ride payloads.
* **Retention:** `ride_segments` (90d), `rejection_log` (30d), `idempotency_keys` (24h); `segment_stats` is long-lived.
* **Keys:** `BMTC_API_KEY` rotated every 90 days; stored in `/etc/bmtc-api/env` with `0600` perms; service user `bmtc`.

---

## 6) Deployment Topology (single VM)

```
/opt/bmtc-api           # Code (git workspace; read-only to service)
 /backend
 /docs
/etc/bmtc-api/env       # .env (0600) — API key, DB/GTFS paths, tunables
/var/lib/bmtc-api       # Data
  bmtc.db               # SQLite DB (WAL mode)
  gtfs/bmtc.zip         # Static GTFS feed
/var/backups/bmtc-api   # Compressed backups (*.db.gz)
/var/log/journal        # journald logs
```

**Systemd services (examples)**

* `bmtc-api.service` → `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`
* `bmtc-backup.{service,timer}` → hourly gzip snapshots
* `bmtc-retention.{service,timer}` → daily TTL sweep

**Edge**

* Cloudflare Tunnel: `cloudflared` maps `https://api.example.com` → `http://127.0.0.1:8000`
* WireGuard: `wg0` for admin subnet (SSH, sqlite3, journalctl)

---

## 7) Configuration (env)

| Variable                     | Default (prod)                    | Notes             |
| ---------------------------- | --------------------------------- | ----------------- |
| `BMTC_DB_PATH`               | `/var/lib/bmtc-api/bmtc.db`       | SQLite file       |
| `BMTC_GTFS_PATH`             | `/var/lib/bmtc-api/gtfs/bmtc.zip` | Static feed       |
| `BMTC_API_KEY`               | *(required)*                      | Bearer for POST   |
| `BMTC_N0`                    | `20`                              | Blend denominator |
| `BMTC_EMA_ALPHA`             | `0.1`                             | EMA smoothing     |
| `BMTC_HALF_LIFE_DAYS`        | `30`                              | EMA time-decay    |
| `BMTC_OUTLIER_SIGMA`         | `3.0`                             | Outlier k-sigma   |
| `BMTC_MAPMATCH_MIN_CONF`     | `0.7`                             | Reject below      |
| `BMTC_MAX_SEGMENTS_PER_RIDE` | `50`                              | Validation        |
| `BMTC_RATE_LIMIT_PER_HOUR`   | `500`                             | per device_bucket |

---

## 8) Observability (minimal, no extra stack)

* **Health:** `GET /v1/health` returns `db_ok`, `uptime_sec`
* **Basic Metrics (log-derived / SQL queries):**

  * `accepted_segments_total`, `rejected_segments_total{reason}`
  * `idempotency_hits_total`
  * `learned_bins_nonzero_total`
  * Coverage: `% of queries with n ≥ 8`
* **Targets (SLO-ish):**

  * `GET /v1/eta` p95 < 200 ms over tunnel
  * POST success ≥ 99% (excluding client errors)
  * After 2 weeks with 5 users, ≥ 60% of queried segments have `n ≥ 8`

*(If needed later, add Prometheus text endpoint or lightweight stats in `/v1/health`.)*

---

## 9) Backup & Recovery

* **Hourly backup:** `sqlite3 .backup` → gzip to `/var/backups/bmtc-api/bmtc-YYYYMMDD-HHMM.db.gz`
* **Retention:** keep last 48; prune older
* **Recovery:**

  1. `systemctl stop bmtc-api`
  2. Decompress snapshot → `/var/lib/bmtc-api/bmtc.db`
  3. `PRAGMA integrity_check;`
  4. `systemctl start bmtc-api`

*(WAL mode allows hot backups, but prefer brief stop for simplicity.)*

---

## 10) Failure Modes & Safeguards

* **DB lock contention:** Single writer; batch all segment updates in one transaction per POST. Retries with backoff.
* **Bin boundary discontinuities:** Optional adjacent-bin soft blend at query time.
* **Data poisoning:** Outlier filter, `mapmatch_conf` threshold, per-device rate limit, per-segment×bin daily cap (optional).
* **Clock drift / timezone:** Enforce UTC ISO timestamps, reject future/older than 7d; consider monotonicity checks within a ride.
* **Duplicate submissions:** Idempotency table with `(key, method, path, body_sha256)`.

---

## 11) Development & Test

* **Package manager:** `uv`
* **Bootstrap:** `uv run python -m app.bootstrap` (from `backend/`)
* **Run:** `uv run uvicorn app.main:app --reload`
* **Tests:** `uv run pytest -v` (use `pytest-xdist`: `-n auto --dist loadfile` to isolate settings)
* **Local DB:** `:memory:` for unit tests; file DB for integration tests

---

## 12) Security Checklist (MVP)

* [ ] No public inbound ports; CF Tunnel + WG only
* [ ] Bearer auth on POST; unauthenticated GETs
* [ ] Require `Idempotency-Key` on POST
* [ ] Body hash stored with idempotency record; 409 on mismatch
* [ ] Request size limit (e.g., 256 KB)
* [ ] Per-device_bucket rate limiting + 429
* [ ] Log redaction; no payload at INFO
* [ ] Key rotation every 90 days; `.env` perms 0600
* [ ] Regular retention jobs enabled and monitored

---

## 13) Capacity Notes (single VM)

* **DB size:** ~0.5–1.0 GB post-bootstrap (BMTC 2025 feed), +10–20% transient WAL during writes
* **`segment_stats`:** ~3–5M rows (sparse)
* **QPS expectation:** hobby cohort O(0.1–1) POST/s, O(1–10) GET/s is comfortably within SQLite WAL limits
* **CPU/RAM:** 2 vCPU / 2–4 GB RAM is sufficient

---

## 14) Upgrade & GTFS Update

* **App deploy:** pull + restart `bmtc-api.service` (zero public downtime acceptable)
* **GTFS refresh:** replace `gtfs/bmtc.zip` → run `bootstrap` (off-hours). Keep old DB snapshot; re-seed `schedule_mean`; learned stats persist.

---

## 15) Appendix — Minimal systemd units (illustrative)

```ini
# /etc/systemd/system/bmtc-api.service
[Unit]
Description=BMTC Transit API
After=network.target

[Service]
User=bmtc
WorkingDirectory=/opt/bmtc-api/backend
EnvironmentFile=/etc/bmtc-api/env
ExecStart=/usr/bin/env sh -lc 'uv sync --frozen && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000'
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/bmtc-backup.service
[Unit]
Description=Backup BMTC SQLite DB

[Service]
Type=oneshot
User=bmtc
ExecStart=/usr/bin/env sh -lc 'mkdir -p /var/backups/bmtc-api && sqlite3 /var/lib/bmtc-api/bmtc.db ".backup /var/backups/bmtc-api/bmtc-$(date +%%Y%%m%%d-%%H%%M).db" && gzip -f /var/backups/bmtc-api/bmtc-*.db'
```

```ini
# /etc/systemd/system/bmtc-backup.timer
[Unit]
Description=Hourly BMTC backup

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/bmtc-retention.service
[Unit]
Description=Retention sweeps (rejections 30d, idempotency 24h)

[Service]
Type=oneshot
User=bmtc
ExecStart=/usr/bin/env sh -lc '
sqlite3 /var/lib/bmtc-api/bmtc.db "
DELETE FROM rejection_log WHERE created_at < datetime(\"now\",\"-30 days\");
DELETE FROM idempotency_keys WHERE created_at < datetime(\"now\",\"-1 day\");"
'
```

```ini
# /etc/systemd/system/bmtc-retention.timer
[Unit]
Description=Daily retention sweep

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

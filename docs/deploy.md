# Deployment Guide

## Prerequisites

- Ubuntu/Debian server (Oracle free tier, Hetzner, etc.)
- Python 3.9+
- BMTC GTFS zip file

## Setup

### 1. Create user and directories

```bash
sudo useradd -r -s /bin/bash -d /opt/bmtc-api bmtc
sudo mkdir -p /opt/bmtc-api /var/lib/bmtc-api/gtfs /var/lib/bmtc-api/backups /etc/bmtc-api
sudo chown -R bmtc:bmtc /opt/bmtc-api /var/lib/bmtc-api
```

### 2. Install uv and deploy code

```bash
# Install uv system-wide
curl -LsSf https://astral.sh/uv/install.sh | sh

# Deploy code
cd /opt/bmtc-api
sudo -u bmtc git clone <repo> .
sudo -u bmtc uv sync --frozen
```

### 3. Configure environment

```bash
sudo tee /etc/bmtc-api/env <<EOF
BMTC_API_KEY=$(openssl rand -hex 32)
BMTC_DB_PATH=/var/lib/bmtc-api/bmtc.db
BMTC_GTFS_PATH=/var/lib/bmtc-api/gtfs
BMTC_N0=20
BMTC_STALE_THRESHOLD_DAYS=90
BMTC_RETENTION_DAYS=90
BMTC_REJECTION_LOG_RETENTION_DAYS=30
BMTC_SERVER_VERSION=0.1.0
BMTC_BACKUP_DIR=/var/lib/bmtc-api/backups
EOF
sudo chmod 600 /etc/bmtc-api/env
```

### 4. Upload GTFS and bootstrap

```bash
sudo -u bmtc cp bmtc-gtfs.zip /var/lib/bmtc-api/gtfs/bmtc.zip
sudo -u bmtc bash -c 'cd /opt/bmtc-api && uv run python -m app.bootstrap'
```

### 5. Install systemd services

```bash
sudo cp deploy/bmtc-api.service /etc/systemd/system/
sudo cp deploy/bmtc-backup.{service,timer} /etc/systemd/system/
sudo cp deploy/bmtc-retention.{service,timer} /etc/systemd/system/
sudo cp deploy/bmtc-rate-limit-cleanup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bmtc-api
sudo systemctl enable --now bmtc-backup.timer
sudo systemctl enable --now bmtc-retention.timer
sudo systemctl enable --now bmtc-rate-limit-cleanup.timer
```

### 6. Verify

```bash
sudo systemctl status bmtc-api
curl http://localhost:8000/v1/health
```

---

## Cloudflare Tunnel

### Install cloudflared

```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Authenticate

```bash
cloudflared tunnel login
```

### Create tunnel

```bash
cloudflared tunnel create bmtc-api
```

Note the tunnel ID.

### Configure ingress

```bash
sudo tee /etc/cloudflared/config.yml <<EOF
tunnel: <TUNNEL_ID>
credentials-file: /home/bmtc/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: bmtc-api.yourdomain.com
    service: http://localhost:8000
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF
```

### Install and start

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Add DNS record

In Cloudflare dashboard, add CNAME:
- Name: `bmtc-api`
- Target: `<TUNNEL_ID>.cfargotunnel.com`

---

## Tailscale Funnel (Alternative)

### Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

### Enable Funnel

```bash
sudo tailscale funnel 8000
```

Access at: `https://<machine-name>.<tailnet>.ts.net/v1/health`

---

## Firewall

```bash
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow from <tailscale-ip> to any port 22
sudo ufw enable
```

---

## Monitoring

### Health check cron

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * curl -f http://localhost:8000/v1/health || echo 'API unhealthy' | mail -s 'BMTC API Alert' you@example.com") | crontab -
```

### Logs

```bash
sudo journalctl -u bmtc-api -f
```

---

## Backup Verification

```bash
# Test restore
sudo -u bmtc /opt/bmtc-api/scripts/restore.sh /var/lib/bmtc-api/backups/bmtc_latest.db.gz
```

---

## Upgrading an Existing Database

`apply_migrations.sh` brings an **existing, already-deployed** database up to date with new versioned SQL migrations added to `backend/app/migrations/`. It is a **manual, post-deploy step** — it is never invoked from `app.main`'s startup lifespan (D-04).

**Fresh install vs. upgrade — these are two distinct paths, do not conflate them:**

- **Fresh install:** `python -m app.bootstrap` loads the current `schema.sql` (already contains every schema change) and `init_db()` auto-seeds `schema_migrations` with every migration filename present in `backend/app/migrations/`, so nothing gets re-applied on first boot. Use this for a brand-new host (see Setup step 4 above).
- **Upgrade (existing DB):** After a code deploy that adds a new migration file to `backend/app/migrations/`, run `apply_migrations.sh` manually to apply only the migrations missing from that DB's `schema_migrations` table. Do NOT run `python -m app.bootstrap` against an existing DB to "upgrade" it — bootstrap does not apply migrations, it only loads `schema.sql` once.

**Invocation:**

```bash
sudo -u bmtc bash -c 'cd /opt/bmtc-api && BMTC_DB_PATH=/var/lib/bmtc-api/bmtc.db scripts/apply_migrations.sh'
```

The script is idempotent — re-running it after all pending migrations are applied is a no-op (`Applied 0 migration(s).`).

---

## Refreshing GTFS Data

`update_gtfs.sh` replaces the static GTFS feed (routes/stops/trips/stop_times/etc.) with a newer operator-supplied zip, without losing any learned Welford statistics (`segment_stats.welford_mean`/`n`/`m2`) or ride history (D-12).

**Invocation:**

```bash
sudo -u bmtc bash -c 'cd /opt/bmtc-api && scripts/update_gtfs.sh /path/to/new-gtfs.zip'
```

**What it does:**

1. Validates the new zip is present and well-formed before touching anything (fails closed, no side effects on bad input).
2. Stops `bmtc-api` — see "Granting the bmtc user service-control permission" below; this step requires elevated privilege.
3. Takes a pre-refresh backup (reuses `backup.sh` verbatim). Taken *after* the stop so the backup always reflects the exact state a rollback resumes from — no ride submitted between backup and stop can be silently lost on rollback.
4. Clears the 7 GTFS-source tables only (`agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`, `gtfs_metadata`). `segments`, `segment_stats`, `rides`, and `ride_segments` — the learning history — are never touched.
5. Re-runs `python -m app.bootstrap` against the new zip.
6. Validates row counts on the 7 GTFS tables (fails if a table goes to zero, or changes by more than 50% either direction).
7. On success, restarts `bmtc-api`. On any failure at steps 3-6 — including unanticipated ones, via a global error trap, not just the explicit checks — automatically restores the pre-refresh backup from step 3, restarts `bmtc-api` from the restored DB, and exits non-zero.

**Expect a ~30-60 second outage** of `bmtc-api` during the stop -> backup -> clear -> re-bootstrap -> restart window (steps 2-7). Schedule refreshes during low-traffic periods.

Segment-level learning history (`welford_mean`, `n`, `m2` per segment×bin) is preserved byte-identically across a refresh — only `schedule_mean` is recomputed from the new GTFS schedule.

---

## Granting the bmtc User Service-Control Permission

`update_gtfs.sh` (and `restore.sh`) call `systemctl stop bmtc-api` / `systemctl start bmtc-api`. The `bmtc` system user (Setup step 1) has no default permission to control systemd units it doesn't own, so one of the following must be configured on the target host **before the first production run of `update_gtfs.sh`**:

**Option A — scoped sudoers drop-in (recommended):**

Create `/etc/sudoers.d/bmtc-gtfs-update` containing exactly:

```
bmtc ALL=(root) NOPASSWD: /usr/bin/systemctl stop bmtc-api, /usr/bin/systemctl start bmtc-api
```

Validate the syntax before relying on it:

```bash
sudo visudo -c
```

**Important:** each command+argument pair must be listed explicitly — sudoers does not glob `systemctl * bmtc-api`. Do NOT use a wildcard rule such as `systemctl *`; that would let a compromised `bmtc` account control or stop arbitrary system services (least-privilege).

**Option B — run as root:**

Skip the sudoers drop-in and invoke `update_gtfs.sh` directly as root instead of as the `bmtc` user:

```bash
sudo bash /opt/bmtc-api/scripts/update_gtfs.sh /path/to/new-gtfs.zip
```

Either option is acceptable — pick whichever matches the target host's existing privilege-delegation convention. Before the first production run, also confirm no broader pre-existing sudoers rule (e.g. `systemctl *`) already over-grants the `bmtc` user.

---

## Secret Rotation

Generate new API key monthly:

```bash
NEW_KEY=$(openssl rand -hex 32)
sudo sed -i "s/BMTC_API_KEY=.*/BMTC_API_KEY=$NEW_KEY/" /etc/bmtc-api/env
sudo systemctl restart bmtc-api
# Update client with $NEW_KEY
```

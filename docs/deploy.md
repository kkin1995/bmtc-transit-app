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
BMTC_EMA_ALPHA=0.1
BMTC_HALF_LIFE_DAYS=30
BMTC_STALE_THRESHOLD_DAYS=90
BMTC_RETENTION_DAYS=90
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
sudo systemctl daemon-reload
sudo systemctl enable --now bmtc-api
sudo systemctl enable --now bmtc-backup.timer
sudo systemctl enable --now bmtc-retention.timer
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

## Secret Rotation

Generate new API key monthly:

```bash
NEW_KEY=$(openssl rand -hex 32)
sudo sed -i "s/BMTC_API_KEY=.*/BMTC_API_KEY=$NEW_KEY/" /etc/bmtc-api/env
sudo systemctl restart bmtc-api
# Update client with $NEW_KEY
```

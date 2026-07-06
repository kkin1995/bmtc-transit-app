---
created: 2026-07-04T04:07:40Z
title: Confirm bmtc sudoers drop-in before first production update_gtfs.sh run
area: deploy
files:
  - docs/deploy.md
  - backend/scripts/update_gtfs.sh
---

## Problem

Phase 4 plan 04-05 documented a scoped `/etc/sudoers.d/bmtc-gtfs-update` drop-in (NOPASSWD for exactly `systemctl stop bmtc-api` and `systemctl start bmtc-api`) that `update_gtfs.sh` depends on for its stop/start service-control calls. This is a production-host prerequisite that cannot be verified from the repo. The operator deferred confirmation on 2026-07-04 because the target host isn't provisioned yet.

## Solution

Before the first real (non-dry-run) `update_gtfs.sh` run against production, either (a) confirm `/etc/sudoers.d/bmtc-gtfs-update` exists and is scoped to exactly the two commands via `sudo -l -U bmtc` + `sudo visudo -c`, with no broader `systemctl *` rule; or (b) accept the documented fallback of running `update_gtfs.sh` as root directly. See `docs/deploy.md` "Granting the bmtc user service-control permission" section for exact steps.

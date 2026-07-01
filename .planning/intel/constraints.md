# Constraints (from SPECs)

Synthesized from classified SPEC sources. One entry per constraint; provenance preserved.
Precedence tier: SPEC (below ADR, above PRD/DOC per default `["ADR","SPEC","PRD","DOC"]`).

---

## API Reference v1 — `docs/api.md`

- **Source:** `docs/api.md` | Type: api-contract | Confidence: high
- **Status:** Current/canonical per project convention (`CLAUDE.md`: "docs/api.md is the canonical API specification"). Versioned internally to v1.2 (changelog embedded); this is the **most current** field-name ground truth among the docs corpus and matches `backend/app/models.py` exactly.

**Key contracts:**
- Auth: only `POST /v1/ride_summary` requires `Authorization: Bearer <API_KEY>`; all GETs unauthenticated.
- Idempotency: `Idempotency-Key: <UUIDv4>` required on POST; server stores `(key, method, path, body_sha256, status_code)`; same body → replay; different body → 409; 24h TTL.
- Rate limiting: 500 req/hour per `device_bucket` (IP fallback); headers `X-RateLimit-{Limit,Remaining,Reset}` on POST only; 429 on exceed.
- Error model: 7 canonical codes (`invalid_request` 400, `unauthorized` 401, `not_found` 404, `conflict` 409, `unprocessable` 422, `rate_limited` 429, `server_error` 500), all responses `{error, message, details}`.
- `POST /v1/ride_summary` request: `device_bucket` top-level (not in segments); segments use `observed_at_utc` (ISO-8601 string, primary) with `timestamp_utc` (deprecated, epoch int) as fallback; `mapmatch_conf` 0.0–1.0 default-reject below `config.mapmatch_min_conf` (0.7); max 50 segments; `duration_sec` in (0, 7200].
- `POST /v1/ride_summary` response: `{accepted_segments: int, rejected_segments: int, rejected_by_reason: dict}`.
- `GET /v1/eta` response (current, v1.1+ structure): nested `segment{}`, `scheduled{duration_sec, service_id, source}`, `prediction{predicted_duration_sec, p50_sec, p90_sec, confidence, blend_weight, samples_used, bin_id, last_updated, model_version}`. Old flat format (`eta_sec`, `n`, `schedule_sec`, `low_confidence`, etc.) deprecated but still supported for backward compatibility.
- Confidence levels: `high` (n≥8), `medium` (3≤n<8), `low` (n<3). Low confidence uses wider P90 margin (`mean + 1.5σ` vs `mean + 1.28σ`).
- Discovery endpoints (v1.1/v1.2 additions): `GET /v1/stops` (bbox/route_id filter + pagination), `GET /v1/routes` (stop_id/route_type filter + pagination), `GET /v1/routes/search` (normalized substring match), `GET /v1/stops/{stop_id}/schedule`.
- Retention: `ride_segments` 90d, `rejection_log` 30d, `idempotency_keys` 24h, `segment_stats` long-lived.
- Validation defaults: `max_segments_per_ride=50`, `rate_limit_per_hour=500`, `mapmatch_min_conf=0.7`, `outlier_sigma=3.0` (reject `n>5` and `|x−μ|>3σ`), `n0=20`, `half_life_days=30`.

---

## Architecture Spec v1 — `docs/architecture.md`

- **Source:** `docs/architecture.md` | Type: nfr/protocol | Confidence: high

**Key contracts:**
- Deployment topology: single VM, FastAPI/Uvicorn bound to `127.0.0.1:8000`, Cloudflare Tunnel for public read/write traffic, WireGuard for admin-only access (no public inbound ports).
- Data model: `segments` unique on `(route_id, direction_id, from_stop_id, to_stop_id)`; 192 time bins; stats per segment×bin (`n, welford_mean, welford_m2, ema_mean, ema_var, schedule_mean, last_update`).
- Concurrency: single writer; batch all segment updates in one transaction per POST.
- Security checklist: no public inbound ports; Bearer auth on POST; required Idempotency-Key; body-hash stored, 409 on mismatch; request size limit (256 KB); per-device_bucket rate limiting; no INFO-level payload logging; key rotation every 90 days; `.env` perms 0600.
- Retention: same windows as api.md (`ride_segments` 90d, `rejection_log` 30d, `idempotency_keys` 24h).
- SLO targets: `GET /v1/eta` p95 < 200ms over tunnel; POST success ≥99% (excl. client errors); after 2 weeks/5 users, ≥60% of queried segments have n≥8.
- Test command referenced: `uv run pytest -v` with `pytest-xdist` note (`-n auto --dist loadfile`) — consistent with current test-isolation state (47 tests), not the PRD's pre-fix 33-test state.

**⚠ Note — internal drift within this SPEC file:** §3.1 (`GET /v1/eta` request lifecycle, step 5) and §7 describe the response as the OLD flat shape (`eta_sec`, `p50/p90`, `n`, `blend_weight`, `schedule_sec`, `bin_window`, `low_confidence`, `cache_ttl_sec`) while `docs/api.md` (also SPEC, more current per its own internal changelog to v1.2) has since restructured this into nested `scheduled{}`/`prediction{}` objects and the implementation (`ETAResponseV11` in `models.py`) matches `api.md`, not `architecture.md`. Both files are classified SPEC (same precedence tier) — flagged as a same-tier conflict requiring a WARNING rather than silent resolution. See conflicts report.

---

## Database Implementation Notes — `docs/DB_NOTES.md`

- **Source:** `docs/DB_NOTES.md` | Type: schema | Confidence: medium

**Key contracts (matches current implementation exactly, verified against `backend/app/schema.sql:248-254`):**
- `rate_limit_buckets` table: `bucket_id TEXT PRIMARY KEY`, `tokens INTEGER NOT NULL CHECK(tokens >= -1 AND tokens <= 500)`, `last_refill TEXT NOT NULL CHECK(length(last_refill) >= 19)`, `STRICT` mode.
  - **Note:** actual schema allows `tokens = -1` as an "exhausted" sentinel (not documented in DB_NOTES.md's constraint description, which states range `0..500`) — minor doc/implementation drift, not conflicting with another classified doc, informational only.
- Atomic check-and-spend pattern: single `UPDATE ... WHERE bucket_id = ? AND tokens > 0`; 0 rows affected → 429.
- Refill: binary reset (full 500) when ≥3600s elapsed since `last_refill`; gradual refill documented as a "Future Enhancement," not current behavior.
- Cleanup: daily job deletes buckets with `last_refill` >24h stale; script exists at `backend/scripts/rate_limit_cleanup.sh` but (per `CONCERNS.md`) is **not wired to any systemd timer**.

**⚠ Conflict: column names differ from `device-bucket-rate-limit` PRD.** PRD's FR-1 specifies `quota_remaining INT`, `reset_utc INT`; actual/SPEC schema uses `tokens INTEGER`, `last_refill TEXT`. Same underlying token-bucket semantics, different column contract — the PRD does not describe the schema that was actually implemented. See conflicts report.

---

## GTFS Database Schema Documentation — `docs/gtfs-database.md`

- **Source:** `docs/gtfs-database.md` | Type: schema | Confidence: medium

**Key contracts:**
- Unified SQLite DB combining GTFS static data + learning data + time-binned predictions.
- Row-count reference (BMTC 2025-09-02 feed): `routes` 4,190, `stops` 9,360, `trips` 54,780, `stop_times` 1,462,417, `segments` ~110,000, `segment_stats` ~3–5M (sparse), `time_bins` 192.
- Table schemas for GTFS core tables (`agency`, `routes` with `idx_routes_short_name`, etc.) — no contradictions found against other classified sources; consistent with `architecture.md` and `api.md`.

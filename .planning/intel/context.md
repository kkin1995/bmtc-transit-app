# Context Notes (from DOCs)

Synthesized from classified DOC sources. Running notes keyed by topic, appended verbatim (paraphrased) with source attribution.
Precedence tier: DOC (lowest, per default `["ADR","SPEC","PRD","DOC"]`) — informational only, never overrides ADR/SPEC/PRD content.

---

## Topic: Security Review Findings (v0.2.0)

- **Source:** `docs/SECURITY_REVIEW/2025-10-22_v0.2.0-stride-review.md`
- STRIDE-lite audit, overall risk MEDIUM (3 HIGH, 5 MEDIUM, 2 LOW findings).
- 3 HIGH findings at review time: (1) body hash verification missing for idempotency conflicts (Tampering), (2) rate limiting disabled by default (DoS), (3) IP address logging in rate-limit fallback (Information Disclosure).
- Per `CONCERNS.md` (codebase intel, not part of this ingest batch): H1 (body hash) and H3 (no IP persistence) are noted as addressed in code; H2 (rate limiting disabled by default) remains open — consistent with the `device-bucket-rate-limit` PRD's unimplemented `BMTC_RATE_LIMIT_ENABLED` flag (see requirements.md). This is reinforcing evidence, not a conflict.

## Topic: API v1 Alignment History (superseded intermediate state)

- **Sources:** `docs/ALIGNMENT_STATUS.md`, `docs/ALIGNMENT_SUMMARY.md`
- Both documents record a 2025-10-22 change-log: backend was aligned to an intermediate "v1.0.0" contract — `device_bucket` moved to top-level, `timestamp_utc` (epoch) → `observed_at_utc` (ISO-8601), POST response `accepted`+`rejected_count` → `accepted_segments`+`rejected_segments`, GET /eta response `mean_sec`/`sample_count`/`low_n_warning` → `eta_sec`/`n`/`low_confidence` (flat shape, plus new `bin_id`, `schedule_sec` fields).
- **This flat GET /eta shape is itself now historical.** Current `docs/api.md` (v1.1+) and current `backend/app/models.py` (`ETAResponseV11`) have since restructured the response into nested `segment{}`/`scheduled{}`/`prediction{}` objects, keeping the flat fields only as deprecated backward-compatible duplicates. Both ALIGNMENT_* docs describe a real, already-superseded step in the API's evolution — useful project history, not a live contract. No downstream action needed beyond awareness that these are historical, not current.

## Topic: Changelog / Version History

- **Source:** `docs/CHANGELOG.md`
- v1.0.0 (2025-10-22): API v1 baseline — Bearer auth, Idempotency-Key (24h TTL), 500/hour rate limit per device_bucket, 7 error codes.
- v1.1 (2025-11-18): GTFS alignment pass — added `GET /v1/stops`, `GET /v1/routes`, `GET /v1/stops/{stop_id}/schedule`; restructured `GET /v1/eta` response into `segment`/`scheduled`/`prediction` objects (backward compatible).
- v1.2 (2026-02-16): Added `GET /v1/routes/search` with normalized substring matching (handles hyphenated route names like "335-E").
- Unreleased: mobile app routes-tab limit increased 50 → 1000.

## Topic: Deployment Runbook

- **Source:** `docs/deploy.md`
- Step-by-step production deployment: server setup, systemd services (`bmtc-api.service`, backup/retention timers), Cloudflare Tunnel configuration. No contradictions found against `architecture.md` (SPEC) — consistent topology description.

## Topic: Quick Start Guide

- **Source:** `docs/quickstart.md`
- Local dev setup: install → GTFS bootstrap → run server → test. References `scripts/generate_sample_data.py`. No contradictions found.

## Topic: Project Structure

- **Source:** `docs/PROJECT_STRUCTURE.md`
- Monorepo layout description (`backend/`, `mobile/`, `docs/`, `gtfs/`), file counts, build/deploy commands. Descriptive only; consistent with `CLAUDE.md` and `.claude/CLAUDE.md` directory structure sections already in project instructions.

## Topic: GTFS Data Analysis

- **Source:** `docs/gtfs-analysis.md`
- Analysis of the BMTC community GTFS dataset (routes, stops, trip stats, peak hours) and bootstrap implications for the learning DB. Cross-refs external sources (Vonter's community GTFS repo, GTFS spec, official BMTC site). No contradictions found against `gtfs-database.md` (SPEC) row-count figures.

## Topic: Operational Metrics Runbook

- **Source:** `docs/ops-metrics.md`
- SQL query cookbook for production health monitoring: recent learning activity, rate-limit bucket state, idempotency key volume, rejection-log breakdowns, device-bucket activity. Consistent with `architecture.md`'s "Observability" section (log-derived metrics, no dedicated metrics stack yet) — reinforces the OPS-04 gap already tracked in `.planning/REQUIREMENTS.md`.

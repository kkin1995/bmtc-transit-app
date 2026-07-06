# Doc Ingest Synthesis Summary

**Mode:** merge
**Precedence:** ADR > SPEC > PRD > DOC (default; no per-doc overrides present in this batch)
**Synthesized:** 17 classified documents (0 UNKNOWN, 0 excluded due to cycles)

---

## Doc Counts by Type

| Type | Count | Sources |
|------|-------|---------|
| ADR  | 1 | docs/PLAN.md (embeds ADR-0001 + ADR-0002, both `locked: true`) |
| SPEC | 4 | docs/api.md, docs/architecture.md, docs/DB_NOTES.md, docs/gtfs-database.md |
| PRD  | 3 | docs/prd/api-docs-v1-refresh.md, docs/prd/device-bucket-rate-limit.md, docs/prd/test-isolation-xdist.md |
| DOC  | 9 | docs/SECURITY_REVIEW/2025-10-22_v0.2.0-stride-review.md, docs/ALIGNMENT_STATUS.md, docs/ALIGNMENT_SUMMARY.md, docs/CHANGELOG.md, docs/deploy.md, docs/gtfs-analysis.md, docs/ops-metrics.md, docs/PROJECT_STRUCTURE.md, docs/quickstart.md |

## Cross-Reference Graph

9 edges found among classified docs (e.g., ALIGNMENT_STATUS.md → api.md, PLAN.md → api.md/deploy.md). **No cycles detected** (DFS three-color, full graph traversed, well under the 50-depth cap). All 17 docs were eligible for synthesis.

## Decisions Locked

2 ADRs, both `locked: true`, both embedded in `docs/PLAN.md`:
- **ADR-0001** — Stack & architecture (FastAPI, SQLite WAL, Welford, EMA, 192 time bins, Cloudflare Tunnel, Bearer auth, blend formula `w=n/(n+20)`, outlier threshold 3σ/n>5).
- **ADR-0002** — Global aggregation design (SHA256 device buckets, 24h idempotency TTL, 0.7 map-match confidence threshold, 30d rejection-log retention, configurable outlier sigma, 50-segment ride cap).

Full text: `.planning/intel/decisions.md`

## Requirements Extracted

3 PRDs, ~20 individual requirement entries (IDs prefixed `REQ-api-docs-*`, `REQ-ratelimit-*`, `REQ-test-isolation-*`). None of the three PRDs are yet reflected in `.planning/REQUIREMENTS.md`'s active v1 roadmap (BUGFIX/LEARN/API/DATA/OPS series) — they represent a **separate, not-yet-triaged** requirement stream from prior work sessions.

Full text: `.planning/intel/requirements.md`

## Constraints

4 SPECs extracted: 1 api-contract (docs/api.md — canonical, current, v1.2), 1 nfr/protocol (docs/architecture.md — internally drifted on GET /v1/eta shape, see conflicts), 2 schema (docs/DB_NOTES.md, docs/gtfs-database.md).

Full text: `.planning/intel/constraints.md`

## Context Topics

7 DOC-derived topics: security review findings, API alignment history (superseded intermediate state), changelog/version history, deployment runbook, quickstart guide, project structure, GTFS data analysis, operational metrics runbook.

Full text: `.planning/intel/context.md`

## Conflicts

**1 BLOCKER, 2 WARNINGS, 3 INFO.**

- BLOCKER: LOCKED ADR (docs/PLAN.md) field-name contract (`accepted`/`rejected_count`/`timestamp_utc`) contradicts current SPEC (docs/api.md) and implementation (`accepted_segments`/`rejected_segments`/`observed_at_utc`). Cannot auto-resolve per precedence rules — LOCKED status blocks silent override.
- WARNING: docs/architecture.md and docs/api.md (both SPEC, same precedence tier) disagree on the GET /v1/eta response shape (flat vs. nested).
- WARNING: device-bucket-rate-limit PRD's proposed `rate_limit_buckets` schema (`quota_remaining`/`reset_utc`) conflicts with the already-implemented schema (`tokens`/`last_refill`) documented in DB_NOTES.md (SPEC).
- INFO ×3: api-docs-v1-refresh PRD's acceptance criteria target an already-superseded intermediate API shape; test-isolation-xdist PRD's problem statement is already fixed in the current codebase (47/47 tests, not 33); no LOCKED-decision conflicts found against existing `.planning/` merge-mode context.

Full text: `.planning/INGEST-CONFLICTS.md`

---

**Downstream:** `gsd-roadmapper` should read this file first, then `.planning/intel/{decisions,requirements,constraints,context}.md`, then resolve the BLOCKER and WARNINGs in `.planning/INGEST-CONFLICTS.md` before writing PROJECT.md/REQUIREMENTS.md/ROADMAP.md updates. The BLOCKER gates the workflow per the doc-conflict-engine safety gate — no destination files should be written until it is resolved.

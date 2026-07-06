---
phase: 03
slug: api-surface-completion
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-03
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → API (path param) | `stop_id` (GET /v1/stops/{stop_id}) and `route_id` (GET /v1/routes/{route_id}) are untrusted client input crossing into SQL queries | GTFS identifiers (strings) |
| client → API (query params) | `lat`, `lon`, `radius_m`, `bbox` (GET /v1/stops) are untrusted client input controlling a DB query and a computed Haversine scan | Coordinates / distance (floats, ints) |
| client → API (query params, resolved) | `route_id`/`from_stop_id`/`to_stop_id` already validated/resolved by `get_eta` before the segment-enrichment JOIN runs; enrichment introduces no new client input | Internal `segment_id` (int) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering | `stop_id` path param in `get_stop_detail` (routes.py:720) | high | mitigate | Parameterized `?` query (`WHERE stop_id = ?`) — `stop_id` never interpolated into SQL text. Verified: routes.py:727-729. | closed |
| T-03-02 | Information Disclosure | routes-serving-a-stop response (`get_stop_detail`) | low | accept | Response exposes only public GTFS route metadata already public via `GET /v1/routes`; no trip_ids or schedule internals (D-07 scope). | closed |
| T-03-03 | Tampering | `route_id` path param in `get_route_detail` (routes.py:1111) | high | mitigate | Parameterized `?` queries throughout (route lookup, representative-shape query, stop_times join). Verified: routes.py:1111 handler body. | closed |
| T-03-04 | Information Disclosure | route-detail response scope (`get_route_detail`) | low | accept | D-01 deliberately narrows the response to stops-only — no trip_ids or schedule times exposed; scope-minimization is itself the control. | closed |
| T-03-05 | Denial of Service | unbounded radius search full-table Haversine scan (`get_stops`) | medium | mitigate | `MAX_RADIUS_M` cap (2000m) bounds the bounding-box candidate set before the Haversine second pass. Verified: routes.py:47-54 (D-15 cap check), routes.py:522-527 (`bounding_box`). | closed |
| T-03-06 | Tampering | `lat`/`lon`/`radius_m`/`bbox` values used in the `BETWEEN` query (`get_stops`) | high | mitigate | Values are parameterized `?` placeholders and range/type-validated before use (D-16/D-17); never interpolated into SQL text. Verified: routes.py:111-114, :86-87. | closed |
| T-03-07 | Tampering | validation returning wrong status/shape (422 vs 400) (`get_stops`) | medium | mitigate | `lat`/`lon`/`radius_m` declared as unconstrained `Query(None)` (no `ge`/`le`); manual validation returns `JSONResponse(400, {"error": "invalid_request", ...})` in the canonical envelope. Verified: routes.py:538-542 (no declarative bounds), routes.py:11-54 (manual validation chain). | closed |
| T-03-08 | Tampering | enrichment JOIN on `segment_id` (`get_eta`) | high | mitigate | `segment_id` is derived from an already-resolved `segments` row and passed as a parameterized `?`; no raw client string enters SQL text. Verified: routes.py:307-321. | closed |
| T-03-09 | Denial of Service / data-integrity | orphaned reference causing 500 (`get_eta` enrichment) | low | mitigate | `LEFT JOIN` (never `INNER JOIN`) + `Optional[str] = None` fields on `SegmentInfo` null the missing value and return 200. Verified: routes.py:316-318 (3× `LEFT JOIN`), models.py:280-282 (`Optional[str] = None`). | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-03-01 | T-03-02 | `get_stop_detail`'s routes array exposes only GTFS route metadata already public via `GET /v1/routes` (route_id, short/long name, type, agency) — no trip-level or schedule data. Accepted at plan time (03-01-PLAN.md threat model). | plan author (03-01-PLAN.md) | 2026-07-03 |
| R-03-02 | T-03-04 | `get_route_detail` is deliberately scoped to stops-only per D-01 — the scope-minimization itself is the control against further disclosure. Accepted at plan time (03-02-PLAN.md threat model). | plan author (03-02-PLAN.md) | 2026-07-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-03 | 9 | 9 | 0 | /gsd-secure-phase (L1 grep-depth verification, ASVS L1, block_on: high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-03

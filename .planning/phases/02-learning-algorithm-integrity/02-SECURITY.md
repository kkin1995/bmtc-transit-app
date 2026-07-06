---
phase: 02
slug: learning-algorithm-integrity
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-02
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| (none new) | Plan 01 touches a pure in-process function (`compute_variance`) with no I/O and no external input | none |
| client → API (ride ingest) | Plan 02's seed-row path in `update_segment_stats`; `segment_id`/`bin_id` are server-derived, not client-controlled | duration_sec, mapmatch_conf (already validated upstream) |
| client → GET /v1/config | Plan 03's soft-deprecation of `ema_alpha`/`half_life_days`; unauthenticated public read, schema stays backward-compatible | server config values |
| client → POST /v1/ride_summary | Plan 04's single-commit consolidation; untrusted multi-segment payload inside one SQLite write transaction | ride segments (commit boundary is internal consistency, not new external exposure) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-2-01 | (n/a) | `compute_variance` divisor change (Plan 01) | low | accept | Pure arithmetic change; no auth/access-control/input-validation/crypto surface touched. `n<2` guard regression-locked by `test_compute_variance_guards_n_less_than_2` | closed |
| T-2-02 | Denial of Service | Seed-row creation in `update_segment_stats` (Plan 02, BUGFIX-04) | low | accept | `bin_id` is server-computed via `compute_bin_id()` (bounded 0-191); `segment_id` validated against `segments` table before `update_segment_stats` runs (routes.py:151-156). Seed path bounded to at most 192 rows per legitimate segment — not a new unbounded write. Verified by `test_update_segment_stats_seeds_new_bin_and_accepts` | closed |
| T-2-03 | Tampering | EMA dead-code deletion (Plan 02, LEARN-01) | low | accept | Pure removal of unreferenced functions; grep confirmed zero callers outside `update_segment_stats`. No consumer-visible behavior removed (`ema_mean`/`ema_var` columns retained inert) | closed |
| T-2-04 | Information Disclosure | `GET /v1/config` field removal (Plan 03, LEARN-01) | low | accept | No secret exposed or removed — fields become `null`. Grep confirmed zero mobile-client readers of these fields. Soft-deprecate (present-but-null) is strictly more backward-compatible than removal | closed |
| T-2-05 | Denial of Service | `AttributeError` 500 on `GET /v1/config` if config field deletion lands without response-model soft-deprecation (Plan 03) | low | mitigate | Enforced by same-commit sequencing (D-04 + D-14 landed in one commit, per plan's critical_note #1); `get_config` passes hardcoded `None`, never reads the deleted `Settings` attributes. Verified by `test_config_endpoint` and `test_get_config_has_all_spec_fields`/`test_get_config_values_are_reasonable` (all passing per 02-03-SUMMARY.md D1) | closed |
| T-2-06 | Tampering / Repudiation | Multi-commit-per-ride partial-write on mid-ride failure (Plan 04, BUGFIX-06) | low | mitigate | Consolidating to a single outer `conn.commit()` is strictly safer than the prior per-segment commits: on a mid-loop exception, SQLite now rolls back the entire uncommitted transaction instead of leaving a partial write. Verified by `test_ride_with_50_segments_commits_exactly_once` (exactly 1 commit for a 50-segment ride, passing per 02-04-SUMMARY.md D1) and `grep -c 'conn.commit()' backend/app/learning.py` returning 0 (D3) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-2-01 | T-2-01 | Pure arithmetic divisor change (`m2/n` → `m2/(n-1)`) with no I/O or external input; RESEARCH.md's ASVS L1 security domain scan found no applicable category | Plan 01 (RESEARCH.md Security Domain) | 2026-07-02 |
| R-2-02 | T-2-02 | Seed-row writes are bounded by existing bin cardinality (0-191) and gated by pre-existing `segment_id` validation; not a new unbounded write surface | Plan 02 (RESEARCH.md Security Domain) | 2026-07-02 |
| R-2-03 | T-2-03 | Deleting unreferenced dead code (`update_ema`, `compute_time_based_alpha`, `is_stale`) with zero remaining callers confirmed via grep; no external contract depends on these functions | Plan 02 (RESEARCH.md Security Domain) | 2026-07-02 |
| R-2-04 | T-2-04 | Config fields become `null` rather than removed — strictly backward-compatible; zero mobile-client readers of these fields confirmed via grep; no secret material involved | Plan 03 (RESEARCH.md Security Domain) | 2026-07-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-02 | 6 | 6 | 0 | /gsd-secure-phase (short-circuit: threats_open=0, register authored at plan time, ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-02

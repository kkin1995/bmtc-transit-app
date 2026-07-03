---
phase: 3
slug: api-surface-completion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-03
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.4.3 with pytest-xdist 3.5.0, pytest-randomly 3.15.0 |
| **Config file** | `backend/pytest.ini` |
| **Quick run command** | `cd backend && uv run pytest tests/test_api_gtfs_alignment.py -v` |
| **Full suite command** | `cd backend && uv run pytest -n auto --dist loadfile -q` |
| **Estimated runtime** | ~10 seconds (full suite, per CLAUDE.md baseline) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_api_gtfs_alignment.py -v`
- **After every plan wave:** Run `cd backend && uv run pytest -n auto --dist loadfile -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | API-01 | V5 | Manual param validation, parameterized queries | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stop_detail_success -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | API-01 | V5 | 404 standard error shape for unknown stop_id | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stop_detail_not_found -x` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 0 | API-01 | — | 200 + `routes: []` for orphaned stop (D-10) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stop_detail_no_routes -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 0 | API-02 | V5 | Route detail + ordered stops per direction | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_success -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 0 | API-02 | V5 | 404 standard error shape for unknown route_id | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_not_found -x` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 0 | API-02 | — | 200 + `directions: []` for zero-trip route (D-05) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_no_trips -x` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 0 | API-02 | — | Most-common shape selected for branch variants (D-04) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_route_detail_branch_selection -x` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 0 | API-03 | V5/DoS | 500m included, 600m excluded (literal success criterion) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_boundary -x` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 0 | API-03 | V5 | `bbox` + radius params mutually exclusive → 400 (D-13) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_bbox_radius_mutually_exclusive -x` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 0 | API-03 | V5 | Partial lat/lon/radius_m → 400 (D-14) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_all_or_nothing -x` | ❌ W0 | ⬜ pending |
| 03-03-04 | 03 | 0 | API-03 | V5/DoS | radius_m > 2000 → 400 (D-15) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_exceeds_cap -x` | ❌ W0 | ⬜ pending |
| 03-03-05 | 03 | 0 | API-03 | V5 | Out-of-range lat/lon → 400 for radius (D-16) and bbox (D-17) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_stops_radius_invalid_latlon -x`, `test_get_stops_bbox_invalid_range -x` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 1 | API-04 | — | `from_stop_name`/`to_stop_name`/`route_short_name` populated via LEFT JOIN | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_eta_segment_names_populated -x` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 1 | API-04 | — | Orphaned reference nulls field, still 200 (D-20) | integration | `pytest tests/test_api_gtfs_alignment.py::test_get_eta_segment_names_orphaned_null -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_api_gtfs_alignment.py` — add all test functions listed above; module already covers sibling `/stops`, `/routes`, `/stops/{id}/schedule`, `/eta` endpoints in the same style
- [ ] `backend/tests/conftest.py` — extend/add a fixture analogous to `db_with_test_routes` that also inserts `stops`, `trips`, and `stop_times` rows with multiple `shape_id` branches per `(route_id, direction_id)`, to exercise D-04 deterministically
- [ ] `setup_test_segment_for_eta()` — extend to insert `stops` rows for `STOP_A`/`STOP_B` and a `routes` row for `ROUTE1` so API-04's LEFT JOIN enrichment has real data to resolve against
- [ ] Framework install: none — pytest and all test dependencies already present

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (per RESEARCH.md's Phase Requirements → Test Map, every API-01..04 behavior maps to an integration test).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

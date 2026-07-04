---
phase: 05
slug: quality-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.4.3 (pinned) + pytest-xdist 3.5.0 + pytest-randomly 3.15.0 |
| **Config file** | `backend/pytest.ini` (already configures `-n=auto --dist=loadfile` via `addopts` — CI's explicit `-n auto` flag is redundant-but-harmless with this) |
| **Quick run command** | `cd backend && uv run pytest tests/test_bootstrap.py tests/test_timing_middleware.py -v` |
| **Full suite command** | `cd backend && uv run pytest -n auto --dist loadfile` |
| **Estimated runtime** | ~10-15 seconds (full suite, per CLAUDE.md's existing 47-test ~9-10s baseline plus new tests) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_bootstrap.py tests/test_timing_middleware.py -v`
- **After every plan wave:** Run `cd backend && uv run pytest -n auto --dist loadfile`
- **Before `/gsd-verify-work`:** Full suite must be green; `load_test.py` run manually at least once with `results.txt` committed as evidence (D-03 — not re-run automatically per commit, not a CI gate)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-XX | TBD | 0 | OPS-02 | T-05-01 / — | Literal 17-table + 3-view assertion against `sqlite_master`; FK check runs with `PRAGMA foreign_keys=ON` | integration | `uv run pytest tests/test_bootstrap.py -v` | ❌ Wave 0 | ⬜ pending |
| 05-02-XX | TBD | 0 | OPS-01 | — / — | Load test targets scratch DB only, never `bmtc_dev.db`/prod `BASE_URL` | manual (D-03) | `uv run python tests/perf/load_test.py --endpoint post ...` | ❌ Wave 0 — new file, not a pytest test by design | ⬜ pending |
| 05-03-XX | TBD | 0 | OPS-03 | V14 Configuration | CI workflow declares `permissions: contents: read` (least privilege) | manual verification | N/A — verified by observing a real Actions run/badge | ❌ Wave 0 — new `.github/workflows/ci.yml` | ⬜ pending |
| 05-04-XX | TBD | 0 | OPS-04 | V7 Error Handling and Logging | JSON log line never includes `Authorization` header, request body, or raw `device_bucket`; logs `request.url.path` only | integration | `uv run pytest tests/test_timing_middleware.py -v` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Exact Task IDs to be filled in by the planner once PLAN.md files are created.*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_bootstrap.py` — stubs for OPS-02 (17 tables + 3 views literal list, GTFS metadata row, `PRAGMA foreign_key_check` zero violations)
- [ ] `backend/tests/perf/load_test.py` + `backend/tests/perf/results.txt` — covers OPS-01 (not a pytest file — see D-06; manual/local-only per D-03)
- [ ] `.github/workflows/ci.yml` — covers OPS-03 (greenfield, no existing CI pattern)
- [ ] `backend/tests/test_timing_middleware.py` (new, recommended) — asserts the new JSON log line's shape for OPS-04; `backend/app/logging_config.py` doesn't exist yet
- [ ] Existing `backend/tests/conftest.py` fixtures (`temp_db`, `db_with_test_segment`) — reused, not modified, as the pattern basis for `test_bootstrap.py` and load-test seeding

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| POST /v1/ride_summary p99 < 200ms, GET /v1/eta p99 < 100ms under 20 concurrent clients | OPS-01 | D-03: load test is explicitly NOT automated/CI-gated — shared CI runners are noisy and would make a p99 assertion flaky | Run `cd backend && uv run python tests/perf/load_test.py --endpoint post --clients 20` and `--endpoint eta --clients 20` against a local scratch DB + local uvicorn instance; commit `backend/tests/perf/results.txt` as evidence |
| CI runs full suite on every push/PR to `main` | OPS-03 | Requires an actual GitHub Actions run against a real push/PR — cannot be verified by a local pytest command | Push a commit or open a PR to `main`; confirm the workflow run appears in the Actions tab and the badge/status reflects pass/fail |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

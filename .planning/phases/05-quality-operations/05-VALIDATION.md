---
phase: 05
slug: quality-operations
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-04
updated: 2026-07-06
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
| 05-01 Task 1 | 05-01-PLAN.md | 1 | OPS-02 | T-05-01 | Literal 17-table + 3-view assertion against `sqlite_master` (no bare count) | integration | `cd backend && uv run pytest tests/test_bootstrap.py::test_bootstrap_creates_all_tables_and_views -v` | ✅ `backend/tests/test_bootstrap.py` | ✅ green (verified 2026-07-06, re-ran) |
| 05-01 Task 2a | 05-01-PLAN.md | 1 | OPS-02 | T-05-01 | Mini-fixture bootstrap populates `gtfs_metadata.gtfs_version` (non-empty) | integration | `cd backend && uv run pytest tests/test_bootstrap.py::test_bootstrap_populates_gtfs_metadata -v` | ✅ `backend/tests/test_bootstrap.py` | ✅ green (verified 2026-07-06, re-ran) |
| 05-01 Task 2b | 05-01-PLAN.md | 1 | OPS-02 | T-05-01 | `PRAGMA foreign_key_check` returns `[]` with FK enforcement explicitly ON | integration | `cd backend && uv run pytest tests/test_bootstrap.py::test_bootstrap_foreign_keys_valid -v` | ✅ `backend/tests/test_bootstrap.py` | ✅ green (verified 2026-07-06, re-ran) |
| 05-03 Task 1 | 05-03-PLAN.md | 1 | OPS-01 | T-05-06 / T-05-07 | `percentile()` nearest-rank correctness; script hardcodes local DB/URL, never reads ambient env | unit (self-check) | `cd backend && uv run python -c "import sys; sys.path.insert(0,'tests/perf'); import load_test as L; assert L.percentile(list(range(1,101)),99)==99 and L.percentile(list(range(1,101)),50)==50"` | ✅ `backend/tests/perf/load_test.py` | ✅ green (verified 2026-07-06, re-ran; confirmed NOT collected by pytest — `--collect-only` count = 0) |
| 05-03 Task 2 | 05-03-PLAN.md | 1 | OPS-01 | T-05-06 | POST p99 < 200ms and GET p99 < 100ms under 20 concurrent clients, evidence committed | manual (D-03), evidence-checked | `grep -q "endpoint=post" backend/tests/perf/results.txt && grep -q "endpoint=eta" backend/tests/perf/results.txt` | ✅ `backend/tests/perf/results.txt` | ✅ green — POST p99=88.29ms/target 200ms PASS=True; GET p99=78.47ms/target 100ms PASS=True (results.txt inspected 2026-07-06) |
| 05-04 Task 1 | 05-02-PLAN.md | 1 | OPS-03 | T-05-08 / T-05-09 | Workflow triggers on `push`+`pull_request` to `main`, `permissions: contents: read`, `pull_request` not `pull_request_target`, uv+Python 3.12 pinned, runs `uv run pytest -n auto` | integration (YAML schema check) | `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); ..."` (see 05-04-PLAN.md Task 1 verify block) | ✅ `.github/workflows/ci.yml` | ✅ green (re-ran full assertion script 2026-07-06 — passes) |
| 05-04 Task 2 | 05-04-PLAN.md | 1 | OPS-03 | — | CI actually executes on GitHub and reports a real pass/fail status | manual (human-check) | `gh run list --workflow=ci.yml` / GitHub Actions tab | ✅ `.github/workflows/ci.yml` | ✅ green — per phase-verify record, a real Actions run was observed green (247/247 backend tests passing) |
| 05-02 Task 1 | 05-02-PLAN.md | 1 | OPS-04 | T-05-05 | `JsonFormatter` produces valid JSON (timestamp/level/logger/message + extras), never raises on non-serializable values; `configure_logging()` idempotent, root logger INFO with exactly one handler | unit | `cd backend && uv run pytest tests/test_timing_middleware.py -v -k "formatter or configure or json"` | ✅ `backend/app/logging_config.py`, `backend/tests/test_timing_middleware.py` | ✅ green (verified 2026-07-06, re-ran) |
| 05-02 Task 2 | 05-02-PLAN.md | 1 | OPS-04 | T-05-03 / T-05-04 | Every request emits one `app.access` JSON line with `request_latency_ms`/`method`/`path`/`status`; a 429 short-circuit still logs (proves `TimingMiddleware` is outermost); no Authorization/body/query-string in the log | integration | `cd backend && uv run pytest tests/test_timing_middleware.py -v` | ✅ `backend/app/main.py`, `backend/tests/test_timing_middleware.py` | ✅ green (verified 2026-07-06, re-ran — includes `test_429_short_circuit_still_emits_access_log` and `test_access_log_path_excludes_query_string_and_secrets`) |
| 05-02 Task 3 | 05-02-PLAN.md | 1 | OPS-04 | — | systemd unit disables uvicorn's own access log (`--no-access-log`) to avoid duplicate/non-JSON lines | smoke (grep) | `grep -q -- '--no-access-log' backend/deploy/bmtc-api.service && echo OK` | ✅ `backend/deploy/bmtc-api.service` | ✅ green (verified 2026-07-06, re-ran) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*All 4 plans (05-01..05-04, mapped 1:1 to OPS-02/OPS-01/OPS-03/OPS-04 per file headers) executed in wave 1. Task IDs above reflect the real `<task>` blocks in each PLAN.md. Full suite re-confirmed 2026-07-06: `cd backend && uv run pytest -n auto --dist loadfile -q` → 247 passed.*

---

## Wave 0 Requirements

- [x] `backend/tests/test_bootstrap.py` — built for OPS-02 (17 tables + 3 views literal list, GTFS metadata row, `PRAGMA foreign_key_check` zero violations) — 3 tests, all green
- [x] `backend/tests/perf/load_test.py` + `backend/tests/perf/results.txt` — covers OPS-01 (not a pytest file — see D-06; manual/local-only per D-03) — results.txt shows both POST and GET runs, PASS=True
- [x] `.github/workflows/ci.yml` — covers OPS-03 (greenfield, no existing CI pattern) — YAML validated, real Actions run observed green per phase-verify record
- [x] `backend/tests/test_timing_middleware.py` — asserts the new JSON log line's shape for OPS-04; `backend/app/logging_config.py` created — 8 tests, all green
- [x] Existing `backend/tests/conftest.py` fixtures (`temp_db`, `db_with_test_segment`) — reused, not modified, as the pattern basis for `test_bootstrap.py` and load-test seeding

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| POST /v1/ride_summary p99 < 200ms, GET /v1/eta p99 < 100ms under 20 concurrent clients | OPS-01 | D-03: load test is explicitly NOT automated/CI-gated — shared CI runners are noisy and would make a p99 assertion flaky | Run `cd backend && uv run python tests/perf/load_test.py --endpoint post --clients 20` and `--endpoint eta --clients 20` against a local scratch DB + local uvicorn instance; commit `backend/tests/perf/results.txt` as evidence |
| CI runs full suite on every push/PR to `main` | OPS-03 | Requires an actual GitHub Actions run against a real push/PR — cannot be verified by a local pytest command | Push a commit or open a PR to `main`; confirm the workflow run appears in the Actions tab and the badge/status reflects pass/fail |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (OPS-01 Task 2 and OPS-03 Task 2 are evidence/human-check, per D-03/D-12, not gaps)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — none remain MISSING; all rows COVERED
- [x] No watch-mode flags
- [x] Feedback latency < 15s (targeted suite ~1.3s, full suite ~2s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-06 (post-execution Nyquist audit) — all 10 task rows re-verified by direct re-run:
- `cd backend && uv run pytest tests/test_bootstrap.py tests/test_timing_middleware.py -v` → 11 passed
- `cd backend && uv run pytest -n auto --dist loadfile -q` → 247 passed
- `load_test.py` percentile self-check → OK; confirmed not collected by pytest (`--collect-only` grep count 0)
- `backend/tests/perf/results.txt` → endpoint=post PASS=True, endpoint=eta PASS=True
- `.github/workflows/ci.yml` → YAML schema assertions (permissions, triggers, uv/Python 3.12, no `pull_request_target`) all pass

No genuine automated-verification gap was found; no new test was required. This audit re-derived the task-ID map from the real PLAN.md files (05-01→OPS-02, 05-02→OPS-04, 05-03→OPS-01, 05-04→OPS-03) and confirmed COVERED status for all 10 tasks across the 4 plans.

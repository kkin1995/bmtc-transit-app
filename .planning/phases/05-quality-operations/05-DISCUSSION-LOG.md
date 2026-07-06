# Phase 5: Quality & Operations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 5-Quality & Operations
**Areas discussed:** Load-test tooling (OPS-01), Bootstrap smoke tests (OPS-02), CI pipeline scope (OPS-03), Monitoring approach (OPS-04)

---

## Todo Cross-Reference

| Option | Description | Selected |
|--------|-------------|----------|
| Leave it alone | GTFS sudoers todo is a Phase 4 deploy concern, unrelated to Phase 5 | ✓ |
| Fold into Phase 5 | Treat sudoers confirmation as this phase's scope | |

**User's choice:** Leave it alone
**Notes:** Todo matched via keyword search (score 0.6, area: deploy) but is about `update_gtfs.sh` permissions, not CI/perf/monitoring — a keyword false-positive.

---

## Load-Test Tooling (OPS-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Custom asyncio/httpx script | Zero new deps, reuses existing httpx dev dependency | ✓ |
| Locust | Purpose-built framework, web UI, new dependency | |
| k6 | Go binary, separate toolchain outside Python/uv stack | |

**User's choice:** Custom asyncio/httpx script

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse generate_sample_data.py | Existing synthetic ride-data generator | ✓ |
| Run against real dev DB | Simpler but pollutes real dev data | |
| You decide | | |

**User's choice:** Reuse generate_sample_data.py

| Option | Description | Selected |
|--------|-------------|----------|
| Manual/local-only | Avoids CI flakiness from noisy shared runners | ✓ |
| CI-gated on every PR | Requires stable dedicated runner or becomes flaky | |

**User's choice:** Manual/local-only

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct device_bucket per client | Matches real-world usage, exercises real rate-limit path | ✓ |
| Disable rate limiting for the test | Simpler but skips measuring real middleware overhead | |

**User's choice:** Distinct device_bucket per client

| Option | Description | Selected |
|--------|-------------|----------|
| Separate runs per endpoint | Clean p99 attribution per ROADMAP's two distinct targets | ✓ |
| Mixed concurrent traffic | More realistic but noisier attribution | |

**User's choice:** Separate runs per endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| backend/tests/perf/load_test.py + results.txt | Matches ROADMAP's literal path | ✓ |
| backend/scripts/load_test.py | Groups with other operational scripts | |

**User's choice:** backend/tests/perf/load_test.py + results.txt

**Notes:** The rate-limit interaction (device_bucket per client) was flagged by the user as a detail that could have silently broken the whole load test if left unresolved.

---

## Bootstrap Smoke Tests (OPS-02)

| Option | Description | Selected |
|--------|-------------|----------|
| mini_gtfs.zip | Existing fast fixture, already used by test_gtfs_update.py | ✓ |
| Real bmtc.zip | Full realism but slow (1.46M rows) | |
| Both | Fast test in suite + separate manual real-data check | |

**User's choice:** mini_gtfs.zip

| Option | Description | Selected |
|--------|-------------|----------|
| Same suite | Runs with the other 235 tests via -n auto | ✓ |
| Separate/opt-in marker | Excluded from default run | |

**User's choice:** Same suite

| Option | Description | Selected |
|--------|-------------|----------|
| Assert literal names | Hardcoded 11 table + 3 view names against sqlite_master | ✓ |
| Count only | Simpler but passes even if wrong tables exist | |

**User's choice:** Assert literal names

---

## CI Pipeline Scope (OPS-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Backend only | Matches ROADMAP's literal wording | ✓ |
| Backend + Mobile | Adds a Jest job, not named in success criteria | |

**User's choice:** Backend only

| Option | Description | Selected |
|--------|-------------|----------|
| push + PR to main, required check | Matches ROADMAP wording exactly | ✓ |
| All branches, advisory only | Purely informational | |

**User's choice:** push + PR to main, required check

| Option | Description | Selected |
|--------|-------------|----------|
| Single pinned version (3.12) + uv caching | Simpler, matches single-deploy-target nature | ✓ |
| Matrix across 3.9-3.12 | More CI time, catches version-specific regressions | |

**User's choice:** Single pinned version (3.12) + uv caching

---

## Monitoring Approach (OPS-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Structured log fields | Zero new deps, extends existing logger pattern | ✓ |
| Prometheus /metrics endpoint | New dependency, new scrape-target infra | |

**User's choice:** Structured log fields

| Option | Description | Selected |
|--------|-------------|----------|
| Per-request INFO log (method+path+status+latency_ms) | Greppable per-request traceability | ✓ |
| Aggregate only (no per-request logs) | Lower volume, loses traceability | |

**User's choice:** Per-request INFO log

| Option | Description | Selected |
|--------|-------------|----------|
| key=value formatted string | Zero new deps, matches existing plain-string logger calls | |
| Real JSON lines | Requires custom Formatter, more parseable by future tooling | |
| (free text) "What is industry best practice?" | | ✓ |

**User's choice:** Asked for industry best practice instead of picking; Claude recommended real JSON lines via a small custom `logging.Formatter` (zero new dependency, universally parseable) over key=value/logfmt. User confirmed this recommendation in a follow-up question.

| Option | Description | Selected |
|--------|-------------|----------|
| Outermost, added first | Captures full request lifecycle including rate-limit overhead | ✓ |
| Innermost, right before routes | Measures only handler execution time | |

**User's choice:** Outermost, added first

| Option | Description | Selected |
|--------|-------------|----------|
| Derived from per-request logs | No new code, operator computes error_rate via grep/jq | ✓ |
| Separate periodic aggregate log line | More code, at-a-glance summary | |

**User's choice:** Derived from per-request logs

---

## Claude's Discretion

- Exact JSON field names beyond `request_latency_ms`/`method`/`path`/`status` (e.g. timestamp, request ID) — left to research/planning.
- Whether `generate_sample_data.py` needs modification or is directly reusable for load-test seeding — a technical detail for research to confirm.

## Deferred Ideas

- Mobile Jest tests in CI — out of scope for this phase, could be a second CI job in a future phase.
- GitHub branch-protection enforcement (required status check in repo settings) — a manual, off-repo follow-up for the operator.
- Prometheus `/metrics` endpoint — rejected in favor of structured logs; revisit if a scraper is ever deployed.
- Real `bmtc.zip` bootstrap smoke test — mini fixture covers CI needs; a periodic real-data check was considered but not adopted.
- GTFS sudoers confirmation todo — reviewed but explicitly left out of this phase's scope (unrelated deploy concern from Phase 4).

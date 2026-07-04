# Phase 5: Quality & Operations - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify (and where missing, build) the operational quality gates already promised elsewhere: a load test proving POST /v1/ride_summary p99 < 200ms and GET /v1/eta p99 < 100ms under concurrent load, a bootstrap smoke test proving schema/FK integrity after a fresh bootstrap, a CI pipeline running the full test suite on every push/PR to main, and structured request-latency/error logging so an operator can observe performance without instrumenting the process externally. Covers requirements OPS-01, OPS-02, OPS-03, OPS-04.

No new API endpoints, no learning-algorithm changes, no rate-limit quota/header behavior changes (Phase 6), no mobile-app CI (explicitly deferred), no Prometheus/external monitoring infrastructure — this phase is purely file-based verification and lightweight in-process observability, consistent with the project's "keep deps minimal, single-server SQLite" constraints.

</domain>

<decisions>
## Implementation Decisions

### Load Testing (OPS-01)
- **D-01:** Load generation is a custom asyncio/httpx script — no new dependency (Locust, k6). `httpx` is already a dev dependency via `TestClient` usage. Matches the project's established minimal-deps precedent (Phase 4 rejected Alembic for the same reason).
- **D-02:** Test data is seeded by reusing/extending `backend/scripts/generate_sample_data.py` against a scratch DB before the load run — not the real dev DB (`backend/bmtc_dev.db`), to avoid polluting real dev data or depending on whatever happens to already be there.
- **D-03:** The load test is manual/local-only, NOT a CI gate. Shared CI runners are noisy (no dedicated hardware, competing jobs) and would make a p99 assertion flaky. `results.txt` is committed as evidence of a manual run, not enforced as a required check on every PR.
- **D-04:** Each simulated concurrent client uses a distinct `device_bucket` (not a shared one, not rate-limiting disabled). This exercises the real end-to-end path including `RateLimitMiddleware`'s per-bucket token check — matching how 20 real devices would actually behave — rather than measuring an artificially rate-limit-free code path.
- **D-05:** POST /v1/ride_summary and GET /v1/eta are load-tested in **separate runs**, not mixed concurrent traffic. This cleanly isolates each endpoint's p99 against its own distinct target (200ms vs 100ms) without cross-endpoint noise in attribution.
- **D-06:** Script lives at `backend/tests/perf/load_test.py`; results written to `backend/tests/perf/results.txt` (resolves ROADMAP's literal `tests/perf/results.txt` path under `backend/`, where all other tests live). It is a standalone script, not a pytest test — do not prefix with `test_` or it will be picked up by pytest collection.

### Bootstrap Smoke Tests (OPS-02)
- **D-07:** `test_bootstrap.py` bootstraps from the existing `backend/tests/fixtures/mini_gtfs.zip` fixture (already used by `test_gtfs_update.py`), not the real `bmtc.zip` (1.46M `stop_times` rows — too slow for a test that runs on every commit).
- **D-08:** Lives in `backend/tests/` and runs as part of the normal suite (`uv run pytest -n auto --dist loadfile`) — not an opt-in/marked test. It's fast (mini fixture) and belongs with the rest of the correctness tests.
- **D-09:** Table/view existence is asserted against a **hardcoded literal list** of the 11 table names + 3 view names (checked against `sqlite_master`), not a bare count. A count-only assertion (`COUNT(*) = 11`) would pass even if the wrong 11 tables existed after a schema drift; literal names catch a table being silently renamed or dropped.
- **D-10:** `PRAGMA foreign_key_check` must be run with `PRAGMA foreign_keys = ON` explicitly set first — SQLite defaults this off per-connection, and the check is a no-op without it.

### CI Pipeline (OPS-03)
- **D-11:** Backend only — `uv run pytest -n auto` on the FastAPI test suite. Mobile Jest tests are explicitly out of scope for this phase (not named in ROADMAP's success criteria); adding them would be scope creep. Noted as a deferred idea below.
- **D-12:** Workflow triggers on `push` and `pull_request` to `main`, matching ROADMAP's literal wording. It is a required/blocking check in the sense that the workflow fails (non-zero exit, visible red status/badge) on test failure — actual GitHub branch-protection enforcement (marking it as a required status check in repo settings) is a GitHub UI/API change outside this phase's file-based scope; noted as a follow-up for the operator.
- **D-13:** Single pinned Python version (3.12), not a version matrix across the `>=3.9` range declared in `pyproject.toml`. This is a single-deploy-target app, not a published library — matrix testing adds CI time for no real benefit here.
- **D-14:** `uv` dependencies are cached (via `astral-sh/setup-uv`'s built-in caching or `actions/cache` keyed on `uv.lock`) for fast repeat runs.

### Monitoring (OPS-04)
- **D-15:** Structured log fields, NOT a Prometheus `/metrics` endpoint. Zero new dependencies, matches PROJECT.md's "keep deployment simple" constraint and the project's consistent minimal-deps stance. A `/metrics` endpoint would be new scrape-target infrastructure with no configured scraper today.
- **D-16:** Log lines are **real JSON** (one JSON object per line), produced by a small custom `logging.Formatter` subclass (`json.dumps()` on the record) — no new dependency. This is the actual industry-standard meaning of "structured logging": any future tool (Loki, CloudWatch, Datadog, or just `journalctl -u bmtc-api | jq`) can parse fields without custom regex. Rejected key=value/logfmt-style strings as a lesser middle ground — JSON costs nothing extra here and is more universal.
- **D-17:** A new timing middleware logs one JSON line per request with fields including `request_latency_ms`, `method`, `path`, `status`. It is registered **outermost** (added first in `main.py`, before `CORSMiddleware`/`APIVersionMiddleware`/`RateLimitMiddleware`) — Starlette applies middleware in reverse-registration order, so registering it first makes it wrap everything, capturing the full client-perceived request lifecycle including time spent in rate-limit checks.
- **D-18:** `error_rate` is derived by an operator (or future tooling) from the per-request JSON logs — `count(status>=400) / count(*)` over a time window — not a separate aggregate counter or periodic summary log line. No new code beyond the per-request log line itself.

### Claude's Discretion
- Exact JSON field names beyond the four locked ones (`request_latency_ms`, `method`, `path`, `status`) — e.g., whether to add a timestamp field or request ID — left to research/planning to resolve against what's idiomatic for Python's `logging` module.
- Whether `generate_sample_data.py` needs modification/extension vs. is usable as-is for D-02's seeding need — a technical detail for research to confirm.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level requirements and roadmap
- `.planning/REQUIREMENTS.md` §"Quality & Operations" — OPS-01, OPS-02, OPS-03, OPS-04 definitions
- `.planning/ROADMAP.md` §"Phase 5: Quality & Operations" (lines 138-150) — goal and 4 literal success criteria this phase's decisions are locked against, including the exact `tests/perf/results.txt` path (D-06) and the "OR" framing for log fields vs Prometheus (D-15)
- `.planning/PROJECT.md` — constraints (SQLite-only, single-writer transaction pattern, performance targets: GET /v1/eta p99 < 200ms via CF Tunnel)

### Existing code referenced/reused by this phase
- `backend/tests/fixtures/mini_gtfs.zip` and `backend/tests/test_gtfs_update.py` — existing fixture and usage pattern that `test_bootstrap.py` reuses (D-07)
- `backend/scripts/generate_sample_data.py` — existing synthetic ride-data generator reused for load-test seeding (D-02)
- `backend/app/main.py` — current middleware registration order (CORS → APIVersion → RateLimit → routes) that the new timing middleware must be added before (D-17)
- `backend/app/rate_limit.py` (`RateLimitMiddleware`) — per-`device_bucket`/IP token-bucket logic the load test must work with, not around (D-04)
- `backend/app/schema.sql` — authoritative source of the 11 table + 3 view names for `test_bootstrap.py`'s literal-name assertions (D-09)
- `backend/pyproject.toml` — `requires-python = ">=3.9"` and existing dev dependency groups (pytest, httpx, pytest-xdist, pytest-randomly) that CI must invoke correctly (D-11, D-13)

### Prior phase precedent
- `.planning/phases/04-data-management/04-CONTEXT.md` D-01/D-04/D-08 — established the "keep deps minimal, matches project's operational model" reasoning this phase's D-01/D-11/D-15 follow (rejecting Locust/k6/Prometheus for the same class of reason Phase 4 rejected Alembic and automated VACUUM)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/tests/fixtures/mini_gtfs.zip` — small GTFS fixture already parseable via `parse_gtfs()`, exactly what `test_bootstrap.py` needs for a fast, deterministic bootstrap smoke test (D-07).
- `backend/scripts/generate_sample_data.py` — existing synthetic ride generator; extend or call directly for load-test seed data (D-02).
- `backend/tests/conftest.py` fixtures (`temp_db`, `test_env`, `test_settings`) — existing test-isolation pattern `test_bootstrap.py` should follow rather than inventing a new DB-setup approach.

### Established Patterns
- `backend/app/main.py:22-29` `APIVersionMiddleware` — existing `BaseHTTPMiddleware` subclass pattern (dispatch method wrapping `call_next`) that the new timing middleware should mirror.
- `backend/app/main.py:19` `logger = logging.getLogger(__name__)` — existing per-module logger pattern; the new JSON formatter should be configured centrally (e.g. in `main.py` or a new `app/logging_config.py`) so it applies consistently, not per-call-site.
- No GitHub Actions workflows exist yet (`.github/workflows/` absent) — OPS-03 is greenfield, no existing CI pattern to follow or preserve.
- No `tests/perf/` directory exists yet — OPS-01 is also greenfield.

### Integration Points
- `backend/app/main.py` — where the new timing middleware is registered (D-17, must be first `app.add_middleware()` call) and where the JSON logging formatter is configured.
- `backend/app/schema.sql` — source of truth `test_bootstrap.py` must read/mirror for its literal table/view name list (D-09); if schema changes in a future phase, this test's hardcoded list must be updated too (a maintenance cost the literal-names decision (D-09) accepts deliberately).
- `.github/workflows/` — new directory for the CI workflow file (D-11 through D-14).

</code_context>

<specifics>
## Specific Ideas

User wants every ambiguity resolved before planning (consistent with Phases 1-4) and specifically pushed for a second round of clarification after the initial four areas, surfacing several decisions that weren't obvious at first pass: the load test's interaction with `RateLimitMiddleware` (D-04, distinct device_bucket per client — could have silently broken the whole load test if left unresolved), separating POST/GET load runs for clean p99 attribution (D-05), asserting literal table names in the bootstrap test rather than counts (D-09), and pinning CI to a single Python version with caching rather than a matrix (D-13/D-14). When asked about log format specifically, the user asked "what is industry best practice?" rather than picking from the given options — resolved toward real JSON log lines via a small custom formatter (D-16), explained as the more universal answer over key=value/logfmt, and confirmed by the user afterward.

</specifics>

<deferred>
## Deferred Ideas

- **Mobile Jest tests in CI** — explicitly out of scope for this phase (D-11); mobile has its own test suite but isn't named in ROADMAP's Phase 5 success criteria. Add as a second CI job whenever mobile CI is prioritized.
- **GitHub branch-protection enforcement** (marking the CI workflow as a required status check in repo settings) — a GitHub UI/API configuration change outside this phase's file-based scope (D-12); the workflow itself will fail visibly on test failure, but repo-settings enforcement is a manual follow-up for the operator.
- **Prometheus `/metrics` endpoint** — explicitly rejected in favor of structured logs for this phase (D-15); revisit if/when a scraper (Grafana, etc.) is actually deployed.
- **Real `bmtc.zip` bootstrap smoke test** — the mini fixture (D-07) covers CI/every-commit needs; a slower, periodic manual test against the real 1.46M-row GTFS zip was raised as an option but not adopted — could be added later as a separate opt-in check if real-data-scale bootstrap issues are ever suspected.

### Reviewed Todos (not folded)
- `.planning/todos/pending/2026-07-04-confirm-gtfs-update-sudoers.md` — "Confirm bmtc sudoers drop-in before first production update_gtfs.sh run" — matched via keyword search (score 0.6) but is a Phase 4 GTFS-deploy concern, unrelated to Phase 5's CI/perf/monitoring scope. User explicitly chose to leave it alone rather than fold it in.

</deferred>

---

*Phase: 5-Quality & Operations*
*Context gathered: 2026-07-04*

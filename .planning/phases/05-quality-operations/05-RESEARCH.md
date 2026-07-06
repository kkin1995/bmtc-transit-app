# Phase 5: Quality & Operations - Research

**Researched:** 2026-07-04
**Domain:** Load testing (asyncio/httpx), SQLite schema/FK verification, GitHub Actions CI, Python structured logging + Starlette middleware
**Confidence:** HIGH (all critical findings verified directly against this repo's installed package versions and schema, not assumed)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Load Testing (OPS-01)**
- D-01: Load generation is a custom asyncio/httpx script — no new dependency (Locust, k6). `httpx` is already a dev dependency via `TestClient` usage.
- D-02: Test data is seeded by reusing/extending `backend/scripts/generate_sample_data.py` against a scratch DB before the load run — not the real dev DB.
- D-03: The load test is manual/local-only, NOT a CI gate. `results.txt` is committed as evidence of a manual run, not enforced as a required check.
- D-04: Each simulated concurrent client uses a distinct `device_bucket` — exercises `RateLimitMiddleware`'s real per-bucket token check.
- D-05: POST /v1/ride_summary and GET /v1/eta are load-tested in **separate runs**, not mixed concurrent traffic.
- D-06: Script lives at `backend/tests/perf/load_test.py`; results at `backend/tests/perf/results.txt`. Standalone script, not a pytest test — must not be prefixed `test_`.

**Bootstrap Smoke Tests (OPS-02)**
- D-07: `test_bootstrap.py` bootstraps from `backend/tests/fixtures/mini_gtfs.zip`, not the real `bmtc.zip`.
- D-08: Lives in `backend/tests/`, runs as part of the normal suite (`uv run pytest -n auto --dist loadfile`) — not opt-in/marked.
- D-09: Table/view existence asserted against a **hardcoded literal list** (checked against `sqlite_master`), not a bare count.
- D-10: `PRAGMA foreign_key_check` must be run with `PRAGMA foreign_keys = ON` explicitly set first.

**CI Pipeline (OPS-03)**
- D-11: Backend only — `uv run pytest -n auto`. Mobile Jest tests explicitly out of scope.
- D-12: Workflow triggers on `push` and `pull_request` to `main`. Workflow fails visibly on test failure; branch-protection enforcement is a follow-up for the operator.
- D-13: Single pinned Python version (3.12), not a matrix.
- D-14: `uv` dependencies are cached (via `astral-sh/setup-uv`'s built-in caching or `actions/cache` keyed on `uv.lock`).

**Monitoring (OPS-04)**
- D-15: Structured log fields, NOT a Prometheus `/metrics` endpoint. Zero new dependencies.
- D-16: Log lines are **real JSON** (one JSON object per line), produced by a small custom `logging.Formatter` subclass — no new dependency.
- D-17: A new timing middleware logs one JSON line per request with fields including `request_latency_ms`, `method`, `path`, `status`. It is registered **outermost** — Starlette applies middleware such that the outermost middleware wraps everything, capturing the full client-perceived request lifecycle including time spent in rate-limit checks. **See Pitfall 2 below — the CONTEXT.md rationale text ("added first ... reverse-registration order") describes the WRONG mechanism; this research corrects the concrete implementation needed to achieve the stated (correct) intent.**
- D-18: `error_rate` is derived by an operator from the per-request JSON logs — `count(status>=400) / count(*)` over a time window — not a separate aggregate counter or periodic summary log line.

### Claude's Discretion
- Exact JSON field names beyond the four locked ones (`request_latency_ms`, `method`, `path`, `status`) — resolved below to `timestamp`, `level`, `logger` as additional idiomatic fields (see Code Examples).
- Whether `generate_sample_data.py` needs modification/extension vs. is usable as-is for D-02's seeding need — resolved below: it needs to be paired with direct scratch-DB seeding, and its timestamp generation has a latent bug (see Pitfall 4).

### Deferred Ideas (OUT OF SCOPE)
- Mobile Jest tests in CI — add as a second CI job whenever mobile CI is prioritized.
- GitHub branch-protection enforcement (required status check in repo settings) — manual follow-up for the operator.
- Prometheus `/metrics` endpoint — revisit if/when a scraper is actually deployed.
- Real `bmtc.zip` bootstrap smoke test — mini fixture covers CI/every-commit needs.
</user_constraints>

## Summary

This phase adds zero new runtime dependencies — everything is built from `httpx`, `pytest`, stdlib `logging`/`sqlite3`, and GitHub Actions YAML that are either already present or free. The technical risk in this phase is not "which library to use" (already locked) but getting four mechanically subtle things exactly right, each of which this research verified directly against the actual repo state rather than assuming from memory or from CONTEXT.md's own rationale text:

1. **The bootstrap smoke test's literal table/view list must be 17 tables + 3 views, not 11+3.** CONTEXT.md/ROADMAP.md's success-criterion wording ("all 11 tables and 3 views") mirrors a stale count in `CLAUDE.md` that predates `dwell_stats`, `rate_limit_buckets`, `device_buckets`, `rejection_log`, and `idempotency_keys` being added to `schema.sql`. Running `sqlite_master` against the current `schema.sql` in-process returns 17 tables and 3 views (exact list in Pitfall 1). D-09's *intent* (source the literal list from `schema.sql`, not a bare count) is correct and must be followed exactly — using the literal number "11" would make the test fail against the real, current schema.

2. **Starlette's actual middleware ordering is the reverse of what D-17's rationale text describes.** Direct inspection of the installed `starlette==0.35.1` source (`Starlette.add_middleware` / `Starlette.build_middleware_stack`) shows `add_middleware()` inserts each new middleware at the **front** of an internal list, and the stack is built by iterating that list in reverse — meaning the **last**-added middleware ends up **outermost** (closest to the client, sees the request first and the response last), not the first-added. To make the new timing middleware genuinely outermost (as D-17 correctly intends), it must be `app.add_middleware()`'d **last** in `main.py` — i.e., *after* the existing `RateLimitMiddleware` call — not first. Getting this backwards would put the timing middleware innermost of the four, meaning any request that `RateLimitMiddleware` short-circuits with a 429 would never reach it, and the log line for that request would simply never be emitted.

3. **The root logger has no handlers and defaults to WARNING level in this codebase today.** Verified by direct execution: `logging.getLogger("app.main").info(...)` currently emits nothing — not to console, not to journald — because nothing in this codebase calls `logging.basicConfig()` or configures a handler on the root logger, and uvicorn's own logging setup does not touch it. The existing `logger.info("Startup cleanup: removed N expired idempotency keys")` call in `main.py` has silently never printed anything. This means the new per-request JSON log line will *also* silently never be emitted unless this phase explicitly configures the root (or `app`) logger with a handler and an INFO-or-lower level — this is a required, not optional, part of implementing D-16/D-17.

4. **`generate_sample_data.py`'s synthetic route/stop IDs will be rejected by `POST /v1/ride_summary`.** The endpoint 422s any segment whose `(route_id, direction_id, from_stop_id, to_stop_id)` tuple isn't already a row in the `segments` table (`routes.py:141-161`) — segments are not auto-created from arbitrary POST bodies. `generate_sample_data.py`'s hardcoded IDs like `"ROUTE_335E"`/`"STOP_KR_PURAM"` do not exist in a freshly-bootstrapped scratch DB, so the load-test's seed step must directly insert matching `segments` rows (and, for the GET /v1/eta run, `segment_stats` rows across all 192 bins — `GET /v1/eta` 404s on a missing segment×bin row and does **not** auto-seed) — mirroring the existing `db_with_test_segment` fixture pattern in `conftest.py`, not relying on `generate_sample_data.py` alone.

**Primary recommendation:** Build all four OPS pieces as thin, dependency-free additions that directly reuse existing repo idioms (the `temp_db`/`db_with_test_segment` fixture pattern, the `APIVersionMiddleware` dispatch-method shape, the `foreign_keys = ON` precedent already in `conftest.py`), and apply the four corrections above exactly — they are the difference between code that looks right and code that actually passes/emits/measures what the phase's success criteria require.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load generation (asyncio/httpx client) | External test harness (out-of-process) | — | Must exercise the real network/ASGI stack, not FastAPI's in-process `TestClient` — see Pitfall 5 |
| Concurrent request handling under load | API / Backend (FastAPI + Uvicorn) | Database / Storage (SQLite WAL single-writer) | The measured p99 is a function of both handler code and SQLite's single-writer serialization — see Pitfall 6 |
| Bootstrap schema verification | Database / Storage | API / Backend (`app.db.init_db`) | `test_bootstrap.py` asserts against the schema `init_db()` produces, not against the API layer |
| CI pipeline execution | CI / Build tier (GitHub Actions) | — | New tier for this project — no prior workflow exists |
| Request timing + structured logging | API / Backend (ASGI middleware layer) | — | Must sit at the Starlette middleware layer, outside all other middleware, to see full client-perceived latency |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | Performance tests demonstrating POST p99 < 200ms and GET p99 < 100ms under concurrent load | asyncio/httpx concurrent load pattern, pure-Python percentile calc, seed-data strategy (Pitfalls 4-6, Code Examples) |
| OPS-02 | Bootstrap smoke tests verify all tables exist, GTFS metadata populated, FKs valid | Verified 17-table/3-view literal list (Pitfall 1), `PRAGMA foreign_key_check` pattern (Pitfall 7) |
| OPS-03 | CI pipeline runs full test suite on every commit | `astral-sh/setup-uv` exact YAML, `uv sync` flags, pytest-xdist-on-CI-runner notes (Pitfall 8, Code Examples) |
| OPS-04 | Structured log fields for request latency + error rate | Corrected middleware ordering (Pitfall 2), root-logger configuration requirement (Pitfall 3), JSON formatter pattern (Code Examples). **Note:** per D-18, `error_rate` is intentionally NOT a literal emitted field — it is derived from `status` across log lines. The ROADMAP's literal wording ("error_rate ... emitted on every request") is satisfied by this derivation, per the user's explicit decision; do not implement a separate `error_rate` field. |

## Package Legitimacy Audit

**No new packages are introduced in this phase.** All four OPS pieces are locked (D-01, D-15, D-16) to use only what's already a dependency (`httpx`, `pytest`, `pytest-xdist`) or stdlib (`logging`, `sqlite3`, `asyncio`, `json`, `time`). `astral-sh/setup-uv` and `actions/checkout` are third-party **GitHub Actions**, not Python packages — they run in GitHub's sandboxed Actions runner, not in this project's dependency tree, so the `pip`/`npm` package-legitimacy protocol does not apply to them. Pin them by commit SHA or `@vN` tag as shown in Code Examples; both are maintained by reputable orgs (`astral-sh` publishes `uv` itself; `actions/*` is GitHub's own org).

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| *(none — zero new Python/npm packages this phase)* | — | — | — |

## Architecture Patterns

### System Architecture Diagram — Load Test (OPS-01)

```
operator (manual, local)
   │
   ├─ 1. create scratch SQLite DB (temp path, NOT bmtc_dev.db)
   │      └─ app.db.init_db(scratch_path)  →  schema + 192 time_bins seeded
   │
   ├─ 2. seed step (extends generate_sample_data.py)
   │      └─ INSERT synthetic `segments` rows directly (bypasses GTFS bootstrap)
   │      └─ for GET run only: INSERT `segment_stats` rows for all 192 bins per segment
   │
   ├─ 3. start real server process
   │      └─ BMTC_DB_PATH=scratch_path uv run uvicorn app.main:app --port 8001 &
   │
   └─ 4. run backend/tests/perf/load_test.py --endpoint {post|eta} --clients 20
          │
          ├─ spawns N asyncio tasks, one per simulated client
          │    each client: own httpx.AsyncClient, own SHA256 device_bucket (POST run only)
          │
          ├─ each task issues its share of requests, records (start, end) via time.perf_counter()
          │
          ├─ asyncio.gather(*tasks) → flat list of latency samples
          │
          └─ compute p50/p99 in pure Python (sort + index) → write backend/tests/perf/results.txt
```

### System Architecture Diagram — Request Timing + Structured Logging (OPS-04)

```
client request
   │
   ▼
ServerErrorMiddleware (Starlette internal, always outermost)
   │
   ▼
TimingMiddleware (NEW — must be app.add_middleware()'d LAST, see Pitfall 2)
   │  start = time.perf_counter()
   ▼
RateLimitMiddleware  ──(429 short-circuit)──► back up through TimingMiddleware
   │                                            │ finally: log {status:429, request_latency_ms, ...}
   ▼ (allowed)
APIVersionMiddleware
   │
   ▼
CORSMiddleware
   │
   ▼
ExceptionMiddleware (Starlette internal — converts HTTPException → JSONResponse)
   │
   ▼
route handler (routes.py)
   │
   ▼  response bubbles back up through every layer above
TimingMiddleware: finally-block always fires (normal return AND unhandled exception)
   │  duration_ms = (perf_counter() - start) * 1000
   │  logger.info("request", extra={request_latency_ms, method, path, status})
   ▼
JsonFormatter.format() → one json.dumps() line → stderr/journald
   │
   ▼
operator: journalctl -u bmtc-api | jq 'select(.status>=400)' → error_rate (D-18)
```

### Recommended Project Structure
```
backend/
├── tests/
│   ├── perf/
│   │   ├── load_test.py       # D-06: standalone script, NOT prefixed test_
│   │   ├── results.txt        # D-06: committed artifact of a manual run
│   │   └── seed_perf_db.py    # optional: split seeding out of load_test.py for reuse
│   └── test_bootstrap.py      # D-07/D-08: normal pytest suite member
├── app/
│   ├── main.py                 # TimingMiddleware added LAST (outermost)
│   ├── logging_config.py       # NEW: JsonFormatter + root logger setup, called from main.py at import time
│   └── middleware.py           # optional: house TimingMiddleware alongside RateLimitMiddleware's pattern
.github/
└── workflows/
    └── ci.yml                  # D-11..D-14
```

### Pattern 1: httpx concurrent load generation with asyncio.gather
**What:** One `httpx.AsyncClient` per simulated device (so each carries its own connection + own `device_bucket` for D-04), tasks fired concurrently via `asyncio.gather`.
**When to use:** Any local load-test script targeting a real running ASGI server (not `TestClient`).
**Example:**
```python
# Source: verified against installed httpx==0.25.2; pattern confirmed via
# python-httpx.org/advanced/resource-limits/ and encode/httpx#2772
import asyncio
import hashlib
import time
import httpx

async def run_client(client_id: int, base_url: str, n_requests: int, results: list[float]) -> None:
    device_bucket = hashlib.sha256(f"load-test-client-{client_id}".encode()).hexdigest()
    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for _ in range(n_requests):
            payload = build_payload(device_bucket)  # see Pitfall 4/5 for payload construction
            start = time.perf_counter()
            resp = await client.post(
                "/v1/ride_summary",
                json=payload,
                headers={"Authorization": f"Bearer {API_KEY}"},
            )
            elapsed_ms = (time.perf_counter() - start) * 1000
            results.append(elapsed_ms)
            assert resp.status_code in (200, 429), resp.text  # 429 is a valid, expected outcome, not a bug

async def main(base_url: str, n_clients: int, n_requests_per_client: int):
    all_results: list[float] = []
    tasks = [
        run_client(i, base_url, n_requests_per_client, all_results)
        for i in range(n_clients)
    ]
    await asyncio.gather(*tasks)
    return all_results
```

### Pattern 2: Pure-Python percentile calculation (no numpy/statistics dependency needed)
**What:** Sort samples, index by `ceil(p/100 * count) - 1`.
**When to use:** Any p50/p99 computation from a flat list of latency floats.
**Example:**
```python
# Source: standard nearest-rank percentile method; verified formula against
# multiple independent sources during research
import math

def percentile(samples: list[float], p: float) -> float:
    """Nearest-rank percentile. p in [0, 100]."""
    if not samples:
        raise ValueError("no samples")
    ordered = sorted(samples)
    idx = math.ceil((p / 100) * len(ordered)) - 1
    idx = max(0, min(idx, len(ordered) - 1))  # clamp for p=0 and float edge cases
    return ordered[idx]

# Note: stdlib `statistics.quantiles(data, n=100)` (Python 3.8+) is also
# available and uses linear interpolation rather than nearest-rank — either
# is defensible for a load-test report; nearest-rank (above) matches how
# most APM tools (Datadog, Prometheus histogram_quantile) report percentiles,
# so it is the more comparable choice if these numbers are ever cross-checked
# against a future monitoring tool.
```

### Pattern 3: Corrected TimingMiddleware placement and implementation
**What:** A `BaseHTTPMiddleware` subclass, mirroring the existing `APIVersionMiddleware` shape, that always logs — even on unhandled exceptions.
**When to use:** OPS-04's per-request JSON log line.
**Example:**
```python
# Source: verified against installed starlette==0.35.1 source
# (Starlette.add_middleware / Starlette.build_middleware_stack) — see Pitfall 2
import logging
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("app.access")

class TimingMiddleware(BaseHTTPMiddleware):
    """Logs one JSON line per request. Must be app.add_middleware()'d LAST
    in main.py (i.e. after RateLimitMiddleware) to be truly outermost —
    Starlette's add_middleware() inserts at the front of an internal list
    and builds the stack in reverse, so the LAST call wraps everything."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        status_code = 500  # default if an unhandled exception propagates past us
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "request",
                extra={
                    "request_latency_ms": round(duration_ms, 2),
                    "method": request.method,
                    "path": request.url.path,  # .path only — never .query or full .url (may contain sensitive params)
                    "status": status_code,
                },
            )

# In main.py, this MUST be the LAST app.add_middleware() call:
# app.add_middleware(CORSMiddleware, ...)
# app.add_middleware(APIVersionMiddleware)
# app.add_middleware(RateLimitMiddleware)
# app.add_middleware(TimingMiddleware)   # <-- added last = outermost = correct per D-17's intent
```

### Pattern 4: JSON log formatter (D-16)
**What:** A `logging.Formatter` subclass producing one `json.dumps()` object per line, merging in any `extra=` fields from `TimingMiddleware`.
**When to use:** Attached to a single handler on the root logger, configured once at process startup.
**Example:**
```python
# Source: pattern synthesized from stdlib logging.Formatter contract
# (docs.python.org/3/howto/logging-cookbook.html) — no new dependency (D-16)
import json
import logging
from datetime import datetime, timezone

# Attributes present on every LogRecord by default — anything NOT in this
# set that appears on a record's __dict__ came from `extra=` and should be
# included in the JSON payload.
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {"message", "asctime"}

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Call once at import time in main.py, BEFORE the app object's first
    request. Without this, the root logger has NO handlers and defaults to
    WARNING — every logger.info() call in this codebase (including the new
    TimingMiddleware line) silently emits nothing. Verified by direct
    execution against this repo's current state (see Pitfall 3)."""
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler()  # journald captures stdout/stderr of the systemd unit
    handler.setFormatter(JsonFormatter())
    root.handlers.clear()
    root.addHandler(handler)
```

### Pattern 5: `PRAGMA foreign_key_check` with explicit FK enforcement (D-10)
**What:** `db.get_connection()` (used by the production app) does NOT set `PRAGMA foreign_keys = ON` — verified directly in `backend/app/db.py:93-99`. A fresh `sqlite3.connect()` in a test must set it explicitly, exactly as `conftest.py`'s `temp_db`/`in_memory_db` fixtures already do at lines 102 and 139.
**When to use:** `test_bootstrap.py`'s FK-integrity assertion.
**Example:**
```python
# Source: sqlite.org/pragma.html — PRAGMA foreign_key_check; SQLite defaults
# foreign key enforcement OFF per-connection (confirmed: backend/app/db.py's
# get_connection() never sets it — see backend/scripts/update_gtfs.sh:162's
# own comment acknowledging the same gap)
import sqlite3

def test_bootstrap_foreign_keys_valid(tmp_path):
    db_path = str(tmp_path / "bootstrap_test.db")
    from app.db import init_db
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")  # REQUIRED — no-op without this line
        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        assert violations == [], f"FK violations found: {violations}"
    finally:
        conn.close()
```

### Pattern 6: Literal table/view existence check against `sqlite_master` (D-09)
**What:** Hardcoded list of every table/view name — sourced from a live read of `schema.sql`, not from ROADMAP's stale "11 tables" figure.
**Example:**
```python
# Source: verified 2026-07-04 by executing schema.sql against an in-memory
# DB and querying sqlite_master directly (see Pitfall 1 for the full
# derivation) — this is the actual, current, complete list.
EXPECTED_TABLES = {
    # GTFS static (7)
    "agency", "routes", "stops", "calendar", "trips", "stop_times", "gtfs_metadata",
    # Learning (6)
    "segments", "time_bins", "segment_stats", "dwell_stats", "rides", "ride_segments",
    # Global aggregation / audit (4)
    "idempotency_keys", "device_buckets", "rejection_log", "rate_limit_buckets",
}
EXPECTED_VIEWS = {"route_summary", "stop_summary", "segment_learning_progress"}

def test_bootstrap_creates_all_tables_and_views(tmp_path):
    db_path = str(tmp_path / "bootstrap_test.db")
    from app.db import init_db
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT type, name FROM sqlite_master WHERE type IN ('table','view') "
            "AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'"
        ).fetchall()
        actual_tables = {name for t, name in rows if t == "table"}
        actual_views = {name for t, name in rows if t == "view"}
        assert actual_tables == EXPECTED_TABLES
        assert actual_views == EXPECTED_VIEWS
    finally:
        conn.close()
```
*(`schema_migrations` is excluded deliberately — it's a bookkeeping table `init_db()` creates for the migration framework, DATA-01, not part of the domain schema's "11/17 tables" count in ROADMAP's framing. Confirm this exclusion or inclusion choice explicitly in the plan so the literal-count assertion is unambiguous either way.)*

### Pattern 7: GitHub Actions CI workflow (D-11..D-14)
**What:** Exact, verified YAML using `astral-sh/setup-uv`'s built-in caching and Python-version pinning.
**Example:**
```yaml
# Source: docs.astral.sh/uv/guides/integration/github/ and
# github.com/astral-sh/setup-uv/blob/main/action.yml (verified inputs:
# python-version, enable-cache, cache-dependency-glob)
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    name: Backend test suite
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v7

      - name: Install uv
        uses: astral-sh/setup-uv@v8
        with:
          enable-cache: true
          python-version: "3.12"          # D-13: single pinned version
          cache-dependency-glob: "backend/uv.lock"

      - name: Install dependencies
        run: uv sync --locked --all-extras --dev

      - name: Run test suite
        run: uv run pytest -n auto --dist loadfile
```
*Note: `working-directory: backend` combined with `cache-dependency-glob: "backend/uv.lock"` is redundant-but-safe — the default glob (`**/uv.lock`) already matches nested paths; an explicit glob is more defensive if the repo ever gains a second `uv.lock` (e.g. a future tooling subproject).*

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Load generation harness | A custom threading-based or raw-socket load generator | `httpx.AsyncClient` + `asyncio.gather` (already a dep) | D-01 already locks this; threading would add complexity without adding capability `asyncio` doesn't already have here |
| Percentile computation | A hand-rolled interpolating percentile function with edge-case bugs | The nearest-rank `sort + ceil(p/100*n)-1` formula (Pattern 2) or stdlib `statistics.quantiles` | Off-by-one errors in percentile index math are a classic self-inflicted bug; the formula above is the industry-standard nearest-rank method |
| JSON log escaping | Manual string concatenation / f-string log lines with `,`/`:` separators (logfmt-style) | `json.dumps()` (Pattern 4) | `json.dumps()` correctly escapes newlines/quotes in `path` or any user-influenced field, which manual string building would not — this is also a log-injection mitigation (see Security Domain) |

**Key insight:** Every piece of this phase has a "seems simple, has a sharp edge" version of the naive implementation — hand-rolled percentiles get the index off by one, hand-rolled log lines are injectable, and hand-rolled middleware ordering reasoning (as CONTEXT.md's own D-17 rationale shows) is easy to get backwards even when the *intent* is completely clear. Verify each against source/execution rather than trusting memory, exactly as this research did.

## Common Pitfalls

### Pitfall 1: ROADMAP's "11 tables + 3 views" is stale — actual schema has 17 tables + 3 views
**What goes wrong:** A `test_bootstrap.py` written to literally match ROADMAP's/CLAUDE.md's wording (`len(tables) == 11`) will fail on the very first run, because the current `schema.sql` was verified (by executing it against an in-memory DB and querying `sqlite_master`) to define 17 tables: `agency, routes, stops, calendar, trips, stop_times, gtfs_metadata, segments, time_bins, segment_stats, dwell_stats, rides, ride_segments, idempotency_keys, device_buckets, rejection_log, rate_limit_buckets` — plus the bookkeeping `schema_migrations` table `init_db()` creates separately (18 if counted). Views are correctly 3: `route_summary, stop_summary, segment_learning_progress`.
**Why it happens:** `CLAUDE.md`'s own "Database Schema (11 tables)" section predates the Phase 4 migration-framework work and the earlier addition of `dwell_stats`/`rate_limit_buckets` — it was never updated as the schema grew, and ROADMAP.md's Phase 5 success-criterion text copied the same stale number.
**How to avoid:** Follow D-09's actual intent (source the list from `schema.sql`, the acknowledged source of truth) and use the verified 17-table/3-view list in Pattern 6 above, not the literal string "11" from planning docs. Optionally, as a small drive-by fix, update `CLAUDE.md`'s stale count — not required by this phase's scope but avoids the same staleness biting a future phase.
**Warning signs:** A hardcoded `== 11` or `== 14` assertion in `test_bootstrap.py`; any assertion that doesn't explicitly exclude/include `schema_migrations` and document the choice.

### Pitfall 2: D-17's stated middleware-ordering mechanism is backwards
**What goes wrong:** Implementing D-17 literally as worded ("registered outermost (added first)... registering it first makes it wrap everything") produces a `TimingMiddleware` that is actually the **innermost** of the four app-level middlewares — wrapped by `RateLimitMiddleware`, `APIVersionMiddleware`, and `CORSMiddleware`. Any request `RateLimitMiddleware` rejects with 429 before calling `call_next()` never reaches `TimingMiddleware` at all, so 429s are invisible to the new logging — precisely the "capturing... time spent in rate-limit checks" behavior D-17 says it wants.
**Why it happens:** Starlette's `Starlette.add_middleware()` inserts each new middleware at index 0 of an internal list (`self.user_middleware.insert(0, ...)`), and `build_middleware_stack()` builds the actual ASGI call chain by iterating that list in **reverse**. Net effect, verified by reading the installed `starlette==0.35.1` source directly: **the last middleware added via `add_middleware()` ends up outermost**, not the first. (Multiple independent sources — FastAPI's own middleware docs and community discussions — confirm this same behavior, giving cross-source verification beyond just reading the source once.)
**How to avoid:** Add `app.add_middleware(TimingMiddleware)` as the LAST `add_middleware()` call in `main.py`, after the existing `RateLimitMiddleware` line, not before `CORSMiddleware`. This makes it outermost and achieves D-17's stated (correct) *intent* even though the *justifying mechanism* in CONTEXT.md was described backwards.
**Warning signs:** A manual test that sends a request that should trip `RateLimitMiddleware`'s 429 and checking whether a JSON log line was emitted for it — if not, the ordering is wrong.

### Pitfall 3: The root logger has no handlers today — `logger.info()` currently emits nothing
**What goes wrong:** The new `TimingMiddleware` calls `logger.info("request", extra={...})`, expecting a JSON line to appear on stdout/stderr (and thus in `journalctl`). Without explicit configuration, nothing appears — not even an error; the call just silently no-ops.
**Why it happens:** Verified by direct execution in this repo's environment: `logging.getLogger().handlers == []` and `logging.getLogger().level == 30` (WARNING) by default. Python's logging module only invokes its "handler of last resort" (a stderr `StreamHandler`) for records at WARNING or above when no handler exists anywhere in the logger hierarchy — INFO-level records are filtered out by the root logger's default level *before* even reaching that fallback. Uvicorn's own `dictConfig()` call at server startup configures the `uvicorn`/`uvicorn.error`/`uvicorn.access` loggers but does not touch the root logger, so it doesn't rescue this.
**How to avoid:** Explicitly call a `configure_logging()` function (Pattern 4) that sets the root logger's level to `INFO` and attaches a `StreamHandler` with the new `JsonFormatter`, invoked at module-import time in `main.py` (before the `app = FastAPI(...)` line, or at the very top of the module) so it's active before the very first request. This is a **required** part of implementing D-16/D-17, not a drive-by nice-to-have.
**Warning signs:** After implementing the middleware, manually curl the running dev server and grep the terminal/journal output for a JSON line — if nothing appears, this is the cause.

### Pitfall 4: `generate_sample_data.py`'s timestamp generation can produce a future timestamp, failing validation
**What goes wrong:** `RideSegment.timestamp_utc` (and `observed_at_utc`) validators reject any timestamp `> now`. `generate_sample_rides()` computes `base_time = now - random.randint(0, 7*24*3600)` and then per-segment `timestamp_utc = base_time + j * 300`. When the random offset lands near 0 (i.e., `base_time` ≈ `now`), later segments in a multi-segment ride (`j >= 1`) get pushed into the future, and the POST is rejected with a 422/400 validation error — an intermittent, load-dependent failure that would corrupt the load test's request mix (some requests failing for reasons unrelated to what's being measured).
**Why it happens:** The script was written for offline synthetic-data generation (dumped to `sample_rides.json`), not for live POSTing against a running validator with a strict "not in the future" rule.
**How to avoid:** When extending/reusing this script for D-02's seeding, shift `base_time` further into the past by at least `num_segments * 300` seconds (e.g., `now - random.randint(num_segments*300, 7*24*3600)`), or clamp each computed timestamp to `min(timestamp, now - 1)`. Also convert the payload's timestamp field to `observed_at_utc` (ISO-8601 string, e.g. `datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00","Z")`) rather than the deprecated `timestamp_utc` int field, to avoid the `X-Deprecation-Warning` header noise during the load run and to match the currently-recommended client contract.
**Warning signs:** A handful of unexplained non-200 responses in the POST load test's results that don't correlate with rate-limiting (429) or the intentional stress being applied.

### Pitfall 5: `generate_sample_data.py`'s route/stop IDs don't exist in the load test's scratch DB
**What goes wrong:** `POST /v1/ride_summary` 422s with `"Unknown segment"` for any `(route_id, direction_id, from_stop_id, to_stop_id)` not already present in the `segments` table (`routes.py:141-161` — verified by reading the handler directly). `generate_sample_data.py`'s synthetic IDs (`"ROUTE_335E"`, `"STOP_KR_PURAM"`, etc.) are not GTFS-derived and don't exist unless something inserts matching rows first.
**Why it happens:** `generate_sample_data.py` was built to produce a standalone JSON file for manual/offline use, with no coupling to any specific DB's `segments` table contents.
**How to avoid:** The load test's seed step must directly `INSERT` matching `segments` rows into the scratch DB for whatever route/stop IDs the generator produces — mirroring `conftest.py`'s `db_with_test_segment` fixture, which inserts one segment plus baseline `segment_stats` rows for all 192 bins. This is simpler and faster than running a full GTFS bootstrap of `mini_gtfs.zip` (which has its own small, fixed set of route/stop IDs unrelated to `generate_sample_data.py`'s names) — pick ONE approach (direct segment seeding, recommended) and use it consistently for both the POST and GET load runs.
**Warning signs:** Every load-test request returning 422.

### Pitfall 6: SQLite's single-writer WAL model may itself be the p99 bottleneck, not handler code
**What goes wrong:** Under 20 truly concurrent POST /v1/ride_summary requests, SQLite (per this project's own documented "Single DB writer" architecture — `CLAUDE.md`) allows only one write transaction to commit at a time; the rest block on `busy_timeout` (5000ms, per `db.py:22`/`db.py:94`). If the p99 target (200ms) is missed, the load test's own results should be interpreted with this in mind — it may indicate expected SQLite serialization under burst concurrency rather than a code-level regression.
**Why it happens:** This is a deliberate, documented architectural tradeoff of the project (SQLite-only, no Postgres/Redis — see `PROJECT.md` Out of Scope), not a bug.
**How to avoid:** Not something to "fix" in this phase (no DB engine changes are in scope) — but the load test script and `results.txt` should record whether requests were issued as a simultaneous burst (worst case for write serialization) or as a steady arrival rate, since these produce very different p99s for the identical endpoint. Recommend a steady-rate design (each client's requests paced, e.g., naturally spaced by request/response round-trip time rather than a tight `while True` fire-loop) for a more realistic and defensible p99 measurement.
**Warning signs:** POST p99 is much worse than GET p99 by a margin far exceeding the extra DB-write work involved — a sign of write-lock queuing dominating the measurement.

### Pitfall 7: `PRAGMA foreign_keys = ON` is not the production connection's default
**What goes wrong:** A `test_bootstrap.py` FK-check test that opens the DB via `sqlite3.connect(db_path)` and runs `PRAGMA foreign_key_check` without first running `PRAGMA foreign_keys = ON` will always report zero violations — not because the data is valid, but because the check itself is a documented no-op when FK enforcement is off for that connection.
**Why it happens:** SQLite's `foreign_keys` pragma is per-connection, defaults to OFF, and — verified directly in `backend/app/db.py` — the app's own `get_connection()` never sets it (an existing, acknowledged gap also called out in `backend/scripts/update_gtfs.sh:162`'s own comment). This is exactly D-10's warning, now independently confirmed against the actual code rather than taken on faith.
**How to avoid:** Follow the exact pattern already established in `conftest.py`'s `temp_db`/`in_memory_db` fixtures (`conn.execute("PRAGMA foreign_keys = ON")` immediately after connecting) — Pattern 5 above.
**Warning signs:** A "passing" FK-check test that would still pass even if a foreign-key column referenced a non-existent row — a red flag that FK enforcement isn't actually active in that test.

### Pitfall 8: CI subprocess-based tests need their hardcoded `PATH` to actually exist on the runner
**What goes wrong:** `test_gtfs_update.py`, `test_migrations.py`, `test_retention_cleanup.py`, and `test_rate_limit_cleanup_script.py` all shell out to bash scripts via `subprocess.run(..., env={...})` with a hand-built `PATH` (`_test_path()`: uv's dir + `/usr/local/bin:/usr/bin:/bin`). If `sqlite3`/`gzip`/other CLI tools these scripts depend on live at a different path on the GitHub Actions `ubuntu-latest` image than assumed, these subprocess tests could fail in CI while passing locally.
**Why it happens:** `ubuntu-latest` GitHub-hosted runners do ship `sqlite3`, `gzip`, and standard coreutils under `/usr/bin`, matching this project's hardcoded path list — so this is a low-probability but real "worked locally, mysteriously fails in CI" class of issue if the runner image ever changes its base paths, or if this suite is later run on a different OS/runner (e.g. `macos-latest`, where Homebrew paths differ).
**How to avoid:** Since D-13 pins to a single `ubuntu-latest`-class runner (implicit in not specifying a matrix), this is currently a non-issue — just don't add a macOS or Windows runner without revisiting these hardcoded `PATH` values.
**Warning signs:** A subprocess-based test failing in CI with `command not found` while passing locally.

## Code Examples

### Complete `backend/tests/perf/load_test.py` skeleton (D-01, D-02, D-04, D-05, D-06)
```python
#!/usr/bin/env python3
"""Manual, local-only load test (OPS-01, D-03: NOT a pytest test, NOT a CI gate).

Usage:
    # Terminal 1: start a scratch-DB-backed server
    BMTC_DB_PATH=/tmp/perf.db BMTC_API_KEY=perf-test-key \
        uv run uvicorn app.main:app --port 8001 &

    # Terminal 2: seed + run
    uv run python tests/perf/load_test.py --seed --endpoint post --clients 20 --requests 25
    uv run python tests/perf/load_test.py --endpoint eta --clients 20 --requests 25
"""
import argparse
import asyncio
import hashlib
import math
import sqlite3
import time
from datetime import datetime, timezone

import httpx

BASE_URL = "http://127.0.0.1:8001"
API_KEY = "perf-test-key"
DB_PATH = "/tmp/perf.db"


def seed_scratch_db() -> None:
    """Directly inserts a test segment + all-192-bin baseline stats,
    mirroring conftest.py's db_with_test_segment fixture (Pitfall 5)."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) "
        "VALUES ('PERF_ROUTE', 0, 'PERF_STOP_A', 'PERF_STOP_B')"
    )
    (segment_id,) = conn.execute(
        "SELECT segment_id FROM segments WHERE route_id='PERF_ROUTE'"
    ).fetchone()
    for bin_id in range(192):
        conn.execute(
            "INSERT OR IGNORE INTO segment_stats "
            "(segment_id, bin_id, schedule_mean, n, welford_mean, welford_m2) "
            "VALUES (?, ?, 300.0, 5, 300.0, 100.0)",
            (segment_id, bin_id),
        )
    conn.commit()
    conn.close()


def percentile(samples: list[float], p: float) -> float:
    ordered = sorted(samples)
    idx = max(0, min(math.ceil((p / 100) * len(ordered)) - 1, len(ordered) - 1))
    return ordered[idx]


async def post_client(client_id: int, n_requests: int, latencies: list[float]) -> None:
    device_bucket = hashlib.sha256(f"perf-client-{client_id}".encode()).hexdigest()
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        for i in range(n_requests):
            observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            payload = {
                "route_id": "PERF_ROUTE",
                "direction_id": 0,
                "device_bucket": device_bucket,
                "segments": [{
                    "from_stop_id": "PERF_STOP_A",
                    "to_stop_id": "PERF_STOP_B",
                    "duration_sec": 300.0,
                    "observed_at_utc": observed_at,
                    "mapmatch_conf": 0.95,
                }],
            }
            start = time.perf_counter()
            resp = await client.post(
                "/v1/ride_summary", json=payload,
                headers={"Authorization": f"Bearer {API_KEY}"},
            )
            latencies.append((time.perf_counter() - start) * 1000)
            assert resp.status_code in (200, 429), f"{resp.status_code}: {resp.text}"


async def eta_client(client_id: int, n_requests: int, latencies: list[float]) -> None:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        for _ in range(n_requests):
            start = time.perf_counter()
            resp = await client.get(
                "/v1/eta",
                params={
                    "route_id": "PERF_ROUTE", "direction_id": 0,
                    "from_stop_id": "PERF_STOP_A", "to_stop_id": "PERF_STOP_B",
                },
            )
            latencies.append((time.perf_counter() - start) * 1000)
            assert resp.status_code == 200, resp.text


async def run(endpoint: str, n_clients: int, n_requests: int) -> list[float]:
    latencies: list[float] = []
    fn = post_client if endpoint == "post" else eta_client
    await asyncio.gather(*[fn(i, n_requests, latencies) for i in range(n_clients)])
    return latencies


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", choices=["post", "eta"], required=True)
    parser.add_argument("--clients", type=int, default=20)
    parser.add_argument("--requests", type=int, default=25)
    parser.add_argument("--seed", action="store_true")
    args = parser.parse_args()

    if args.seed:
        seed_scratch_db()

    latencies = asyncio.run(run(args.endpoint, args.clients, args.requests))
    target_ms = 200 if args.endpoint == "post" else 100
    p50, p99 = percentile(latencies, 50), percentile(latencies, 99)

    result_line = (
        f"{datetime.now(timezone.utc).isoformat()} endpoint={args.endpoint} "
        f"clients={args.clients} requests={len(latencies)} "
        f"p50_ms={p50:.2f} p99_ms={p99:.2f} target_ms={target_ms} "
        f"PASS={p99 < target_ms}\n"
    )
    print(result_line)
    with open("tests/perf/results.txt", "a") as f:
        f.write(result_line)


if __name__ == "__main__":
    main()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `actions/setup-python` + manual `pip install` / `pip cache` steps | `astral-sh/setup-uv` with `enable-cache: true` (single action handles Python interpreter pinning via `python-version` input AND uv's own dependency cache) | `setup-uv` has been the recommended pattern in `uv`'s own official GitHub Actions integration guide for some time now | Fewer workflow steps, faster cold-start (uv's resolver + cache is materially faster than pip), one action to pin both the Python version and the dependency cache |
| Manual `time.time()` diff for latency measurement | `time.perf_counter()` | N/A — `perf_counter()` has always been the correct choice for duration measurement since Python 3.3 | `perf_counter()` is monotonic and immune to system clock adjustments (NTP sync, DST) mid-measurement; `time.time()` is not — using it for latency measurement can occasionally produce negative or wildly skewed durations |
| Third-party JSON logging libraries (`python-json-logger`) | A ~20-line custom `logging.Formatter` subclass | This phase (D-16 explicitly rejects the library in favor of zero new deps) | For a single, simple structured field set (4-7 fields), a custom formatter is trivially maintainable and avoids a dependency; `python-json-logger` earns its keep at higher field-count/feature complexity (e.g. OpenTelemetry trace-context injection), which this project doesn't need |

**Deprecated/outdated:**
- Nothing in this phase's dependency set is deprecated. `httpx==0.25.2` (pinned in `pyproject.toml`) is older than the latest httpx release but has no relevant behavior changes affecting the patterns used here (`AsyncClient`, `Limits`, `.post()`/`.get()`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub-hosted `ubuntu-latest` runners ship `sqlite3`/`gzip` under `/usr/bin` matching this project's hardcoded subprocess test `PATH` | Pitfall 8 | If the runner image changes base paths, subprocess-based tests (`test_gtfs_update.py` etc.) could fail in CI while passing locally — mitigated by pinning to a single OS/runner (already the case) |
| A2 | `astral-sh/setup-uv@v8` and `actions/checkout@v7` are the current major-version tags at time of writing | Code Examples (CI workflow) | Version tags drift; the planner/implementer should confirm the latest stable major tag at implementation time rather than trusting this exact string indefinitely — the mechanism (inputs: `enable-cache`, `python-version`, `cache-dependency-glob`) is what's verified, not the exact version pin |
| A3 | A steady-rate request pacing (vs. a simultaneous burst) is the more "realistic and defensible" choice for the load test's p99 measurement | Pitfall 6 | This is a judgment call about what the load test should measure, not a verified fact — if the phase's actual intent is specifically to stress-test worst-case simultaneous burst behavior, a burst design would be the correct choice instead; confirm intent during planning if ambiguous |

## Open Questions

1. **Should `schema_migrations` be included in the bootstrap smoke test's literal table count?**
   - What we know: `init_db()` creates it via `CREATE TABLE IF NOT EXISTS schema_migrations (...)` as bookkeeping for the DATA-01 migration framework — it's not part of the domain schema in `schema.sql` itself (it's created in `db.py`, not `schema.sql`).
   - What's unclear: Whether "all tables" in the phase's success criterion is meant to cover every table `init_db()` produces (18, including `schema_migrations`) or just the domain schema defined in `schema.sql` (17).
   - Recommendation: Exclude it explicitly (as shown in Pattern 6) and note the exclusion in a code comment — it's an implementation-detail bookkeeping table, not a GTFS/learning/audit table, and its presence/absence doesn't reflect schema *correctness* the way the other 17 do.

2. **Should the JSON log formatter be wired into uvicorn's own access-log path, or replace it entirely?**
   - What we know: Uvicorn's default `--access-log` behavior produces its own (non-JSON) line per request via the `uvicorn.access` logger, independent of the new `TimingMiddleware`'s line — running both means two log lines per request in two different formats.
   - What's unclear: Whether the operator wants uvicorn's default access log disabled (`access_log=False` in the systemd unit's `ExecStart`, or `--no-access-log` flag) now that the JSON line supersedes it, or whether both should coexist.
   - Recommendation: Since this is a deployment/systemd-unit change (`backend/deploy/bmtc-api.service`) rather than application code, treat as a discretionary follow-up the plan can address explicitly (add `--no-access-log` to the `ExecStart` line) rather than silently leaving duplicate logging in place.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `uv` | Load test invocation, CI | ✓ | 0.11.8 | — |
| `sqlite3` CLI | Subprocess-based tests, manual DB inspection | ✓ | 3.53.2 | — |
| `python3` (system) | Not used directly (project uses `uv run` + its own managed interpreter) | ✓ | 3.14.6 (system) / 3.12 via uv venv | — |
| `httpx` (dev dep) | Load test script | ✓ | 0.25.2 (pinned in `pyproject.toml`) | — |
| `gh` CLI | Not required for this phase's implementation (only for verifying workflow runs post-push) | ✓ | 2.95.0 | — |
| GitHub Actions `ubuntu-latest` runner | CI workflow execution | Not locally verifiable — assumed available per standard GitHub Actions offering | — | — |
| `.github/workflows/` directory | CI workflow file target | Does not exist yet (confirmed via `ls`) — greenfield, matches CONTEXT.md's "no existing CI pattern to follow" note | — | — |

**Missing dependencies with no fallback:** None — this phase has zero new external dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 7.4.3 (pinned) + pytest-xdist 3.5.0 + pytest-randomly 3.15.0 |
| Config file | `backend/pytest.ini` (already configures `-n=auto --dist=loadfile` via `addopts` — CI's explicit `-n auto` flag is redundant-but-harmless with this) |
| Quick run command | `cd backend && uv run pytest tests/test_bootstrap.py -v` |
| Full suite command | `cd backend && uv run pytest -n auto --dist loadfile` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | POST p99 < 200ms, GET p99 < 100ms under 20 concurrent clients | manual (D-03: explicitly NOT automated/CI) | `uv run python tests/perf/load_test.py --endpoint post ...` | ❌ Wave 0 — new file, not a pytest test by design |
| OPS-02 | 17 tables + 3 views exist; GTFS metadata populated; zero FK violations | unit/integration | `uv run pytest tests/test_bootstrap.py -v` | ❌ Wave 0 |
| OPS-03 | CI runs full suite on push/PR to main | manual verification (push a commit, check Actions tab / badge) | N/A — verified by observing a real workflow run, not a local pytest command | ❌ Wave 0 — new `.github/workflows/ci.yml` |
| OPS-04 | JSON log line with `request_latency_ms`/`method`/`path`/`status` on every request | integration (assert on captured log output) or manual (curl + inspect journal/stdout) | `uv run pytest tests/test_timing_middleware.py -v` (new, recommended) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/test_bootstrap.py tests/test_timing_middleware.py -v` (fast, targets just this phase's new tests)
- **Per wave merge:** `cd backend && uv run pytest -n auto --dist loadfile` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; `load_test.py` run manually at least once with `results.txt` committed as evidence (D-03 — not re-run automatically per commit)

### Wave 0 Gaps
- [ ] `backend/tests/test_bootstrap.py` — covers OPS-02
- [ ] `backend/tests/perf/load_test.py` + `backend/tests/perf/results.txt` — covers OPS-01 (not a pytest file — see D-06)
- [ ] `.github/workflows/ci.yml` — covers OPS-03
- [ ] A test asserting the new JSON log line's shape (e.g. capture `caplog` output through `TimingMiddleware` via `TestClient`, or a small standalone unit test of `JsonFormatter.format()`) — covers OPS-04; none of this exists today (`app/logging_config.py` doesn't exist)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V7 Error Handling and Logging | yes | Structured JSON logging (D-16) must log only `method`/`path`/`status`/`request_latency_ms` — never the `Authorization` header value, full request body, or raw `device_bucket` alongside PII. `request.url.path` (not `.query` or full `.url`) avoids accidentally logging query-string values. This matches the existing project-wide rule already in `CLAUDE.md`: "No logging of request payloads at INFO; avoid IP linkage." |
| V14 Configuration | yes | The new CI workflow (`.github/workflows/ci.yml`) should declare `permissions: contents: read` explicitly (least privilege) since the test job needs no write access and uses no repository secrets (test fixtures inject a dummy `BMTC_API_KEY` via `conftest.py`, not a real credential) |
| V1 Architecture, Design and Threat Modeling | no | This phase adds no new attack surface (no new endpoints, no new data flows exposed to untrusted input) — the load test and CI workflow operate on synthetic/test data only |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Log injection via control characters (e.g., a crafted `path` containing embedded newlines/quotes attempting to forge additional fake JSON fields in the log stream) | Tampering | Using `json.dumps()` (Pattern 4) rather than string concatenation for the log line inherently escapes all such characters — this is one of the stated reasons D-16 chose real JSON over logfmt-style key=value strings |
| CI secret exfiltration via a malicious pull request (a fork PR modifying test code to `curl` out `$BMTC_API_KEY` or other env vars) | Information Disclosure | This workflow triggers on `pull_request` (not the more dangerous `pull_request_target`, which runs with base-branch secrets against untrusted head-branch code) and uses no real secrets — `BMTC_API_KEY` in tests is always the fixed dummy value from `conftest.py`'s `test_env` fixture, never a production credential — so there is nothing of value to exfiltrate even in the worst case |
| Load test script accidentally targeting production `bmtc_dev.db` or a live deployed instance | Tampering / Denial of Service | D-02 already locks this to a scratch DB; the script (Code Examples) hardcodes a `/tmp` scratch path and a `127.0.0.1:8001` local base URL, never reading `BMTC_DB_PATH`/`BASE_URL` from an ambient production `.env` — recommend the implementation keep these as explicit CLI args or hardcoded local defaults, never silently inherited from the shell environment, to prevent an accidental run against a real deployment |

## Sources

### Primary (HIGH confidence — verified via direct execution/inspection against this repo)
- `backend/app/schema.sql` — executed directly against an in-memory SQLite DB; queried `sqlite_master` to derive the authoritative 17-table/3-view list (Pitfall 1, Pattern 6)
- `backend/app/db.py` — read directly; confirmed `get_connection()` never sets `PRAGMA foreign_keys = ON` (Pitfall 7, Pattern 5)
- `backend/app/routes.py:56-230` (`ride_summary` handler) — read directly; confirmed unknown segments 422, confirmed device_bucket/idempotency flow (Pitfall 4, 5)
- `backend/app/routes.py:255-369` (`get_eta` handler) — read directly; confirmed 404 on missing `segment_stats` row, no auto-seed (Pitfall 5)
- Installed `starlette==0.35.1` source (`Starlette.add_middleware`, `Starlette.build_middleware_stack`, via `uv run python -c "import inspect; ..."`) — confirmed actual middleware ordering mechanics (Pitfall 2)
- Direct Python execution (`logging.getLogger().handlers`, `.getEffectiveLevel()`) against this repo's environment — confirmed root logger has no handlers, WARNING default (Pitfall 3)
- `backend/tests/conftest.py` — read directly; confirmed `temp_db`/`db_with_test_segment` fixture patterns to mirror (Pattern 5, 6, Pitfall 5)
- `backend/scripts/generate_sample_data.py` — read directly; confirmed synthetic route/stop IDs and timestamp generation logic (Pitfall 4, 5)
- `.planning/config.json` — confirmed `nyquist_validation: true`, `security_enforcement: true` (drives Validation Architecture / Security Domain section inclusion)

### Secondary (MEDIUM confidence — WebSearch/WebFetch cross-checked against official docs)
- [docs.astral.sh/uv/guides/integration/github/](https://docs.astral.sh/uv/guides/integration/github/) — official `uv` + GitHub Actions example workflow
- [github.com/astral-sh/setup-uv/blob/main/action.yml](https://github.com/astral-sh/setup-uv/blob/main/action.yml) — confirmed `python-version`, `enable-cache`, `cache-dependency-glob` inputs
- [github.com/astral-sh/setup-uv/blob/main/docs/caching.md](https://github.com/astral-sh/setup-uv/blob/main/docs/caching.md) — caching behavior and default glob pattern
- SQLite official docs (`sqlite.org/pragma.html`) — `PRAGMA foreign_key_check` return-row semantics, cross-checked via WebSearch results quoting the official page
- python-httpx.org resource-limits page and `encode/httpx` GitHub discussions — `httpx.Limits`, `AsyncClient` + `asyncio.gather` pattern

### Tertiary (LOW confidence — WebSearch-only, general guidance not tied to an authoritative single source)
- Percentile calculation blog posts (multiple, consistent nearest-rank formula) — cross-checked against each other and against the well-known nearest-rank method, low risk given the formula's simplicity and verifiability
- `pytest-xdist` + GitHub Actions runner CPU-count discussion (GitHub issue threads) — informational only; no code change results from this, just an awareness note (Pitfall 8's neighbor consideration, not elevated to a full pitfall since `ubuntu-latest` is confirmed adequate for this project's small test suite)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all pinned versions read directly from `pyproject.toml`
- Architecture (middleware ordering, logging config, schema/FK verification): HIGH — every claim in Pitfalls 1-3, 7 verified by direct code execution/inspection against this specific repo, not by memory or general web search
- Load test seed-data strategy (Pitfalls 4-6): HIGH for the failure-mode diagnosis (verified against `routes.py`), MEDIUM for the "steady-rate vs burst" recommendation (a defensible judgment call, logged as Assumption A3)
- CI workflow YAML: MEDIUM — mechanism (inputs, caching behavior) verified against official docs; exact version-pin strings (Assumption A2) will drift over time and should be reconfirmed at implementation time

**Research date:** 2026-07-04
**Valid until:** 2026-08-03 (30 days — stable stdlib/SQLite/Starlette mechanics won't change; GitHub Actions action version tags should be reconfirmed at implementation time regardless of this window per Assumption A2)

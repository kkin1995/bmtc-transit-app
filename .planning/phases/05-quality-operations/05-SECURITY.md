---
phase: 5
slug: 05-quality-operations
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
status: verified
created: 2026-07-06
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| test harness → scratch SQLite DB (05-01) | `test_bootstrap.py` creates/inspects a throwaway `tmp_path` DB; no untrusted input, no production data | schema metadata only |
| client → API (ASGI middleware) (05-02) | Untrusted request metadata (method, path) is logged; must not log secrets or user-influenced content unescaped | method, path, status, latency |
| API process → log stream (journald) (05-02) | Log lines are consumed downstream by operators/tools; a crafted `path` could attempt log injection | structured JSON log lines |
| load script → target server/DB (05-03) | The script chooses which DB and URL to hit; must never point at production data or a live deployment | synthetic segment/ride data |
| load client → API (05-03) | Synthetic authenticated POSTs cross the real auth + rate-limit boundary (intentional, D-04) | Bearer token, device_bucket hash |
| untrusted fork PR → CI runner (05-04) | A malicious PR could modify test code to exfiltrate secrets or abuse write permissions | repo checkout, no secrets |
| CI job → repository (05-04) | The workflow's granted permissions define its blast radius | GITHUB_TOKEN scope |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | test operates on real `bmtc_dev.db` instead of a scratch DB | low | mitigate | `backend/tests/test_bootstrap.py` uses `tmp_path`-scoped DBs (lines 41, 65, 87) and `MINI_GTFS_ZIP` (`tests/fixtures/mini_gtfs.zip`, line 20); no reference to `bmtc_dev.db` or the real `bmtc.zip` anywhere in the file | closed |
| T-05-02 | Denial of Service | slow test blocks the every-commit suite | low | accept | Mini fixture bootstrap is sub-second — empirically confirmed: `uv run pytest tests/test_bootstrap.py -v --durations=0` → all 3 tests complete in 0.00–0.01s each, full run 1.23s | closed |
| T-05-03 | Information Disclosure | TimingMiddleware log line | high | mitigate | `backend/app/main.py:61-69` — `extra={"request_latency_ms", "method", "path": request.url.path, "status"}`. No Authorization header, request body, or query string is captured; `.url.path` excludes the query string by construction | closed |
| T-05-04 | Tampering | log injection via crafted `path` (embedded newlines/quotes forging fake JSON fields) | medium | mitigate | `backend/app/logging_config.py:36` emits via `json.dumps(payload, default=str)`. Empirically verified: a crafted `path` containing an embedded newline + quote sequence (`'GET /v1/eta?x=1\n"fake_field": "injected", "status": 999'`) round-trips as a single escaped string value — `json.loads()` of the output does NOT produce an injected `fake_field` key | closed |
| T-05-05 | Denial of Service | a raising formatter crashes request logging | low | mitigate | `JsonFormatter.format()` uses `default=str` (never raises on non-serializable extras); `TimingMiddleware.dispatch()` (`main.py:55-69`) logs inside a `finally` block so logging cannot swallow or block the response | closed |
| T-05-06 | Tampering / Denial of Service | `load_test.py` accidentally targeting `bmtc_dev.db` or a deployed instance | high | mitigate | `backend/tests/perf/load_test.py:42-44` hardcodes `BASE_URL="http://127.0.0.1:8001"` and `DB_PATH="/tmp/perf.db"`; grep confirms zero `os.environ`/`os.getenv` references in the file — values cannot be overridden by ambient `BMTC_DB_PATH`/`BASE_URL` | closed |
| T-05-07 | Spoofing | load uses a single shared `device_bucket`, bypassing real rate-limit behavior | low | mitigate | `backend/tests/perf/load_test.py:100` — each simulated client computes `hashlib.sha256(f"perf-client-{client_id}".encode()).hexdigest()`, giving every client a distinct bucket and exercising the real per-bucket token path | closed |
| T-05-08 | Information Disclosure | CI secret exfiltration via a malicious fork PR | high | mitigate | `.github/workflows/ci.yml` triggers on `pull_request` (line 12), never `pull_request_target`; grep confirms zero `secrets.*` references in the workflow — there is nothing to exfiltrate | closed |
| T-05-09 | Elevation of Privilege | over-privileged workflow token | high | mitigate | `.github/workflows/ci.yml:17-18` declares `permissions: contents: read` at the top level (above `jobs:`), scoping the `GITHUB_TOKEN` to read-only for the entire workflow | closed |
| T-05-10 | Tampering | subprocess-based tests fail on the runner due to hardcoded `PATH` | low | accept | `ubuntu-latest` ships `sqlite3`/`gzip` under `/usr/bin`, matching the hardcoded `PATH="/usr/bin:/bin"` used by `test_gtfs_update.py`, `test_migrations.py`, `test_retention_cleanup.py`, `test_rate_limit_cleanup_script.py`. Empirically validated: 05-04-SUMMARY.md records a real GitHub Actions run (PR #1, run `28747654025`) with all 246 tests — including these subprocess tests — passing green on `ubuntu-latest` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-02 | Mini-fixture bootstrap runs in ~0.01s/test (1.23s for the full 3-test file); this is precisely why D-07 rejected the 1.46M-row production `bmtc.zip` for every-commit tests. No mitigation needed beyond the fixture choice already made. | gsd-security-auditor (phase-05 audit) | 2026-07-06 |
| AR-05-02 | T-05-10 | `ubuntu-latest` (the only runner used, no matrix per D-13) ships `sqlite3`/`gzip` at `/usr/bin`, matching the subprocess tests' hardcoded `PATH`. Verified empirically by a real green CI run (PR #1, run 28747654025) exercising these exact tests. Risk would resurface only if a non-Linux runner is added later. | gsd-security-auditor (phase-05 audit) | 2026-07-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Auditor Notes (informational — not blocking)

- **Newly-live logging surface (no severity change, no action required):** OPS-04's `configure_logging()` (`backend/app/main.py:24`) changes the root logger from "no handler / effectively WARNING-only via last-resort handler" to an explicit INFO-level JSON handler. This makes ~9 pre-existing `logger.info()`/`logger.warning()` call sites in `backend/app/routes.py`, `backend/app/rate_limit.py`, and `backend/app/learning.py` emit for the first time in production — none of these call sites were authored by Phase 5's four plans, and none are covered by T-05-03 (which is scoped narrowly to `TimingMiddleware`'s own log line). Spot-checked all of them: they log `segment_id`/`bin_id`/derived stats, client-supplied `idempotency_key` UUIDs, and hashed `bucket_id`s — no raw `Authorization` header, device_bucket-from-request-body, or request payload is logged. `rate_limit.py:303-304` explicitly documents "H3 SECURITY FIX: Do NOT log bucket_id" for the 429 path. No unregistered high/critical exposure found, so this is not logged as an open threat — flagged here only because "OPS-04 makes previously-dormant logging live" is new attack surface with no explicit threat mapping in the Phase 5 register, and a future phase that adds a careless `logger.info(payload)` call will now actually leak it where it silently wouldn't have before.
- **Out of scope per orchestrator context:** CR-01 (05-REVIEW.md) — a `RateLimitMiddleware` idempotency-replay bug found via code review and already fixed in a follow-up commit — predates Phase 5 and is explicitly excluded from this register per the task's `<additional_context>`. Not re-verified here.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-06 | 10 | 10 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-06

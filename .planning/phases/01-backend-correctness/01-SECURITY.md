---
phase: 01
slug: backend-correctness
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-02
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client→API | Untrusted POST/GET request payloads and headers cross into route handlers that open SQLite connections | Ride segment payloads, query params, headers |
| API→SQLite | Each handler opens a file-backed connection; unclosed connections are OS file descriptors that accumulate | DB connections, ride/segment rows |
| browser→API (CORS) | The `Origin` request header is attacker-influenceable; CORS policy decides which origins may read responses | Origin header, cross-origin responses |
| client→API (idempotency table) | Untrusted clients drive idempotency-key rows; unbounded growth is an availability concern | Idempotency-Key header, cached response bodies |
| client→API (Idempotency-Key replay) | The `Idempotency-Key` header and request body are attacker-influenceable; replay must return the original response only for a matching body | Cached response_body, body_sha256 |
| client→API (deprecated field) | `timestamp_utc` is a legacy client-supplied input; its use must be signaled back to the client, not just logged | timestamp_utc input, X-Deprecation-Warning header |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Denial of Service | `db.py get_connection()` + all route handlers | high | mitigate | `get_connection()` converted to `@contextmanager` with `try/finally: conn.close()` (db.py:45-46); all 15 app + 24 test call sites migrated to `with` syntax; zero manual `conn.close()` remain in routes.py; verified by `test_connection_leak.py` (forced-exception + repeated-failure tests) | closed |
| T-01-02 | Tampering | test suite fidelity | low | accept | 8 pre-existing baseline failures recorded and diffed against post-change runs; no misattribution risk | closed |
| T-01-SC | Tampering | pip/npm/cargo installs | low | accept | Plan 01 installs no new packages (stdlib `contextlib` only) | closed |
| T-02-CORS | Tampering / Information Disclosure | `main.py` CORSMiddleware config | high | mitigate | Explicit origin allowlist via `settings.cors_origins.split(",")` (main.py:96); `allow_credentials` fully removed (zero grep matches) — eliminates wildcard-origin+credentials Starlette misconfiguration; verified by `test_cors.py` (5 tests) | closed |
| T-02-Growth | Denial of Service | `idempotency_keys` table | medium | mitigate | `cleanup_expired_keys()` invoked in `lifespan` startup after `init_db()` (main.py:14,50); verified by `test_startup_cleanup.py` | closed |
| T-02-DeadCode | Tampering | `slowapi` Limiter dead code | low | mitigate | All slowapi imports/instances/wiring deleted from main.py, routes.py, pyproject.toml; `grep -rn 'slowapi' backend/app/ --include='*.py'` returns zero matches | closed |
| T-02-SC | Tampering | pip dependency set | low | accept | Plan 02 only removes an already-vetted dependency (`slowapi==0.1.9`); installs nothing new | closed |
| T-03-Replay | Denial of Service (indirect) | `routes.py` idempotency replay + `idempotency.py` | high | mitigate | `response_body` column stores serialized JSON; replay deserializes and returns the original `RideSummaryResponse` byte-for-byte instead of stale zeros (routes.py:92-104, idempotency.py:71,86,117); verified by `test_replay_returns_original_accepted_count_not_zero` | closed |
| T-03-NullCrash | Denial of Service | `routes.py` replay deserialization | medium | mitigate | Explicit `if response_body is not None:` guard (routes.py:93) before `json.loads`; legacy NULL rows fall through to fresh processing rather than raising | closed |
| T-03-Tamper | Tampering | idempotency body-hash verification | low | accept | Pre-existing SHA256 body-hash 409-on-mismatch logic untouched by Plan 03; replay only returns cached body on hash match | closed |
| T-03-SC | Tampering | pip dependency set | low | accept | Plan 03 installs no new packages (stdlib `json` only) | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-02 | Pre-existing baseline test failures are unrelated to Phase 1 changes; tracked via baseline diff, not fixed in-phase | Plan 01 author | 2026-07-01 |
| AR-02 | T-01-SC | No new dependencies introduced (stdlib `contextlib` only) | Plan 01 author | 2026-07-01 |
| AR-03 | T-02-SC | Dependency removal only (`slowapi==0.1.9`), no new supply-chain surface | Plan 02 author | 2026-07-01 |
| AR-04 | T-03-Tamper | Existing body-hash verification control (pre-Phase-1) is out of scope and untouched | Plan 03 author | 2026-07-01 |
| AR-05 | T-03-SC | No new dependencies introduced (stdlib `json` only) | Plan 03 author | 2026-07-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-02 | 11 | 11 | 0 | /gsd-secure-phase (grep-level L1 verification, ASVS level 1, register authored at plan time — short-circuit path) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-02

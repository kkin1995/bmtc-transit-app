---
phase: 01-backend-correctness
verified: 2026-07-01T00:00:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Backend Correctness Verification Report

**Phase Goal:** Every route handler closes its SQLite connection under all exit paths; idempotency replay returns the original response; CORS is safe for production; and dead slowapi code is removed
**Verified:** 2026-07-01
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submitting a ride that causes an internal exception does not leak a SQLite file descriptor | ✓ VERIFIED | `backend/app/db.py:45-59` — `get_connection()` is `@contextmanager` with `try: yield conn / finally: conn.close()`. `backend/tests/test_connection_leak.py` (2 tests) pass: forced `RuntimeError` mid-handler does not leak, and 25 repeated forced failures still leave DB usable. Zero manual `conn.close()` remain outside `db.py` (`grep -rn "conn.close()" app/` returns only the 2 correct occurrences inside `db.py` itself). All 15 app call sites use `with get_connection(...) as conn:` |
| 2 | A client that retries POST /v1/ride_summary with the same Idempotency-Key receives the original accepted/rejected counts — not zeros | ✓ VERIFIED | `backend/app/routes.py:92-105` — replay branch reads `response_body`, deserializes via `json.loads`, returns `RideSummaryResponse(**cached_data)` byte-for-byte; legacy `response_body IS NULL` rows fall through to fresh reprocessing (D-09), never returning old zero-count response. `backend/tests/test_idempotency_bodyhash.py::test_replay_returns_original_accepted_count_not_zero` PASSES (verified directly, not from SUMMARY claim) |
| 3 | The CORS configuration specifies an explicit origin list; allow_credentials=True is removed or scoped to a non-wildcard origin | ✓ VERIFIED | `backend/app/main.py:95-98` — `allow_origins=settings.cors_origins.split(",")` (explicit allowlist from `BMTC_CORS_ORIGINS`); `grep -c 'allow_credentials' backend/app/main.py` returns 0 (fully deleted, not scoped-false). `backend/tests/test_cors.py` (5 tests) all PASS |
| 4 | Expired idempotency keys are removed on application startup — no rows older than 24h after a fresh server start | ✓ VERIFIED | `backend/app/main.py:14,50` — `cleanup_expired_keys()` imported and called in `lifespan` after `init_db(settings.db_path)`. `backend/tests/test_startup_cleanup.py::test_expired_idempotency_key_purged_on_startup` PASSES |
| 5 | The response to POST /v1/ride_summary includes an X-Deprecation-Warning header when the deprecated timestamp_utc field is used | ✓ VERIFIED | `backend/app/routes.py:98-101,226-229` (POST) and `408-411` (GET, bonus scope) — `JSONResponse(content=model.model_dump(), headers={"X-Deprecation-Warning": ...})` returned when `deprecation_warning` set. `docs/api.md` documents the header spec-first (`grep -c` returns 4 matches, both endpoints + changelog). `backend/tests/test_deprecation_header.py` (4 tests: POST/GET present+absent) all PASS |
| 6 | The slowapi Limiter instances in routes.py and main.py are deleted — one rate-limiting mechanism only | ✓ VERIFIED | `grep -rn 'slowapi' backend/app/ --include='*.py'` returns zero matches. `grep -n 'slowapi' backend/pyproject.toml backend/uv.lock` returns zero matches. `RateLimitMiddleware` (`backend/app/rate_limit.py`) remains the sole active limiter |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/db.py` | `get_connection()` as `@contextmanager` w/ try/finally | ✓ VERIFIED | Confirmed lines 45-59; `init_db()` unchanged (separate inline connect/close) |
| `backend/tests/test_connection_leak.py` | Forced-exception + repeated-failure test | ✓ VERIFIED | 2/2 tests pass |
| `backend/app/config.py` | `cors_origins: str` field | ✓ VERIFIED | Line 20, default `"http://localhost:8081,http://localhost:19006"` |
| `backend/tests/test_cors.py` | Allowlist + credentials-absence tests | ✓ VERIFIED | 5/5 tests pass |
| `backend/tests/test_startup_cleanup.py` | cleanup invoked at lifespan startup | ✓ VERIFIED | 1/1 test passes |
| `docs/api.md` | X-Deprecation-Warning documented (spec-first) | ✓ VERIFIED | 4 matches (POST section, GET section, changelog) |
| `idempotency_keys.response_body` column | Guarded ALTER in `db.py init_db()` | ✓ VERIFIED | `db.py:24-26` `PRAGMA table_info` guard; also in `schema.sql` for fresh installs |
| `backend/tests/test_deprecation_header.py` | Header presence/absence tests | ✓ VERIFIED | 4/4 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Every `get_connection()` call site (app+tests) | `db.py`'s contextmanager | `with get_connection(...) as conn:` | ✓ WIRED | `grep -rn 'conn = get_connection'` returns zero matches; 15 app sites confirmed using `with` syntax |
| `main.py` CORSMiddleware | `settings.cors_origins` | `.split(',')`, no `allow_credentials` param | ✓ WIRED | Confirmed at `main.py:95-98` |
| `main.py` lifespan | `idempotency.py cleanup_expired_keys()` | Called after `init_db()` | ✓ WIRED | Confirmed at `main.py:46,50` |
| `routes.py` replay branch | `idempotency.py response_body` | `json.loads(response_body)` → `RideSummaryResponse(**cached_data)` | ✓ WIRED | Confirmed at `routes.py:92-101`; test proves non-zero replay value |
| `routes.py` POST/GET handlers | Client response | `JSONResponse(..., headers={"X-Deprecation-Warning": ...})` | ✓ WIRED | Confirmed at both endpoints; docs/api.md matches implementation message text verbatim |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Connection-leak regression test | `uv run pytest tests/test_connection_leak.py -v` | 2 passed | ✓ PASS |
| CORS allowlist enforcement | `uv run pytest tests/test_cors.py -v` | 5 passed | ✓ PASS |
| Startup cleanup invocation | `uv run pytest tests/test_startup_cleanup.py -v` | 1 passed | ✓ PASS |
| Idempotency replay non-zero value | `uv run pytest tests/test_idempotency_bodyhash.py::test_replay_returns_original_accepted_count_not_zero -v` | 1 passed | ✓ PASS |
| Deprecation header present/absent (POST+GET) | `uv run pytest tests/test_deprecation_header.py -v` | 4 passed | ✓ PASS |
| No slowapi anywhere | `grep -rn 'slowapi' backend/app/ --include='*.py'` | 0 matches | ✓ PASS |
| Full suite regression check | `cd backend && uv run pytest -q` | 189 passed, 6 failed | ✓ PASS — failure set is exactly the documented pre-existing baseline minus the 2 drive-by fixes (see below) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BUGFIX-01 | 01-01 | SQLite connections always closed, even on exception | ✓ SATISFIED | `db.py` contextmanager + `test_connection_leak.py` |
| BUGFIX-02 | 01-02 | CORS locked to explicit allowlist; `allow_credentials` removed/scoped | ✓ SATISFIED | `main.py` CORS block + `test_cors.py` |
| BUGFIX-03 | 01-03 | Idempotency replay returns original response body | ✓ SATISFIED | `routes.py` replay branch + `response_body` column + replay-value test |
| BUGFIX-07 | 01-02 | Expired idempotency keys cleaned up automatically at startup | ✓ SATISFIED | `main.py` lifespan call + `test_startup_cleanup.py` |
| LEARN-03 | 01-02 | slowapi dead code removed | ✓ SATISFIED | grep-clean across `app/`, `pyproject.toml`, `uv.lock` |
| API-05 | 01-03 | X-Deprecation-Warning header sent to clients | ✓ SATISFIED | `docs/api.md` (spec-first) + `routes.py` implementation + `test_deprecation_header.py` |

No orphaned requirements — REQUIREMENTS.md's Phase 1 traceability table (lines 126-131) lists exactly these 6 IDs, all cross-referenced above. (Note: `CORE-01..CORE-11` entries also tagged "Phase 1" in REQUIREMENTS.md's feature table refer to the original baseline application scope, not this bugfix phase's deliverable — they predate Phase 1 of this roadmap cycle and are not part of this phase's `requirements:` frontmatter across any of the 3 plans.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers found in any phase-modified file (`db.py`, `routes.py`, `idempotency.py`, `rate_limit.py`, `bootstrap.py`, `main.py`, `config.py`) | — | — |

No blocker or warning anti-patterns found in the files this phase modified. A prior code review (`01-REVIEW.md`) flagged 3 Critical issues (CR-01/02/03) in `rate_limit.py` and error-response shape handling — these are confirmed, by direct test execution, to be **pre-existing baseline defects** recorded in `01-VALIDATION.md` before any Phase 1 change (the exact 8-failure baseline: `test_idempotency.py` x2, `test_idempotency_bodyhash.py` x4, `test_rate_limit.py` x2). Plan 01-03 fixed 2 of the 8 as an explicit, in-scope drive-by (`test_idempotency.py`'s stale 2-arg signature calls), leaving exactly 6 — confirmed still present and unchanged by direct `pytest -q` execution during this verification. None of the 6 remaining failures are caused by, or block, any of the 6 roadmap success criteria: the CORS, connection-leak, startup-cleanup, slowapi-removal, and deprecation-header criteria are unaffected by `rate_limit.py`/error-shape issues, and the idempotency-replay success criterion is proven independently by the passing `test_replay_returns_original_accepted_count_not_zero` test (the 4 failing `test_idempotency_bodyhash.py` tests test unrelated concerns — reordered-JSON-key hashing, modified-segment 409 detail-key shape, expired-key 422 validation, and different-body 409 detail-key shape — none of which assert on replay VALUE). 01-03-PLAN.md explicitly scoped these out as "Phase 6 territory," and ROADMAP.md's Phase 6 ("Rate-Limit Hardening & API Docs Completeness") is the designated home for CR-01/02/03.

### Human Verification Required

None. All 6 success criteria are directly verifiable via grep/test execution and were verified by direct command execution during this review (not taken from SUMMARY.md claims).

### Gaps Summary

No gaps. All 6 ROADMAP.md success criteria are met, backed by passing tests executed directly during verification (not SUMMARY claims). The 6 pre-existing test failures are correctly out of scope per the explicit baseline recorded in `01-VALIDATION.md` prior to any Phase 1 work, are unrelated to any of the 6 success criteria, and are already tracked for remediation in Phase 6 per ROADMAP.md.

---

_Verified: 2026-07-01_
_Verifier: Claude (gsd-verifier)_

---
phase: 01-backend-correctness
plan: 03
subsystem: api
tags: [idempotency, deprecation, http-headers, sqlite-schema, spec-first]

# Dependency graph
requires:
  - phase: 01-backend-correctness (plan 01)
    provides: get_connection() as @contextmanager — all call sites migrated to `with` syntax
  - phase: 01-backend-correctness (plan 02)
    provides: cleanup_expired_keys() at startup; slowapi dead code removed
provides:
  - Genuine idempotency replay (response_body TEXT column + byte-for-byte replay, BUGFIX-03)
  - X-Deprecation-Warning response header on POST /v1/ride_summary and GET /v1/eta (API-05)
  - docs/api.md spec update documenting the header (spec-first per CLAUDE.md Rule 1)
affects: [02-learning-correctness, mobile-client-deprecation-handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guarded ALTER TABLE via PRAGMA table_info(table) column-existence check in init_db() — idempotent schema evolution without a migration framework"
    - "JSONResponse(content=model.model_dump(), headers={...}) escape hatch for attaching custom headers while still constructing the Pydantic model first (keeps validation guarantees)"
    - "Idempotency replay: response_body IS NULL treated as cache miss, not an error — legacy rows fall through to fresh reprocessing"

key-files:
  created:
    - backend/tests/test_deprecation_header.py
  modified:
    - docs/api.md
    - backend/app/schema.sql
    - backend/app/db.py
    - backend/app/idempotency.py
    - backend/app/routes.py
    - backend/tests/test_idempotency_bodyhash.py
    - backend/tests/test_idempotency.py

key-decisions:
  - "response_body column added via BOTH schema.sql (fresh installs) AND a guarded ALTER TABLE in db.py init_db() (existing DBs whose CREATE TABLE IF NOT EXISTS was a no-op), per D-06"
  - "Replay returns the response byte-for-byte identical to the original — no 'this is a replay' marker (D-08, Stripe-style idempotency semantics)"
  - "Legacy response_body IS NULL rows are treated as a cache miss and reprocessed fresh, never falling back to the old zero-count response (D-09)"
  - "X-Deprecation-Warning applied to BOTH POST /v1/ride_summary and GET /v1/eta, even though roadmap criterion #5 only named POST — same underlying server-log-only bug exists on GET (D-10)"
  - "Spec (docs/api.md) updated FIRST, before tests or implementation, per CLAUDE.md Global Workflow Rule 1"

requirements-completed: [BUGFIX-03, API-05]

coverage:
  - id: D1
    description: "Idempotent replay returns the ORIGINAL accepted/rejected counts, not hardcoded zeros"
    requirement: "BUGFIX-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_idempotency_bodyhash.py#test_replay_returns_original_accepted_count_not_zero"
        status: pass
    human_judgment: false
  - id: D2
    description: "Legacy response_body IS NULL rows are treated as a cache miss and reprocessed fresh"
    requirement: "BUGFIX-03"
    verification:
      - kind: manual
        ref: "routes.py replay branch: `if response_body is not None:` guard falls through to fresh processing when False — no dedicated legacy-row regression test added this plan (pre-existing test_body_hash_verification_with_null_stored_hash in test_idempotency_bodyhash.py covers the adjacent NULL body_hash case and passes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs/api.md documents X-Deprecation-Warning (name, trigger, value, both endpoints) BEFORE implementation — spec-first"
    requirement: "API-05"
    verification:
      - kind: other
        ref: "grep -c 'X-Deprecation-Warning' docs/api.md (returns 4, >= 2 required)"
        status: pass
    human_judgment: false
  - id: D4
    description: "X-Deprecation-Warning header present on POST /v1/ride_summary and GET /v1/eta when timestamp_utc used; absent when current field used"
    requirement: "API-05"
    verification:
      - kind: integration
        ref: "backend/tests/test_deprecation_header.py (4 tests: POST present/absent, GET present/absent)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Drive-by: fix 2 stale test_idempotency.py tests calling old 2-arg store_idempotency_key() signature"
    requirement: "BUGFIX-03 (thematic drive-by, RESEARCH.md Open Question 1)"
    verification:
      - kind: unit
        ref: "backend/tests/test_idempotency.py::test_idempotency_key_store_and_retrieve, ::test_idempotency_key_replace"
        status: pass
    human_judgment: false

duration: 33min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 3: Idempotency Replay Fix + Deprecation Header Summary

**Genuine idempotency replay via a stored `response_body` column (byte-for-byte, legacy-null-safe) and a client-visible `X-Deprecation-Warning` header on both endpoints, spec-first in docs/api.md**

## Performance

- **Duration:** 33 min
- **Started:** 2026-07-01T09:04:33Z
- **Completed:** 2026-07-01T09:37:xx Z (approx, self-timed)
- **Tasks:** 4 completed
- **Files modified:** 7 (docs/api.md, schema.sql, db.py, idempotency.py, routes.py, test_idempotency_bodyhash.py, test_idempotency.py) + 1 created (test_deprecation_header.py)

## Accomplishments

- Updated `docs/api.md` FIRST (spec-first per CLAUDE.md Rule 1) to document the `X-Deprecation-Warning` header — name, trigger condition, exact message text, and a Changelog (API) entry — for both `POST /v1/ride_summary` and `GET /v1/eta`
- Added `response_body TEXT` to the `idempotency_keys` table in `schema.sql` (fresh installs) AND a guarded `ALTER TABLE` in `db.py`'s `init_db()` using a `PRAGMA table_info(idempotency_keys)` column-existence check (idempotent — safe to run on every startup, verified by calling `init_db()` twice against the same DB with no error)
- `idempotency.py`: `check_idempotency_key()` now selects and returns `response_body` (`None` for legacy rows); `store_idempotency_key()` serializes the response via `json.dumps()` and writes it — function signatures and body-hash verification logic unchanged
- `routes.py`: the `ride_summary` replay branch now deserializes `response_body` and returns the ORIGINAL `RideSummaryResponse` byte-for-byte instead of the hardcoded `accepted_segments=0, rejected_segments=0`; a `response_body IS NULL` legacy row falls through to fresh reprocessing rather than crashing or returning stale zeros (D-09)
- `routes.py`: both `ride_summary` and `get_eta` now attach `X-Deprecation-Warning` via `JSONResponse(content=model.model_dump(), headers={...})` when the deprecated `timestamp_utc` field/param is used — constructing the Pydantic model first (validation intact), then dumping it into `JSONResponse` only when the header must be attached
- Drive-by: fixed the 2 pre-existing `test_idempotency.py` failures (`test_idempotency_key_store_and_retrieve`, `test_idempotency_key_replace`) that called the stale 2-arg `store_idempotency_key(key, response_data)` signature — updated to the current 3-arg `store_idempotency_key(key, body_data, response_data)`
- New test file `test_deprecation_header.py` (4 tests: POST present/absent, GET present/absent) and a new replay-value assertion test in `test_idempotency_bodyhash.py` — all passing
- Full suite: **189 passed, 6 failed** (down from baseline 182 passed, 8 failed) — the 6 remaining failures are the pre-existing, out-of-scope baseline failures (`test_idempotency_bodyhash.py` ×4, `test_rate_limit.py` ×2), unchanged and unrelated to this plan's scope; no new regressions introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: Update docs/api.md to document X-Deprecation-Warning (SPEC-FIRST)** - `ea2be7e` (docs)
2. **Task 2: Add response_body column (schema + guarded ALTER) and write replay + deprecation tests (RED)** - `9aad722` (test)
3. **Task 3: Store and return response_body in idempotency.py** - `f3fba3a` (feat)
4. **Task 4: Replay stored response + attach deprecation headers in routes.py; fix 2 stale tests (GREEN)** - `c407ae0` (fix)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 2 intentionally produced 2 RED tests (`test_post_ride_summary_with_timestamp_utc_has_deprecation_header`, `test_get_eta_with_timestamp_utc_has_deprecation_header`) plus a pre-existing-pattern RED on the new replay-value assertion — all turned GREEN by Task 4._

## Files Created/Modified

- `docs/api.md` - Documented `X-Deprecation-Warning` header for POST /v1/ride_summary and GET /v1/eta (headers block + deprecation note); added a Changelog (API) "Unreleased" entry
- `backend/app/schema.sql` - Added `response_body TEXT` column to `idempotency_keys` CREATE TABLE (fresh installs)
- `backend/app/db.py` - Added guarded `ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT` in `init_db()`, gated by a `PRAGMA table_info` existing-columns check (idempotent across repeated startups)
- `backend/app/idempotency.py` - `check_idempotency_key()` SELECT + result dict now include `response_body`; `store_idempotency_key()` INSERT now writes `json.dumps(response_data)` into `response_body`
- `backend/app/routes.py` - Added `import json`; `ride_summary`'s idempotency-replay branch deserializes and returns the original cached response (legacy-null fall-through); both `ride_summary` and `get_eta` return `JSONResponse` with `X-Deprecation-Warning` when `timestamp_utc` is used
- `backend/tests/test_deprecation_header.py` - New: 4 tests (POST + GET, header present/absent)
- `backend/tests/test_idempotency_bodyhash.py` - Added `test_replay_returns_original_accepted_count_not_zero` (replay-value assertion)
- `backend/tests/test_idempotency.py` - Fixed 2 stale tests to use the current 3-arg `store_idempotency_key()` signature

## Decisions Made

- Column added in BOTH `schema.sql` (documents intent for fresh installs) and a guarded `ALTER TABLE` in `db.py` (handles existing DBs whose `CREATE TABLE IF NOT EXISTS` is a no-op) — per D-06 and RESEARCH.md's recommended Option B (`PRAGMA table_info` check preferred over try/except string-matching on SQLite's error text)
- Replay is byte-for-byte identical to the original response with no extra "this is a replay" marker, per D-08 (Stripe-style idempotency contract)
- `response_body IS NULL` (legacy row within the 24h TTL, written before this fix deployed) is explicitly treated as a cache miss — the code falls through to the exact same processing path as "no key at all," never resurrecting the old broken zero-count response (D-09, RESEARCH.md Pitfall 2)
- `X-Deprecation-Warning` applied to both endpoints per D-10, even though the roadmap's success criterion only names POST — the same server-log-only deprecation bug existed identically on GET `/v1/eta`, and fixing both is a small additive change within this bug-fix phase's intent
- The 2 stale `test_idempotency.py` tests were fixed as an explicit drive-by (per RESEARCH.md Open Question 1's recommendation) since `idempotency.py` was already being touched for the response_body change — the other 6 baseline failures (`test_idempotency_bodyhash.py` ×4, `test_rate_limit.py` ×2) were left untouched as genuinely out-of-scope (Phase 6 territory)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `db_with_test_segment`-style fixtures only seed bin_id=0, causing false negatives in new tests**
- **Found during:** Task 2 (writing `test_deprecation_header.py` and the replay-value test)
- **Issue:** The existing `setup_segment_for_bodyhash` (in `test_idempotency_bodyhash.py`) and a naive single-bin seed in the new `test_deprecation_header.py` fixture only inserted `segment_stats` for `bin_id=0`. Since `compute_bin_id()` maps "now" to whichever of the 192 bins the current wall-clock time falls into (not always bin 0), requests made with `timestamp_utc=int(time.time())` frequently missed the seeded row, causing `update_segment_stats()` to reject the segment (`accepted_segments=0`) for reasons unrelated to the code under test — a false negative that would have made the replay-value assertion meaningless.
- **Fix:** Seeded `segment_stats` for all 192 bins (matching the existing `db_with_test_segment` fixture's established pattern) in both the new `test_deprecation_header.py` fixture and inline within `test_replay_returns_original_accepted_count_not_zero` (without mutating the shared `setup_segment_for_bodyhash` fixture used by other, unrelated tests in the same file).
- **Files modified:** `backend/tests/test_deprecation_header.py`, `backend/tests/test_idempotency_bodyhash.py`
- **Verification:** Both test files pass; first-submission `accepted_segments == 1` confirmed before asserting replay equality.
- **Committed in:** `9aad722` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, test-infrastructure only — no production code affected)
**Impact on plan:** None on scope; this was a test-fixture correctness fix needed to make the new tests meaningful, not a change to any file the plan lists as modified beyond the two test files already in scope.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — no external service configuration required. The `response_body` column change is fully backward-compatible (nullable, guarded ALTER) and requires no manual migration step; it self-applies on the next `init_db()` call (every app startup).

## Next Phase Readiness

- All three plans of Phase 1 (Backend Correctness) are now complete: connection-leak fix (01), CORS/startup-cleanup/slowapi removal (02), idempotency-replay + deprecation-header (03)
- Full suite: 189 passed, 6 pre-existing baseline failures unchanged (`test_idempotency_bodyhash.py` ×4 — pre-existing 422/hash-verification issues; `test_rate_limit.py` ×2 — pre-existing `device_bucket`-required-field issue) — none introduced or worsened by this plan
- Idempotency replay contract is now correct end-to-end: clients retrying `POST /v1/ride_summary` with the same `Idempotency-Key` receive their original accepted/rejected counts, removing the incentive for indefinite client-side retry loops (T-03-Replay mitigation)
- `X-Deprecation-Warning` is now a documented, client-visible contract (docs/api.md) that the mobile app or any client can detect and act on ahead of the `timestamp_utc` removal target (v0.3.0, 2025-11-30)
- Phase 2 (learning-correctness) can proceed — no shared files with this plan's scope

---
*Phase: 01-backend-correctness*
*Completed: 2026-07-01*

## Self-Check: PASSED

All 8 created/modified source and test files verified present on disk; all 4 task commits (`ea2be7e`, `9aad722`, `f3fba3a`, `c407ae0`) verified present in git log.

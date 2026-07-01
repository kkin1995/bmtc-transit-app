# Phase 1: Backend Correctness - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate P0 production-reliability defects in the existing FastAPI backend without adding new capabilities: SQLite connection leaks in route handlers, an unsafe CORS configuration, broken idempotency replay, unscheduled idempotency key cleanup, dead `slowapi` rate-limit code, and a missing client-visible deprecation signal for the legacy `timestamp_utc` field. Covers requirements BUGFIX-01, BUGFIX-02, BUGFIX-03, BUGFIX-07, LEARN-03, API-05.

No new endpoints, no schema redesign beyond the one column needed to fix idempotency replay, no learning-algorithm changes (that's Phase 2).

</domain>

<decisions>
## Implementation Decisions

### CORS Configuration (BUGFIX-02)
- **D-01:** Remove `allow_credentials=True` entirely — auth is Bearer-token-in-header only, no cookies are used, so CORS credentials mode is unnecessary and its removal eliminates the wildcard-origin + credentials combination browsers reject.
- **D-02:** Replace `allow_origins=["*"]` with a new `BMTC_CORS_ORIGINS` setting in `config.py` (comma-separated string, e.g. `"http://localhost:8081,http://localhost:19006"`, split on `,` in code — not JSON).
- **D-03:** Default value (when `BMTC_CORS_ORIGINS` is unset) is the Expo dev localhost origins only (`http://localhost:8081`, `http://localhost:19006`) — matches the pattern of other `BMTC_*` settings having sane dev defaults. Do not fail startup on unset.
- **D-04:** No production domain exists yet — do not hardcode one. Production sets the real value via env at deploy time (`/etc/bmtc-api/env`).
- **D-05:** Leave `allow_methods=["*"]` and `allow_headers=["*"]` as wildcards — safe without `allow_credentials`, no security benefit to narrowing, avoids churn when headers are added later.

### Idempotency Replay (BUGFIX-03)
- **D-06:** `idempotency_keys` table gets a new `response_body TEXT` column via an ad-hoc `ALTER TABLE` in `schema.sql`'s bootstrap path (try `ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT`, swallow "duplicate column" error) — self-contained for Phase 1, does not wait on the Phase 4 migration framework.
- **D-07:** Store the full serialized JSON response string (`json.dumps(response_data)`) in `response_body` at write time (`store_idempotency_key`). Replay returns this string byte-for-byte via `check_idempotency_key`.
- **D-08:** Replay returns an identical response to the original — no extra header or field signals "this is a replay" (standard idempotency-key contract, matches Stripe-style semantics).
- **D-09:** For legacy rows written before this fix deploys (up to 24h, `response_body IS NULL`), treat as a cache miss and process the ride submission fresh — never fall back to the old broken zero-count response. Self-heals within the 24h TTL.

### Deprecation Header (API-05)
- **D-10:** Apply `X-Deprecation-Warning` to **both** `POST /v1/ride_summary` (per-segment `timestamp_utc`) and `GET /v1/eta` (query-param `timestamp_utc`) — roadmap criterion #5 only names POST, but the same underlying bug (server-log-only) exists on GET; fixing both is a small additive change within this phase's bug-fix intent.
- **D-11:** Header value is the existing message text already defined in `routes.py:66` (e.g. `"timestamp_utc is deprecated, use observed_at_utc (ISO-8601). Will be removed in v0.3.0 (2025-11-30)"`), sent as `X-Deprecation-Warning: <message>` — not the RFC 8594 `Deprecation`/`Link` header style.
- **D-12:** Implementation attaches the header by returning `JSONResponse` directly (bypassing `response_model`), manually serializing via the Pydantic model's `.model_dump()` — matches the fix approach already suggested in CONCERNS.md. Applies to both the POST and GET handlers that need the header.

### Connection Leak Fix (BUGFIX-01)
- **D-13:** Convert `get_connection()` in `backend/app/db.py` into a context manager (`@contextmanager`) so every route-handler call site becomes `with get_connection(db_path) as conn:` — one change point in `db.py`, Python guarantees `close()` on any exit path including exceptions.
- **D-14:** No special-case handling needed for the `GET /v1/eta` handler even though it now also returns `JSONResponse` directly for the deprecation header (D-12) — build response content inside (or after) the `with` block; the context manager closes the connection on block exit regardless of how it exits.
- **D-15:** Scope is `backend/app/routes.py` handlers only, per roadmap wording and CONCERNS.md's P0 callout. Do NOT touch `idempotency.py`, `learning.py`, or `gtfs_bootstrap.py` connection-opening code in this phase — those open short-lived connections inline already and are not the flagged leak pattern. Revisit only if a leak is actually found there later.

### Idempotency Key Cleanup (BUGFIX-07)
- Locked by ROADMAP.md success criterion #4: `cleanup_expired_keys()` is called on application startup (not via systemd timer) — no discussion needed, already decided.

### Dead Code Removal (LEARN-03)
- Delete the `slowapi` `Limiter` instances in `routes.py:49` and `main.py:57` and the associated `@limiter` state wiring — mechanical removal, no behavior change since `RateLimitMiddleware` is the actual (and only) active rate limiter. No further discussion needed.

### Claude's Discretion
- Exact wording/placement of the `ALTER TABLE ... ADD COLUMN` guard (try/except vs. `PRAGMA table_info` check) in `schema.sql`'s bootstrap path.
- Whether the JSONResponse-based deprecation-header handlers still validate the payload against the Pydantic response model before serializing (recommended: yes, construct the Pydantic model first, then `.model_dump()` it into `JSONResponse`, to keep validation guarantees).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Known issues driving this phase
- `.planning/codebase/CONCERNS.md` — P0 connection leak (routes.py all handlers), P0 CORS wildcard+credentials (main.py:92-97), idempotency replay stale-zero bug (routes.py:95-99, idempotency.py:82-95), deprecation header undeliverable via response_model (routes.py:221-226), slowapi dead code (routes.py:49, main.py:57)
- `.planning/codebase/ARCHITECTURE.md` — component responsibilities, data flow, API layer, concurrency/consistency model

### Project-level requirements and roadmap
- `.planning/REQUIREMENTS.md` — BUGFIX-01, BUGFIX-02, BUGFIX-03, BUGFIX-07, LEARN-03, API-05 definitions
- `.planning/ROADMAP.md` §"Phase 1: Backend Correctness" — goal and 6 success criteria this phase must satisfy
- `.planning/PROJECT.md` — constraints (SQLite-only, privacy, single-writer, backward compatibility, performance targets)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/errors.py` — structured error helpers already exist; the JSONResponse-based deprecation-header handlers should keep using the existing `{error, message, details}` shape for error paths.
- `backend/app/config.py` — `BMTC_*` settings pattern (Pydantic `Settings` class, cached via `get_settings()`) is the established place to add `cors_origins`.

### Established Patterns
- `backend/app/db.py:37` `get_connection(db_path)` — currently a plain function returning `sqlite3.Connection`; every route handler calls it bare and closes manually. This is the single point of change for D-13.
- `backend/app/idempotency.py` — already has `compute_body_hash`, `compute_response_hash`, `check_idempotency_key`, `store_idempotency_key`, `cleanup_expired_keys`. Only `check_idempotency_key`/`store_idempotency_key` need to read/write the new `response_body` column; `cleanup_expired_keys` already exists and just needs to be called at startup (main.py lifespan).
- `backend/app/schema.sql` uses `CREATE TABLE IF NOT EXISTS` throughout with no migration tracking — D-06's ad-hoc `ALTER TABLE` is the established escape hatch until Phase 4's real migration framework exists.

### Integration Points
- `backend/app/main.py` — lifespan handler is where `cleanup_expired_keys()` gets called on startup (BUGFIX-07); CORS middleware registration (main.py:91-97) is where D-01 through D-05 land; `slowapi` `Limiter` removal touches main.py:57 and routes.py:49.
- `backend/app/routes.py:52-226` (`ride_summary` handler) and `backend/app/routes.py:247-333` (`get_eta` handler) are the two handlers needing the JSONResponse-based deprecation header treatment (D-10/D-12), and both are in the D-13 context-manager conversion scope.

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX requirements — this is a backend-only correctness phase. The user emphasized wanting every ambiguity, however small, resolved before planning (drilled into CORS methods/headers wildcarding, env var format, legacy-row replay behavior, and connection-manager interaction with the JSONResponse change) — expect the planner to find this phase's decisions unusually exhaustive relative to its size.

</specifics>

<deferred>
## Deferred Ideas

- **React Native vs. native mobile app architecture** — user raised uncertainty about whether Expo/React Native is the right long-term choice for the mobile app vs. going native. This is a major architectural decision far outside Phase 1 (backend correctness) scope and affects the entire `mobile/` codebase, not the API. Flag for a dedicated discussion/spike before any future mobile-focused phase, not folded into this phase.

None — otherwise discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Backend Correctness*
*Context gathered: 2026-07-01*

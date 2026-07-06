# Phase 1: Backend Correctness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 1-Backend Correctness
**Areas discussed:** CORS allowed origins, Idempotency replay storage, Deprecation header scope, Connection leak fix pattern

---

## CORS Allowed Origins

| Option | Description | Selected |
|--------|-------------|----------|
| Expo dev server (localhost) | http://localhost:8081, http://localhost:19006 for local mobile dev | ✓ |
| Production domain (CF Tunnel) | Public hostname exposed via Cloudflare Tunnel | ✓ (conceptually — no domain exists yet) |
| Not sure yet / no browser clients | React Native doesn't run in a browser; CORS matters for web preview only | ✓ |

**User's choice:** All three selected, plus a free-text note questioning whether React Native is even the right mobile architecture.
**Notes:** No production domain exists yet. User does not want one hardcoded — env var only, set at deploy time. React Native vs. native architecture question logged as a deferred idea, not acted on here.

| Question | Options | Selected |
|----------|---------|----------|
| Need allow_credentials=True? | Remove it / Keep it scoped | **Remove it** |
| Origins config format | Env var / Hardcoded | **Env var** |
| Prod domain default | No domain yet, env-only / Provide domain now | **No domain yet, env-only** |
| allow_methods/allow_headers | Leave wildcard / Lock down explicitly | **Leave wildcard** |
| BMTC_CORS_ORIGINS format | Comma-separated string / JSON array | **Comma-separated string** |
| Unset env var behavior | Fall back to dev defaults / Fail startup | **Fall back to dev defaults** |

---

## Idempotency Replay Storage

| Question | Options | Selected |
|----------|---------|----------|
| Schema change approach (no migration framework until Phase 4) | Ad-hoc ALTER TABLE / Drop+recreate / Wait for Phase 4 | **Ad-hoc ALTER TABLE in schema.sql** |
| What to store | Full serialized JSON response / Reconstruct from other fields | **Full serialized JSON response** |
| Replay signal to client | No signal, return identical response / Add X-Idempotent-Replay header | **No signal — identical response** |
| Legacy rows with NULL response_body (up to 24h post-deploy) | Treat as cache miss, process fresh / Return old zero-count response | **Treat as cache miss, process fresh** |

**Notes:** BUGFIX-03 cannot be fixed without a schema change — `idempotency_keys` currently only stores `response_hash`, not the response body itself, so there is nothing to replay verbatim. This was discovered during codebase scouting (idempotency.py review), not something the user raised — surfaced as a gray area because it affects HOW the bug gets fixed within Phase 1's boundary (no migration framework yet).

---

## Deprecation Header Scope

| Question | Options | Selected |
|----------|---------|----------|
| Apply to GET /v1/eta too, beyond roadmap's POST-only wording | Yes, apply to both / No, POST only per roadmap | **Yes — apply to GET too** |
| Header format | X-Deprecation-Warning: message / RFC 8594 Deprecation+Link | **X-Deprecation-Warning: message** |
| Implementation mechanism | Return JSONResponse directly / Response param + response.headers | **Return JSONResponse directly** |

**Notes:** Roadmap criterion #5 only names POST /v1/ride_summary, but GET /v1/eta has the identical underlying bug (deprecated timestamp_utc query param, server-log-only warning). User chose to fix both as a small additive change within the phase's existing bug-fix intent, not as new scope.

---

## Connection Leak Fix Pattern

| Question | Options | Selected |
|----------|---------|----------|
| Fix mechanism | Context manager on get_connection() / try/finally per call site | **Context manager on get_connection()** |
| Interaction with JSONResponse change (D-12) | No special handling needed / Explicitly close conn before building JSONResponse | **No special handling needed** |
| Scope — routes.py only, or also idempotency.py/learning.py/gtfs_bootstrap.py | routes.py only, per roadmap / Apply everywhere | **routes.py only, per roadmap** |

**Notes:** This area was largely mechanical (Claude's implementation judgment), included for completeness per the user's explicit request to drill into every ambiguity, however small.

---

## Claude's Discretion

- Exact wording/placement of the `ALTER TABLE ... ADD COLUMN` guard (try/except vs. `PRAGMA table_info` check) in schema.sql's bootstrap path.
- Whether JSONResponse-based deprecation-header handlers still construct and validate the Pydantic response model before `.model_dump()`-ing it (recommended: yes, to preserve validation guarantees).

## Deferred Ideas

- **React Native vs. native mobile app architecture** — raised during the CORS discussion as a free-text aside. This is a major architectural decision affecting the entire `mobile/` codebase, unrelated to backend correctness. Not folded into Phase 1; flagged for a dedicated discussion or spike before any future mobile-focused phase.

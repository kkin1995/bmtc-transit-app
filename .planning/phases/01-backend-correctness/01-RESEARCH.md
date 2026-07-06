# Phase 1: Backend Correctness - Research

**Researched:** 2026-07-01
**Domain:** FastAPI/Starlette request lifecycle, SQLite connection management, CORS security, HTTP idempotency semantics
**Confidence:** HIGH

## Summary

Phase 1 is six mechanical, well-scoped bug fixes against a codebase this research has now read directly (`backend/app/db.py`, `routes.py`, `idempotency.py`, `main.py`, `config.py`, `schema.sql`, and the existing test suite). CONTEXT.md's decisions (D-01 through D-15) are technically sound and require no revision — this research instead verifies the exact mechanics the planner needs to sequence tasks correctly, and surfaces three things CONTEXT.md's discussion could not have caught from a code-reading pass alone:

1. **The `slowapi` removal surface is larger than "two `Limiter(...)` lines.`** `main.py` also registers `app.state.limiter` and an exception handler for `RateLimitExceeded` — both must go, plus 3 import lines across 2 files, plus the `slowapi==0.1.9` line in `pyproject.toml`. All confirmed dead — no test or code path outside these lines references `slowapi`.
2. **The baseline test suite is not fully green.** `uv run pytest -q` on the current tree yields **174 passed, 8 failed** — not 182/182 as `CLAUDE.md` states. Two of the 8 failures (`test_idempotency.py::test_idempotency_key_store_and_retrieve`, `test_idempotency.py::test_idempotency_key_replace`) call `store_idempotency_key(key, response_data)` with the **old 2-argument signature** — the function has required 3 args (`idempotency_key, body_data, response_data`) since the H1 body-hash fix shipped, so these two tests are already broken independent of this phase's work. Four more (`test_idempotency_bodyhash.py`) fail via a 422 from the running `TestClient` app, and two (`test_rate_limit.py`) fail on a `device_bucket`-required 400. **None of these 8 failures are caused by Phase 1's scope**, but the planner must decide: fix them as drive-by (small, unrelated diffs — against CLAUDE.md's "keep changes small/additive" rule) or explicitly document them as pre-existing/out-of-scope so `/gsd-verify-work` doesn't misattribute them to this phase's changes.
3. **`.model_dump()` → `JSONResponse(content=...)` is safe for both response models in scope** — verified by inspecting `RideSummaryResponse` and `ETAResponseV11` field types (str/int/float/bool/dict only, no raw `datetime`/`Decimal` fields; all timestamps are already converted to ISO strings before model construction). No `jsonable_encoder` wrapping is needed for D-12.

**Primary recommendation:** Implement all six fixes in the order CONTEXT.md implies (connection-manager conversion first, since it's the substrate every other handler-touching change sits on top of), verify the pre-existing 8 test failures are unaffected before and after, and treat the `slowapi` removal as touching 3 files (`main.py`, `routes.py`, `pyproject.toml`) not 2 (`routes.py`, `main.py` as CONTEXT.md's summary implies).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SQLite connection lifecycle | API/Backend (`db.py`) | — | Single-writer SQLite pattern; connection management is a backend infra concern, not business logic |
| CORS policy | API/Backend (`main.py` middleware) | — | Enforced at the ASGI middleware layer before any route logic runs |
| Idempotency replay | API/Backend (`idempotency.py` + `routes.py`) | Database/Storage (`idempotency_keys` table) | Storage holds the cached response; route handler decides when to short-circuit |
| Deprecation signaling | API/Backend (`routes.py` response construction) | — | HTTP header is a transport-layer concern attached at the route boundary |
| Rate limiting | API/Backend (`rate_limit.py` middleware) | Database/Storage (`rate_limit_buckets` table) | `RateLimitMiddleware` is the sole active tier; `slowapi` is being removed, not relocated |

No browser/client, SSR, or CDN tier involvement — this phase is 100% backend/API and its SQLite storage layer.

## Package Legitimacy Audit

**Not applicable.** This phase installs no new packages. It *removes* one existing dependency (`slowapi==0.1.9`, already present in `pyproject.toml`/`uv.lock`, verified installed and functioning in the current environment via `uv run pytest`). No legitimacy check is required for removing an already-vetted, already-installed package.

**Recommendation (Claude's discretion, additive to LEARN-03):** After deleting the `slowapi` import lines and `Limiter`/`app.state.limiter`/`add_exception_handler(RateLimitExceeded, ...)` wiring, also remove the `"slowapi==0.1.9"` line from `backend/pyproject.toml` `[project.dependencies]` and run `uv sync` (or `uv lock --upgrade-package slowapi` equivalent removal) to drop it from `uv.lock`. Verified via `grep -rn "slowapi" backend/ --include="*.py"` (excluding `.venv`) that no other file imports it. Leaving the dependency declared but unused is itself a smaller version of the same "dead code" problem LEARN-03 targets — but this is optional cleanup, not required by the roadmap's success criteria, and should be a separate small commit if included.

## Architecture Patterns

### System Architecture Diagram

```
POST /v1/ride_summary                          GET /v1/eta
       │                                              │
       ▼                                              ▼
 verify_token (Bearer)                    (no auth — open endpoint)
       │                                              │
       ▼                                              ▼
 RateLimitMiddleware (device_bucket/IP token bucket)  │
       │                                              │
       ▼                                              ▼
┌──────────────────────┐                    ┌──────────────────────┐
│ Idempotency-Key check │                    │ direction_id validate │
│ (idempotency.py)      │                    └──────────┬───────────┘
│  hit + body match     │                               │
│    → replay cached    │─────[SHORT CIRCUIT]           ▼
│    response (D-06..09)│                    with get_connection() as conn:
│  miss/no key           │                         resolve segment_id
└──────────┬─────────────┘                         fetch segment_stats row
           ▼                                        compute blend/percentiles
 with get_connection() as conn:  (D-13)             build ETAResponseV11
      validate max_segments                          check timestamp_utc used
      insert rides row                                    │
      for each segment:                                   ▼
        resolve segment_id                    if deprecated field used (D-10/D-11):
        compute_bin_id()                         construct model → .model_dump()
        update_segment_stats() (Welford/EMA)      → JSONResponse(content=..., 
        log_rejection() if rejected                    headers={"X-Deprecation-Warning": ...})
      conn.commit() (once)                       else: return model directly (response_model path)
  # connection auto-closed on any exit (D-13/D-14)
           │
           ▼
 store_idempotency_key(key, body, response_data)  (D-07)
           │
           ▼
 if deprecated field used (D-10/D-11):
   construct RideSummaryResponse → .model_dump()
   → JSONResponse(content=..., headers={"X-Deprecation-Warning": ...})
 else: return model directly


 App startup (main.py lifespan):
   init_db() → cleanup_expired_keys() (BUGFIX-07, D- locked)  → set_startup_time()

 CORS (main.py middleware, applies to all requests before routing):
   allow_origins=settings.cors_origins.split(",")  (D-02/D-03/D-04)
   allow_credentials removed  (D-01)
   allow_methods=["*"], allow_headers=["*"]  (D-05)
```

### Recommended Project Structure

No new files or directories. All changes are in-place edits to existing modules:

```
backend/app/
├── db.py          # get_connection() → @contextmanager (D-13)
├── routes.py      # ride_summary, get_eta: JSONResponse + context-manager `with` (D-10..15)
├── idempotency.py # check/store_idempotency_key: read/write response_body column (D-06/D-07)
├── main.py        # CORS settings wiring (D-01..05), cleanup_expired_keys() at startup (BUGFIX-07),
│                  # slowapi Limiter/state/exception-handler removal (LEARN-03)
├── config.py      # + cors_origins: str setting (D-02/D-03)
└── schema.sql     # idempotency_keys: bootstrap-path ALTER TABLE ADD COLUMN response_body (D-06)
```

### Pattern 1: `@contextmanager`-wrapped `sqlite3.Connection` with guaranteed close

**What:** Convert `get_connection(db_path) -> sqlite3.Connection` into a generator function decorated with `@contextlib.contextmanager` that yields the connection inside a `try/finally`.
**When to use:** Any function that opens a resource needing guaranteed cleanup regardless of how the `with` block exits (return, exception, or early `raise`).
**Why `try/finally` inside the generator is mandatory, not optional:** `@contextmanager` does NOT provide automatic cleanup-on-exception. If the code inside the `with` block raises, Python throws that exception into the generator at the `yield` point via `.throw()`. Code placed *after* `yield` with no enclosing `try` will simply never run — the exception propagates out immediately. This is the single most important correctness detail for D-13; a naive `@contextmanager` conversion without `try/finally` reproduces the exact same leak the fix is meant to close. [VERIFIED: Python contextlib docs]

```python
# Source: Python 3 contextlib docs — canonical pattern
# https://docs.python.org/3/library/contextlib.html#contextlib.contextmanager
from contextlib import contextmanager
import sqlite3

@contextmanager
def get_connection(db_path: str):
    """Get database connection with WAL enabled. Guarantees close() on any exit path."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
```

Every call site changes from:
```python
conn = get_connection(settings.db_path)
cursor = conn.cursor()
...
conn.close()  # skipped if an exception is raised above this line
```
to:
```python
with get_connection(settings.db_path) as conn:
    cursor = conn.cursor()
    ...
    # no explicit conn.close() anywhere — happens automatically on any exit,
    # including early `return`, early `raise HTTPException(...)`, or an
    # unhandled exception from Pydantic/SQLite/etc.
```
**Concrete migration note verified against the actual codebase:** every early-return branch in `routes.py` that currently calls `conn.close()` manually before `raise HTTPException(...)` (e.g. lines 146, 278, 303, 490, 564, 661, 676) must have that manual `conn.close()` call **deleted**, not merely left in place — calling `.close()` a second time inside the `with` block's body is harmless (SQLite connections are idempotent-close-safe) but is dead code that will confuse the next reader about who owns cleanup. The whole point of D-13 is that the manual `conn.close()` scattered across ~7 early-return branches becomes unnecessary.

### Pattern 2: `JSONResponse` as an escape hatch from `response_model`

**What:** Returning `JSONResponse(content=..., headers=...)` directly from a route function bypasses FastAPI's `response_model` validation/serialization pipeline entirely.
**When to use:** Only when you need to attach custom headers (this phase's exact case) or a non-default status code the declarative `response_model=` mechanism can't express.
**Critical constraint:** `content=` must already be a plain-JSON-serializable structure (dict/list/str/int/float/bool/None) — FastAPI's automatic `jsonable_encoder()` pass does NOT run for directly-returned `Response` subclasses. If any field were a raw `datetime`, `Decimal`, `UUID`, or other non-JSON-native Python type, `JSONResponse`'s internal `json.dumps()` call would raise `TypeError: Object of type X is not JSON serializable`. [VERIFIED: FastAPI response-model docs + GitHub discussion #10425]

**Verified safe for this phase's two models** — inspected `backend/app/models.py`:
- `RideSummaryResponse`: `accepted_segments: int`, `rejected_segments: int`, `rejected_by_reason: dict[str, int]` — all plain JSON types.
- `ETAResponseV11`: nested models (`SegmentInfo`, `ScheduledInfo`, `PredictionInfo`) plus flat fields — every timestamp field (`query_time`, `last_updated`) is already a `str` (converted from epoch via `.isoformat()` before the model is constructed at `routes.py:357-363`), not a raw `datetime`. No `Decimal` fields anywhere in the response models.

```python
# Source: FastAPI docs — https://fastapi.tiangolo.com/tutorial/response-model/
# Pattern for D-12: construct the Pydantic model first (keeps validation),
# then .model_dump() it into a plain dict, THEN attach the header.
response = RideSummaryResponse(**response_data)
if deprecation_warning:
    return JSONResponse(
        content=response.model_dump(),
        headers={"X-Deprecation-Warning": deprecation_warning},
    )
return response  # normal path — response_model validates/serializes as usual
```

Because `.model_dump()` (not `.model_dump(mode="json")`) is used, double-check this only matters if a field type doesn't have a native JSON equivalent — confirmed above that none exist in scope. If a future field ever needs a `datetime`, switch to `.model_dump(mode="json")` (Pydantic v2's JSON-safe dump mode) rather than plain `.model_dump()`.

### Pattern 3: Idempotent `ALTER TABLE ADD COLUMN` without a migration framework

**What:** Add `response_body TEXT` to `idempotency_keys` inside the existing `init_db()` bootstrap path in a way that is safe to run every single app startup (since `schema.sql`'s `CREATE TABLE IF NOT EXISTS` already runs unconditionally on every startup, per `main.py`'s lifespan handler calling `init_db(settings.db_path)` on every boot — not just first boot).
**When to use:** Exactly this situation — no migration framework exists yet (Phase 4 territory per `.planning/codebase/CONCERNS.md`), and the schema-drift risk is limited to one nullable column.

Two viable approaches, both verified locally in this session:

**Option A — try/except (what CONTEXT.md's D-06 describes):**
```python
try:
    conn.execute("ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT")
except sqlite3.OperationalError as e:
    if "duplicate column" not in str(e):
        raise  # re-raise anything that isn't the expected "already exists" case
```
Verified exact SQLite error string in this environment: `sqlite3.OperationalError: duplicate column name: response_body` — the guard `"duplicate column" not in str(e)` is a safe substring match (SQLite has used this exact wording across versions going back years).

**Option B — `PRAGMA table_info` check (CONTEXT.md flags this as Claude's discretion):**
```python
existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(idempotency_keys)").fetchall()}
if "response_body" not in existing_cols:
    conn.execute("ALTER TABLE idempotency_keys ADD COLUMN response_body TEXT")
```
**Recommendation:** Option B is marginally preferable — it doesn't depend on parsing an error message string (which, while stable across SQLite versions, is still string-matching against an implementation detail), and it makes the guard's intent explicit at the call site. Both are O(1) and equally safe; this is a low-stakes choice either way. [VERIFIED: tested both against sqlite3 in this session]

### Anti-Patterns to Avoid

- **Placing `try/finally` cleanup logic in the wrong function during the D-13 conversion:** Do not add `try/finally` around the *call site* (`with get_connection(...) as conn:`) — the `try/finally` belongs *inside* `get_connection`'s generator body, wrapping the `yield`. The `with` statement's job is just to invoke the context manager protocol; the context manager itself owns the guarantee.
- **Double-closing paranoia:** Don't add defensive `if conn: conn.close()` checks at former early-return sites after the D-13 conversion — this is now dead code. Delete it rather than leave it as a no-op; it signals to future readers that cleanup is still manual, which is false.
- **Adding a custom "this is a replay" signal to the idempotency response (contradicts D-08):** Some idempotency implementations add an `Idempotent-Replayed: true` header. CONTEXT.md explicitly locks against this (D-08, matches Stripe-style semantics) — the replayed response must be byte-for-byte identical to the original, not decorated.
- **Using `jsonable_encoder()` defensively "just in case" for D-12:** Unnecessary given the verified field types above, and it silently double-serializes if the model already round-trips cleanly through `.model_dump()`. Only reach for it if a future model adds a non-JSON-native field type.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resource cleanup on any exit path | Custom try/finally boilerplate repeated at every call site | `@contextlib.contextmanager` + `with` (stdlib) | One correctness-critical block instead of ~8 duplicated try/finally blocks across route handlers; matches D-13 exactly |
| CORS preflight logic | Custom `OPTIONS` handler / manual `Access-Control-*` header setting | Starlette's `CORSMiddleware` (already in use) | Already correctly used in `main.py` — this phase only changes its *configuration* (D-01 through D-05), never its implementation. Do not write custom CORS logic. |
| Body-tamper detection for idempotency | Custom signature scheme | SHA256 body hash already implemented in `idempotency.py` (`compute_body_hash`) | Already exists and correctly wired (H1 security fix, predates this phase) — Phase 1 only adds the missing `response_body` storage/replay, does not touch the hash-verification logic |

**Key insight:** Every "don't hand-roll" candidate in this phase's scope already has a correct implementation sitting one layer away in the same codebase (SHA256 hashing, CORS middleware, structured error responses in `errors.py`). The bugs are all *wiring* bugs — a value computed correctly but never used (idempotency response body), a resource opened but not guaranteed-closed (connections), a header value computed but never attached (deprecation warning) — not missing capability. This confirms CONTEXT.md's framing that this is a "no new capabilities" phase.

## Common Pitfalls

### Pitfall 1: `@contextmanager` without `try/finally` reintroduces the exact bug being fixed
**What goes wrong:** Writing `@contextmanager def get_connection(...): conn = sqlite3.connect(...); yield conn; conn.close()` (no `try/finally`) looks correct and passes the happy-path tests, but on any exception inside the `with` block, `conn.close()` never executes — the generator's `.throw()` call re-raises at the `yield` line and the function exits without reaching the line after `yield`.
**Why it happens:** The `@contextmanager` decorator's job is only to translate generator protocol into context-manager protocol; it does not add implicit exception safety. This is a very common first-attempt mistake when converting a function to `@contextmanager`.
**How to avoid:** Always wrap `yield conn` in `try: yield conn` / `finally: conn.close()`. Verify by writing a test that forces an exception between connection acquisition and normal close (e.g., mock `update_segment_stats` to raise), then assert the connection was closed (e.g., via `sqlite3.Connection.close()` call tracking, or checking `conn.execute(...)` raises `ProgrammingError: Cannot operate on a closed database` afterward).
**Warning signs:** Any code review of the diff where the line after `yield` is *not* inside a `finally` block.

### Pitfall 2: Legacy idempotency rows with `response_body IS NULL` must not resurrect the old broken behavior
**What goes wrong:** After deploying the D-06/D-07 fix, rows written by the *old* code (before this fix ships) have `response_body = NULL`. If `check_idempotency_key`'s new code path does `if cached_response: return json.loads(cached_response['response_body'])` without a null-check, this raises `TypeError: the JSON object must be str, bytes or bytearray, not NoneType` on any legacy row within the 24h TTL window — a regression, not a fix.
**Why it happens:** The column is nullable by necessity (existing rows can't retroactively gain a value), and it's easy to assume "cache hit" implies "replay body available."
**How to avoid:** D-09 already locks the correct behavior — treat `response_body IS NULL` as a cache miss and reprocess the request fresh (never fall back to the old zero-count response). Implementation must explicitly check `if row.response_body is not None:` before attempting to deserialize, and the "cache miss" path must fall through to the exact same code as "no key at all" (i.e., not a special third branch with different behavior).
**Warning signs:** Any code path that does `json.loads(response_body)` without a preceding `is not None` (or equivalent falsy) check on `response_body` specifically — checking the outer `cached_response` object for truthiness is not equivalent, since `cached_response` will be truthy even when `response_body` inside it is `None`.

### Pitfall 3: `conn.close()` calls scattered across early-return branches must be deleted, not left as harmless leftovers
**What goes wrong:** After converting to `with get_connection(...) as conn:`, a lazy conversion might leave the old `conn.close()` calls at early-return sites (`routes.py:146, 278, 303, 490, 564, 661, 676` in the current tree) in place "just to be safe." This is harmless at runtime (double-close on a SQLite connection is a no-op, does not raise) but leaves misleading code that implies manual cleanup is still required, undermining the whole point of the refactor and creating confusion for whoever edits this code next.
**Why it happens:** It's the path of least resistance when converting line-by-line without stepping back to see the full picture.
**How to avoid:** After the D-13 conversion, grep the touched files for `conn.close()` and `\.close()` — there should be **zero** remaining explicit close calls in `routes.py` route handlers; the `with` statement is now the only thing that closes connections.
**Warning signs:** `grep -n "conn.close()" backend/app/routes.py` returning any matches after the fix is applied signals incomplete migration.

### Pitfall 4: Pre-existing test failures unrelated to this phase can be misattributed to Phase 1's changes
**What goes wrong:** Running the full suite after Phase 1's changes and seeing 8 failures might cause the planner/verifier to assume the phase introduced regressions, when in fact these 8 tests already fail on the unmodified baseline (verified in this research session: `174 passed, 8 failed` on current `main`).
**Why it happens:** `CLAUDE.md` documents "182/182 passing" as a fact, but that claim is stale relative to the current tree — likely from an earlier commit before some test or signature drift occurred.
**How to avoid:** Before starting implementation, run `uv run pytest -q` and record the baseline failure list. After implementing Phase 1's changes, re-run and diff the failure list — the set of failing tests should be identical (same 8, or fewer if the planner chooses to fix `test_idempotency.py`'s stale 2-arg calls as drive-by, which do overlap thematically with BUGFIX-03's idempotency-replay fix). Any *new* failure not in the baseline list is a real regression from this phase's work.
**Warning signs:** Treating "test suite is green" as the success bar without first establishing what "green" meant on the baseline tree.

### Pitfall 5: CORS `allow_credentials=True` removal must be a full deletion, not `allow_credentials=False`
**What goes wrong:** Setting `allow_credentials=False` (explicit) vs. removing the parameter entirely (relying on Starlette's default) are functionally identical at runtime, but CONTEXT.md's D-01 says "remove entirely." If a future engineer sees an explicit `allow_credentials=False`, they may assume there was a deliberate reason to state it (e.g., "we tried True and reverted"), inviting someone to flip it back later without understanding why. If it's simply absent, the fact that credentials mode was never needed (Bearer-header-only auth) is cleaner to infer from the diff itself.
**Why it happens:** Both produce the same middleware behavior — this is a code-clarity/maintainability distinction, not a functional bug, but it's exactly the kind of ambiguity CONTEXT.md's D-01 pre-resolved.
**How to avoid:** Delete the `allow_credentials=True,` line from the `CORSMiddleware(...)` call entirely rather than changing its value.
**Warning signs:** `grep -n "allow_credentials" backend/app/main.py` returning any match after the fix — it should return zero matches (parameter fully absent), not one match with `False`.

## Code Examples

### Full CORS configuration after D-01 through D-05 (main.py)
```python
# Source: Starlette docs — https://starlette.dev/middleware/#corsmiddleware
# and D-01..D-05 in 01-CONTEXT.md
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
    # allow_credentials intentionally absent (D-01) — Bearer-header auth only,
    # no cookies; this also avoids Starlette's documented behavior of
    # reflecting the request Origin when allow_credentials=True + origins="*"
)
```

### config.py addition for `cors_origins` (D-02/D-03)
```python
# Source: verified against pydantic-settings 2.1.0 in this session —
# comma-separated string works with no custom parsing needed
class Settings(BaseSettings):
    ...
    cors_origins: str = "http://localhost:8081,http://localhost:19006"
    ...
```
Verified: `Settings().cors_origins.split(",")` produces `['http://localhost:8081', 'http://localhost:19006']` with the default unset, and correctly parses any `BMTC_CORS_ORIGINS=https://app.example.com,https://admin.example.com` override with no JSON-array syntax required.

### `cleanup_expired_keys()` wired into lifespan (BUGFIX-07 — already locked, no discussion needed)
```python
# Source: existing pattern in main.py's lifespan handler, extended per BUGFIX-07
from app.idempotency import cleanup_expired_keys

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    ...
    init_db(settings.db_path)
    deleted = cleanup_expired_keys()
    logger.info(f"Startup cleanup: removed {deleted} expired idempotency keys")
    state.set_startup_time(int(time.time()))
    yield
```
Note: `cleanup_expired_keys()` already opens/closes its own connection internally (`idempotency.py:128-148`) — it does not need (and per D-15, should not receive) the `@contextmanager` treatment in this phase, since D-15 scopes the connection-manager fix to `routes.py` handlers only. `idempotency.py`'s existing bare `get_connection()`/`conn.close()` calls are short-lived and already correctly paired in every function (verified: every function in `idempotency.py` that opens a connection closes it on all paths since there's no early-return between open and close in this specific module) — but note this module will still benefit from `get_connection()` becoming a context manager transparently, since `with get_connection(...) as conn:` works identically to the old call pattern's replacement even in files not explicitly targeted for handler-level rewrites. D-15's restriction is about not *rewriting call sites* in `idempotency.py`/`learning.py`/`gtfs_bootstrap.py`, not about avoiding the `db.py` change itself — those modules' existing bare-function calls (`conn = get_connection(...)`) will simply stop working once `get_connection` becomes a generator decorated with `@contextmanager`, because calling a `@contextmanager`-decorated function directly returns a context manager object, not a connection.

**This is the one place CONTEXT.md's D-15 needs a compatibility note the discussion could not have surfaced without reading the code:** `@contextmanager` changes the *call contract* of `get_connection()` globally — every caller, not just `routes.py`, must switch to `with get_connection(...) as conn:`. D-15 explicitly says "do NOT touch `idempotency.py`, `learning.py`, or `gtfs_bootstrap.py` connection-opening code in this phase" — but if `db.py`'s `get_connection` becomes a bare `@contextmanager` function, those modules' existing `conn = get_connection(settings.db_path)` calls will break at runtime (they'll receive a `_GeneratorContextManager` object instead of a `sqlite3.Connection`, and any `.cursor()` call on it will raise `AttributeError`).

**Verified call sites requiring the `with` syntax update, even though D-15 says not to *rewrite* these modules' logic:**
```
backend/app/idempotency.py  — 4 call sites (check_idempotency_key, store_idempotency_key, cleanup_expired_keys — each opens+closes once)
backend/app/learning.py     — grep for get_connection/get_connection( calls
backend/app/gtfs_bootstrap.py — grep for get_connection( calls
```
The planner must reconcile this: D-15's *intent* (don't touch the leak-handling logic/behavior in those files, since they don't have the leak pattern) is correct and should stand, but the **mechanical syntax change** (`conn = get_connection(x)` → `with get_connection(x) as conn:`) is unavoidable in every file calling `get_connection()`, regardless of whether that file has a leak bug. This is a **syntax-only, behavior-preserving edit** in `idempotency.py`/`learning.py`/`gtfs_bootstrap.py` — not the same as "fixing a leak" there (there is none to fix), but structurally required for the codebase to still run. Recommend the plan include this as an explicit small task ("update `get_connection()` call sites in idempotency.py/learning.py/gtfs_bootstrap.py to `with` syntax — mechanical, no behavior change") rather than silently discovering it mid-implementation.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual `conn.close()` at every return site | `@contextmanager`-wrapped connection factory + `with` | This has been Python best practice since `contextlib.contextmanager` was added in Python 2.5 (2006) | Not a "new" pattern — this phase is catching the codebase up to a decades-old stdlib idiom, not adopting something new |
| `allow_origins=["*"]` + `allow_credentials=True` | Explicit origin allowlist, no credentials mode | CORS spec has forbidden this combination since the spec's inception; browsers have enforced it for years | Removes a configuration that silently degrades to a security-relevant "reflect the request Origin" behavior in Starlette when both are set |

**Deprecated/outdated:** Nothing framework-level is deprecated here — `slowapi` itself (0.1.9) is a small, maintained wrapper around the `limits` library and isn't being removed because it's obsolete; it's being removed because it was never wired to do anything (dead code), per LEARN-03.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The SQLite `"duplicate column"` error substring is stable across all SQLite versions this project might run on | Pattern 3 | Low — this project runs a single pinned SQLite (stdlib `sqlite3` module tied to the Python 3.12 build in `uv.lock`), and this research chose to recommend the `PRAGMA table_info` approach specifically to avoid relying on this string anyway |
| A2 | `learning.py` and `gtfs_bootstrap.py` call `get_connection()` in a pattern compatible with a simple `with` syntax swap (no code that stores the raw connection object beyond its function scope, no code that expects `get_connection()` to return a `sqlite3.Connection` directly for type-checking purposes) | Code Examples section | Medium — if either module does something unusual (e.g., passes the connection object to another function that also expects to call `.close()` on it, or type-hints `sqlite3.Connection` in a way that would need updating), the mechanical `with` swap may need a slightly larger diff than described. The planner should grep+read these two files' `get_connection` call sites directly before finalizing task scope — this research read `db.py`/`routes.py`/`idempotency.py`/`main.py`/`config.py` directly but did not do a line-by-line read of `learning.py` or `gtfs_bootstrap.py`'s connection-handling code. |

## Open Questions

1. **Should the 8 pre-existing test failures be fixed as part of this phase, given thematic overlap with BUGFIX-03?**
   - What we know: `test_idempotency.py::test_idempotency_key_store_and_retrieve` and `test_idempotency_key_replace` call the OLD 2-arg `store_idempotency_key(key, response_data)` signature; the function has required 3 args since the H1 fix. These tests were already broken before this phase and are not part of CONTEXT.md's locked decisions.
   - What's unclear: Whether "keep changes small and additive" (CLAUDE.md rule 3) means leaving these red, or whether fixing a 2-line test-signature mismatch counts as within-scope since the same file (`idempotency.py`) is being touched for D-06/D-07 anyway.
   - Recommendation: Document the 8 pre-existing failures explicitly in the plan's baseline note (do not silently fix or silently ignore). If the planner chooses to fix the 2 `test_idempotency.py` signature-mismatch tests as a 2-line drive-by (since `idempotency.py` is already in the diff), call it out as an explicit, separate, tiny task — not folded silently into the D-06/D-07 task. Leave the other 6 (`test_idempotency_bodyhash.py` ×4, `test_rate_limit.py` ×2) untouched; they are unrelated to any Phase 1 requirement (one is a 422 investigation, the other is a `device_bucket`-required-field issue in rate limiting, which is Phase 6 territory).

2. **Does `learning.py`/`gtfs_bootstrap.py` need any code change at all, or purely a syntax swap?**
   - What we know: D-15 says don't touch the leak-handling *logic* there. `db.py`'s `get_connection()` signature change is unavoidable for any caller.
   - What's unclear: Exact number and shape of call sites in those two files (not read line-by-line in this research pass).
   - Recommendation: Planner/executor should `grep -n "get_connection(" backend/app/learning.py backend/app/gtfs_bootstrap.py` at the start of the D-13 task and budget a small mechanical `with`-syntax edit for each hit, distinct from (and much smaller than) the `routes.py` handler rewrites.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv | All backend commands | Yes | 0.11.8 per CLAUDE.md, confirmed via `uv run` executing successfully in this session | — |
| Python | Backend runtime | Yes | 3.12.13 (confirmed via pytest run output) | — |
| sqlite3 (stdlib) | DB layer | Yes | Bundled with Python 3.12.13 | — |
| pytest / pytest-xdist / pytest-randomly | Test verification | Yes | 7.4.3 / installed / installed (confirmed via successful `uv run pytest -q` run) | — |

No missing dependencies. This phase requires no new tools, services, or external installs — pure in-repo code changes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 7.4.3 with pytest-xdist 3.5.0 (`--dist loadfile -n auto`) and pytest-randomly |
| Config file | `backend/pytest.ini` |
| Quick run command | `cd backend && uv run pytest tests/test_idempotency.py tests/test_idempotency_bodyhash.py -v` |
| Full suite command | `cd backend && uv run pytest -q` |

**Baseline (verified this session, before any Phase 1 change):** 174 passed, 8 failed. The 8 failures are: `test_idempotency.py::test_idempotency_key_store_and_retrieve`, `test_idempotency.py::test_idempotency_key_replace`, `test_idempotency_bodyhash.py::test_replay_with_reordered_json_keys_succeeds`, `test_idempotency_bodyhash.py::test_replay_with_modified_segment_data_returns_409`, `test_idempotency_bodyhash.py::test_replay_with_different_body_returns_409`, `test_idempotency_bodyhash.py::test_expired_key_allows_new_submission`, `test_rate_limit.py::test_fallback_to_ip_when_no_device_bucket`, `test_rate_limit.py::test_rate_limit_error_structure`. **Record this list before starting implementation; diff against it after.**

### Phase Requirement → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUGFIX-01 | Connection closes on exception in `ride_summary`/`get_eta`/`get_stops`/`get_routes`/`get_stop_schedule`/`search_routes` | integration | New test needed: force an exception mid-handler (e.g., monkeypatch `update_segment_stats` to raise), assert via `sqlite3.Connection` mock/spy that `.close()` was called, or assert no `sqlite3.OperationalError: database is locked` under repeated forced-failure calls | ❌ Wave 0 — no existing test forces a mid-handler exception and inspects connection state |
| BUGFIX-02 | CORS rejects non-allowlisted origins, no `Access-Control-Allow-Credentials` header present | integration | `uv run pytest tests/test_cors.py -v` (new file) — use `TestClient` with an `Origin` header not in the allowlist, assert `Access-Control-Allow-Origin` is absent from response; assert `Access-Control-Allow-Credentials` header is absent entirely for any origin | ❌ Wave 0 — no `test_cors.py` exists currently |
| BUGFIX-03 | Idempotent replay returns original `accepted_segments`/`rejected_segments`, not zeros | integration | `uv run pytest tests/test_idempotency_bodyhash.py -v` (existing file, once its 4 currently-failing tests are diagnosed — see Open Question 1) plus new test: submit ride with N accepted segments, retry same `Idempotency-Key`+body, assert replay response has N accepted (not 0) | Partial — `test_idempotency_bodyhash.py` exists but 4/9 tests already fail; new replay-value-assertion test needed |
| BUGFIX-07 | `idempotency_keys` has 0 rows >24h old immediately after fresh startup | integration | `uv run pytest tests/test_idempotency.py::test_cleanup_expired_keys -v` (existing, passes on baseline) plus new test asserting `cleanup_expired_keys()` is actually invoked during `lifespan()`/app startup (e.g., via `TestClient` triggering startup and checking a pre-seeded expired row is gone) | Partial — unit test for `cleanup_expired_keys()` itself exists; no test verifies it's *called* at startup |
| API-05 | `X-Deprecation-Warning` header present on `POST /v1/ride_summary` and `GET /v1/eta` responses when `timestamp_utc` used | integration | New test: submit request using deprecated `timestamp_utc` field, assert `response.headers["X-Deprecation-Warning"]` is present and non-empty; assert absent when `observed_at_utc`/`when` used instead | ❌ Wave 0 — no existing test checks response headers for deprecation signaling |
| LEARN-03 | No `slowapi` import/usage anywhere in `backend/app/` | static/grep | `grep -rn "slowapi" backend/app/ --include="*.py"` returns zero matches (excluding `.venv`) | N/A — grep-based check, not a pytest test; recommend as a plan verification step, not a new test file |

### Sampling Rate
- **Per task commit:** targeted test file for the task's requirement (e.g., `uv run pytest tests/test_idempotency_bodyhash.py -v` after BUGFIX-03 work)
- **Per wave merge:** `cd backend && uv run pytest -q` (full suite, ~2s) — diff failure list against the recorded 8-failure baseline
- **Phase gate:** Full suite run before `/gsd-verify-work`; the failure *count* should not exceed the baseline 8 (fewer is fine if drive-by fixes are made per Open Question 1; more indicates a regression)

### Wave 0 Gaps
- [ ] `backend/tests/test_cors.py` — new file, covers BUGFIX-02 (origin allowlist enforcement, credentials header absence)
- [ ] New test in `backend/tests/test_integration.py` or a new `test_connection_leak.py` — covers BUGFIX-01 (forced-exception connection-close verification)
- [ ] New test(s) in `backend/tests/test_idempotency_bodyhash.py` or a new file — covers BUGFIX-03's actual replay-value assertion (existing tests check hash/conflict behavior, not the *value* of the replayed response body)
- [ ] New test asserting `cleanup_expired_keys()` runs at app startup (not just that the function works standalone) — covers BUGFIX-07's "on startup" requirement specifically
- [ ] New test(s) for `X-Deprecation-Warning` header presence — covers API-05
- [ ] Framework install: none — pytest/httpx/TestClient already present and sufficient for all of the above

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No change this phase | Existing Bearer token (`auth.py`) — untouched |
| V3 Session Management | No | No sessions; Bearer-token-per-request, no cookies |
| V4 Access Control | No | Not in scope — POST/GET auth boundary unchanged |
| V5 Input Validation | Indirect | `Idempotency-Key` header and CORS `Origin` header are both attacker-influenceable inputs; the fixes in this phase (D-01/D-02, D-06/D-09) are themselves input-validation-adjacent hardening, not new validation logic |
| V6 Cryptography | No | SHA256 body-hash logic (`idempotency.py`) is untouched by this phase — only the *storage/replay* of the already-hash-verified response changes |
| V14 Configuration | Yes | CORS configuration (BUGFIX-02) is squarely a V14 configuration-hardening item — removing wildcard-origin-plus-credentials is the canonical ASVS V14.4/OWASP CORS misconfiguration fix |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CORS misconfiguration (wildcard origin + credentials) enabling cross-origin credentialed requests from any site | Tampering / Information Disclosure | Explicit origin allowlist, no credentials mode when not needed (this phase's D-01–D-05, matches OWASP CORS guidance) |
| Idempotency-Key replay used to probe server behavior via stale/zero responses, or a client retry loop caused by broken idempotency amplifying load | Denial of Service (indirect) | Correct replay of the original response body (BUGFIX-03) removes the incentive for clients to retry indefinitely believing their submission never succeeded |
| Resource exhaustion via SQLite file-descriptor leak under sustained exception-triggering traffic | Denial of Service | Guaranteed-close context manager (BUGFIX-01) — directly closes this DoS vector; this is the single highest-severity item in this phase per `.planning/codebase/CONCERNS.md`'s P0 classification |

No new external attack surface is introduced by this phase — all six fixes reduce existing attack surface or reliability risk; none add a new endpoint, new auth mechanism, or new data flow.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `backend/app/db.py`, `routes.py`, `idempotency.py`, `main.py`, `config.py`, `models.py`, `schema.sql`, `pyproject.toml`, `uv.lock`, `tests/test_idempotency.py`, `tests/conftest.py`, `pytest.ini` — read in full during this research session
- Live verification via `uv run pytest -q` (baseline: 174 passed, 8 failed) and `uv run pytest tests/...` for specific failure diagnostics
- Live verification of SQLite `ALTER TABLE`/`PRAGMA table_info` behavior via local Python interpreter in this session
- Live verification of `pydantic-settings` comma-separated string env-var parsing via local Python interpreter in this session
- [Python contextlib docs](https://docs.python.org/3/library/contextlib.html#contextlib.contextmanager) — `@contextmanager` exception-propagation semantics

### Secondary (MEDIUM confidence)
- [Starlette Middleware docs](https://starlette.dev/middleware/) — CORSMiddleware `allow_credentials`/`allow_origins` interaction
- [FastAPI Response Model docs](https://fastapi.tiangolo.com/tutorial/response-model/) — `JSONResponse` bypassing `response_model`
- [FastAPI GitHub Discussion #10425](https://github.com/fastapi/fastapi/discussions/10425) — `JSONResponse` does not implicitly serialize Pydantic models
- [Starlette GitHub Discussion #1823/#1807, PR #1113](https://github.com/Kludex/starlette) — documented origin-reflection behavior when `allow_credentials=True` + `allow_origins=["*"]`

### Tertiary (LOW confidence)
- None used for factual claims in this document — all claims above are either verified directly against this codebase/environment or cited to official framework documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries introduced; all changes use stdlib (`contextlib`) or already-installed framework primitives (Starlette's `CORSMiddleware`, FastAPI's `JSONResponse`)
- Architecture: HIGH — verified directly against the actual `routes.py`/`db.py`/`main.py` source, not inferred from CONTEXT.md's description alone
- Pitfalls: HIGH — every pitfall listed was either reproduced locally in this session (baseline test failures, SQLite ALTER TABLE behavior) or is a well-documented, decades-stable Python/framework semantic (contextmanager exception propagation, CORS spec)

**Research date:** 2026-07-01
**Valid until:** No expiry pressure — this research is grounded in the current commit's exact source and a locally-reproduced test baseline, not external library version claims that could drift. Re-verify the "174 passed, 8 failed" baseline number if significant time passes before implementation, since other work may land on `main` first.

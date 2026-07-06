# Technical Concerns & Risks

**Analysis Date:** 2026-07-01

---

## Critical Issues

**P0 — SQLite Connection Leak in `GET /v1/eta` on stats-not-found path:**
- Issue: `backend/app/routes.py:336` raises `HTTPException(status_code=404)` after `conn.close()` — this specific path is fine. However, if `row is None` at line 335, the connection was already closed at line 333. This is correct. But the `get_eta` handler does NOT use a `try/finally` block, so any unexpected exception between `get_connection()` (line 265) and `conn.close()` (line 333) will leak the connection.
- All other route handlers share the same pattern: bare `conn = get_connection()` + explicit `conn.close()` calls inside early-return branches. There is no `with` context manager or `try/finally`. A Python exception from Pydantic, SQLite, or any other internal error will leak the connection.
- Files: `backend/app/routes.py` — all handlers (`ride_summary`, `get_eta`, `get_stops`, `get_routes`, `get_stop_schedule`, `search_routes`)
- Impact: Under sustained traffic, leaked SQLite file descriptors accumulate until the process hits OS limits or SQLite WAL WAL becomes confused.
- Fix approach: Replace bare `conn = get_connection()` / `conn.close()` with a `contextlib.contextmanager` or `try/finally` blocks. A simple `with get_connection(db_path) as conn:` pattern after making `get_connection` return a context manager.

**P0 — CORS wildcard with credentials on a production API:**
- Issue: `backend/app/main.py:92-95` sets `allow_origins=["*"]` AND `allow_credentials=True`. CORS spec forbids this combination in browsers (browsers reject it). The comment says "Allow all origins for development" but this is committed code that may reach production.
- Files: `backend/app/main.py:91-97`
- Impact: Either the credentials flag is silently broken for browser clients (browsers refuse the response), or it signals this has never been validated in a browser. If a locked-down origin list is never set before production, cross-origin cookie attacks become possible.
- Fix approach: Lock `allow_origins` to an explicit list (e.g., Expo dev server URL, production domain) before production deployment. Remove the `allow_credentials=True` if Bearer header auth is the sole mechanism.

---

## Technical Debt

**Routes search loads all 4,190 routes into Python memory on every request:**
- Issue: `backend/app/routes.py:831-836` — `search_routes` fetches all rows from the `routes` table (`SELECT ... FROM routes ORDER BY route_short_name`, no LIMIT), loads them into a Python list, then filters in Python using `normalize_for_search`. Comment at line 830: "Fetch all routes and filter in Python (normalization cannot be done in SQLite easily)".
- Files: `backend/app/routes.py:823-860`
- Impact: Every search call deserializes ~4,190 rows. At moderate concurrency (50 rps) this is a significant allocation bottleneck. Under high load this function will become the hotspot.
- Fix approach: Add a normalized column `route_short_name_normalized` (GENERATED ALWAYS or populated at bootstrap) and use SQLite `LIKE` or `INSTR`. Alternatively use SQLite's `lower()` and drop the space/hyphen stripping into a real FTS5 table.

**Deprecation warning cannot be delivered to client:**
- Issue: `backend/app/routes.py:221-226` — when `timestamp_utc` is used instead of `observed_at_utc`, the code sets `deprecation_warning` and then `logger.warning(...)` because "FastAPI doesn't easily allow adding headers to response_model responses". The deprecation header is never sent to the client.
- Files: `backend/app/routes.py:62-68`, `routes.py:221-226`
- Impact: Clients using the deprecated field get no signal to migrate; the deprecation deadline of v0.3.0 (2025-11-30 per the warning string) will break them silently.
- Fix approach: Return a `JSONResponse` directly (or use `Response` with `background`) to attach a `Deprecation` or `X-Deprecation-Warning` header.

**Idempotency replay returns stale zero-count response:**
- Issue: `backend/app/routes.py:95-99` — on an idempotency cache hit, the handler returns `RideSummaryResponse(accepted_segments=0, rejected_segments=0, rejected_by_reason={})` regardless of what the original response contained. The comment says "client should cache response". The actual stored `response_hash` is never used to retrieve the original response body.
- Files: `backend/app/routes.py:93-99`, `backend/app/idempotency.py:82-95`
- Impact: Clients retrying a ride submission on network failure receive `accepted=0` and may re-submit. The idempotency guarantee is broken for clients that inspect the response.
- Fix approach: Store the full serialized response in `idempotency_keys.response_body` (or reconstruct from `response_hash`) and return it verbatim on replay.

**EMA stored but not used in blended mean:**
- Issue: `backend/app/learning.py:303` updates EMA fields (`ema_mean`, `ema_var`) and `backend/app/routes.py:341` calls `compute_blended_mean(welford_mean, schedule_mean, n)` — the EMA values are written to DB but never read or incorporated into the returned ETA.
- Files: `backend/app/learning.py:303`, `backend/app/routes.py:341`
- Impact: Half the learning model (EMA) is silently dead. The algorithm description in `CLAUDE.md` implies EMA is part of the blend, but it isn't.
- Fix approach: Either incorporate `ema_mean` into the blend formula or remove EMA writes to avoid misleading future developers.

**`compute_variance` uses population variance, not sample variance:**
- Issue: `backend/app/learning.py:57` returns `m2 / n`. Welford's algorithm computes the sample variance as `m2 / (n-1)`. Using `m2 / n` underestimates variance, leading to tighter (overconfident) P90 bounds.
- Files: `backend/app/learning.py:53-58`
- Impact: P90 ETA predictions are systematically too narrow, which matters for transit planning use cases.
- Fix approach: Return `m2 / (n - 1)` when `n >= 2`.

**`dwell_stats` table exists in schema but is never populated:**
- Issue: `backend/app/schema.sql:151-167` defines a `dwell_stats` table with Welford stats for dwell times. No code in `backend/app/` writes to this table. It is orphaned schema.
- Files: `backend/app/schema.sql:151-167`
- Impact: Misleads future developers; wastes schema complexity.
- Fix approach: Either implement dwell time learning (from `dwell_sec` in `RideSegment`) or drop the table.

**`missing_stats` rejection silently discards data instead of bootstrapping:**
- Issue: `backend/app/learning.py:279-283` — if `segment_stats` row doesn't exist for a `(segment_id, bin_id)` pair, the observation is rejected with `"missing_stats"`. The stats row is never created on first observation. New segments with no history will forever reject observations until a bootstrap is run.
- Files: `backend/app/learning.py:279-283`
- Impact: Prevents the system from learning on segments that were not pre-seeded from GTFS. Any segment discovered post-bootstrap silently drops all observations.
- Fix approach: Insert a new `segment_stats` row with `n=0, welford_mean=schedule_mean` on first observation (upsert semantics).

---

## Scalability Concerns

**SQLite single-writer bottleneck on ride submissions:**
- Issue: `backend/app/learning.py:322` and `backend/app/learning.py:199` each call `conn.commit()` per-segment inside the per-ride loop (two commits per segment: one in `update_device_bucket`, one in `update_segment_stats`). With 50 segments per ride, that is 100 commits per request.
- Files: `backend/app/routes.py:125-203`, `backend/app/learning.py:197-199`, `learning.py:320-323`
- Impact: Each `commit()` flushes WAL, serializing writers. At >10 concurrent POST requests, p99 latency will exceed the stated 200 ms target.
- Fix approach: Move all per-segment writes into the single outer transaction already opened by the `rides` insert. Call `conn.commit()` once at `routes.py:204`.

**`/v1/stops?route_id=X` runs a correlated subquery over 1.46M stop_times rows:**
- Issue: `backend/app/routes.py:503-509` — when `route_id` is provided, the query filters using a nested `SELECT DISTINCT st.stop_id FROM stop_times JOIN trips WHERE route_id = ?`. No index exists on `(trips.route_id, stop_times.stop_id)` combination; the query plan will scan stop_times.
- Files: `backend/app/routes.py:503-509`, `backend/app/schema.sql` (no compound index on this join path)
- Impact: Single queries may take hundreds of ms on the 1.46M row stop_times table.

**`/v1/routes?stop_id=X` has same nested scan issue:**
- Files: `backend/app/routes.py:583-590`

**Rate limit bucket table grows unboundedly:**
- Issue: The `rate_limit_buckets` table has no TTL or cleanup. `backend/scripts/rate_limit_cleanup.sh` exists but is not wired to any systemd timer (only `bmtc-backup.timer` and `bmtc-retention.timer` are documented in `NEXT_STEPS.md` / `backend/deploy/`).
- Files: `backend/app/schema.sql:248-256`, `backend/scripts/rate_limit_cleanup.sh`
- Impact: Table grows at one row per unique device_bucket forever, eventually degrading SQLite query performance.

---

## Security & Privacy Risks

**CORS wildcard + credentials (see Critical Issues above):**
- `backend/app/main.py:92-95`

**Device bucket validation accepts any 64-char hex string — no server-side salt verification:**
- Issue: `backend/app/models.py:95-103` validates `device_bucket` is a 64-char hex string but cannot verify it was produced with the expected daily salt. A client can submit any static 64-char hex string and evade rate limiting by rotating strings.
- Files: `backend/app/models.py:95-103`, `backend/app/rate_limit.py:42-43`
- Impact: Rate limiting is trivially bypassed by generating random 64-char hex strings per request.
- Note: This is an inherent limitation of client-side hashing with no shared secret.

**`hmac_secret_key` is optional and unused:**
- Issue: `backend/app/config.py:33` defines `hmac_secret_key: Optional[str] = None` but no code in the codebase uses it. HMAC signing was planned (STRIDE review mentions it) but not implemented.
- Files: `backend/app/config.py:33`
- Impact: The security review documentation may describe a mitigated threat that is not actually mitigated.

**`slowapi` `Limiter` is instantiated in `routes.py` and `main.py` but the `@limiter.limit()` decorator is never applied to any route:**
- Issue: `backend/app/routes.py:49` creates `limiter = Limiter(key_func=get_remote_address)` and `backend/app/main.py:57` creates another. Neither is used as a decorator on any route function. The actual rate limiting happens in `RateLimitMiddleware`, not via slowapi.
- Files: `backend/app/routes.py:49`, `backend/app/main.py:57`
- Impact: Dead code; the slowapi setup adds confusion about which rate limiting mechanism is active.

---

## Operational Risks

**No automated cleanup for `idempotency_keys` in production:**
- Issue: `backend/app/idempotency.py:128-148` defines `cleanup_expired_keys()` but this function is never called anywhere in the application. Idempotency keys will accumulate unless manually purged.
- Files: `backend/app/idempotency.py:128-148`
- Fix approach: Call `cleanup_expired_keys()` in the lifespan handler (`backend/app/main.py`) on startup, or add a systemd timer.

**Retention script only cleans `ride_segments`, not `rides`:**
- Issue: `backend/deploy/bmtc-retention.service` runs `DELETE FROM ride_segments WHERE timestamp_utc < ...` but does not clean the parent `rides` table. Orphaned `rides` rows accumulate with no segments.
- Files: `backend/deploy/bmtc-retention.service`

**No database migration framework:**
- Issue: `backend/app/schema.sql` uses `CREATE TABLE IF NOT EXISTS` everywhere. Changes to existing table columns (adding `body_hash` to `idempotency_keys`, adding `rate_limit_buckets`) are not tracked. There is a `backend/app/migrations/` directory but it is empty.
- Files: `backend/app/migrations/` (empty), `backend/app/schema.sql`
- Impact: Schema changes require manual ALTER TABLE or full DB recreation. The production DB will drift from the schema on incremental updates.
- Fix approach: Adopt Alembic or a simple versioned migration script pattern.

**`server_version` hardcoded as string in `config.py`:**
- Issue: `backend/app/config.py:19` sets `server_version: str = "0.2.0"`. It is not derived from `pyproject.toml` or git tags.
- Files: `backend/app/config.py:19`
- Impact: Version drift between git tags and API responses; no automated consistency check.

---

## Data Quality Risks

**Normal distribution assumption is unrevalidated for bus travel times:**
- Issue: `backend/app/learning.py:91-131` computes P50 and P90 using normal approximation (`mean ± z·σ`). Bus travel times are right-skewed (delays are asymmetric). The normal approximation will underestimate P90 for high-traffic segments.
- Files: `backend/app/learning.py:91-131`
- Impact: P90 ETA is systematically optimistic; riders using P90 as a "safe" estimate will miss buses more than 10% of the time.

**Single GTFS service_id assumption:**
- Issue: `NEXT_STEPS.md:270` documents that BMTC GTFS has service_id='1' running all 7 days. `compute_bin_id` maps to weekday vs weekend bins based on day-of-week only. If BMTC ever publishes a multi-service GTFS, the bin mapping will silently assign data to wrong bins.
- Files: `backend/app/db.py:45-74`

**`is_holiday` flag is client-controlled with no server verification:**
- Issue: `backend/app/routes.py:158` passes `segment.is_holiday` directly to `compute_bin_id`. Any client can set `is_holiday=True` to route observations to weekend bins on a weekday, polluting weekend statistics.
- Files: `backend/app/routes.py:158`, `backend/app/db.py:68-69`
- Fix approach: Either remove the flag and compute holidays server-side using a public holiday calendar, or ignore it entirely given the single service_id GTFS.

**Welford `n` counter never resets even as EMA decays:**
- Issue: `segment_stats.n` monotonically increases. The blend weight `w = n/(n+20)` converges to 1.0 for old high-traffic segments. If route conditions change (road diversion, new flyover), the high `n` makes the learner extremely slow to adapt even though the EMA's time-based alpha would adapt faster. But EMA is not used in the blend (see Technical Debt above).
- Files: `backend/app/learning.py:75-88`

---

## Missing Features / Gaps

**No GTFS update workflow (Phase 6 of NEXT_STEPS.md):**
- GTFS data is loaded once at bootstrap. There is no `scripts/update_gtfs.sh`. If GTFS is re-bootstrapped, existing `segment_stats` learning data is preserved but segments table may gain new rows or lose old ones without reconciliation.

**No performance tests:**
- `NEXT_STEPS.md:213-222` specifies performance targets (POST p99 < 200ms, GET p99 < 100ms) but there are no load tests. Given the multiple commits-per-segment issue, these targets are likely not met under concurrent load.

**Bootstrap smoke tests not implemented:**
- `NEXT_STEPS.md:198-211` describes `tests/test_bootstrap.py` that should verify all tables exist, GTFS metadata is populated, and foreign keys are valid. This file does not exist.

**No monitoring / alerting integration:**
- `NEXT_STEPS.md:242` mentions "Uptime Robot / healthchecks.io" as a deployment checklist item but nothing is instrumented. There are no Prometheus metrics, no structured log fields for latency, no p95 tracking.

**`GET /v1/stops/{stop_id}` and `GET /v1/routes/{route_id}` not implemented:**
- `NEXT_STEPS.md:108-112` lists these as Phase 4 optional additions. The mobile client cannot fetch a single stop or route detail without pagination.

**Geospatial stop search (radius_m) not implemented:**
- `NEXT_STEPS.md:111` lists `GET /v1/stops?lat=X&lon=Y&radius_m=500`. The current bbox filter is a rectangular approximation only.

---

## Positive Observations

- **Welford algorithm is correctly implemented** (`backend/app/learning.py:14-33`): the two-pass delta/delta2 update is numerically stable and matches the canonical algorithm.
- **Test isolation is thorough**: `backend/tests/conftest.py` clears settings cache and uses in-memory / temp-file DBs per test. The `--dist loadfile` parallelism setup is well-documented in `backend/tests/TEST_ISOLATION.md`.
- **STRIDE security review was completed** (`docs/SECURITY_REVIEW/`): findings are documented and several (H1 body hash, H2 rate limiting, H3 no IP persistence) were addressed in code.
- **Rate limit middleware uses SQLite atomic UPSERT** (`backend/app/rate_limit.py:100-115`): the token bucket logic correctly handles concurrent decrements without a separate SELECT+UPDATE race.
- **Idempotency key body-hash verification** (`backend/app/idempotency.py:25-41`): SHA256 of deterministically serialized JSON prevents tampering, even if the replay response is stale (see Technical Debt above).
- **API versioning header** (`backend/app/main.py:24-31`): `X-API-Version: 1` is added to all responses via middleware, enabling future version negotiation.

---

*Concerns audit: 2026-07-01*

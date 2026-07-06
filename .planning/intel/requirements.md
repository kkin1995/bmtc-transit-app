# Requirements (from PRDs)

Synthesized from classified PRD sources. One entry per requirement; provenance preserved.
Precedence tier: PRD (below ADR and SPEC per default `["ADR","SPEC","PRD","DOC"]`).

All three source PRDs carry `manifest_override: true` (user explicitly tagged these as PRDs).

---

## PRD: API Docs v1 Refresh

- **Source:** `docs/prd/api-docs-v1-refresh.md`
- **Status:** Draft | Created 2025-10-22
- **Scope:** `docs/api.md`, `POST /v1/ride_summary`, `GET /v1/eta`, `RideSummaryResponse`, `ETAResponse`, rate-limit headers, idempotency, `device_bucket`

**REQ-api-docs-field-alignment** — Correct field-name misalignments between `docs/api.md` and the implementation.
- Acceptance: `docs/api.md` field names match `models.py` exactly (AC1); all 4 curl examples run successfully (AC2); POST body shows `device_bucket` at ride level with segments containing `timestamp_utc` (int) (AC3); GET /eta response shows `mean_sec`, `sample_count`, `low_n_warning` (AC4); POST response body is `{accepted: bool, rejected_count: int, rejected_by_reason: dict}` with no `rate_limit` object (AC5); rate-limit headers documented for POST only (AC6); exact 7 error codes documented (AC7); two independent reviewers can integrate using only the doc (AC8).
- **⚠ See competing-variants / conflict note below — this PRD's target field names do not match the current implementation or current `docs/api.md`.**

**REQ-api-docs-privacy-attestation** — Document that `device_bucket` is a client-salted hash never returned by GET APIs.
- Acceptance: Privacy section states retention windows (`ride_segments` 90d, `rejection_log` 30d, `idempotency_keys` 24h, `segment_stats` long-lived); reiterates no INFO-level payload logging; documents 409 behavior on idempotency body-hash mismatch.

**REQ-api-docs-error-model** — Error section lists exactly 7 canonical error codes with HTTP status mapping and request/response examples for 400/401/409/422/429.

---

## PRD: Device-Bucket Rate Limiting for POST /v1/ride_summary

- **Source:** `docs/prd/device-bucket-rate-limit.md`
- **Status:** Draft | Owner: Backend | Created 2025-10-22
- **Scope:** `POST /v1/ride_summary`, `rate_limit_buckets` table, `device_bucket`, `Idempotency-Key`, `X-RateLimit` headers, `BMTC_RATE_LIMIT_ENABLED` feature flag

**REQ-ratelimit-token-bucket-storage (FR-1)** — Maintain a `rate_limit_buckets` table: `bucket_id TEXT PRIMARY KEY`, `quota_remaining INT`, `reset_utc INT` (unix epoch).
- **⚠ Conflict: actual/SPEC schema uses different column names — see conflicts report.**

**REQ-ratelimit-bucket-identification (FR-2)** — Extract `device_bucket` from request body; fallback to `ip:<X-Forwarded-For>` or `remote_addr` if absent/invalid. Never log the canonical bucket_id.

**REQ-ratelimit-quota-check-before-ingest (FR-3)** — Check remaining quota BEFORE updating `segment_stats`/`rejection_log`. Return 429 (`error="rate_limited"`) with no state changes if `quota_remaining <= 0`.

**REQ-ratelimit-atomic-decrement (FR-4)** — Decrement `quota_remaining` by 1 in the same transaction as ride ingest; no race conditions under concurrent POSTs to the same bucket.

**REQ-ratelimit-hourly-reset (FR-5)** — Reset `quota_remaining` to 500 when `reset_utc <= now`; next window = `now + 3600`.

**REQ-ratelimit-idempotency-integration (FR-6)** — Do NOT deduct quota on replay of identical `(Idempotency-Key, body_sha256)`; quota spent only on first submission.

**REQ-ratelimit-response-headers (FR-7)** — Include `X-RateLimit-Limit: 500`, `X-RateLimit-Remaining: <N>`, `X-RateLimit-Reset: <unix-sec>` on all POST responses including 429.

**REQ-ratelimit-feature-flag (FR-8)** — Respect `BMTC_RATE_LIMIT_ENABLED` (default true); when false, skip quota check but still return headers.
- **Note:** `BMTC_RATE_LIMIT_ENABLED` does not currently exist as a config field (only referenced in a log message string in `main.py`) — this PRD requirement is genuinely unimplemented, not a naming conflict.

**Acceptance criteria (AC1–AC9):** clean-bucket happy path, quota exhaustion → 429, hourly reset behavior, IP fallback, idempotent replay does not deduct, concurrent-POST consistency (no oversell), feature-flag-disabled sentinel behavior (`Remaining=999`), invalid `device_bucket` format falls back to IP. Full detail in source.

**NFRs:** check+decrement p95 < 3ms; `rate_limit_buckets` growth ≤1 row/bucket/hour with daily auto-cleanup of >24h-stale rows; no quota overspend under concurrent writes; headers returned for all outcomes.

---

## PRD: Test Isolation & Parallel Execution with pytest-xdist

- **Source:** `docs/prd/test-isolation-xdist.md`
- **Status:** Draft | Owner: QA | Created 2025-10-22
- **Scope:** `pytest-xdist`, `pytest-randomly`, settings singleton refactor, `conftest.py` fixtures, backend test suite (33 tests at PRD authoring time)

**REQ-test-isolation-xdist-deps (FR-1)** — Add `pytest-xdist` and `pytest-randomly` to dev dependencies.

**REQ-test-isolation-pytest-config (FR-2)** — Configure `pytest.ini` with `-n auto --dist loadfile`.

**REQ-test-isolation-fixture-settings (FR-3)** — Settings (`n0`, `half_life_days`, `outlier_sigma`, `mapmatch_min_conf`) accessible via fixtures, not global singletons.

**REQ-test-isolation-db-fixtures (FR-4)** — DB fixtures: in-memory `:memory:` for unit tests, temp file-based for integration tests.

**REQ-test-isolation-env-fixtures (FR-5)** — Environment variable isolation via monkeypatch fixtures (`BMTC_API_KEY`, `BMTC_DB_PATH`).

**REQ-test-isolation-cache-teardown (FR-6)** — Fixture teardown explicitly clears app state caches (`lifespan.startup_time`, `settings._cache`).

**REQ-test-isolation-documented-commands (FR-7)** — Document single-module, full-sequential, and full-parallel test commands.

**Acceptance criteria (AC1–AC7):** full 33-test suite passes under `-n auto --dist loadfile`; zero flakes across 3 consecutive runs; single-module results match full-suite results; env-var isolation verified under parallel execution; pytest-randomly shuffled order still passes; fixture injection prevents cross-test cache pollution; fresh DB state confirmed between tests.

**Status vs. current codebase:** `CLAUDE.md` and `backend/tests/TEST_ISOLATION.md` (referenced, not separately classified) claim this work is **already complete** — "All 47 tests now pass reliably in parallel" with pytest-xdist + pytest-randomly wired up, test count now 47 (grown from the PRD's 33). This PRD's problem statement (33 tests, flaky in parallel) describes a **pre-fix state**; current reality is a superset already fixed. Treated as informational — not a blocking conflict since no contradiction exists, only staleness. See conflicts report (INFO bucket).

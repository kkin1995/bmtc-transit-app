# Decisions (from ADRs)

Synthesized from classified ADR sources. One entry per decision; provenance preserved.
Precedence tier: ADR (highest, per default `["ADR","SPEC","PRD","DOC"]`).

---

## ADR-0001: Stack & Architecture Decisions

- **Source:** `docs/PLAN.md` (§ "ADR-0001: Stack & Architecture Decisions")
- **Status:** Locked (`locked: true` per classification; document header marks Phase 1 "✅ Complete")
- **Scope:** Backend stack, learning algorithm choice, deployment topology, auth model

**Decisions:**
1. **FastAPI** as the web framework — async, typed contracts, auto OpenAPI, <50ms overhead.
2. **SQLite WAL** as the sole datastore — ACID, zero-config, handles 100 writes/sec, atomic `.backup`, no network overhead. Explicitly rejects Postgres (overkill for <1M rows) and Redis (SQLite fast enough for read cache).
3. **Welford's algorithm** for online mean/variance — O(1) update, numerically stable vs. naive Σ(x²).
4. **EMA (α=0.1)** for recency-weighting — recent rides weighted more, ~20-sample effective window.
5. **192 time bins** — 15-min granularity × 2 day-types (weekday/weekend); balances sparsity vs. temporal precision.
6. **Cloudflare Tunnel** for public exposure — no open ports, auto HTTPS, free tier sufficient. Rejects direct server exposure and K8s (single VM fits free tier, no orchestration needed).
7. **Bearer token auth** (single long-lived key) — sufficient for single-user/low-user-count deployment; rotate monthly. Rejects JWT/OAuth (no multi-tenant need).
8. **Blend formula:** `w = n/(n+20)`; at n=0 pure schedule, at n=20 50/50, at n=100 ≈83% learned.
9. **Outlier threshold:** reject if `n > 5` AND `|x−μ| > 3σ`; 3σ is a starting point, may need tuning for Bengaluru traffic patterns.
10. **Decay strategy:** 30-day EMA half-life; stale threshold at 90 days.

**Rationale for "Why NOT" alternatives:** documented explicitly in source (Postgres, K8s, Redis, JWT/OAuth, alternative REST frameworks) — see source for full text.

---

## ADR-0002: Global Aggregation Design Decisions (Phase 2)

- **Source:** `docs/PLAN.md` (§ "ADR-0002: Global Aggregation Design Decisions (Phase 2)")
- **Status:** Locked (`locked: true` per classification; document header marks Phase 2 "✅ Complete")
- **Scope:** Multi-device crowd-sourced learning — privacy, quality, reliability controls

**Decisions:**
1. **SHA256 device buckets** (not plain UUIDs) — privacy: hash prevents reverse lookup to device identity; client can rotate salt to change bucket. Rejects plain UUIDs (expose device identity).
2. **Idempotency keys, 24h TTL** — prevents retry-storm contamination of learned ETAs; response-hash caching allows safe replay. Rejects server-generated dedup (requires client-side state).
3. **Map-match confidence threshold, default 0.7** — below threshold indicates possible route mismatch from GPS tunneling; default when unset is 1.0 (perfect, backward compatible). Rejects accepting all observations unconditionally.
4. **Rejection logging, 30-day retention**, separate table from `ride_segments` — enables quality monitoring without polluting production data. Rejects flagging in `ride_segments` directly (harder to query/prune).
5. **Configurable outlier sigma**, default 3.0 — different routes have different traffic variability; per-deployment tunable. Rejects a fixed, non-configurable threshold.
6. **Max segments per ride: 50** — longest BMTC routes have ~40 stops (~39 segments); prevents abuse/unbounded processing. Rejects unbounded segment counts (DoS risk).

**Rationale for "Why NOT" alternatives:** per-device learning models (single global model converges faster), JWT/session auth (still single admin user), Redis for idempotency (SQLite <5ms lookups sufficient), real-time feedback (batch learning adequate) — see source for full text.

---

## Conflict Note: ADR field-name contract vs. current implementation

**Source:** `docs/PLAN.md` § "API Contract" (embedded in the same ADR-bearing document, classified ADR, locked)

The embedded API Contract section of `docs/PLAN.md` specifies:
- `POST /v1/ride_summary` response: `{accepted: bool, rejected_count: int, rejected_by_reason: dict}`
- Segment field: `timestamp_utc` (Unix epoch int)

This contradicts the **current** ground truth in `backend/app/models.py` (`RideSummaryResponse.accepted_segments: int`, `RideSummaryResponse.rejected_segments: int`, `RideSegment.observed_at_utc: str` as primary field with `timestamp_utc` demoted to deprecated fallback) and the **current** `docs/api.md` (SPEC, same field names as the implementation).

**Resolved:** Per user decision, `docs/PLAN.md`'s "## API Contract" section now carries an explicit "⚠ SUPERSEDED (2025-10-22)" note declaring `docs/api.md` canonical for these field names. ADR-0001/ADR-0002's actual architectural decisions (stack, algorithms, privacy/aggregation design) remain locked and unaffected — only the embedded, stale field-name contract was annotated. See `INGEST-CONFLICTS.md` INFO bucket.

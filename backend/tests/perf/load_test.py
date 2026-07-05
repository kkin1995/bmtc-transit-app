#!/usr/bin/env python3
"""Manual, local-only load test for OPS-01.

NOT a pytest test (filename intentionally not prefixed `test_` so pytest's
`python_files = test_*.py` config does not collect it, per D-06). NOT wired
into CI — this is a manual/local evidence artifact only (D-03).

Drives >=20 concurrent clients against a running server, each with its own
`device_bucket` (D-04, exercises the real per-bucket RateLimitMiddleware
path), and measures p50/p99 latency for POST /v1/ride_summary and GET
/v1/eta in separate runs (D-05).

BASE_URL/API_KEY/DB_PATH are hardcoded local-only defaults below and are
NEVER read from the ambient shell environment, to prevent an accidental run
against a real deployment or the real dev DB (D-02, T-05-06).

Usage:
    # Terminal 1: start a scratch-DB-backed server (never bmtc_dev.db)
    BMTC_DB_PATH=/tmp/perf.db BMTC_API_KEY=perf-test-key \\
        uv run uvicorn app.main:app --port 8001 &

    # Terminal 2: seed once, then run each endpoint in its own pass
    uv run python tests/perf/load_test.py --seed --endpoint post --clients 20 --requests 25
    uv run python tests/perf/load_test.py --endpoint eta --clients 20 --requests 25

    # When done, stop the background server:
    kill %1
"""
import argparse
import asyncio
import hashlib
import math
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Local-only defaults. Intentionally hardcoded, never sourced from
# BMTC_DB_PATH / BASE_URL env vars — see module docstring (D-02, T-05-06).
BASE_URL = "http://127.0.0.1:8001"
API_KEY = "perf-test-key"
DB_PATH = "/tmp/perf.db"

RESULTS_PATH = Path(__file__).parent / "results.txt"


def seed_scratch_db(db_path: str) -> None:
    """Directly insert a test segment + all-192-bin baseline stats into the
    scratch DB, mirroring conftest.py's db_with_test_segment fixture.

    generate_sample_data.py's synthetic IDs are not reused here: they don't
    exist in a freshly-bootstrapped scratch DB and would 422 against
    POST /v1/ride_summary's segment-lookup check (RESEARCH Pitfall 5).
    n=5 / welford populated so GET /v1/eta returns a learned value (200),
    not a 404 on a zero-observation bin.
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) "
            "VALUES ('PERF_ROUTE', 0, 'PERF_STOP_A', 'PERF_STOP_B')"
        )
        (segment_id,) = conn.execute(
            "SELECT segment_id FROM segments WHERE route_id='PERF_ROUTE' AND direction_id=0 "
            "AND from_stop_id='PERF_STOP_A' AND to_stop_id='PERF_STOP_B'"
        ).fetchone()
        for bin_id in range(192):
            conn.execute(
                "INSERT OR IGNORE INTO segment_stats "
                "(segment_id, bin_id, schedule_mean, n, welford_mean, welford_m2) "
                "VALUES (?, ?, 300.0, 5, 300.0, 100.0)",
                (segment_id, bin_id),
            )
        conn.commit()
    finally:
        conn.close()


def percentile(samples: list[float], p: float) -> float:
    """Nearest-rank percentile. p in [0, 100]."""
    if not samples:
        raise ValueError("no samples")
    ordered = sorted(samples)
    idx = math.ceil((p / 100) * len(ordered)) - 1
    idx = max(0, min(idx, len(ordered) - 1))
    return ordered[idx]


async def post_client(client_id: int, n_requests: int, latencies: list[float]) -> None:
    """Simulate one client repeatedly POSTing ride segments.

    Each client derives its own SHA256 device_bucket (D-04) so the real
    per-bucket RateLimitMiddleware token path is exercised, not bypassed.
    Requests are sequential awaits within a client (paced by round-trip
    time, not a tight burst loop) per RESEARCH Pitfall 6 / Assumption A3,
    for a steady-rate, more defensible p99 measurement.
    """
    device_bucket = hashlib.sha256(f"perf-client-{client_id}".encode()).hexdigest()
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        for _ in range(n_requests):
            observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            payload = {
                "route_id": "PERF_ROUTE",
                "direction_id": 0,
                "device_bucket": device_bucket,
                "segments": [
                    {
                        "from_stop_id": "PERF_STOP_A",
                        "to_stop_id": "PERF_STOP_B",
                        "duration_sec": 300.0,
                        "observed_at_utc": observed_at,
                        "mapmatch_conf": 0.95,
                    }
                ],
            }
            start = time.perf_counter()
            resp = await client.post(
                "/v1/ride_summary",
                json=payload,
                headers={"Authorization": f"Bearer {API_KEY}"},
            )
            latencies.append((time.perf_counter() - start) * 1000)
            # 429 is a valid, expected outcome under real rate-limiting (D-04), not a bug.
            assert resp.status_code in (200, 429), f"{resp.status_code}: {resp.text}"


async def eta_client(client_id: int, n_requests: int, latencies: list[float]) -> None:
    """Simulate one client repeatedly querying GET /v1/eta."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        for _ in range(n_requests):
            start = time.perf_counter()
            resp = await client.get(
                "/v1/eta",
                params={
                    "route_id": "PERF_ROUTE",
                    "direction_id": 0,
                    "from_stop_id": "PERF_STOP_A",
                    "to_stop_id": "PERF_STOP_B",
                },
            )
            latencies.append((time.perf_counter() - start) * 1000)
            assert resp.status_code == 200, f"{resp.status_code}: {resp.text}"


async def run(endpoint: str, n_clients: int, n_requests: int) -> list[float]:
    """Fan out n_clients concurrent simulated clients via asyncio.gather."""
    latencies: list[float] = []
    fn = post_client if endpoint == "post" else eta_client
    await asyncio.gather(*[fn(i, n_requests, latencies) for i in range(n_clients)])
    return latencies


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", choices=["post", "eta"], required=True)
    parser.add_argument("--clients", type=int, default=20)
    parser.add_argument("--requests", type=int, default=25)
    parser.add_argument("--seed", action="store_true", help="Seed the scratch DB before running")
    args = parser.parse_args()

    if args.seed:
        seed_scratch_db(DB_PATH)

    latencies = asyncio.run(run(args.endpoint, args.clients, args.requests))
    target_ms = 200 if args.endpoint == "post" else 100
    p50 = percentile(latencies, 50)
    p99 = percentile(latencies, 99)
    passed = p99 < target_ms

    result_line = (
        f"{datetime.now(timezone.utc).isoformat()} endpoint={args.endpoint} "
        f"clients={args.clients} requests={len(latencies)} "
        f"p50_ms={p50:.2f} p99_ms={p99:.2f} target_ms={target_ms} "
        f"PASS={passed}\n"
    )
    print(result_line)
    with open(RESULTS_PATH, "a") as f:
        f.write(result_line)


if __name__ == "__main__":
    main()

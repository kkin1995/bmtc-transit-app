"""API route handlers."""
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import verify_token
from app.config import get_settings
from app.db import get_connection, compute_bin_id
from app.learning import (
    update_segment_stats,
    compute_blended_mean,
    compute_percentiles_robust,
    compute_variance,
    is_stale
)
from app.models import (
    RideSummary,
    RideSummaryResponse,
    ETAResponse,
    ConfigResponse,
    HealthResponse
)
from app.state import get_startup_time


logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/ride_summary", response_model=RideSummaryResponse)
@limiter.limit("10/minute")
async def ride_summary(
    request: Request,
    ride: RideSummary,
    authenticated: bool = Depends(verify_token)
):
    """Accept ride summary and update learning statistics."""
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    rejected_count = 0

    # Insert ride metadata
    cursor.execute(
        "INSERT INTO rides (submitted_at, segment_count) VALUES (?, ?)",
        (int(time.time()), len(ride.segments))
    )
    ride_id = cursor.lastrowid

    for seq, segment in enumerate(ride.segments):
        # Validate segment exists
        cursor.execute(
            """
            SELECT segment_id FROM segments
            WHERE route_id = ? AND direction_id = ? AND from_stop_id = ? AND to_stop_id = ?
            """,
            (ride.route_id, ride.direction_id, segment.from_stop_id, segment.to_stop_id)
        )
        row = cursor.fetchone()
        if row is None:
            # Unknown segment - reject with 422
            conn.close()
            raise HTTPException(status_code=422, detail=f"Unknown segment: {segment.from_stop_id} -> {segment.to_stop_id}")

        segment_id = row[0]

        # Compute time bin (with optional holiday routing)
        bin_id = compute_bin_id(segment.timestamp_utc, is_holiday=segment.is_holiday)

        # Update statistics
        accepted = update_segment_stats(conn, segment_id, bin_id, segment.duration_sec)
        if not accepted:
            rejected_count += 1

        # Record ride_segment
        cursor.execute(
            """
            INSERT INTO ride_segments (ride_id, seq, segment_id, duration_sec, dwell_sec, timestamp_utc, accepted)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (ride_id, seq, segment_id, segment.duration_sec, segment.dwell_sec, segment.timestamp_utc, int(accepted))
        )

    conn.commit()
    conn.close()

    return RideSummaryResponse(accepted=True, rejected_count=rejected_count)


@router.get("/eta", response_model=ETAResponse)
async def get_eta(
    route_id: str = Query(...),
    direction_id: int = Query(...),
    from_stop_id: str = Query(...),
    to_stop_id: str = Query(...),
    timestamp_utc: Optional[int] = Query(None)
):
    """Query learned ETA for a segment."""
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Resolve segment
    cursor.execute(
        """
        SELECT segment_id FROM segments
        WHERE route_id = ? AND direction_id = ? AND from_stop_id = ? AND to_stop_id = ?
        """,
        (route_id, direction_id, from_stop_id, to_stop_id)
    )
    row = cursor.fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Segment not found")

    segment_id = row[0]

    # Determine bin
    if timestamp_utc is None:
        timestamp_utc = int(time.time())
    bin_id = compute_bin_id(timestamp_utc)

    # Fetch stats
    cursor.execute(
        """
        SELECT n, welford_mean, welford_m2, schedule_mean, last_update
        FROM segment_stats
        WHERE segment_id = ? AND bin_id = ?
        """,
        (segment_id, bin_id)
    )
    row = cursor.fetchone()
    conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Stats not found for segment×bin")

    n, welford_mean, welford_m2, schedule_mean, last_update = row

    # Compute blended mean (always use w(n) = n/(n+20), converges to learned as n→∞)
    mean = compute_blended_mean(welford_mean, schedule_mean, n)

    # Compute variance and percentiles (with low-n protection)
    variance = compute_variance(welford_m2, n)
    p50, p90, low_n_warning = compute_percentiles_robust(mean, variance, n, schedule_mean)

    # Blend weight
    from app.learning import compute_blend_weight
    blend_weight = compute_blend_weight(n)

    return ETAResponse(
        mean_sec=mean,
        p50_sec=p50,
        p90_sec=p90,
        sample_count=n,
        blend_weight=blend_weight,
        last_updated=last_update,
        low_n_warning=low_n_warning
    )


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    """Return server configuration."""
    settings = get_settings()

    # Fetch GTFS version from DB
    gtfs_version = "unknown"
    try:
        conn = get_connection(settings.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM gtfs_metadata WHERE key='gtfs_version'")
        row = cursor.fetchone()
        if row:
            gtfs_version = row[0]
        conn.close()
    except Exception:
        pass

    return ConfigResponse(
        n0=settings.n0,
        time_bin_minutes=15,
        half_life_days=settings.half_life_days,
        gtfs_version=gtfs_version,
        server_version=settings.server_version
    )


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    settings = get_settings()

    # Try DB read
    db_ok = False
    try:
        conn = get_connection(settings.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        conn.close()
        db_ok = True
    except Exception as e:
        logger.error(f"Health check DB error: {e}")

    # Compute uptime
    startup = get_startup_time()
    uptime_sec = int(time.time()) - startup if startup else 0

    status = "ok" if db_ok else "degraded"
    status_code = 200 if db_ok else 503

    return HealthResponse(status=status, db_ok=db_ok, uptime_sec=uptime_sec)

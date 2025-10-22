"""API route handlers."""

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
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
    log_rejection,
    update_device_bucket,
)
from app.idempotency import check_idempotency_key, store_idempotency_key
from app.models import (
    RideSummary,
    RideSummaryResponse,
    ETAResponse,
    ConfigResponse,
    HealthResponse,
)
from app.state import get_startup_time


logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/ride_summary", response_model=RideSummaryResponse)
async def ride_summary(
    request: Request,
    ride: RideSummary,
    authenticated: bool = Depends(verify_token),
    idempotency_key: str = Header(None, alias="Idempotency-Key"),
):
    """Accept ride summary and update learning statistics (global aggregation)."""
    settings = get_settings()

    # Check for deprecated timestamp_utc usage and set deprecation header
    deprecation_warning = None
    for segment in ride.segments:
        if segment.timestamp_utc is not None and not segment.observed_at_utc:
            deprecation_warning = "timestamp_utc is deprecated, use observed_at_utc (ISO-8601). Will be removed in v0.3.0 (2025-11-30)"
            break

    # Check idempotency key (optional but recommended)
    if idempotency_key:
        cached_response = check_idempotency_key(idempotency_key)
        if cached_response:
            # Return cached response (409 Conflict with cached result)
            logger.info(f"Idempotent replay detected: {idempotency_key}")
            # For now, return success with zero rejected count (client should cache response)
            response = RideSummaryResponse(
                accepted_segments=0, rejected_segments=0, rejected_by_reason={}
            )
            return response

    # Validate max segments
    if len(ride.segments) > settings.max_segments_per_ride:
        raise HTTPException(
            status_code=400,
            detail=f"Too many segments ({len(ride.segments)}), max is {settings.max_segments_per_ride}",
        )

    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    accepted_count = 0
    rejected_count = 0
    rejected_by_reason: dict[str, int] = {}

    # Insert ride metadata
    cursor.execute(
        "INSERT INTO rides (submitted_at, segment_count) VALUES (?, ?)",
        (int(time.time()), len(ride.segments)),
    )
    ride_id = cursor.lastrowid

    # Extract device_bucket from top-level (not from segments)
    device_bucket = ride.device_bucket

    for seq, segment in enumerate(ride.segments):
        # Update device bucket tracking (if provided at top level)
        if device_bucket:
            update_device_bucket(conn, device_bucket)

        # Validate segment exists
        cursor.execute(
            """
            SELECT segment_id FROM segments
            WHERE route_id = ? AND direction_id = ? AND from_stop_id = ? AND to_stop_id = ?
            """,
            (
                ride.route_id,
                ride.direction_id,
                segment.from_stop_id,
                segment.to_stop_id,
            ),
        )
        row = cursor.fetchone()
        if row is None:
            # Unknown segment - reject with 422
            conn.close()
            raise HTTPException(
                status_code=422,
                detail=f"Unknown segment: {segment.from_stop_id} -> {segment.to_stop_id}",
            )

        segment_id = row[0]

        # Get timestamp epoch from segment (handles both ISO-8601 and deprecated epoch)
        timestamp_epoch = segment.get_timestamp_epoch()

        # Compute time bin (with optional holiday routing)
        bin_id = compute_bin_id(timestamp_epoch, is_holiday=segment.is_holiday)

        # Update statistics (with mapmatch_conf check)
        accepted, rejection_reason = update_segment_stats(
            conn, segment_id, bin_id, segment.duration_sec, segment.mapmatch_conf
        )

        if accepted:
            accepted_count += 1
        else:
            rejected_count += 1
            rejected_by_reason[rejection_reason] = (
                rejected_by_reason.get(rejection_reason, 0) + 1
            )

            # Log rejection (use top-level device_bucket)
            log_rejection(
                conn,
                segment_id,
                bin_id,
                rejection_reason,
                segment.duration_sec,
                segment.mapmatch_conf,
                device_bucket,
            )

        # Record ride_segment (use top-level device_bucket)
        cursor.execute(
            """
            INSERT INTO ride_segments (ride_id, seq, segment_id, duration_sec, dwell_sec, timestamp_utc, accepted, device_bucket, mapmatch_conf, rejection_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ride_id,
                seq,
                segment_id,
                segment.duration_sec,
                segment.dwell_sec,
                timestamp_epoch,
                int(accepted),
                device_bucket,
                segment.mapmatch_conf,
                rejection_reason,
            ),
        )

    conn.commit()
    conn.close()

    response_data = {
        "accepted_segments": accepted_count,
        "rejected_segments": rejected_count,
        "rejected_by_reason": rejected_by_reason,
    }

    # Store idempotency key (if provided)
    if idempotency_key:
        store_idempotency_key(idempotency_key, response_data)

    response = RideSummaryResponse(**response_data)

    # Add deprecation header if needed
    if deprecation_warning:
        # Note: FastAPI doesn't easily allow adding headers to response_model responses
        # This will be handled in middleware or by returning Response object
        # For now, log the warning
        logger.warning(f"Deprecated field used: {deprecation_warning}")

    return response


@router.get("/eta", response_model=ETAResponse)
async def get_eta(
    route_id: str = Query(...),
    direction_id: int = Query(...),
    from_stop_id: str = Query(...),
    to_stop_id: str = Query(...),
    timestamp_utc: Optional[int] = Query(None),
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
        (route_id, direction_id, from_stop_id, to_stop_id),
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
        (segment_id, bin_id),
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
    p50, p90, low_n_warning = compute_percentiles_robust(
        mean, variance, n, schedule_mean
    )

    # Blend weight
    from app.learning import compute_blend_weight
    from datetime import datetime, timezone

    blend_weight = compute_blend_weight(n)

    # Convert last_update from epoch to ISO-8601 UTC string
    if last_update is not None:
        last_updated_iso = datetime.fromtimestamp(last_update, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        # If no updates yet, use epoch 0
        last_updated_iso = datetime.fromtimestamp(0, tz=timezone.utc).isoformat().replace("+00:00", "Z")

    return ETAResponse(
        eta_sec=mean,
        p50_sec=p50,
        p90_sec=p90,
        n=n,
        blend_weight=blend_weight,
        schedule_sec=schedule_mean,
        low_confidence=low_n_warning,
        bin_id=bin_id,
        last_updated=last_updated_iso,
    )


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    """Return server configuration (includes global aggregation settings)."""
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
        server_version=settings.server_version,
        # Global aggregation settings
        mapmatch_min_conf=settings.mapmatch_min_conf,
        max_segments_per_ride=settings.max_segments_per_ride,
        idempotency_ttl_hours=settings.idempotency_ttl_hours,
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

    return HealthResponse(status=status, db_ok=db_ok, uptime_sec=uptime_sec)

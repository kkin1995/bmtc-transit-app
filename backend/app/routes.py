"""API route handlers."""

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from fastapi.responses import JSONResponse
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
    StopsListResponse,
    StopResponse,
    RoutesListResponse,
    RouteResponse,
    ScheduleResponse,
    StopInfo,
    DepartureInfo,
    TripInfo,
    StopTimeInfo,
    ETAResponseV11,
    SegmentInfo,
    ScheduledInfo,
    PredictionInfo,
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
        # Convert request body to dict for hash verification
        request_body = ride.model_dump()

        cached_response = check_idempotency_key(idempotency_key, request_body)
        if cached_response:
            # Check body hash match (H1 security fix - prevent tampering)
            body_hash_match = cached_response.get("body_hash_match")

            if body_hash_match is False:
                # Body hash mismatch - tampered request
                logger.warning(f"Idempotency key reused with different body: {idempotency_key}")
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "conflict",
                        "message": "Idempotency key already used with different request body",
                        "details": {
                            "idempotency_key": idempotency_key
                        }
                    }
                )

            # Body hash matches or not verified (backward compat) - return cached response
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

    # Store idempotency key with body hash (if provided) - H1 security fix
    if idempotency_key:
        request_body = ride.model_dump()
        store_idempotency_key(idempotency_key, request_body, response_data)

    response = RideSummaryResponse(**response_data)

    # Add deprecation header if needed
    if deprecation_warning:
        # Note: FastAPI doesn't easily allow adding headers to response_model responses
        # This will be handled in middleware or by returning Response object
        # For now, log the warning
        logger.warning(f"Deprecated field used: {deprecation_warning}")

    return response


def _compute_confidence(n: int) -> str:
    """Compute confidence level from sample count."""
    if n >= 8:
        return "high"
    elif n >= 3:
        return "medium"
    else:
        return "low"


@router.get("/eta", response_model=ETAResponseV11)
async def get_eta(
    route_id: str = Query(...),
    direction_id: int = Query(...),
    from_stop_id: str = Query(...),
    to_stop_id: str = Query(...),
    when: Optional[str] = Query(None),  # ISO-8601 UTC timestamp string (v1 spec)
    timestamp_utc: Optional[int] = Query(None),  # DEPRECATED: use 'when' instead
):
    """Query learned ETA for a segment."""
    from datetime import datetime, timezone as dt_timezone

    settings = get_settings()

    # Validate direction_id (must be 0 or 1)
    if direction_id not in (0, 1):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_request",
                "message": "direction_id must be 0 or 1",
                "details": {"direction_id": direction_id}
            }
        )

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
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": "Segment not found in GTFS data",
                "details": {
                    "route_id": route_id,
                    "direction_id": direction_id,
                    "from_stop_id": from_stop_id,
                    "to_stop_id": to_stop_id
                }
            }
        )

    segment_id = row[0]

    # Determine timestamp epoch (Priority: when > timestamp_utc > now)
    timestamp_epoch = None
    if when is not None:
        # Parse ISO-8601 timestamp string
        try:
            dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
            timestamp_epoch = int(dt.timestamp())
        except (ValueError, AttributeError) as e:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "invalid_request",
                    "message": "when must be ISO-8601 UTC timestamp (e.g., '2025-10-22T10:41:00Z')",
                    "details": {"when": when}
                }
            )
    elif timestamp_utc is not None:
        # Backward compatibility: use deprecated timestamp_utc
        logger.warning(f"timestamp_utc parameter is deprecated, use 'when' instead (route={route_id})")
        timestamp_epoch = timestamp_utc
    else:
        # Default to server "now"
        timestamp_epoch = int(time.time())

    # Compute time bin
    bin_id = compute_bin_id(timestamp_epoch)

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

    # Convert timestamp_epoch to ISO-8601 for query_time
    query_time_iso = datetime.fromtimestamp(timestamp_epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    confidence = _compute_confidence(n)

    return ETAResponseV11(
        # New v1.1 structured format
        segment=SegmentInfo(
            route_id=route_id,
            direction_id=direction_id,
            from_stop_id=from_stop_id,
            to_stop_id=to_stop_id
        ),
        query_time=query_time_iso,
        scheduled=ScheduledInfo(
            duration_sec=schedule_mean,
            service_id=None,
            source="gtfs"
        ),
        prediction=PredictionInfo(
            predicted_duration_sec=mean,
            p50_sec=p50,
            p90_sec=p90,
            confidence=confidence,
            blend_weight=blend_weight,
            samples_used=n,
            bin_id=bin_id,
            last_updated=last_updated_iso,
            model_version="welford-ema-v1"
        ),
        # Backward-compatible flat fields (deprecated)
        eta_sec=mean,
        p50_sec=p50,
        p90_sec=p90,
        n=n,
        blend_weight=blend_weight,
        schedule_sec=schedule_mean,
        low_confidence=(confidence != "high"),
        bin_id=bin_id,
        last_updated=last_updated_iso
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
        ema_alpha=settings.ema_alpha,
        outlier_sigma=settings.outlier_sigma,
        mapmatch_min_conf=settings.mapmatch_min_conf,
        max_segments_per_ride=settings.max_segments_per_ride,
        rate_limit_per_hour=settings.rate_limit_per_hour,
        idempotency_ttl_hours=settings.idempotency_ttl_hours,
        gtfs_version=gtfs_version,
        server_version=settings.server_version,
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


# GTFS-aligned endpoints (Phase 0)

@router.get("/stops", response_model=StopsListResponse)
async def get_stops(
    bbox: Optional[str] = Query(None),
    route_id: Optional[str] = Query(None),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
):
    """Discover GTFS stops with filtering and pagination."""
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Build WHERE clauses
    where_clauses = []
    params = []

    # Parse bbox if provided
    if bbox:
        try:
            parts = bbox.split(",")
            if len(parts) != 4:
                raise ValueError("Invalid bbox format")
            min_lat, min_lon, max_lat, max_lon = map(float, parts)
            where_clauses.append("stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?")
            params.extend([min_lat, max_lat, min_lon, max_lon])
        except (ValueError, IndexError):
            conn.close()
            return JSONResponse(
                status_code=400,
                content={
                    "error": "invalid_request",
                    "message": "bbox must be in format: min_lat,min_lon,max_lat,max_lon",
                    "details": {"bbox": bbox}
                }
            )

    # Filter by route_id if provided
    if route_id:
        # Stops served by this route (via trips and stop_times)
        where_clauses.append("""stop_id IN (
            SELECT DISTINCT st.stop_id
            FROM stop_times st
            JOIN trips t ON st.trip_id = t.trip_id
            WHERE t.route_id = ?
        )""")
        params.append(route_id)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Get total count
    cursor.execute(f"SELECT COUNT(*) FROM stops {where_sql}", params)
    total = cursor.fetchone()[0]

    # Get paginated results
    cursor.execute(
        f"""
        SELECT stop_id, stop_name, stop_lat, stop_lon, zone_id
        FROM stops
        {where_sql}
        ORDER BY stop_id
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset]
    )

    stops = []
    for row in cursor.fetchall():
        stops.append(StopResponse(
            stop_id=row[0],
            stop_name=row[1],
            stop_lat=row[2],
            stop_lon=row[3],
            zone_id=row[4]
        ))

    conn.close()

    return StopsListResponse(
        stops=stops,
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/routes", response_model=RoutesListResponse)
async def get_routes(
    stop_id: Optional[str] = Query(None),
    route_type: Optional[int] = Query(None),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
):
    """Discover GTFS routes with filtering and pagination."""
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Validate route_type
    if route_type is not None and route_type not in range(8):
        conn.close()
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "route_type must be a valid GTFS route type (0-7)",
                "details": {"route_type": route_type}
            }
        )

    # Build WHERE clauses
    where_clauses = []
    params = []

    if route_type is not None:
        where_clauses.append("route_type = ?")
        params.append(route_type)

    if stop_id:
        # Routes serving this stop
        where_clauses.append("""route_id IN (
            SELECT DISTINCT t.route_id
            FROM trips t
            JOIN stop_times st ON t.trip_id = st.trip_id
            WHERE st.stop_id = ?
        )""")
        params.append(stop_id)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Get total count
    cursor.execute(f"SELECT COUNT(*) FROM routes {where_sql}", params)
    total = cursor.fetchone()[0]

    # Get paginated results
    cursor.execute(
        f"""
        SELECT route_id, route_short_name, route_long_name, route_type, agency_id
        FROM routes
        {where_sql}
        ORDER BY route_id
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset]
    )

    routes = []
    for row in cursor.fetchall():
        routes.append(RouteResponse(
            route_id=row[0],
            route_short_name=row[1],
            route_long_name=row[2],
            route_type=row[3],
            agency_id=row[4]
        ))

    conn.close()

    return RoutesListResponse(
        routes=routes,
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/stops/{stop_id}/schedule", response_model=ScheduleResponse)
async def get_stop_schedule(
    stop_id: str,
    when: Optional[str] = Query(None),
    time_window_minutes: int = Query(60),
    route_id: Optional[str] = Query(None),
):
    """Get scheduled departures for a stop from GTFS."""
    from datetime import datetime, timezone

    settings = get_settings()

    # Validate time_window_minutes manually for proper error response
    if time_window_minutes < 1 or time_window_minutes > 180:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "time_window_minutes must be between 1 and 180",
                "details": {"time_window_minutes": time_window_minutes}
            }
        )

    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Verify stop exists
    cursor.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?", (stop_id,))
    stop_row = cursor.fetchone()

    if stop_row is None:
        conn.close()
        return JSONResponse(
            status_code=404,
            content={
                "error": "not_found",
                "message": "Stop not found in GTFS data",
                "details": {"stop_id": stop_id}
            }
        )

    # Parse when parameter
    if when:
        try:
            dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            conn.close()
            return JSONResponse(
                status_code=400,
                content={
                    "error": "invalid_request",
                    "message": "when must be ISO-8601 UTC timestamp",
                    "details": {"when": when}
                }
            )
    else:
        dt = datetime.now(timezone.utc)

    query_time_iso = dt.isoformat().replace("+00:00", "Z")

    # For simplicity, get all departures and filter in Python
    # (GTFS time handling is complex due to 24h+ times)
    where_clause = "st.stop_id = ?"
    params = [stop_id]

    if route_id:
        where_clause += " AND t.route_id = ?"
        params.append(route_id)

    cursor.execute(
        f"""
        SELECT t.trip_id, t.route_id, t.service_id, t.trip_headsign, t.direction_id,
               st.arrival_time, st.departure_time, st.stop_sequence
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id
        WHERE {where_clause}
        ORDER BY st.departure_time
        LIMIT 100
        """,
        params
    )

    departures = []
    for row in cursor.fetchall():
        departures.append(DepartureInfo(
            trip=TripInfo(
                trip_id=row[0],
                route_id=row[1],
                service_id=row[2],
                trip_headsign=row[3],
                direction_id=row[4]
            ),
            stop_time=StopTimeInfo(
                arrival_time=row[5],
                departure_time=row[6],
                stop_sequence=row[7],
                pickup_type=None,
                drop_off_type=None
            )
        ))

    conn.close()

    return ScheduleResponse(
        stop=StopInfo(
            stop_id=stop_row[0],
            stop_name=stop_row[1],
            stop_lat=stop_row[2],
            stop_lon=stop_row[3]
        ),
        departures=departures,
        query_time=query_time_iso
    )

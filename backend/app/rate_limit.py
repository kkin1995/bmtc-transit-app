"""Rate limiting middleware using token bucket algorithm."""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Tuple, Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.db import get_connection


logger = logging.getLogger(__name__)


async def extract_bucket_id(request: Request) -> str:
    """Extract bucket_id from request body or fallback to IP.

    Args:
        request: FastAPI request object

    Returns:
        bucket_id string (device_bucket hash or "ip:<remote_addr>")
    """
    try:
        # Read and cache body for downstream processing
        body_bytes = await request.body()

        # Parse JSON
        if body_bytes:
            body = json.loads(body_bytes.decode())

            # Priority 1: Check top-level device_bucket field (v1 spec)
            if "device_bucket" in body and body["device_bucket"]:
                return body["device_bucket"]

            # Priority 2 (backward compat): Check segments for device_bucket (deprecated)
            if "segments" in body and isinstance(body["segments"], list):
                for segment in body["segments"]:
                    if isinstance(segment, dict) and segment.get("device_bucket"):
                        logger.warning("device_bucket in segments is deprecated, move to top-level")
                        return segment["device_bucket"]
    except Exception as e:
        logger.warning(f"Failed to extract device_bucket from body: {e}")

    # Priority 3: Fallback to IP address
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


def check_and_spend_token(
    bucket_id: str, db_path: str, limit: int = 500
) -> Tuple[bool, int, int]:
    """Atomically check quota and spend token using token bucket algorithm.

    This function implements atomic UPSERT with hourly refill logic:
    - If bucket doesn't exist: create with (limit-1) tokens
    - If last_refill >= 1 hour ago: refill to (limit-1) tokens
    - Otherwise: decrement tokens if > 0

    Args:
        bucket_id: Device bucket hash or "ip:<addr>"
        db_path: Path to SQLite database
        limit: Maximum tokens per hour (default 500)

    Returns:
        Tuple of (allowed: bool, remaining: int, reset_timestamp: int)
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    reset_time = int((now + timedelta(hours=1)).timestamp())

    conn = get_connection(db_path)
    cursor = conn.cursor()

    try:
        # Atomic UPSERT with refill logic
        # Pattern: INSERT with ON CONFLICT handles both creation and update
        # Note: We decrement BEFORE checking, so tokens can go to -1 to detect exhaustion
        # Under high concurrency, clamp at -1 to respect CHECK constraint
        cursor.execute(
            """
            INSERT INTO rate_limit_buckets (bucket_id, tokens, last_refill)
            VALUES (?, ?, ?)
            ON CONFLICT(bucket_id) DO UPDATE SET
                tokens = CASE
                    WHEN (unixepoch('now') - unixepoch(last_refill)) >= 3600 THEN ?
                    ELSE MAX(-1, tokens - 1)
                END,
                last_refill = CASE
                    WHEN (unixepoch('now') - unixepoch(last_refill)) >= 3600 THEN excluded.last_refill
                    ELSE last_refill
                END
            """,
            (bucket_id, limit - 1, now_iso, limit - 1),
        )

        # Read current state after update
        cursor.execute(
            "SELECT tokens, last_refill FROM rate_limit_buckets WHERE bucket_id = ?",
            (bucket_id,),
        )
        row = cursor.fetchone()

        conn.commit()

        if row:
            tokens = row["tokens"]
            # Token was already spent in the UPDATE, so tokens is post-decrement value
            # If tokens < 0, we went negative which means we were at 0 before spending
            allowed = tokens >= 0
            remaining = max(0, tokens)

            return allowed, remaining, reset_time

        # Should never reach here due to INSERT guarantee
        return False, 0, reset_time

    except Exception as e:
        logger.error(f"Rate limit check failed for {bucket_id}: {e}")
        conn.rollback()
        # Fail open: allow request on error
        return True, limit, reset_time
    finally:
        conn.close()


def refill_if_needed(bucket_id: str, db_path: str, limit: int = 500) -> None:
    """Check and refill tokens if hour boundary crossed.

    This is a helper for idempotency integration - checks if refill is needed
    without spending a token.

    Args:
        bucket_id: Device bucket hash or "ip:<addr>"
        db_path: Path to SQLite database
        limit: Maximum tokens per hour (default 500)
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    conn = get_connection(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            UPDATE rate_limit_buckets
            SET tokens = ?, last_refill = ?
            WHERE bucket_id = ?
              AND (unixepoch('now') - unixepoch(last_refill)) >= 3600
            """,
            (limit, now_iso, bucket_id),
        )
        conn.commit()
    except Exception as e:
        logger.error(f"Refill check failed for {bucket_id}: {e}")
        conn.rollback()
    finally:
        conn.close()


def get_current_limit_state(bucket_id: str, db_path: str, limit: int = 500) -> Tuple[int, int]:
    """Get current rate limit state without modifying it.

    Used for adding headers to cached idempotent responses.

    Args:
        bucket_id: Device bucket hash or "ip:<addr>"
        db_path: Path to SQLite database
        limit: Maximum tokens per hour (default 500)

    Returns:
        Tuple of (remaining: int, reset_timestamp: int)
    """
    now = datetime.now(timezone.utc)
    reset_time = int((now + timedelta(hours=1)).timestamp())

    conn = get_connection(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT tokens, last_refill FROM rate_limit_buckets WHERE bucket_id = ?",
            (bucket_id,),
        )
        row = cursor.fetchone()

        if row:
            tokens = row["tokens"]
            last_refill_iso = row["last_refill"]

            # Check if refill needed
            last_refill = datetime.fromisoformat(last_refill_iso)
            if (now - last_refill.replace(tzinfo=timezone.utc)).total_seconds() >= 3600:
                # Would be refilled
                remaining = limit
            else:
                remaining = max(0, tokens)

            return remaining, reset_time

        # No entry yet - full quota available
        return limit, reset_time

    except Exception as e:
        logger.error(f"Failed to get limit state for {bucket_id}: {e}")
        return limit, reset_time
    finally:
        conn.close()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware for POST /v1/ride_summary."""

    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting."""

        # Only apply to POST /v1/ride_summary
        if request.method != "POST" or not request.url.path.endswith("/ride_summary"):
            return await call_next(request)

        # Feature flag check
        settings = get_settings()
        if not settings.rate_limit_enabled:
            # Pass through without rate limiting
            return await call_next(request)

        # Check idempotency cache first (don't double-charge)
        idempotency_key = request.headers.get("idempotency-key")
        if idempotency_key:
            # Check if this is a cached response
            from app.idempotency import check_idempotency_key

            cached_response = check_idempotency_key(idempotency_key)
            if cached_response:
                # Get bucket_id for headers
                bucket_id = await extract_bucket_id(request)

                # Get current limit state (don't spend token)
                remaining, reset_time = get_current_limit_state(
                    bucket_id, settings.db_path, settings.rate_limit_per_hour
                )

                # Return cached response with rate limit headers
                response = JSONResponse(
                    status_code=200,
                    content={"accepted": True, "rejected_count": 0, "rejected_by_reason": {}}
                )
                response.headers["X-RateLimit-Limit"] = str(settings.rate_limit_per_hour)
                response.headers["X-RateLimit-Remaining"] = str(remaining)
                response.headers["X-RateLimit-Reset"] = str(reset_time)

                logger.info(f"Idempotent replay - no token spent: {idempotency_key}")
                return response

        # Extract bucket_id from request
        bucket_id = await extract_bucket_id(request)

        # Check and spend token atomically
        allowed, remaining, reset_time = check_and_spend_token(
            bucket_id, settings.db_path, settings.rate_limit_per_hour
        )

        # Store rate limit info in request state for downstream use
        request.state.rate_limit = {
            "limit": settings.rate_limit_per_hour,
            "remaining": remaining,
            "reset": reset_time,
            "bucket_id": bucket_id,
        }

        if not allowed:
            # Rate limit exceeded - return 429
            bucket_type = "device" if not bucket_id.startswith("ip:") else "ip"

            logger.warning(
                f"Rate limit exceeded for {bucket_type} bucket (id: {bucket_id[:8]}...)"
            )

            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limited",
                    "message": f"Rate limit exceeded. Limit: {settings.rate_limit_per_hour} requests per hour.",
                    "details": {
                        "limit": settings.rate_limit_per_hour,
                        "reset": reset_time,
                        "bucket_id_type": bucket_type,
                    },
                },
                headers={
                    "X-RateLimit-Limit": str(settings.rate_limit_per_hour),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_time),
                    "Retry-After": str(3600),  # Retry after 1 hour
                },
            )

        # Proceed with request
        response = await call_next(request)

        # Add rate limit headers to successful response
        response.headers["X-RateLimit-Limit"] = str(settings.rate_limit_per_hour)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_time)

        return response

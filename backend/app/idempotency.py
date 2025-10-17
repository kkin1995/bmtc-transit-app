"""Idempotency handling for ride submissions."""

import hashlib
import json
import time
from typing import Optional

from app.db import get_connection
from app.config import get_settings


def compute_response_hash(response_data: dict) -> str:
    """Compute SHA256 hash of response for verification.

    Args:
        response_data: Response dictionary to hash

    Returns:
        SHA256 hex digest
    """
    response_json = json.dumps(response_data, sort_keys=True)
    return hashlib.sha256(response_json.encode()).hexdigest()


def check_idempotency_key(idempotency_key: str) -> Optional[dict]:
    """Check if idempotency key exists and return cached response if found.

    Args:
        idempotency_key: UUID provided by client

    Returns:
        Cached response dict if key exists, None otherwise
    """
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Check TTL
    ttl_seconds = settings.idempotency_ttl_hours * 3600
    min_timestamp = int(time.time()) - ttl_seconds

    cursor.execute(
        """
        SELECT response_hash FROM idempotency_keys
        WHERE key = ? AND submitted_at >= ?
        """,
        (idempotency_key, min_timestamp),
    )
    row = cursor.fetchone()
    conn.close()

    if row:
        # Return sentinel to indicate cached response exists
        # Actual response reconstruction happens in route handler
        return {"_cached": True, "response_hash": row[0]}

    return None


def store_idempotency_key(idempotency_key: str, response_data: dict) -> None:
    """Store idempotency key with response hash.

    Args:
        idempotency_key: UUID provided by client
        response_data: Response dictionary to cache
    """
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    response_hash = compute_response_hash(response_data)

    cursor.execute(
        """
        INSERT OR REPLACE INTO idempotency_keys (key, submitted_at, response_hash)
        VALUES (?, ?, ?)
        """,
        (idempotency_key, int(time.time()), response_hash),
    )
    conn.commit()
    conn.close()


def cleanup_expired_keys() -> int:
    """Remove expired idempotency keys (older than TTL).

    Returns:
        Number of keys deleted
    """
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    ttl_seconds = settings.idempotency_ttl_hours * 3600
    min_timestamp = int(time.time()) - ttl_seconds

    cursor.execute(
        "DELETE FROM idempotency_keys WHERE submitted_at < ?", (min_timestamp,)
    )
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()

    return deleted_count

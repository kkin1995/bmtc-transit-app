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


def compute_body_hash(body_dict: dict) -> str:
    """Compute SHA256 hash of request body for verification.

    Uses deterministic JSON serialization (sorted keys, UTF-8) to ensure
    identical bodies produce identical hashes regardless of key ordering.

    Security: Prevents replay attacks with modified payloads (H1 - STRIDE: Tampering)

    Args:
        body_dict: Request body as dictionary

    Returns:
        SHA256 hex digest (64 characters)
    """
    body_json = json.dumps(body_dict, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(body_json.encode('utf-8')).hexdigest()


def check_idempotency_key(idempotency_key: str, body_dict: Optional[dict] = None) -> Optional[dict]:
    """Check if idempotency key exists and verify body hash.

    Security: Enforces body hash verification to prevent tampering (H1 fix)

    Args:
        idempotency_key: UUID provided by client
        body_dict: Request body dict (for hash verification). If None, only checks existence.

    Returns:
        Cached response dict if key exists with:
        - "_cached": True (sentinel)
        - "response_hash": SHA256 of cached response
        - "body_hash": SHA256 of request body (None if not stored)
        - "body_hash_match": True if body_hash matches, False if mismatch, None if not verified
        Returns None if key doesn't exist or is expired.
    """
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    # Check TTL
    ttl_seconds = settings.idempotency_ttl_hours * 3600
    min_timestamp = int(time.time()) - ttl_seconds

    cursor.execute(
        """
        SELECT response_hash, body_hash FROM idempotency_keys
        WHERE key = ? AND submitted_at >= ?
        """,
        (idempotency_key, min_timestamp),
    )
    row = cursor.fetchone()
    conn.close()

    if row:
        stored_response_hash = row[0]
        stored_body_hash = row[1] if len(row) > 1 else None

        result = {
            "_cached": True,
            "response_hash": stored_response_hash,
            "body_hash": stored_body_hash
        }

        # Verify body hash if provided and stored hash exists
        if body_dict is not None and stored_body_hash is not None:
            current_body_hash = compute_body_hash(body_dict)
            result["body_hash_match"] = (current_body_hash == stored_body_hash)
        else:
            result["body_hash_match"] = None

        return result

    return None


def store_idempotency_key(idempotency_key: str, body_data: dict, response_data: dict) -> None:
    """Store idempotency key with body and response hashes.

    Security: Stores body hash for tampering detection (H1 fix)

    Args:
        idempotency_key: UUID provided by client
        body_data: Request body dictionary
        response_data: Response dictionary to cache
    """
    settings = get_settings()
    conn = get_connection(settings.db_path)
    cursor = conn.cursor()

    body_hash = compute_body_hash(body_data)
    response_hash = compute_response_hash(response_data)

    cursor.execute(
        """
        INSERT OR REPLACE INTO idempotency_keys (key, submitted_at, response_hash, body_hash)
        VALUES (?, ?, ?, ?)
        """,
        (idempotency_key, int(time.time()), response_hash, body_hash),
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

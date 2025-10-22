"""Pydantic models for API contracts."""

from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class RideSegment(BaseModel):
    """Single segment within a ride."""

    from_stop_id: str
    to_stop_id: str
    duration_sec: float = Field(gt=0)
    dwell_sec: Optional[float] = Field(None, ge=0)
    observed_at_utc: Optional[str] = None  # ISO-8601 UTC timestamp string (e.g., "2025-10-22T10:33:00Z")
    is_holiday: bool = False  # Optional: route weekday to weekend bin
    mapmatch_conf: float = Field(default=1.0, ge=0.0, le=1.0)  # Map-matching confidence

    # Deprecated field - backward compatibility for one release
    timestamp_utc: Optional[int] = None  # DEPRECATED: use observed_at_utc instead

    @field_validator("observed_at_utc")
    @classmethod
    def validate_observed_at_utc(cls, v: Optional[str]) -> Optional[str]:
        """Validate ISO-8601 timestamp and reject if >7 days old or in future."""
        if v is None:
            return None

        import time

        try:
            # Parse ISO-8601 timestamp
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
            timestamp = int(dt.timestamp())
        except (ValueError, AttributeError) as e:
            raise ValueError(
                f"observed_at_utc must be a valid ISO-8601 UTC timestamp (e.g., '2025-10-22T10:33:00Z'): {e}"
            )

        # Validate timestamp window (±7 days)
        now = int(time.time())
        seven_days = 7 * 24 * 3600
        if timestamp < now - seven_days:
            raise ValueError(
                "observed_at_utc must be within the last 7 days"
            )
        if timestamp > now:
            raise ValueError(
                "observed_at_utc cannot be in the future"
            )

        return v

    @field_validator("timestamp_utc")
    @classmethod
    def validate_timestamp_utc_deprecated(cls, v: Optional[int]) -> Optional[int]:
        """Validate deprecated timestamp_utc field (backward compatibility)."""
        if v is None:
            return None

        import time
        now = int(time.time())
        seven_days = 7 * 24 * 3600
        if v < now - seven_days or v > now:
            raise ValueError("timestamp_utc must be within ±7 days")
        return v

    def get_timestamp_epoch(self) -> int:
        """Convert observed_at_utc (or timestamp_utc) to Unix epoch timestamp.

        Returns:
            Unix epoch timestamp (seconds)
        """
        # Priority 1: Use observed_at_utc if provided
        if self.observed_at_utc:
            dt = datetime.fromisoformat(self.observed_at_utc.replace("Z", "+00:00"))
            return int(dt.timestamp())

        # Priority 2: Fall back to deprecated timestamp_utc
        if self.timestamp_utc is not None:
            return self.timestamp_utc

        # Should not reach here due to validation
        raise ValueError("Either observed_at_utc or timestamp_utc must be provided")


class RideSummary(BaseModel):
    """POST /v1/ride_summary request."""

    route_id: str
    direction_id: int = Field(ge=0, le=1)
    device_bucket: Optional[str] = None  # SHA256(device_id + daily_salt) - top-level field
    segments: List[RideSegment] = Field(min_length=1)

    @field_validator("device_bucket")
    @classmethod
    def validate_device_bucket(cls, v: Optional[str]) -> Optional[str]:
        """Validate device_bucket is a valid SHA256 hex string (64 chars)."""
        if v is not None and (
            len(v) != 64 or not all(c in "0123456789abcdef" for c in v.lower())
        ):
            raise ValueError(
                "device_bucket must be a valid SHA256 hex string (64 characters)"
            )
        return v


class RideSummaryResponse(BaseModel):
    """POST /v1/ride_summary response."""

    accepted_segments: int
    rejected_segments: int
    rejected_by_reason: dict[str, int] = Field(default_factory=dict)  # {reason: count}


class ETAQuery(BaseModel):
    """GET /v1/eta query parameters."""

    route_id: str
    direction_id: int
    from_stop_id: str
    to_stop_id: str
    timestamp_utc: Optional[int] = None  # Defaults to now


class ETAResponse(BaseModel):
    """GET /v1/eta response."""

    eta_sec: float  # Blended ETA (learned + schedule)
    p50_sec: float  # 50th percentile
    p90_sec: float  # 90th percentile
    n: int  # Sample count
    blend_weight: float  # Weight given to learned data: n/(n+n0)
    schedule_sec: float  # GTFS scheduled duration
    low_confidence: bool = False  # True when n < 8 (wider P90 for safety)
    bin_id: int  # Time bin ID (0-191)
    last_updated: str  # ISO-8601 UTC timestamp of last update


class ConfigResponse(BaseModel):
    """GET /v1/config response."""

    n0: int
    time_bin_minutes: int
    half_life_days: int
    gtfs_version: str
    server_version: str
    # Global aggregation settings
    mapmatch_min_conf: float
    max_segments_per_ride: int
    idempotency_ttl_hours: int


class HealthResponse(BaseModel):
    """GET /v1/health response."""

    status: str  # "ok" or "degraded"
    db_ok: bool
    uptime_sec: int

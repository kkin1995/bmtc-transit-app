"""Pydantic models for API contracts."""

from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class RideSegment(BaseModel):
    """Single segment within a ride."""

    from_stop_id: str
    to_stop_id: str
    duration_sec: float = Field(gt=0)
    dwell_sec: Optional[float] = Field(None, ge=0)
    timestamp_utc: int
    is_holiday: bool = False  # Optional: route weekday to weekend bin
    device_bucket: Optional[str] = None  # SHA256(device_id + daily_salt)
    mapmatch_conf: float = Field(default=1.0, ge=0.0, le=1.0)  # Map-matching confidence

    @field_validator("timestamp_utc")
    @classmethod
    def validate_timestamp(cls, v: int) -> int:
        """Reject timestamps >7 days old or in future."""
        import time

        now = int(time.time())
        seven_days = 7 * 24 * 3600
        if v < now - seven_days or v > now:
            raise ValueError("timestamp_utc must be within ±7 days")
        return v

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


class RideSummary(BaseModel):
    """POST /v1/ride_summary request."""

    route_id: str
    direction_id: int = Field(ge=0, le=1)
    segments: List[RideSegment] = Field(min_length=1)


class RideSummaryResponse(BaseModel):
    """POST /v1/ride_summary response."""

    accepted: bool
    rejected_count: int
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

    mean_sec: float
    p50_sec: float
    p90_sec: float
    sample_count: int
    blend_weight: float
    last_updated: Optional[int]
    low_n_warning: bool = False  # True when n < 8 (quantiles unreliable)


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

"""Configuration management via environment variables."""

from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    api_key: str
    db_path: str = "/var/lib/bmtc-api/bmtc.db"
    gtfs_path: str = "/var/lib/bmtc-api/gtfs"
    n0: int = 20
    ema_alpha: float = 0.1
    half_life_days: int = 30
    stale_threshold_days: int = 90
    retention_days: int = 90
    server_version: str = "0.2.0"  # Bumped for global aggregation

    # Global aggregation settings
    mapmatch_min_conf: float = 0.7
    max_segments_per_ride: int = 50
    idempotency_ttl_hours: int = 24
    device_bucket_rate_limit: int = 500  # per hour
    rejection_log_retention_days: int = 30
    outlier_sigma: float = 3.0

    # Rate limiting settings (H2 security fix - enabled by default)
    rate_limit_enabled: bool = True  # CHANGED from False (security best practice)
    rate_limit_per_hour: int = 500  # Requests per hour per device_bucket

    # Optional HMAC signing
    hmac_secret_key: Optional[str] = None

    class Config:
        env_prefix = "BMTC_"
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton.

    NOTE: This cache is cleared in tests via get_settings.cache_clear()
    to ensure test isolation. See tests/conftest.py for the autouse fixture
    that handles this automatically.

    The cache improves performance in production by avoiding repeated
    environment variable reads and validation.
    """
    return Settings()

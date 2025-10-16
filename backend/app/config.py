"""Configuration management via environment variables."""
from functools import lru_cache
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
    server_version: str = "0.1.0"

    class Config:
        env_prefix = "BMTC_"
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()

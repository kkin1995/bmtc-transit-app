"""Application state management."""

# Global startup time for uptime calculation
startup_time = None


def set_startup_time(timestamp: int) -> None:
    """Set application startup timestamp."""
    global startup_time
    startup_time = timestamp


def get_startup_time() -> int:
    """Get application startup timestamp."""
    return startup_time

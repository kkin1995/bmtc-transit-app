"""Pytest configuration for all tests."""

import pytest


@pytest.fixture(scope="module", autouse=True)
def clear_settings_cache_per_module():
    """Clear settings cache before each test module to ensure env vars are picked up."""
    from app.config import get_settings

    get_settings.cache_clear()
    yield

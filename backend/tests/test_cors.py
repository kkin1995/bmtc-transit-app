"""Tests for CORS allowlist configuration (BUGFIX-02).

Verifies:
- No `Access-Control-Allow-Credentials` header is ever present (D-01 — Bearer-header
  auth only, no cookies).
- Requests with an `Origin` in the configured allowlist receive a matching
  `Access-Control-Allow-Origin` response header.
- Requests with an `Origin` NOT in the allowlist do not receive an
  `Access-Control-Allow-Origin` header echoing that origin.
"""

import pytest

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


def test_allowed_origin_receives_matching_header(client):
    """An allowlisted Origin gets Access-Control-Allow-Origin echoing it back.

    Default allowlist (BMTC_CORS_ORIGINS unset) is:
    http://localhost:8081,http://localhost:19006
    """
    response = client.get(
        "/v1/health",
        headers={"Origin": "http://localhost:8081"},
    )

    assert response.headers.get("access-control-allow-origin") == "http://localhost:8081"


def test_disallowed_origin_does_not_receive_matching_header(client):
    """An Origin outside the allowlist must not be echoed back."""
    response = client.get(
        "/v1/health",
        headers={"Origin": "https://evil.example.com"},
    )

    assert response.headers.get("access-control-allow-origin") != "https://evil.example.com"


def test_no_allow_credentials_header_present(client):
    """Access-Control-Allow-Credentials must never appear on any response.

    D-01: allow_credentials is intentionally absent from CORSMiddleware config
    (Bearer-header auth only, no cookies). Starlette only emits this header when
    allow_credentials=True is configured, so its presence would indicate a
    regression back to the wildcard+credentials misconfiguration.
    """
    response = client.get(
        "/v1/health",
        headers={"Origin": "http://localhost:8081"},
    )

    assert "access-control-allow-credentials" not in {
        k.lower() for k in response.headers.keys()
    }


def test_custom_allowlist_via_env_override(client, monkeypatch):
    """BMTC_CORS_ORIGINS overrides the default allowlist (comma-separated, no JSON)."""
    from app.config import get_settings

    monkeypatch.setenv(
        "BMTC_CORS_ORIGINS", "https://app.example.com,https://admin.example.com"
    )
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.cors_origins.split(",") == [
        "https://app.example.com",
        "https://admin.example.com",
    ]

    get_settings.cache_clear()


def test_default_cors_origins_split(test_settings):
    """Default cors_origins parses into the two Expo dev localhost origins."""
    assert test_settings.cors_origins.split(",") == [
        "http://localhost:8081",
        "http://localhost:19006",
    ]

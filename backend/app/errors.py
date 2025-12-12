"""Standardized error response helpers.

This module provides utilities for creating consistent error responses
across all API endpoints, following the format defined in docs/api.md:

{
  "error": "<error_code>",
  "message": "<human-readable description>",
  "details": <optional object with context-specific fields>
}
"""

from typing import Dict, Any, Optional
from fastapi.responses import JSONResponse


def make_error_response(
    status_code: int,
    error: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> JSONResponse:
    """Create a standardized error response.

    Args:
        status_code: HTTP status code (400, 401, 404, 409, 422, 429, 500)
        error: Machine-readable error code (e.g., "invalid_request", "unauthorized")
        message: Human-readable error description
        details: Optional context-specific information (defaults to empty dict)

    Returns:
        JSONResponse with standardized error format
    """
    return JSONResponse(
        status_code=status_code,
        content={
            "error": error,
            "message": message,
            "details": details if details is not None else {}
        }
    )


# Convenience functions for common error types

def invalid_request(message: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    """Return 400 invalid_request error.

    Used for: Parameter validation errors, invalid ranges, malformed input.
    """
    return make_error_response(400, "invalid_request", message, details)


def unauthorized(message: str = "Missing or invalid Authorization header", details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    """Return 401 unauthorized error.

    Used for: Missing or invalid API key.
    """
    return make_error_response(401, "unauthorized", message, details)


def not_found(message: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    """Return 404 not_found error.

    Used for: Missing GTFS entities, unknown segments.
    """
    return make_error_response(404, "not_found", message, details)


def conflict(message: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    """Return 409 conflict error.

    Used for: Idempotency key reused with different body.
    """
    return make_error_response(409, "conflict", message, details)


def unprocessable(message: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    """Return 422 unprocessable error.

    Used for: Semantic validation failures (stale timestamps, unknown segments, etc.).
    """
    return make_error_response(422, "unprocessable", message, details)


def rate_limited(message: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    """Return 429 rate_limited error.

    Used for: Rate limit exceeded.
    """
    return make_error_response(429, "rate_limited", message, details)


def server_error(message: str = "An unexpected error occurred", details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    """Return 500 server_error.

    Used for: Database errors, unexpected internal failures.
    """
    return make_error_response(500, "server_error", message, details)

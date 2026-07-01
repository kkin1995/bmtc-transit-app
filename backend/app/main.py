"""FastAPI application entry point."""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.db import init_db
from app.idempotency import cleanup_expired_keys
from app import routes
from app import state
from app.rate_limit import RateLimitMiddleware

logger = logging.getLogger(__name__)


class APIVersionMiddleware(BaseHTTPMiddleware):
    """Middleware to add X-API-Version header to all responses."""

    async def dispatch(self, request: Request, call_next):
        """Add X-API-Version header to response."""
        response = await call_next(request)
        response.headers["X-API-Version"] = "1"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    settings = get_settings()

    # Security check: Warn if rate limiting is disabled (H2 fix)
    if not settings.rate_limit_enabled:
        logger.warning(
            "SECURITY WARNING: Rate limiting is DISABLED. "
            "This exposes the API to abuse and DoS attacks. "
            "Set BMTC_RATE_LIMIT_ENABLED=true for production deployment."
        )

    # Initialize database on startup
    init_db(settings.db_path)

    # Purge expired idempotency keys (BUGFIX-07) so the table does not grow
    # unbounded across restarts.
    deleted = cleanup_expired_keys()
    logger.info(f"Startup cleanup: removed {deleted} expired idempotency keys")

    state.set_startup_time(int(time.time()))

    yield

    # Cleanup on shutdown (if needed)
    pass


settings = get_settings()

app = FastAPI(
    title="BMTC Transit Learning API",
    version=settings.server_version,
    lifespan=lifespan,
)


# Custom exception handler for structured error responses
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTPException with structured error format support.

    If the exception detail is a dict with 'error', 'message', 'details' keys,
    return it as-is. Otherwise, keep FastAPI's default behavior.
    """
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        # Already in structured format
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.detail
        )
    # Default FastAPI behavior for non-structured errors
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

# Add CORS middleware (explicit origin allowlist from BMTC_CORS_ORIGINS).
# allow_credentials is intentionally absent (D-01) — Bearer-header auth only,
# no cookies — avoiding the wildcard-origin + credentials combination that
# browsers reject and Starlette silently degrades to origin-reflection.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Add API version header middleware (all responses)
app.add_middleware(APIVersionMiddleware)

# Add rate limiting middleware (before routes)
app.add_middleware(RateLimitMiddleware)

# Include routers
app.include_router(routes.router, prefix="/v1")

"""FastAPI application entry point."""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.db import init_db
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
    state.set_startup_time(int(time.time()))

    yield

    # Cleanup on shutdown (if needed)
    pass


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="BMTC Transit Learning API",
    version=get_settings().server_version,
    lifespan=lifespan,
)

# Add rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware (allow requests from Expo dev server and web browsers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Add API version header middleware (all responses)
app.add_middleware(APIVersionMiddleware)

# Add rate limiting middleware (before routes)
app.add_middleware(RateLimitMiddleware)

# Include routers
app.include_router(routes.router, prefix="/v1")

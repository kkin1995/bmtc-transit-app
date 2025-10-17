"""FastAPI application entry point."""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.db import init_db
from app import routes
from app import state


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    settings = get_settings()

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

# Include routers
app.include_router(routes.router, prefix="/v1")

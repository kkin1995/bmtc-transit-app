"""Bearer token authentication middleware."""

from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import get_settings


security = HTTPBearer()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> bool:
    """Verify Bearer token against configured API key."""
    settings = get_settings()
    if credentials.credentials != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True

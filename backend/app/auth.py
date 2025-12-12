"""Bearer token authentication middleware."""

from typing import Optional

from fastapi import HTTPException, Request, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.exceptions import HTTPException as FastAPIHTTPException

from app.config import get_settings


# Custom HTTPBearer that raises structured errors
class StructuredHTTPBearer(HTTPBearer):
    """HTTPBearer that raises structured error responses."""

    async def __call__(self, request: Request) -> Optional[HTTPAuthorizationCredentials]:
        """Override to provide structured error for missing credentials."""
        try:
            return await super().__call__(request)
        except FastAPIHTTPException as e:
            if e.status_code == 403:
                # HTTPBearer returns 403 for missing Authorization header
                # Convert to 401 with structured error
                raise HTTPException(
                    status_code=401,
                    detail={
                        "error": "unauthorized",
                        "message": "Authorization header required for POST endpoints",
                        "details": {}
                    }
                )
            raise


security = StructuredHTTPBearer()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> bool:
    """Verify Bearer token against configured API key."""
    settings = get_settings()
    if credentials.credentials != settings.api_key:
        raise HTTPException(
            status_code=401,
            detail={
                "error": "unauthorized",
                "message": "Invalid API key",
                "details": {}
            }
        )
    return True

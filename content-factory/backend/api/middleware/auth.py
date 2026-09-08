"""JWT authentication middleware + request identity injection.

Security model:
- ALL /api/* routes require a valid Bearer JWT (shared gg-cms JWT_SECRET)
- Exempt routes: /api/health (liveness), /docs, /openapi.json, /redoc
- User identity (sub, email, is_admin) is injected into request.state
  so downstream handlers can enforce per-user/per-resource ownership

IDOR mitigation:
- extract_user_from_request() is provided for routes that need to
  verify the authenticated user owns the resource they are touching.
"""
from __future__ import annotations

import logging
from typing import Any

import jwt
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.configs.settings import settings

logger = logging.getLogger(__name__)

# Paths that bypass JWT validation (publicly accessible)
_EXEMPT_EXACT = {"/api/health", "/factory/api/health"}
_EXEMPT_PREFIXES = ("/docs", "/openapi", "/redoc")

# Allowed origins for CORS — used by main.py CORSMiddleware
ALLOWED_ORIGINS = [
    "https://geekgully.com",
    "https://www.geekgully.com",
] + (
    # Allow localhost for local dev (only when JWT_SECRET is not set)
    [
        "http://localhost:5173",
        "http://localhost:8000",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]
    if not settings.jwt_secret
    else []
)


def _is_exempt(path: str) -> bool:
    if path in _EXEMPT_EXACT:
        return True
    return any(path.startswith(p) for p in _EXEMPT_PREFIXES)


def _is_api_path(path: str) -> bool:
    return path.startswith("/api/") or path.startswith("/factory/api/")


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Validates Bearer JWT on all /api/* routes.

    On success injects into request.state:
      - user_id    (str)  — JWT sub claim
      - user_email (str)  — email claim (may be empty if not present)
      - is_admin   (bool) — True when role/is_admin claim says so

    On failure returns 401 JSON. Static assets and exempt paths pass through.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Non-API paths (static SPA assets) — always pass through
        if not _is_api_path(path):
            return await call_next(request)

        # Exempt liveness + docs
        if _is_exempt(path):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Authorization required. Please log in at geekgully.com/auth"},
            )

        token = auth_header[7:].strip()
        try:
            payload: dict[str, Any] = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=["HS256"],
                options={"verify_exp": True, "require": ["sub", "exp"]},
            )
        except jwt.ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Session expired. Please log in again at geekgully.com/auth"},
            )
        except jwt.MissingRequiredClaimError as exc:
            return JSONResponse(status_code=401, content={"detail": f"Invalid token: {exc}"})
        except jwt.InvalidTokenError as exc:
            logger.warning("JWT validation failed from %s: %s", request.client, exc)
            return JSONResponse(status_code=401, content={"detail": "Invalid token"})

        # Inject verified identity into request state for downstream IDOR checks
        request.state.user_id = str(payload.get("sub", ""))
        request.state.user_email = str(payload.get("email", payload.get("name", "")))
        # gg-cms JWT sets role="admin" for admin accounts
        role = payload.get("role", "")
        request.state.is_admin = role in ("admin", "super_admin") or bool(payload.get("is_admin"))

        return await call_next(request)


def get_current_user(request: Request) -> dict:
    """Helper for routes that need to read the authenticated user's identity.

    Returns dict with keys: user_id, user_email, is_admin.
    Safe to call from any /api/* route after JWTAuthMiddleware has run.
    """
    return {
        "user_id": getattr(request.state, "user_id", ""),
        "user_email": getattr(request.state, "user_email", ""),
        "is_admin": getattr(request.state, "is_admin", False),
    }


def require_admin(request: Request) -> None:
    """FastAPI dependency: raises 403 unless the authenticated user is an admin."""
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin privileges required")

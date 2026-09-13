"""JWT authentication middleware shared with gg-cms.

The Content Factory is accessed via geekgully.com/factory — protected by the
same JWT issued by the gg-cms Go backend at /api/auth/login. This middleware
validates the Bearer token using the shared JWT_SECRET env var.

Unauthenticated requests to /api/* return HTTP 401. The React frontend
redirects to /auth (the gg-cms login page) on 401.

Routes excluded from auth:
  GET  /factory/api/health  — liveness probe
  GET  /factory/            — static React SPA (browser handles auth)
  GET  /factory/*           — static assets (JS/CSS/fonts)
"""
from __future__ import annotations

import logging

import jwt
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.configs.settings import settings

logger = logging.getLogger(__name__)

# Paths that bypass JWT validation
_EXEMPT_PREFIXES = (
    "/factory/api/health",
    "/docs",
    "/openapi",
    "/redoc",
)


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Validates the Authorization: Bearer <token> header for all /api/* routes.

    Skips validation when:
    - JWT_SECRET is not configured (local dev / mock mode)
    - The request path is in the exempt list (health, static assets)
    - The request is not to /api/*
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Pass through non-API routes (static SPA assets served by FastAPI)
        if not path.startswith("/factory/api/") and not path.startswith("/api/"):
            return await call_next(request)

        # Pass through exempt paths
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)

        # If JWT_SECRET is not configured (local dev), skip validation
        if not settings.jwt_secret:
            logger.debug("JWT_SECRET not configured — skipping auth (dev mode)")
            return await call_next(request)

        # Validate Bearer token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"},
            )

        token = auth_header.removeprefix("Bearer ").strip()
        try:
            jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=["HS256"],
                options={"verify_exp": True},
            )
        except jwt.ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token expired — please log in again at /auth"},
            )
        except jwt.InvalidTokenError as exc:
            logger.warning("JWT validation failed: %s", exc)
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid token"},
            )

        return await call_next(request)

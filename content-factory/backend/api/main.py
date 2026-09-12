from __future__ import annotations
import asyncio
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.configs.settings import settings
from backend.api.middleware.auth import JWTAuthMiddleware, ALLOWED_ORIGINS
from backend.api.routers.analytics import router as analytics_router
from backend.api.routers.autonomous import human_review_router, router as autonomous_router
from backend.api.routers.content import router as content_router
from backend.api.routers.content_jobs import router as content_jobs_router
from backend.api.routers.generation import router as generation_router
from backend.api.routers.gdrive import router as gdrive_router
from backend.api.routers.jobs import router as jobs_router
from backend.api.routers.knowledge_packs import router as knowledge_packs_router
from backend.api.routers.opportunities import router as opportunities_router
from backend.api.routers.portals import router as portals_router
from backend.api.routers.projects import router as projects_router
from backend.api.routers.source_generation import router as source_generation_router
from backend.api.routers.sources import router as sources_router
from backend.api.routers.system_settings import router as system_settings_router
from backend.services import system_settings_service
from backend.services.portal_scanner import portal_scan_loop
from backend.services.system_settings_service import apply_overrides

app = FastAPI(
    title="AI Learning Content Factory API",
    description="Autonomous multi-agent research & content generation pipeline",
    version="2.0.0"
)

# ── Rewrite /factory/api prefix so routes like /factory/api/projects resolve to /api/projects
@app.middleware("http")
async def rewrite_factory_prefix(request: Request, call_next):
    if request.url.path.startswith("/factory/api/"):
        request.scope["path"] = request.url.path[8:]
    elif request.url.path == "/factory/api":
        request.scope["path"] = "/api"
    return await call_next(request)

# ── JWT auth middleware (validates gg-cms tokens) ───────────────────────────────
app.add_middleware(JWTAuthMiddleware)

# ── CORS — restricted to geekgully.com + localhost dev ───────────────────────
# In production (JWT_SECRET configured) only geekgully.com origins are accepted.
# Localhost origins are allowed only in local dev where JWT_SECRET is absent.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["X-Factory-Request-ID"],
    max_age=600,
)

# Include Routers
app.include_router(projects_router)
app.include_router(sources_router)
app.include_router(source_generation_router)
app.include_router(portals_router)
app.include_router(knowledge_packs_router)
app.include_router(opportunities_router)
app.include_router(generation_router)
app.include_router(jobs_router)
app.include_router(content_router)
app.include_router(content_jobs_router)
app.include_router(autonomous_router)
app.include_router(human_review_router)
app.include_router(analytics_router)
app.include_router(system_settings_router)
app.include_router(gdrive_router)


@app.on_event("startup")
async def load_system_settings_overrides():
    """Overlays any file-stored system-settings overrides (data/settings.yaml
    via backend.storage.file_store) onto the in-memory `settings` singleton
    so a restart picks up UI-configured values."""
    apply_overrides(system_settings_service.get_row())
    from backend.storage import file_store
    await file_store.ensure_default_project()


@app.on_event("startup")
async def start_portal_scan_loop():
    """Launches the long-lived background task that periodically scans every
    active, due Portal across all projects (backend/services/portal_scanner.py)."""
    asyncio.create_task(portal_scan_loop())


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "settings_loaded": True
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.api.main:app", host="0.0.0.0", port=8000, reload=True)


from fastapi.responses import FileResponse, RedirectResponse

# ── Serve React SPA static files at /factory (Cloud Run mode) ───────────────────
# The Dockerfile copies the Vite build output to /app/dist.
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "dist")
if os.path.isdir(_STATIC_DIR):
    assets_dir = os.path.join(_STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/factory/assets", StaticFiles(directory=assets_dir), name="factory-assets")
        app.mount("/assets", StaticFiles(directory=assets_dir), name="root-assets")

    @app.get("/")
    async def root_redirect():
        return RedirectResponse(url="/factory/")

    @app.get("/factory")
    @app.get("/factory/")
    @app.get("/factory/{full_path:path}")
    async def serve_factory_spa(full_path: str = ""):
        if full_path:
            file_path = os.path.join(_STATIC_DIR, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
        index_file = os.path.join(_STATIC_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        return {"error": "Frontend build files not found"}


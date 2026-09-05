import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.configs.settings import settings
from backend.api.routers.analytics import router as analytics_router
from backend.api.routers.content import router as content_router
from backend.api.routers.generation import router as generation_router
from backend.api.routers.jobs import router as jobs_router
from backend.api.routers.knowledge_packs import router as knowledge_packs_router
from backend.api.routers.opportunities import router as opportunities_router
from backend.api.routers.portals import router as portals_router
from backend.api.routers.projects import router as projects_router
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(projects_router)
app.include_router(sources_router)
app.include_router(portals_router)
app.include_router(knowledge_packs_router)
app.include_router(opportunities_router)
app.include_router(generation_router)
app.include_router(jobs_router)
app.include_router(content_router)
app.include_router(analytics_router)
app.include_router(system_settings_router)


@app.on_event("startup")
async def load_system_settings_overrides():
    """Overlays any file-stored system-settings overrides (data/settings.yaml
    via backend.storage.file_store) onto the in-memory `settings` singleton
    so a restart picks up UI-configured values."""
    apply_overrides(system_settings_service.get_row())


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


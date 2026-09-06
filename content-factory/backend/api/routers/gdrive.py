"""Google Drive API router.

Exposes endpoints to list files in a shared Drive folder and trigger
batch ingestion. Folder ID is provided by the caller (configured in the
Content Factory SystemSettings UI — not hardcoded).

All endpoints require a valid gg-cms JWT (enforced by JWTAuthMiddleware).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.configs.settings import settings
from backend.ingestion.fetchers.gdrive_fetcher import (
    extract_folder_id_from_url,
    ingest_drive_folder,
    list_drive_files,
)

router = APIRouter(prefix="/api/gdrive", tags=["Google Drive"])


def _require_gdrive():
    """Raise 503 if Google Drive integration is disabled or unconfigured."""
    if not settings.gdrive_enabled:
        raise HTTPException(
            status_code=503,
            detail="Google Drive integration is disabled. Enable GDRIVE_ENABLED and configure the service account key.",
        )
    if not settings.gdrive_service_account_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Drive service account key (GDRIVE_SA_KEY) is not configured. "
                "Add the service account JSON key via GCP Secret Manager."
            ),
        )


class DriveStatusResponse(BaseModel):
    enabled: bool
    configured: bool
    message: str


class DriveFilesResponse(BaseModel):
    folder_id: str
    files: list[dict]
    total: int


class DriveIngestRequest(BaseModel):
    folder_url_or_id: str
    project_id: str


class DriveIngestResponse(BaseModel):
    folder_id: str
    total: int
    ingested: int
    skipped: int
    errors: int
    files: list[dict]


@router.get("/status", response_model=DriveStatusResponse)
def gdrive_status():
    """Returns the current Google Drive integration status.

    Used by the SystemSettings UI to show whether Drive is ready to use.
    """
    enabled = settings.gdrive_enabled
    configured = bool(settings.gdrive_service_account_key)
    if not enabled:
        msg = "Google Drive is disabled. Set GDRIVE_ENABLED=true to enable."
    elif not configured:
        msg = (
            "Google Drive is enabled but the service account key is not set. "
            "Add GDRIVE_SA_KEY to GCP Secret Manager and redeploy."
        )
    else:
        msg = "Google Drive is enabled and configured."
    return DriveStatusResponse(enabled=enabled, configured=configured, message=msg)


@router.get("/files", response_model=DriveFilesResponse)
def list_files(folder_url_or_id: str):
    """List all supported files in a Google Drive folder.

    Query param:
      folder_url_or_id — full Drive folder URL or bare folder ID
    """
    _require_gdrive()
    folder_id = extract_folder_id_from_url(folder_url_or_id)
    files = list_drive_files(folder_id)
    return DriveFilesResponse(folder_id=folder_id, files=files, total=len(files))


@router.post("/ingest", response_model=DriveIngestResponse)
async def ingest_folder(req: DriveIngestRequest):
    """Ingest all supported files from a Google Drive folder into a project.

    Each file is passed through the existing extract → normalize → chunk → store
    pipeline. Duplicates are automatically skipped.

    Body:
      folder_url_or_id — full Drive folder URL or bare folder ID
      project_id       — the content factory project to ingest into
    """
    _require_gdrive()
    folder_id = extract_folder_id_from_url(req.folder_url_or_id)
    result = await ingest_drive_folder(req.project_id, folder_id)
    return DriveIngestResponse(folder_id=folder_id, **result)

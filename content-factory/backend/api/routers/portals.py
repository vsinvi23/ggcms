import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict

from backend.models.domain import Portal
from backend.services.portal_scanner import scan_portal
from backend.storage import file_store

router = APIRouter(prefix="/api/portals", tags=["Portals"])


class PortalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    url: str
    portal_type: str
    link_selector: Optional[str] = None
    scan_interval_minutes: int
    is_active: bool
    last_scanned_at: Optional[datetime] = None
    last_scan_status: Optional[str] = None
    last_scan_new_count: Optional[int] = None
    created_at: datetime


class PortalCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    url: str
    portal_type: str = "listing"
    link_selector: Optional[str] = None
    scan_interval_minutes: int = 360


class PortalUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    portal_type: Optional[str] = None
    link_selector: Optional[str] = None
    scan_interval_minutes: Optional[int] = None
    is_active: Optional[bool] = None


class PortalScanOut(BaseModel):
    status: str


@router.get("", response_model=list[PortalOut])
async def list_portals(project_id: uuid.UUID):
    return file_store.list_portals(project_id)


@router.post("", response_model=PortalOut, status_code=201)
async def create_portal(payload: PortalCreate):
    portal = Portal(
        project_id=payload.project_id,
        name=payload.name,
        url=payload.url,
        portal_type=payload.portal_type,
        link_selector=payload.link_selector,
        scan_interval_minutes=payload.scan_interval_minutes,
    )
    await file_store.append_portal(payload.project_id, portal)
    return portal


@router.patch("/{portal_id}", response_model=PortalOut)
async def update_portal(portal_id: uuid.UUID, project_id: uuid.UUID, payload: PortalUpdate):
    portal = file_store.get_portal(project_id, portal_id)
    if portal is None:
        raise HTTPException(status_code=404, detail="Portal not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(portal, field, value)

    await file_store.update_portal(project_id, portal)
    return portal


@router.delete("/{portal_id}", status_code=204)
async def delete_portal(portal_id: uuid.UUID, project_id: uuid.UUID):
    await file_store.delete_portal(project_id, portal_id)


@router.post("/{portal_id}/scan", response_model=PortalScanOut, status_code=202)
async def scan_portal_now(portal_id: uuid.UUID, project_id: uuid.UUID, bg_tasks: BackgroundTasks):
    """
    Fires a single portal scan in the background (no GenerationJob/polling
    ceremony needed -- a single portal scan is fast; poll GET /api/portals
    afterward to see last_scan_status update).
    """
    portal = file_store.get_portal(project_id, portal_id)
    if portal is None:
        raise HTTPException(status_code=404, detail="Portal not found")

    bg_tasks.add_task(scan_portal, project_id, portal)
    return PortalScanOut(status="scanning")

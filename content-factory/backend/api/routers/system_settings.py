from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.services.system_settings_service import (
    OVERRIDABLE_FIELDS,
    RESTART_REQUIRED_FIELDS,
    SECRET_FIELDS,
    apply_overrides,
    effective_view,
    get_row,
)
from backend.storage import file_store

router = APIRouter(prefix="/api/system-settings", tags=["System Settings"])


class SystemSettingsUpdate(BaseModel):
    gemini_api_key: Optional[str] = None
    gemini_model_planner: Optional[str] = None
    gemini_model_researcher: Optional[str] = None
    gemini_model_writer: Optional[str] = None
    gemini_model_reviewer: Optional[str] = None
    gemini_base_url: Optional[str] = None
    embedding_model: Optional[str] = None
    gcs_bucket: Optional[str] = None
    max_monthly_ai_budget: Optional[float] = None
    max_cost_per_content_unit: Optional[float] = None
    max_revisions: Optional[int] = None
    source_max_pages: Optional[int] = None
    source_max_depth: Optional[int] = None
    mock_mode: Optional[bool] = None
    ggcms_base_url: Optional[str] = None
    factory_sync_secret: Optional[str] = None
    tavily_api_key: Optional[str] = None
    web_search_max_results: Optional[int] = None


@router.get("")
async def get_system_settings():
    row = get_row()
    return {"settings": effective_view(row)}


@router.put("")
async def update_system_settings(payload: SystemSettingsUpdate):
    row = get_row()

    incoming = payload.model_dump(exclude_unset=True)
    restart_required = False
    for field in OVERRIDABLE_FIELDS:
        if field not in incoming:
            continue
        value = incoming[field]
        # A masked/empty secret means "leave unchanged" -- never overwrite
        # a real stored secret with a blank value from a masked display.
        if field in SECRET_FIELDS and (value is None or value == ""):
            continue
        setattr(row, field, value)
        if field in RESTART_REQUIRED_FIELDS:
            restart_required = True

    row.updated_at = datetime.now(timezone.utc)
    row = await file_store.save_settings(row)
    apply_overrides(row)

    return {"settings": effective_view(row), "restart_required": restart_required}

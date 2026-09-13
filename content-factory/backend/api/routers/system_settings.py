from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.middleware.auth import require_admin
from backend.services.system_settings_service import (
    OVERRIDABLE_FIELDS,
    READONLY_FIELDS,
    RESTART_REQUIRED_FIELDS,
    SECRET_FIELDS,
    apply_overrides,
    effective_view,
    get_row,
)
from backend.storage import file_store

router = APIRouter(prefix="/api/system-settings", tags=["System Settings"])


class SystemSettingsUpdate(BaseModel):
    """
    PUT body for system settings.

    Security rules enforced server-side:
    - factory_sync_secret, ggcms_base_url, gemini_base_url, gcs_bucket,
      embedding_model are NOT accepted here — they are infrastructure-only
      and must be changed via GCP Secret Manager / Cloud Run env vars.
    - Secret fields (gemini_api_key, tavily_api_key) only update when
      a non-empty string is provided (empty = "leave unchanged").
    - Any field not in OVERRIDABLE_FIELDS is silently ignored.
    """
    gemini_api_key: Optional[str] = None
    gemini_model_planner: Optional[str] = None
    gemini_model_researcher: Optional[str] = None
    gemini_model_writer: Optional[str] = None
    gemini_model_reviewer: Optional[str] = None
    max_monthly_ai_budget: Optional[float] = None
    max_cost_per_content_unit: Optional[float] = None
    max_revisions: Optional[int] = None
    source_max_pages: Optional[int] = None
    source_max_depth: Optional[int] = None
    mock_mode: Optional[bool] = None
    tavily_api_key: Optional[str] = None
    web_search_max_results: Optional[int] = None
    # Intentionally omitted (infrastructure-only, GCP Secret Manager / env vars):
    #   factory_sync_secret, ggcms_base_url, gemini_base_url, gcs_bucket, embedding_model


@router.get("")
async def get_system_settings():
    """Returns current settings.

    Secret fields (gemini_api_key, tavily_api_key) never return key characters.
    Only is_set=true/false is returned so the UI can show a configured badge.
    """
    row = get_row()
    return {"settings": effective_view(row)}


@router.put("", dependencies=[Depends(require_admin)])
async def update_system_settings(payload: SystemSettingsUpdate):
    """Updates overridable settings.

    Readonly/infra fields (factory_sync_secret, ggcms_base_url, etc.) in the
    request body are silently discarded — only OVERRIDABLE_FIELDS are applied.
    Empty secret values are treated as "keep current value".
    """
    row = get_row()

    incoming = payload.model_dump(exclude_unset=True)
    restart_required = False

    for field in OVERRIDABLE_FIELDS:
        if field not in incoming:
            continue
        value = incoming[field]
        # Empty / None secret = "leave unchanged" (user blanked the input)
        if field in SECRET_FIELDS and (value is None or str(value).strip() == ""):
            continue
        # Validate non-empty string for string fields
        if isinstance(value, str) and not value.strip() and field not in SECRET_FIELDS:
            continue
        setattr(row, field, value)
        if field in RESTART_REQUIRED_FIELDS:
            restart_required = True

    row.updated_at = datetime.now(timezone.utc)
    row = await file_store.save_settings(row)
    apply_overrides(row)

    return {"settings": effective_view(row), "restart_required": restart_required}

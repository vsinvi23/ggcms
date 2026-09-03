import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.models.domain import Project, ProjectStrategy
from backend.storage import file_store

router = APIRouter(prefix="/api/projects", tags=["Projects"])


class ProjectCreate(BaseModel):
    name: str
    niche: List[str] = Field(default_factory=list)
    audience: List[str] = Field(default_factory=list)
    language: str = "en"
    country: Optional[str] = None
    levels: List[str] = Field(default_factory=list)
    content_types: List[str] = Field(default_factory=list)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    niche: List[str]
    audience: List[str]
    language: str
    country: Optional[str] = None
    levels: List[str]
    content_types: List[str]
    autonomy_enabled: bool
    min_opportunity_score: int
    daily_limit: int
    require_human_approval: bool
    created_at: datetime


class ProjectSettingsIn(BaseModel):
    name: str
    niche: List[str] = Field(default_factory=list)
    audience: List[str] = Field(default_factory=list)
    language: str = "en"
    country: Optional[str] = None
    levels: List[str] = Field(default_factory=list)
    content_types: List[str] = Field(default_factory=list)
    brand_voice: Optional[str] = None
    autonomy_enabled: bool
    min_opportunity_score: int
    daily_limit: int
    require_human_approval: bool


class ProjectStrategyIn(BaseModel):
    content_goals: List[str] = Field(default_factory=list)
    prohibited_topics: List[str] = Field(default_factory=list)
    preferred_sources: List[str] = Field(default_factory=list)
    publishing_frequency: Optional[str] = None


class ProjectStrategyOut(ProjectStrategyIn):
    model_config = ConfigDict(from_attributes=True)

    project_id: uuid.UUID
    updated_at: datetime


@router.get("", response_model=List[ProjectOut])
async def list_projects():
    return file_store.list_projects()


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(payload: ProjectCreate):
    project = Project(
        name=payload.name,
        niche=payload.niche,
        audience=payload.audience,
        language=payload.language,
        country=payload.country,
        levels=payload.levels,
        content_types=payload.content_types,
    )
    return await file_store.save_project(project)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project_settings(project_id: uuid.UUID, payload: ProjectSettingsIn):
    project = file_store.load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    project.name = payload.name
    project.niche = payload.niche
    project.audience = payload.audience
    project.language = payload.language
    project.country = payload.country
    project.levels = payload.levels
    project.content_types = payload.content_types
    project.brand_voice = payload.brand_voice
    project.autonomy_enabled = payload.autonomy_enabled
    project.min_opportunity_score = payload.min_opportunity_score
    project.daily_limit = payload.daily_limit
    project.require_human_approval = payload.require_human_approval
    project.updated_at = datetime.now(timezone.utc)

    return await file_store.save_project(project)


@router.get("/{project_id}/strategy", response_model=ProjectStrategyOut)
async def get_project_strategy(project_id: uuid.UUID):
    strategy = file_store.load_project_strategy(project_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found for project")
    return strategy


@router.put("/{project_id}/strategy", response_model=ProjectStrategyOut)
async def upsert_project_strategy(project_id: uuid.UUID, payload: ProjectStrategyIn):
    project = file_store.load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    strategy = file_store.load_project_strategy(project_id)
    if strategy is None:
        strategy = ProjectStrategy(project_id=project_id)

    strategy.content_goals = payload.content_goals
    strategy.prohibited_topics = payload.prohibited_topics
    strategy.preferred_sources = payload.preferred_sources
    strategy.publishing_frequency = payload.publishing_frequency
    strategy.updated_at = datetime.now(timezone.utc)

    return await file_store.save_project_strategy(strategy)

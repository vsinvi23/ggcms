import uuid
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.knowledge.packs import create_knowledge_pack
from backend.retrieval.vector_store import list_knowledge_packs as _list_knowledge_packs
from backend.storage import file_store

router = APIRouter(prefix="/api/knowledge-packs", tags=["Knowledge Packs"])


class KnowledgePackCreate(BaseModel):
    project_id: uuid.UUID
    topic: str
    description: Optional[str] = None
    source_ids: List[uuid.UUID] = Field(default_factory=list)


class KnowledgePackOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    topic: str
    description: Optional[str] = None
    source_ids: List[uuid.UUID] = Field(default_factory=list)


@router.get("", response_model=List[KnowledgePackOut])
async def list_knowledge_packs(project_id: Optional[uuid.UUID] = None):
    if project_id is not None:
        return _list_knowledge_packs(project_id)
    return [pack for p in file_store.list_projects() for pack in _list_knowledge_packs(p.id)]


@router.post("", response_model=KnowledgePackOut, status_code=201)
async def create_pack(payload: KnowledgePackCreate):
    pack_id = await create_knowledge_pack(
        payload.project_id,
        topic=payload.topic,
        description=payload.description,
        source_ids=payload.source_ids,
    )
    return {
        "id": pack_id,
        "project_id": payload.project_id,
        "topic": payload.topic,
        "description": payload.description,
        "source_ids": payload.source_ids,
    }

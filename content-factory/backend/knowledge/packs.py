import uuid

from backend.retrieval import vector_store
from backend.storage.file_store import ProjectId


async def create_knowledge_pack(
    project_id: ProjectId,
    topic: str,
    description: str | None = None,
    source_ids: list[uuid.UUID] | None = None,
) -> uuid.UUID:
    """
    Creates a knowledge_pack record linking a project + topic to the set of
    sources it draws from. Thin wrapper over vector_store so callers only need
    to import backend.knowledge.packs.
    """
    return await vector_store.create_knowledge_pack(
        project_id,
        topic=topic,
        description=description,
        source_ids=source_ids,
    )


def get_pack_context(
    project_id: ProjectId,
    knowledge_pack_id: ProjectId,
    query: str,
    top_k: int = 8,
) -> list[str]:
    """
    Fetches retrieval context for a knowledge pack: runs a keyword relevance
    search (see backend/retrieval/vector_store.similarity_search) scoped to
    the pack's sources, and returns the matching chunk texts ordered by
    relevance (closest first). Used by agents (e.g. ResearchAgent's
    knowledge_search tool) to ground generation in ingested source material.
    """
    results = vector_store.similarity_search(
        project_id,
        query=query,
        knowledge_pack_id=knowledge_pack_id,
        top_k=top_k,
    )
    return [row["text"] for row in results]

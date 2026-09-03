"""
STAGE 2 REWRITE: this module used to run pgvector cosine-distance similarity
search (and plain inserts/counts) against the `knowledge_document`,
`knowledge_chunk`, `knowledge_pack`, and `source` Postgres tables via an
injected `AsyncSession`. There is no database anymore -- everything here now
reads/writes through `backend/storage/file_store.py` (per-project YAML), and
every function takes an explicit `project_id` instead of a `db` session.

`similarity_search` in particular no longer does vector math: per
STAGE 1's docstring on `KnowledgeChunk.embedding` (dropped entirely -- see
backend/models/domain.py), there is no embedding to compare against. It is
replaced with a case-insensitive substring/keyword relevance scan over chunk
text, ranking by the number of query-keyword occurrences. The "lower distance
= closer/better match" convention is preserved (distance = 1 / (1 + match
count)) so callers that sort/consume results ascending-by-distance (e.g.
backend/workflows/content_pipeline.py's research_web node -- a later stage)
don't need to change their ordering assumption, only how they build the query
argument (a plain string instead of an embedding vector).
"""
import re
import uuid

from backend.models.domain import KnowledgeChunk, KnowledgeDocument, KnowledgePack
from backend.storage import file_store
from backend.storage.file_store import ProjectId

_KEYWORD_RE = re.compile(r"\w+")


def _keywords(query: str) -> list[str]:
    return _KEYWORD_RE.findall(query.lower())


# --- Writes ------------------------------------------------------------------

async def create_knowledge_document(
    project_id: ProjectId,
    source_id: ProjectId,
    extracted_text: str,
    section_map: dict | None = None,
    page_count: int | None = None,
) -> uuid.UUID:
    """
    Creates a knowledge document (one per extracted Source) and returns its id.
    Chunks created via insert_chunks() reference this id as document_id.
    """
    document = KnowledgeDocument(
        source_id=source_id,
        extracted_text=extracted_text,
        section_map=section_map,
        page_count=page_count,
    )
    await file_store.save_knowledge_document(project_id, document)
    return document.id


async def insert_chunks(
    project_id: ProjectId,
    document_id: ProjectId,
    chunks: list[str],
) -> list[uuid.UUID]:
    """
    Stores `chunks` as KnowledgeChunk rows for a knowledge document, in order
    (chunk_index = position in the list). There is no embedding step anymore
    (see module docstring) -- chunk text is all that's kept.
    """
    if not chunks:
        return []

    chunk_models = [
        KnowledgeChunk(document_id=document_id, chunk_index=index, text=text)
        for index, text in enumerate(chunks)
    ]
    await file_store.append_knowledge_chunks(project_id, chunk_models)
    return [c.id for c in chunk_models]


async def create_knowledge_pack(
    project_id: ProjectId,
    topic: str,
    description: str | None = None,
    source_ids: list[uuid.UUID] | None = None,
) -> uuid.UUID:
    """Creates a knowledge pack linking a project/topic to a set of source ids."""
    pack = KnowledgePack(
        project_id=project_id,
        topic=topic,
        description=description,
        source_ids=source_ids or [],
    )
    await file_store.save_knowledge_pack(project_id, pack)
    return pack.id


# --- Reads ---------------------------------------------------------------

def similarity_search(
    project_id: ProjectId,
    query: str,
    knowledge_pack_id: ProjectId | None = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Returns the top-k knowledge chunks most relevant to `query`, scoped to
    `project_id` and, optionally, to a knowledge pack's source_ids. Relevance
    is a case-insensitive count of query-keyword occurrences in chunk text
    (no embeddings/vector math -- see module docstring).

    Each result: {"chunk_id", "document_id", "text", "url", "distance"}
    (lower distance = better match: distance = 1 / (1 + match_count)).
    Only chunks belonging to APPROVED sources are considered.
    """
    keywords = _keywords(query)

    documents = file_store.list_knowledge_documents(project_id)
    document_to_source = {str(d.id): d.source_id for d in documents}

    sources = file_store.list_sources(project_id)
    sources_by_id = {str(s.id): s for s in sources}

    allowed_source_ids: set[str] | None = None
    if knowledge_pack_id is not None:
        pack = file_store.get_knowledge_pack(project_id, knowledge_pack_id)
        allowed_source_ids = {str(sid) for sid in pack.source_ids} if pack else set()

    candidates = []
    for chunk in file_store.list_knowledge_chunks(project_id):
        source_id = document_to_source.get(str(chunk.document_id))
        if source_id is None:
            continue
        source = sources_by_id.get(str(source_id))
        if source is None or source.review_status != "APPROVED":
            continue
        if allowed_source_ids is not None and str(source_id) not in allowed_source_ids:
            continue
        candidates.append((chunk, source))

    text_lower_cache: dict[str, str] = {}

    def _match_count(chunk: KnowledgeChunk) -> int:
        lowered = text_lower_cache.get(str(chunk.id))
        if lowered is None:
            lowered = chunk.text.lower()
            text_lower_cache[str(chunk.id)] = lowered
        return sum(lowered.count(kw) for kw in keywords) if keywords else 0

    scored = [
        (
            chunk,
            source,
            1.0 / (1.0 + _match_count(chunk)),
        )
        for chunk, source in candidates
    ]
    scored.sort(key=lambda row: row[2])

    return [
        {
            "chunk_id": chunk.id,
            "document_id": chunk.document_id,
            "text": chunk.text,
            "url": source.url,
            "distance": distance,
        }
        for chunk, source, distance in scored[:top_k]
    ]


def count_approved_sources(
    project_id: ProjectId,
    knowledge_pack_id: ProjectId | None = None,
) -> int:
    """Counts APPROVED sources for a project, optionally scoped to a knowledge pack."""
    sources = [s for s in file_store.list_sources(project_id) if s.review_status == "APPROVED"]

    if knowledge_pack_id is not None:
        pack = file_store.get_knowledge_pack(project_id, knowledge_pack_id)
        allowed = {str(sid) for sid in pack.source_ids} if pack else set()
        sources = [s for s in sources if str(s.id) in allowed]

    return len(sources)


def list_knowledge_packs(project_id: ProjectId) -> list[KnowledgePack]:
    """
    Thin re-export of file_store.list_knowledge_packs so routers (e.g.
    backend/api/routers/knowledge_packs.py, a later stage) that already import
    from backend.retrieval.vector_store keep a clean call site instead of
    reaching for the old `knowledge_pack_table` Core Table (removed).
    """
    return file_store.list_knowledge_packs(project_id)

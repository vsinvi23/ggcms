"""
STAGE 2 REWRITE: this module used to run pgvector cosine-distance similarity
search (and plain inserts/counts) against the `knowledge_document`,
`knowledge_chunk`, `knowledge_pack`, and `source` Postgres tables via an
injected `AsyncSession`. There is no database anymore -- everything here now
reads/writes through `backend/storage/file_store.py` (per-project YAML), and
every function takes an explicit `project_id` instead of a `db` session.

`similarity_search` in particular no longer does pgvector math: per
STAGE 1's docstring on `KnowledgeChunk.embedding` (dropped entirely -- see
backend/models/domain.py), there was no in-memory column to compare against.
STAGE 3 (source-trust fast-track) reintroduces real semantic ranking without
reviving that column: query and chunk text are embedded on demand via
`backend/retrieval/semantic_search.py` (a small SQLite-backed cache in front
of `backend/knowledge/embeddings.py`'s Gemini embedding client), and ranked
by cosine similarity. The "lower distance = closer/better match" convention
is preserved (distance = 1 - cosine_similarity, i.e. cosine *distance*) so
callers that sort/consume results ascending-by-distance (e.g.
backend/workflows/content_pipeline.py's research_web node) don't need to
change their ordering assumption.

Sources are usable when review_status is "APPROVED" (manually reviewed) or
"AUTO_APPROVED" (auto-approved during discovery because the source came from
a trusted domain -- see backend/security/net_guard.is_trusted_domain).
"""
import uuid

from backend.models.domain import KnowledgeChunk, KnowledgeDocument, KnowledgePack
from backend.retrieval import semantic_search
from backend.storage import file_store
from backend.storage.file_store import ProjectId

_USABLE_REVIEW_STATUSES = ("APPROVED", "AUTO_APPROVED")


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
    is real cosine-similarity ranking against Gemini embeddings (see module
    docstring and backend/retrieval/semantic_search.py); in settings.mock_mode
    a deterministic pseudo-embedding is used instead so tests stay fast and
    deterministic.

    Each result: {"chunk_id", "document_id", "text", "url", "distance"}
    (lower distance = better match: distance = 1 - cosine_similarity).
    Only chunks belonging to APPROVED or AUTO_APPROVED sources are considered.
    """
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
        if source is None or source.review_status not in _USABLE_REVIEW_STATUSES:
            continue
        if allowed_source_ids is not None and str(source_id) not in allowed_source_ids:
            continue
        candidates.append((chunk, source))

    if not candidates:
        return []

    query_embedding = semantic_search.get_embedding(query, is_query=True)
    chunk_embeddings = {
        str(chunk.id): semantic_search.get_embedding(chunk.text)
        for chunk, _source in candidates
    }
    similarity_by_chunk_id = dict(
        semantic_search.rank_by_similarity(
            query_embedding,
            [(str(chunk.id), chunk_embeddings[str(chunk.id)]) for chunk, _source in candidates],
        )
    )

    scored = [
        (
            chunk,
            source,
            1.0 - similarity_by_chunk_id[str(chunk.id)],
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


def get_chunks_for_source(project_id: ProjectId, source_id: ProjectId) -> list[dict]:
    """
    Returns every chunk belonging to `source_id`'s KnowledgeDocument(s), in
    chunk_index order, regardless of the source's review_status.

    Unlike similarity_search/count_approved_sources, this does NOT gate on
    APPROVED/AUTO_APPROVED -- it backs Mode B (user-provided-source
    generation, see backend/api/routers/source_generation.py), where the
    caller is explicitly supplying this exact source right now, so the
    discovery-trust question similarity_search's gate exists for doesn't
    apply.

    Each result: {"chunk_id", "document_id", "text", "url"} (no "distance" --
    this isn't ranked, it's the full set of chunks for one source).
    """
    documents = [
        d for d in file_store.list_knowledge_documents(project_id)
        if str(d.source_id) == str(source_id)
    ]
    if not documents:
        return []
    document_ids = {str(d.id) for d in documents}

    source = file_store.get_source(project_id, source_id)
    url = source.url if source else None

    chunks = [
        c for c in file_store.list_knowledge_chunks(project_id)
        if str(c.document_id) in document_ids
    ]
    chunks.sort(key=lambda c: c.chunk_index)

    return [
        {"chunk_id": c.id, "document_id": c.document_id, "text": c.text, "url": url}
        for c in chunks
    ]


def count_approved_sources(
    project_id: ProjectId,
    knowledge_pack_id: ProjectId | None = None,
) -> int:
    """
    Counts usable (APPROVED or AUTO_APPROVED) sources for a project,
    optionally scoped to a knowledge pack.
    """
    sources = [
        s for s in file_store.list_sources(project_id)
        if s.review_status in _USABLE_REVIEW_STATUSES
    ]

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

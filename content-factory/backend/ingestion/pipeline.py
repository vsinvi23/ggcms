import httpx

from backend.ingestion.extractors.html_extractor import extract_text_from_html
from backend.ingestion.extractors.pdf_extractor import extract_text_from_pdf
from backend.knowledge.chunking import chunk_text
from backend.models.domain import Source
from backend.retrieval import vector_store
from backend.services import dedup
from backend.storage import file_store
from backend.storage.file_store import ProjectId

# source_type values per DDL §2: 'pdf','docx','markdown','txt','url','website','sitemap','rss','github'.
# Anything not explicitly 'pdf' is treated as HTML/text and routed through trafilatura.
_PDF_SOURCE_TYPES = {"pdf"}


async def _fetch(url: str) -> bytes:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        return response.content


def _normalize(text: str) -> str:
    """
    Normalize step per spec §7: unify whitespace/encoding. Boilerplate stripping
    is already handled by the extractors (trafilatura / PyMuPDF text extraction);
    this collapses stray control characters and blank-line runs left behind.
    """
    if not text:
        return ""
    # Normalize encoding artifacts (e.g. stray surrogate/undecodable bytes) without raising.
    cleaned = text.encode("utf-8", errors="ignore").decode("utf-8")
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse 3+ blank lines to a single blank line, and trailing whitespace per line.
    lines = [line.rstrip() for line in cleaned.split("\n")]
    result_lines: list[str] = []
    blank_run = 0
    for line in lines:
        if line == "":
            blank_run += 1
            if blank_run > 1:
                continue
        else:
            blank_run = 0
        result_lines.append(line)
    return "\n".join(result_lines).strip()


async def ingest_source(
    project_id: ProjectId,
    source_type: str,
    url: str | None = None,
    file_bytes: bytes | None = None,
    title: str | None = None,
) -> dict:
    """
    Orchestrates the full ingestion pipeline for one source, per
    IMPLEMENTATION_SPECIFICATION.md §7:

        fetch -> extract -> normalize -> chunk -> embed -> store

    STAGE 2: "embed" is a no-op now -- there's no embedding infra worth
    keeping for a single-operator file-backed tool (see
    backend/retrieval/vector_store.py's module docstring); chunk text is
    stored as-is and retrieved later via keyword search.

    Dedup short-circuits a re-ingest of the same source (services/dedup.py):
    canonical URL match is checked first when a URL is given, then a content-hash
    match after fetch, before any extraction/chunking work is done.

    Exactly one of `url` / `file_bytes` should be provided (`file_bytes` for
    already-in-hand uploads, e.g. a PDF from a form upload; `url` to fetch it).

    Returns a summary dict: {"status": "duplicate"|"ingested"|"failed", "source_id",
    "document_id", "chunk_count", "chunks"} ("document_id"/"chunk_count"/"chunks"
    omitted on duplicate/failed).
    """
    if not url and file_bytes is None:
        raise ValueError("ingest_source requires either url or file_bytes")

    canonical_url = dedup.canonicalize_url(url) if url else None

    # Pre-fetch dedup: an already-ingested source with the same canonical URL.
    if canonical_url is not None:
        for existing in file_store.list_sources(project_id):
            if existing.url == canonical_url and existing.status in ("FETCHED", "EXTRACTED"):
                return {"status": "duplicate", "source_id": existing.id}

    # --- fetch ---------------------------------------------------------
    is_pdf = source_type in _PDF_SOURCE_TYPES
    if file_bytes is not None:
        raw_bytes = file_bytes
    else:
        raw_bytes = await _fetch(url)

    # --- content-hash dedup (post-fetch, pre-extract) -------------------
    hash_value = dedup.content_hash(raw_bytes)
    duplicate = dedup.find_duplicate_source(project_id, hash_value)
    if duplicate is not None:
        return {"status": "duplicate", "source_id": duplicate.id}

    source = Source(
        project_id=project_id,
        source_type=source_type,
        url=canonical_url,
        title=title,
        content_hash=hash_value,
        status="FETCHED",
    )
    await file_store.append_source(project_id, source)

    # --- extract ---------------------------------------------------------
    page_count = None
    section_map = None
    if is_pdf:
        extracted = extract_text_from_pdf(raw_bytes)
        raw_text = extracted["text"]
        page_count = extracted["page_count"]
        section_map = extracted["section_map"]
    else:
        html = raw_bytes.decode("utf-8", errors="ignore")
        raw_text = extract_text_from_html(html)

    # --- normalize ---------------------------------------------------------
    normalized_text = _normalize(raw_text)

    if not normalized_text:
        source.status = "FAILED"
        await file_store.update_source(project_id, source)
        return {"status": "failed", "source_id": source.id, "reason": "no extractable text"}

    # --- chunk -> store (no embed step -- see module docstring) -----------
    chunks = chunk_text(normalized_text)

    document_id = await vector_store.create_knowledge_document(
        project_id,
        source_id=source.id,
        extracted_text=normalized_text,
        section_map=section_map,
        page_count=page_count,
    )
    chunk_ids = await vector_store.insert_chunks(project_id, document_id, chunks)

    source.status = "EXTRACTED"
    await file_store.update_source(project_id, source)

    return {
        "status": "ingested",
        "source_id": source.id,
        "document_id": document_id,
        "chunk_count": len(chunk_ids),
        "chunks": chunks,
    }


async def ingest_discovered_source(
    project_id: ProjectId,
    url: str,
    title: str | None,
    snippet: str | None,
    search_query: str,
    search_rank: int,
    source_type: str = "url",
) -> dict:
    """
    Ingests a web-search-discovered URL via `ingest_source` (reused, not
    duplicated) and stamps discovery/review metadata onto the resulting
    Source row. New sources land as review_status='PENDING' so they cannot
    ground *future* generations until a human approves them (see
    retrieval/vector_store.similarity_search's review_status filter).
    """
    result = await ingest_source(project_id, source_type, url=url, title=title)

    if result["status"] not in ("ingested", "failed"):
        return result  # duplicate: an existing Source already carries its own review state

    source = file_store.get_source(project_id, result["source_id"])
    source.discovery_method = "web_search"
    source.review_status = "PENDING"
    source.discovered_snippet = snippet
    source.search_query = search_query
    source.search_rank = search_rank
    await file_store.update_source(project_id, source)

    return result

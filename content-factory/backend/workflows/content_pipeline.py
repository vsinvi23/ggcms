import asyncio
import logging
import uuid
from typing import TypedDict, Annotated, Any, Optional
from langgraph.graph import StateGraph, END
from backend.schemas.evidence_pack import EvidencePack, Claim
from backend.schemas.learning_plan import LearningPlan
from backend.schemas.content_plan import ContentPlan

# Import Agents
from backend.agents.research_agent import ResearchAgent
from backend.agents.learning_architect_agent import LearningArchitectAgent
from backend.agents.content_planner_agent import ContentPlannerAgent
from backend.agents.writer_agent import WriterAgent
from backend.agents.fact_checker_agent import FactCheckerAgent
from backend.agents.citation_checker_agent import CitationCheckerAgent
from backend.agents.quality_agent import QualityAgent
from backend.agents.style_guide_agent import StyleGuideAgent
from backend.services.image_service import get_section_image
from backend.configs.settings import settings

logger = logging.getLogger(__name__)

class PipelineState(TypedDict):
    project_id: str
    topic: str
    knowledge_pack_ids: list[str]
    # Singular convenience key (plan §10). `knowledge_pack_ids[0]` already
    # carries this today via research_web/build_evidence_pack -- this key is
    # only populated by the new Content Job orchestrator
    # (backend/orchestration/content_job_orchestrator.py) so build_evidence_pack
    # doesn't have to re-derive "the" knowledge pack from a list every time.
    # Optional: falls back to knowledge_pack_ids[0] when absent.
    knowledge_pack_id: Optional[str]
    # For logging/traceability only (plan §10) -- links pipeline log lines
    # back to the ContentJob that triggered this run. Never branched on.
    content_job_id: Optional[str]
    enable_web_research: bool
    content_type: Optional[str]
    # First-class course structure planned via
    # backend/agents/course_agent.py::plan_course_outline and reviewed by the
    # operator BEFORE generation (see backend/schemas/course.py::CourseOutline
    # -- passed through here as a plain dict). When content_type == "course"
    # and this is set, generate_draft writes each lesson individually instead
    # of running the flat article content-planning path.
    course_outline: Optional[dict]
    context_chunks: Optional[list[str]]
    evidence_pack: Optional[EvidencePack]
    learning_plan: Optional[LearningPlan]
    content_plan: Optional[ContentPlan]
    draft_json: Optional[dict]
    quality_report: Optional[dict]
    revisions_count: int
    is_approved: bool
    # Optional per-job cost tracker (backend/services/cost_tracker.py::CostTracker)
    # threaded through to every agent .run() call that accepts a `tracker`
    # kwarg, so LLM spend across the whole pipeline run is metered against
    # the same job budget. None when the caller (e.g. tests) doesn't wire one.
    cost_tracker: Optional[Any]
    # Human-readable feedback string built by `revise` from the previous
    # QualityReport's issues/narrative_voice_issues, consumed by
    # generate_draft's writer.run(..., revision_feedback=...) so the loop
    # back to generate_draft actually acts on what failed review instead of
    # blindly re-running the same prompt.
    revision_feedback: Optional[str]

# Initialize Agent Singletons
researcher = ResearchAgent()
architect = LearningArchitectAgent()
planner = ContentPlannerAgent()
writer = WriterAgent()
fact_checker = FactCheckerAgent()
citation_checker = CitationCheckerAgent()
auditor = QualityAgent()

async def research_web(state: PipelineState) -> dict:
    """
    Decides whether to web-search for the topic (auto when the project has no
    approved sources yet, or opt-in via enable_web_research), ingests any
    discovered pages as PENDING/web_search Source rows, and merges chunks from
    already-APPROVED sources plus this run's freshly-discovered ones into
    context_chunks for build_evidence_pack.
    """
    from backend.retrieval import vector_store
    from backend.services.web_search_service import web_search
    from backend.ingestion.pipeline import ingest_discovered_source

    topic = state["topic"]
    project_id = uuid.UUID(state["project_id"])
    knowledge_pack_ids = state.get("knowledge_pack_ids") or []
    knowledge_pack_id = uuid.UUID(knowledge_pack_ids[0]) if knowledge_pack_ids else None

    context_chunks: list[str] = []

    approved_count = vector_store.count_approved_sources(project_id, knowledge_pack_id)
    has_sources = approved_count > 0
    should_search = (not has_sources) or bool(state.get("enable_web_research"))

    if has_sources:
        approved_chunks = vector_store.similarity_search(
            project_id, query=topic, knowledge_pack_id=knowledge_pack_id
        )
        for chunk in approved_chunks:
            context_chunks.append(f"[Source: {chunk['url']}]\n{chunk['text']}")

    if should_search:
        print(f"[*] Running web search for: {topic}")
        try:
            results = await web_search(topic)
        except Exception as e:
            logger.error(f"[research_web] web_search failed for '{topic}': {e}")
            results = []

        for result in results:
            try:
                outcome = await ingest_discovered_source(
                    project_id=project_id,
                    url=result.url,
                    title=result.title,
                    snippet=result.snippet,
                    search_query=topic,
                    search_rank=result.rank,
                )
            except Exception as e:
                logger.error(f"[research_web] failed to ingest '{result.url}': {e}")
                continue

            if outcome["status"] == "ingested":
                for chunk_text in outcome.get("chunks", []):
                    context_chunks.append(f"[Source: {result.url}]\n{chunk_text}")

    return {"context_chunks": context_chunks or None}

def _resolve_knowledge_pack_id(state: PipelineState) -> Optional[str]:
    """
    Singular knowledge_pack_id if the caller set one (Content Job orchestrator),
    else falls back to knowledge_pack_ids[0] (existing convention used by
    research_web) so this stays a pure read of state the caller already fills.
    """
    kp_id = state.get("knowledge_pack_id")
    if kp_id:
        return kp_id
    kp_ids = state.get("knowledge_pack_ids") or []
    return kp_ids[0] if kp_ids else None


def _try_load_reusable_evidence_pack(project_id: str, knowledge_pack_id: str) -> Optional[EvidencePack]:
    """
    Plan §10 research-reuse check: if the KnowledgePack referenced by
    knowledge_pack_id already has a populated, non-stale `evidence_pack_id`,
    load and return the existing Evidence Pack so the caller can skip the
    ResearchAgent LLM call entirely -- "one research effort -> many content
    assets," the single biggest cost lever in the autonomous-factory plan.

    IMPORTANT GAP (found during this workstream, not invented/worked around):
    `backend.models.domain.EvidencePack` -- the file-store-shaped domain model
    that `KnowledgePack.evidence_pack_id` is meant to point at -- has NO
    file_store.py accessor today (no save_evidence_pack/get_evidence_pack/
    list_evidence_packs; grepped, confirmed absent). Nothing in the current
    codebase ever populates `KnowledgePack.evidence_pack_id` either (the
    Knowledge Pack builder step that would do so is explicitly out of scope
    per plan §6.2 and this workstream's assignment). So in practice this
    function's fast path is unreachable today -- `evidence_pack_id` is always
    None -- and it always falls through to returning None, letting the caller
    run research_web/build_evidence_pack exactly as before. This is the
    documented minimal-risk fallback: skip the optimization gracefully rather
    than inventing new EvidencePack persistence beyond what already exists.
    The check is still wired end-to-end (state keys, staleness check, feature
    -detected loader) so a future workstream only needs to add the
    file_store accessor for this to start working with no pipeline changes.
    """
    from backend.storage import file_store

    pack = file_store.get_knowledge_pack(project_id, knowledge_pack_id)
    if pack is None or pack.evidence_pack_id is None:
        return None

    # Non-stale: the pack's evidence hasn't been superseded by a newer
    # knowledge-refresh pass. evidence_version/knowledge_version are the only
    # freshness signals modeled today (plan §6.2) -- treat evidence as stale
    # once knowledge_version has moved past the version the evidence was
    # captured at.
    if pack.evidence_version < pack.knowledge_version:
        logger.info(
            f"[build_evidence_pack] KnowledgePack {knowledge_pack_id} evidence is stale "
            f"(evidence_version={pack.evidence_version} < knowledge_version={pack.knowledge_version}); "
            "re-running research."
        )
        return None

    # Feature-detect a persisted-EvidencePack loader rather than assuming one
    # exists -- see docstring gap note above.
    loader = getattr(file_store, "get_evidence_pack", None)
    if loader is None:
        logger.info(
            f"[build_evidence_pack] KnowledgePack {knowledge_pack_id} has evidence_pack_id="
            f"{pack.evidence_pack_id} but backend.storage.file_store has no get_evidence_pack "
            "accessor yet -- skipping research-reuse optimization, running research_web as usual."
        )
        return None

    domain_pack = loader(project_id, pack.evidence_pack_id)
    if domain_pack is None:
        return None

    # Adapt the persisted domain.EvidencePack shape to the
    # backend.schemas.evidence_pack.EvidencePack shape the pipeline/agents
    # actually consume (see tests/conftest.py's docstring -- two EvidencePack
    # classes exist in this repo today; this is the intentional bridge).
    return EvidencePack(
        topic=domain_pack.topic,
        claims=[
            Claim(claim=c.get("claim", ""), evidence=c.get("evidence", ""),
                  source=c.get("source", ""), confidence=c.get("confidence", 1.0))
            if isinstance(c, dict) else c
            for c in (domain_pack.claims or [])
        ],
        definitions=domain_pack.definitions or [],
        examples=domain_pack.examples or [],
        limitations=domain_pack.limitations or [],
        controversies=domain_pack.controversies or [],
        open_questions=domain_pack.open_questions or [],
        citations=domain_pack.citations or [],
    )


async def build_evidence_pack(state: PipelineState) -> dict:
    knowledge_pack_id = _resolve_knowledge_pack_id(state)
    if knowledge_pack_id:
        reused = _try_load_reusable_evidence_pack(state["project_id"], knowledge_pack_id)
        if reused is not None:
            print(f"[*] Reusing existing Evidence Pack for knowledge_pack_id={knowledge_pack_id} "
                  f"(job={state.get('content_job_id')}) -- skipping ResearchAgent call")
            return {"evidence_pack": reused}

    print(f"[*] Running Research Agent for: {state['topic']}")
    evidence = await researcher.run(topic=state["topic"], context_chunks=state.get("context_chunks"))
    return {"evidence_pack": evidence}

async def design_learning_structure(state: PipelineState) -> dict:
    print(f"[*] Running Learning Architect for: {state['topic']}")
    l_plan = await architect.run(
        evidence=state["evidence_pack"],
        tracker=state.get("cost_tracker"),
        project_id=state.get("project_id"),
        job_id=state.get("content_job_id"),
    )
    return {"learning_plan": l_plan}

async def create_content_plan(state: PipelineState) -> dict:
    if state.get("content_type") == "course" and state.get("course_outline"):
        # Course generation drives each lesson straight from course_outline
        # (see generate_draft) -- the flat article ContentPlan is unused here,
        # so skip the extra planner LLM call.
        return {"content_plan": None}
    print(f"[*] Running Content Planner for: {state['topic']}")
    c_plan = await planner.run(
        evidence=state["evidence_pack"],
        learning_plan=state["learning_plan"],
        tracker=state.get("cost_tracker"),
        project_id=state.get("project_id"),
        job_id=state.get("content_job_id"),
    )
    return {"content_plan": c_plan}

style_guide_agent = StyleGuideAgent()


async def _write_lesson_body(
    evidence: EvidencePack,
    section_title: str,
    lesson: dict,
    brand_voice: str = "Not specified",
    tracker: Any | None = None,
    project_id: Any | None = None,
    job_id: Any | None = None,
) -> str:
    """
    Runs the Writer Agent for a single course lesson: wraps the lesson's
    planning-time `summary` brief into a one-section ContentPlan (mirroring
    the flat-article path's plan -> draft call) and returns the resulting
    markdown body for that lesson alone.

    `brand_voice`, when set to a real voice fingerprint (see
    StyleGuideAgent.run), is threaded into WriterAgent.run so later lessons
    in the same course stay stylistically consistent with the first one.
    """
    lesson_plan = ContentPlan(
        content_type="course",
        title=lesson.get("title", ""),
        audience="",
        sections=[{
            "title": lesson.get("title", ""),
            "content": lesson.get("summary", ""),
        }],
    )
    draft = await writer.run(
        evidence=evidence,
        plan=lesson_plan,
        brand_voice=brand_voice,
        tracker=tracker,
        project_id=project_id,
        job_id=job_id,
    )
    sections = draft.model_dump().get("sections") or []
    return "\n\n".join(s.get("body_markdown", "") for s in sections)


async def generate_draft(state: PipelineState) -> dict:
    tracker = state.get("cost_tracker")
    project_id = state.get("project_id")
    job_id = state.get("content_job_id")
    course_outline = state.get("course_outline")
    if state.get("content_type") == "course" and course_outline:
        print(f"[*] Running Writer Agent per-lesson (course) for: {state['topic']}")
        sections_out = []
        # Brand voice fingerprint: generated once, from the very first lesson
        # written, then reused verbatim for every subsequent lesson so the
        # whole course reads in one consistent voice instead of drifting
        # lesson-to-lesson.
        brand_voice = "Not specified"
        voice_established = False
        for section in course_outline.get("sections", []) or []:
            lessons_out = []
            for lesson in section.get("lessons", []) or []:
                markdown_body = await _write_lesson_body(
                    state["evidence_pack"],
                    section.get("title", ""),
                    lesson,
                    brand_voice=brand_voice,
                    tracker=tracker,
                    project_id=project_id,
                    job_id=job_id,
                )
                if not voice_established:
                    brand_voice = await style_guide_agent.run(markdown_body)
                    voice_established = True
                image_prompt = lesson.get("title", "") or section.get("title", "")
                lessons_out.append({
                    "title": lesson.get("title", ""),
                    "markdown_body": markdown_body,
                    "sort_order": lesson.get("sort_order", 0),
                    "image_prompt": image_prompt,
                    "image_url": await get_section_image(image_prompt),
                })
            sections_out.append({
                "title": section.get("title", ""),
                "sort_order": section.get("sort_order", 0),
                "lessons": lessons_out,
            })
        draft_json = {
            "title": state["topic"],
            "summary": course_outline.get("summary", ""),
            "sections": sections_out,
        }
        return {"draft_json": draft_json}

    print(f"[*] Running Writer Agent for: {state['topic']}")
    draft = await writer.run(
        evidence=state["evidence_pack"],
        plan=state["content_plan"],
        revision_feedback=state.get("revision_feedback", ""),
        tracker=tracker,
        project_id=project_id,
        job_id=job_id,
    )
    draft_json = draft.model_dump()
    for section in draft_json.get("sections", []) or []:
        image_prompt = section.get("title", "")
        section["image_prompt"] = image_prompt
        section["image_url"] = await get_section_image(image_prompt)
    return {"draft_json": draft_json}

def _flatten_draft_markdown(draft: dict) -> str:
    """
    Flattens a draft dict's `sections` into one plain markdown blob, used as
    the query text for the second (draft-aware) retrieval pass in
    run_fact_check. Mirrors the exact shape logic already duplicated in
    backend/api/routers/generation.py::_flatten_sections_markdown and
    backend/agents/quality_agent.py::_flatten_draft_text (flat article
    sections are `{title, body_markdown}`, course sections are
    `{title, lessons: [{title, markdown_body}, ...]}`) -- kept as a local
    copy rather than importing from the router module, since routers/
    generation.py is not a stable import target for the workflows package
    (router modules pull in FastAPI app wiring) and this file already can't
    cleanly reuse quality_agent's private helper either.
    """
    parts = []
    for section in draft.get("sections") or []:
        title = section.get("title", "")
        lessons = section.get("lessons")
        if lessons is not None:
            parts.append(f"## {title}")
            for lesson in lessons:
                lesson_title = lesson.get("title", "")
                lesson_body = (
                    lesson.get("markdown_body")
                    or lesson.get("markdown")
                    or lesson.get("content")
                    or ""
                )
                parts.append(f"### {lesson_title}\n\n{lesson_body}")
        else:
            body = section.get("body_markdown", "")
            parts.append(f"## {title}\n\n{body}")
    return "\n\n".join(parts)


def _dedupe_chunks(*chunk_lists: list[str] | None) -> list[str]:
    """
    Unions multiple chunk-text lists, deduplicating by exact text while
    preserving first-seen order. Used to union the pipeline's existing
    (web-discovered + approved) context_chunks with a second, draft-aware
    retrieval pass in run_fact_check without dropping either side --
    replacing context_chunks outright would drop PENDING web-discovered
    chunks that similarity_search's APPROVED/AUTO_APPROVED-only filter
    excludes.
    """
    seen: set[str] = set()
    out: list[str] = []
    for chunks in chunk_lists:
        for chunk in chunks or []:
            if chunk not in seen:
                seen.add(chunk)
                out.append(chunk)
    return out


async def run_fact_check(state: PipelineState) -> dict:
    from backend.retrieval import vector_store

    print(f"[*] Fact Checking...")

    draft = state["draft_json"]
    project_id_raw = state.get("project_id")
    knowledge_pack_id_raw = _resolve_knowledge_pack_id(state)

    draft_aware_chunks: list[str] = []
    if project_id_raw:
        try:
            project_id = uuid.UUID(project_id_raw)
            knowledge_pack_id = uuid.UUID(knowledge_pack_id_raw) if knowledge_pack_id_raw else None
            query_text = _flatten_draft_markdown(draft)
            if query_text.strip():
                results = vector_store.similarity_search(
                    project_id,
                    query=query_text,
                    knowledge_pack_id=knowledge_pack_id,
                    top_k=settings.fact_check_context_top_k,
                )
                for chunk in results:
                    draft_aware_chunks.append(f"[Source: {chunk['url']}]\n{chunk['text']}")
        except Exception as e:
            logger.error(f"[run_fact_check] draft-aware retrieval failed: {e}")

    source_chunks = _dedupe_chunks(state.get("context_chunks"), draft_aware_chunks)

    res = await fact_checker.run(
        draft=draft,
        evidence=state["evidence_pack"],
        source_chunks=source_chunks,
        tracker=state.get("cost_tracker"),
        project_id=state.get("project_id"),
        job_id=state.get("content_job_id"),
    )
    return {"is_approved": res.passed, "context_chunks": source_chunks}

async def run_citation_check(state: PipelineState) -> dict:
    if not state.get("is_approved", True): return state
    print(f"[*] Citation Checking...")
    res = await citation_checker.run(
        draft=state["draft_json"],
        tracker=state.get("cost_tracker"),
        project_id=state.get("project_id"),
        job_id=state.get("content_job_id"),
    )
    return {"is_approved": res.passed}

async def quality_check(state: PipelineState) -> dict:
    if not state.get("is_approved", True): return state
    print(f"[*] Quality Auditing...")

    evidence_pack = state.get("evidence_pack")
    # Grounding proxy: the pipeline is considered "grounded" when the
    # Evidence Pack actually carries real source citations rather than
    # having been synthesized purely from the ResearchAgent's own internal
    # knowledge with no external context (see ResearchAgent.run: with no
    # context_chunks, the prompt is told to "rely on internal knowledge
    # safely" and the resulting EvidencePack.citations comes back empty/
    # placeholder). `citations` non-empty is the only signal EvidencePack
    # models today for "were real sources used."
    is_grounded = bool(evidence_pack and evidence_pack.citations)

    report = await auditor.run(
        draft=state["draft_json"],
        source_chunks=state.get("context_chunks"),
        is_grounded=is_grounded,
        tracker=state.get("cost_tracker"),
        project_id=state.get("project_id"),
        job_id=state.get("content_job_id"),
    )
    return {"quality_report": report.model_dump(), "is_approved": report.passed}


def _format_revision_feedback(quality_report: dict | None) -> str:
    """
    Builds a human-readable revision_feedback string from a stored
    QualityReport dict's `issues` and `narrative_voice_issues`, so the next
    generate_draft -> writer.run call actually receives concrete, actionable
    feedback instead of the loop silently discarding the report (the bug
    this closes -- `revise` previously only incremented revisions_count).
    """
    if not quality_report:
        return ""

    lines: list[str] = []

    feedback = quality_report.get("feedback")
    if feedback:
        lines.append(f"- {feedback}")

    for issue in quality_report.get("issues") or []:
        lines.append(f"- {issue}")

    for voice_issue in quality_report.get("narrative_voice_issues") or []:
        section_title = voice_issue.get("section_title", "")
        rule = voice_issue.get("rule_violated", "")
        detail = voice_issue.get("detail", "")
        lines.append(f"- [{section_title}] {rule}: {detail}")

    return "\n".join(lines)


async def revise(state: PipelineState) -> dict:
    print(f"[*] Revisions count incremented: {state['revisions_count']} -> {state['revisions_count'] + 1}")
    revision_feedback = _format_revision_feedback(state.get("quality_report"))
    return {
        "revisions_count": state["revisions_count"] + 1,
        "revision_feedback": revision_feedback,
    }

def should_revise(state: PipelineState) -> str:
    """
    Decides whether to loop back into another revision or proceed to export.

    Bug fix (plan §1/§12): this previously hardcoded the literal `3` as the
    revision cap instead of reading the configurable `settings.max_revisions`
    (which already exists and defaults to 3 -- see backend/configs/settings.py
    and backend/services/system_settings_service.py's OVERRIDABLE_FIELDS,
    the established pattern for reading a live-overridable setting). Reading
    `settings.max_revisions` here means changing that override (via the
    system-settings overlay or MAX_REVISIONS env var) now actually changes
    the revision loop's behavior instead of silently doing nothing.
    """
    if state.get("is_approved", False):
        return "export_package"
    if state["revisions_count"] < settings.max_revisions:
        return "revise"
    return "export_package"

async def export_package(state: PipelineState) -> dict:
    print(f"[+] Final Export Node Reached. Approved: {state.get('is_approved')}")
    return state

def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("research_web", research_web)
    graph.add_node("build_evidence_pack", build_evidence_pack)
    graph.add_node("design_learning_structure", design_learning_structure)
    graph.add_node("create_content_plan", create_content_plan)
    graph.add_node("generate_draft", generate_draft)
    graph.add_node("run_fact_check", run_fact_check)
    graph.add_node("run_citation_check", run_citation_check)
    graph.add_node("quality_check", quality_check)
    graph.add_node("revise", revise)
    graph.add_node("export_package", export_package)

    graph.add_edge("research_web", "build_evidence_pack")
    graph.add_edge("build_evidence_pack", "design_learning_structure")
    graph.add_edge("design_learning_structure", "create_content_plan")
    graph.add_edge("create_content_plan", "generate_draft")
    graph.add_edge("generate_draft", "run_fact_check")
    graph.add_edge("run_fact_check", "run_citation_check")
    graph.add_edge("run_citation_check", "quality_check")
    
    graph.add_conditional_edges("quality_check", should_revise, {
        "export_package": "export_package",
        "revise": "revise"
    })
    
    graph.add_edge("revise", "generate_draft") 
    graph.add_edge("export_package", END)
    
    graph.set_entry_point("research_web")
    return graph.compile()


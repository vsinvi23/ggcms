import asyncio
import logging
import uuid
from typing import TypedDict, Annotated, Optional
from langgraph.graph import StateGraph, END
from backend.schemas.evidence_pack import EvidencePack
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
from backend.services.image_service import generate_placeholder_image

logger = logging.getLogger(__name__)

class PipelineState(TypedDict):
    project_id: str
    topic: str
    knowledge_pack_ids: list[str]
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

async def build_evidence_pack(state: PipelineState) -> dict:
    print(f"[*] Running Research Agent for: {state['topic']}")
    evidence = await researcher.run(topic=state["topic"], context_chunks=state.get("context_chunks"))
    return {"evidence_pack": evidence}

async def design_learning_structure(state: PipelineState) -> dict:
    print(f"[*] Running Learning Architect for: {state['topic']}")
    l_plan = await architect.run(evidence=state["evidence_pack"])
    return {"learning_plan": l_plan}

async def create_content_plan(state: PipelineState) -> dict:
    if state.get("content_type") == "course" and state.get("course_outline"):
        # Course generation drives each lesson straight from course_outline
        # (see generate_draft) -- the flat article ContentPlan is unused here,
        # so skip the extra planner LLM call.
        return {"content_plan": None}
    print(f"[*] Running Content Planner for: {state['topic']}")
    c_plan = await planner.run(evidence=state["evidence_pack"], learning_plan=state["learning_plan"])
    return {"content_plan": c_plan}

async def _write_lesson_body(evidence: EvidencePack, section_title: str, lesson: dict) -> str:
    """
    Runs the Writer Agent for a single course lesson: wraps the lesson's
    planning-time `summary` brief into a one-section ContentPlan (mirroring
    the flat-article path's plan -> draft call) and returns the resulting
    markdown body for that lesson alone.
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
    draft = await writer.run(evidence=evidence, plan=lesson_plan)
    sections = draft.model_dump().get("sections") or []
    return "\n\n".join(s.get("body_markdown", "") for s in sections)


async def generate_draft(state: PipelineState) -> dict:
    course_outline = state.get("course_outline")
    if state.get("content_type") == "course" and course_outline:
        print(f"[*] Running Writer Agent per-lesson (course) for: {state['topic']}")
        sections_out = []
        for section in course_outline.get("sections", []) or []:
            lessons_out = []
            for lesson in section.get("lessons", []) or []:
                markdown_body = await _write_lesson_body(
                    state["evidence_pack"], section.get("title", ""), lesson
                )
                image_prompt = lesson.get("title", "") or section.get("title", "")
                lessons_out.append({
                    "title": lesson.get("title", ""),
                    "markdown_body": markdown_body,
                    "sort_order": lesson.get("sort_order", 0),
                    "image_prompt": image_prompt,
                    "image_url": generate_placeholder_image(image_prompt),
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
    draft = await writer.run(evidence=state["evidence_pack"], plan=state["content_plan"])
    draft_json = draft.model_dump()
    for section in draft_json.get("sections", []) or []:
        image_prompt = section.get("title", "")
        section["image_prompt"] = image_prompt
        section["image_url"] = generate_placeholder_image(image_prompt)
    return {"draft_json": draft_json}

async def run_fact_check(state: PipelineState) -> dict:
    print(f"[*] Fact Checking...")
    res = await fact_checker.run(draft=state["draft_json"], evidence=state["evidence_pack"])
    return {"is_approved": res.passed}

async def run_citation_check(state: PipelineState) -> dict:
    if not state.get("is_approved", True): return state
    print(f"[*] Citation Checking...")
    res = await citation_checker.run(draft=state["draft_json"])
    return {"is_approved": res.passed}

async def quality_check(state: PipelineState) -> dict:
    if not state.get("is_approved", True): return state
    print(f"[*] Quality Auditing...")
    report = await auditor.run(draft=state["draft_json"])
    return {"quality_report": report.model_dump(), "is_approved": report.passed}

async def revise(state: PipelineState) -> dict:
    print(f"[*] Revisions count incremented: {state['revisions_count']} -> {state['revisions_count'] + 1}")
    return {"revisions_count": state["revisions_count"] + 1}

def should_revise(state: PipelineState) -> str:
    if state.get("is_approved", False):
        return "export_package"
    if state["revisions_count"] < 3:
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


import logging

from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.course import CourseOutline, CourseOutlineLesson, CourseOutlineSection
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError, invoke_structured
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "CourseAgent"


async def plan_course_outline(
    topic: str,
    details: str,
    project,
    tracker=None,
    project_id=None,
    job_id=None,
) -> CourseOutline:
    """
    Plans a first-class CourseOutline (sections -> lessons, each lesson
    carrying a `summary` brief rather than a written body) for `topic`,
    appropriate for `project.audience`/`project.levels`.

    This is a preview/plan step only -- callers persist the reviewed
    CourseOutline onto a ContentItem themselves (see
    backend/api/routers/content.py's `/course-outline` endpoint and
    backend/workflows/content_pipeline.py's course generation branch).
    """
    if settings.mock_mode:
        return CourseOutline(
            sections=[
                CourseOutlineSection(
                    title=f"MOCK Section 1 for {topic}",
                    sort_order=0,
                    lessons=[
                        CourseOutlineLesson(
                            title="MOCK Lesson 1",
                            summary="MOCK lesson summary",
                            sort_order=0,
                        ),
                        CourseOutlineLesson(
                            title="MOCK Lesson 2",
                            summary="MOCK lesson summary",
                            sort_order=1,
                        ),
                    ],
                ),
            ]
        )

    llm = get_llm("planner", temperature=0.3)
    structured_llm = llm.with_structured_output(CourseOutline)

    prompt = load_prompt("course_outline").format(
        topic=topic,
        details=details,
        audience=", ".join(project.audience) or "general developers",
        levels=", ".join(project.levels) or "beginner, intermediate, advanced",
    )

    try:
        result = await invoke_structured(
            structured_llm,
            prompt,
            agent_name=AGENT_NAME,
            tracker=tracker,
            project_id=project_id,
            job_id=job_id,
        )
    except Exception as e:
        logger.error(f"[{AGENT_NAME}] course outline planning failed for topic '{topic}': {e}")
        raise AgentExecutionError(AgentError(
            error_type="LLM_CALL_FAILED",
            agent_name=AGENT_NAME,
            message=str(e),
            retryable=True,
        )) from e

    return result

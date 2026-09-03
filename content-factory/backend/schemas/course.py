"""First-class CourseOutline model.

Same shape as `CourseSpecs`/`CourseSection`/`LessonSpec` in
`backend/schemas/sync_payload.py` (the ggcms wire contract), but this is the
*planning*-time structure: each lesson carries a `summary` (a brief the
writer agent expands into full markdown later) instead of the
`markdown_body` field that only exists once a lesson has actually been
written.

Lifecycle:
  1. `POST /api/content/course-outline` calls
     `backend.agents.course_agent.plan_course_outline` to produce a
     `CourseOutline` for operator review. Nothing is persisted yet.
  2. Once the operator proceeds to generate, the reviewed `CourseOutline`
     (as a plain dict) is passed into `POST /api/generate` and attached to
     the resulting `ContentItem.course_outline` *before* any lesson content
     is written (see `backend/workflows/content_pipeline.py`).
  3. The generation pipeline iterates `course_outline.sections[].lessons[]`
     and fills in each lesson's markdown body, storing results into
     `ContentItem.body_json["sections"][...]["lessons"][...]["markdown_body"]`
     -- the same shape `backend/exporters/ggcms_client.py::build_sync_payload`
     already reads.
"""
from pydantic import BaseModel, Field


class CourseOutlineLesson(BaseModel):
    title: str
    summary: str
    sort_order: int = 0


class CourseOutlineSection(BaseModel):
    title: str
    sort_order: int = 0
    lessons: list[CourseOutlineLesson] = Field(default_factory=list)


class CourseOutline(BaseModel):
    sections: list[CourseOutlineSection] = Field(default_factory=list)

"""Pydantic models mirroring the GG-CMS `SyncPayload` wire contract.

Field names below are a field-for-field mirror of the JSON shape documented in
`docs/import-contract/CONTENT_IMPORT_SCHEMA.md` (section 3.1). That document
expresses the contract as Go structs, but the `json:"..."` tags on each field
are the actual wire contract -- these models use the same names so that
`model_dump(mode="json")` produces exactly the JSON GG-CMS expects, with no
aliasing required.
"""
from datetime import datetime

from pydantic import BaseModel, Field


class ContentMetadata(BaseModel):
    title: str
    slug: str
    description: str
    audience: str = ""
    difficulty: str = ""  # beginner | intermediate | advanced
    estimated_minutes: int = 0
    language: str = "en"


class LearningSpecs(BaseModel):
    objectives: list[str] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    skills_gained: list[str] = Field(default_factory=list)


class ArticleSection(BaseModel):
    section_id: str
    title: str
    markdown: str  # pure semantic markdown block


class ArticleBody(BaseModel):
    sections: list[ArticleSection] = Field(default_factory=list)


class LessonSpec(BaseModel):
    title: str
    markdown_body: str
    sort_order: int = 0


class CourseSection(BaseModel):
    title: str
    sort_order: int = 0
    lessons: list[LessonSpec] = Field(default_factory=list)


class CourseSpecs(BaseModel):
    sections: list[CourseSection] = Field(default_factory=list)


class QuizSpec(BaseModel):
    question: str
    options: list[str] = Field(default_factory=list)
    answer: int = 0  # index of the correct option


class ExerciseSpec(BaseModel):
    title: str
    problem_text: str
    code_fixture: str = ""


class ProvenanceSpecs(BaseModel):
    model: str = ""
    provider: str = ""
    agent_version: str = ""
    knowledge_pack_id: str = ""
    generated_at: datetime
    quality_score: float = 0.0


class SyncPayload(BaseModel):
    """Wire-format payload for `POST {ggcms_base_url}/api/import/ingest`."""

    schema_version: str = "2.0"
    content_id: str
    type: str  # "article" or "course"
    metadata: ContentMetadata
    learning: LearningSpecs

    # If type == "article", populate article_body. If type == "course",
    # populate course_details. Mirrors the `omitempty` pointer fields in the
    # Go DTO.
    article_body: ArticleBody | None = None
    course_details: CourseSpecs | None = None

    quizzes: list[QuizSpec] = Field(default_factory=list)
    exercises: list[ExerciseSpec] = Field(default_factory=list)
    provenance: ProvenanceSpecs


class SyncResult(BaseModel):
    """Standard sync response returned by GG-CMS's ingest endpoint."""

    success: bool
    imported_id: str | None = None
    slug: str | None = None
    version: int | None = None
    message: str | None = None

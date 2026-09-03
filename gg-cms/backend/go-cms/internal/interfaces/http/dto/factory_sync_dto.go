package dto

// Package-level DTOs mirroring the Python "content factory" app's Pydantic
// SyncPayload shape (backend/schemas/sync_payload.py in that repo) field-for-field,
// including its exact JSON key names, so payloads bind without translation.

// FactorySyncPayload is the top-level body POSTed to /api/import/ingest.
type FactorySyncPayload struct {
	SchemaVersion string                 `json:"schema_version"`
	ContentID     string                 `json:"content_id"`
	Type          string                 `json:"type"` // "article" | "course"
	Metadata      FactoryContentMetadata `json:"metadata"`
	Learning      FactoryLearningSpecs   `json:"learning"`
	ArticleBody   *FactoryArticleBody    `json:"article_body"`
	CourseDetails *FactoryCourseSpecs    `json:"course_details"`
	Quizzes       []FactoryQuizSpec      `json:"quizzes"`
	Exercises     []FactoryExerciseSpec  `json:"exercises"`
	Provenance    FactoryProvenanceSpecs `json:"provenance"`
}

type FactoryContentMetadata struct {
	Title            string `json:"title"`
	Slug             string `json:"slug"`
	Description      string `json:"description"`
	Audience         string `json:"audience"`
	Difficulty       string `json:"difficulty"`
	EstimatedMinutes int    `json:"estimated_minutes"`
	Language         string `json:"language"`
}

type FactoryLearningSpecs struct {
	Objectives    []string `json:"objectives"`
	Prerequisites []string `json:"prerequisites"`
	SkillsGained  []string `json:"skills_gained"`
}

type FactoryArticleBody struct {
	Sections []FactoryArticleSection `json:"sections"`
}

type FactoryArticleSection struct {
	SectionID string `json:"section_id"`
	Title     string `json:"title"`
	Markdown  string `json:"markdown"`
}

type FactoryCourseSpecs struct {
	Sections []FactoryCourseSection `json:"sections"`
}

type FactoryCourseSection struct {
	Title     string              `json:"title"`
	SortOrder int                 `json:"sort_order"`
	Lessons   []FactoryLessonSpec `json:"lessons"`
}

type FactoryLessonSpec struct {
	Title        string `json:"title"`
	MarkdownBody string `json:"markdown_body"`
	SortOrder    int    `json:"sort_order"`
}

type FactoryQuizSpec struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
	Answer   int      `json:"answer"`
}

type FactoryExerciseSpec struct {
	Title       string `json:"title"`
	ProblemText string `json:"problem_text"`
	CodeFixture string `json:"code_fixture"`
}

type FactoryProvenanceSpecs struct {
	Model           string  `json:"model"`
	Provider        string  `json:"provider"`
	AgentVersion    string  `json:"agent_version"`
	KnowledgePackID string  `json:"knowledge_pack_id"`
	GeneratedAt     string  `json:"generated_at"`
	QualityScore    float64 `json:"quality_score"`
}

// FactorySyncResult is the SyncResult response the factory app expects back.
type FactorySyncResult struct {
	Success    bool    `json:"success"`
	ImportedID *string `json:"imported_id"`
	Slug       *string `json:"slug"`
	Version    *int    `json:"version"`
	Message    *string `json:"message"`
}

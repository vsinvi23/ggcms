# Content Synchronization & Import Contract — V2

This document defines the strict, versioned JSON payload and REST API webhook contract for pushing approved content from the **AI Learning Content Factory (contentAgent)** directly into the **GG-CMS (ggcms)** production database.

---

## 1. Architectural Boundaries & System Flow

The Content Factory is a pure creation, research, and quality-vetting engine. It does **not** serve reading features, user authentication, or learner tracking. 

When a content unit is approved inside the Factory dashboard, it is pushed via a secure webhook directly into GG-CMS:

```text
       AI CONTENT FACTORY (contentAgent)                         GG-CMS (ggcms)
+----------------------------------------------+        +------------------------------+
¦                                              ¦        ¦                              ¦
¦  [Editor Approves Content Unit]              ¦        ¦  [POST /api/import/ingest]   ¦
¦                 ¦                            ¦        ¦               ¦              ¦
¦                 ?                            ¦        ¦               ?              ¦
¦  [Trigger Sync API Webhook] -----------------+-------?¦  [Validate API Secret]       ¦
¦  (Payload: Canonical JSON)                   ¦        ¦               ¦              ¦
¦                                              ¦        ¦               ?              ¦
¦                                              ¦        ¦  [Parse & Map into Tables]   ¦
¦                                              ¦        ¦  - users (authors)           ¦
¦                                              ¦        ¦  - articles / courses        ¦
¦                                              ¦        ¦  - sections / lessons        ¦
¦                                              ¦        ¦               ¦              ¦
¦                                              ¦        ¦               ?              ¦
¦                                              ¦        ¦  [Learner Portal (Active)]   ¦
¦                                              ¦        ¦  - Serves reading view       ¦
¦                                              ¦        ¦  - Handles user highlights  ¦
¦                                              ¦        ¦    and study notes (Mongo)   ¦
+----------------------------------------------+        +------------------------------+
```

---

## 2. Ingest Sync Endpoint Specification (GG-CMS API)

GG-CMS exposes a highly optimized endpoint to process incoming factory structures.

* **Endpoint:** `POST /api/import/ingest`
* **Headers:**
  ```http
  Content-Type: application/json
  X-Factory-Sync-Secret: <shared_cryptographic_token>
  ```

* **Standard Sync Response:**
  ```json
  {
    "success": true,
    "imported_id": "uuid-string-from-ggcms",
    "slug": "ai-coding-agents-practical-guide",
    "version": 1,
    "message": "Content successfully ingested and synchronized"
  }
  ```

---

## 3. Canonical Import JSON Schema (V2.0)

The payload structures are split into two content categories: Standalone Articles and Multi-Section Courses.

### 3.1 Structural Schema Definitions (Pydantic / Go equivalent)

```go
package dto

type SyncPayload struct {
	SchemaVersion string          `json:"schema_version" binding:"required"` // "2.0"
	ContentID     string          `json:"content_id" binding:"required"`     // UUID
	Type          string          `json:"type" binding:"required"`           // "article" or "course"
	Metadata      ContentMetadata `json:"metadata" binding:"required"`
	Learning      LearningSpecs   `json:"learning" binding:"required"`
	
	// If Type == "article", populate Body. If Type == "course", populate Course
	ArticleBody   *ArticleBody    `json:"article_body,omitempty"`
	CourseDetails *CourseSpecs    `json:"course_details,omitempty"`
	
	Quizzes       []QuizSpec      `json:"quizzes"`
	Exercises     []ExerciseSpec  `json:"exercises"`
	Provenance    ProvenanceSpecs `json:"provenance" binding:"required"`
}

type ContentMetadata struct {
	Title            string `json:"title" binding:"required"`
	Slug             string `json:"slug" binding:"required"`
	Description      string `json:"description" binding:"required"`
	Audience         string `json:"audience"`
	Difficulty       string `json:"difficulty"` // beginner, intermediate, advanced
	EstimatedMinutes int    `json:"estimated_minutes"`
	Language         string `json:"language"` // e.g. en
}

type LearningSpecs struct {
	Objectives    []string `json:"objectives"`
	Prerequisites []string `json:"prerequisites"`
	SkillsGained  []string `json:"skills_gained"`
}

type ArticleBody struct {
	Sections []ArticleSection `json:"sections" binding:"required"`
}

type ArticleSection struct {
	SectionID string `json:"section_id"`
	Title     string `json:"title"`
	Markdown  string `json:"markdown"` // Pure semantic markdown block
}

type CourseSpecs struct {
	Sections []CourseSection `json:"sections" binding:"required"`
}

type CourseSection struct {
	Title      string       `json:"title"`
	SortOrder  int          `json:"sort_order"`
	Lessons    []LessonSpec `json:"lessons"`
}

type LessonSpec struct {
	Title        string `json:"title"`
	MarkdownBody string `json:"markdown_body"`
	SortOrder    int    `json:"sort_order"`
}

type QuizSpec struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
	Answer   int      `json:"answer"` // Index of correct option
}

type ExerciseSpec struct {
	Title       string `json:"title"`
	ProblemText string `json:"problem_text"`
	CodeFixture string `json:"code_fixture"`
}

type ProvenanceSpecs struct {
	Model         string    `json:"model"`
	Provider      string    `json:"provider"`
	AgentVersion  string    `json:"agent_version"`
	KnowledgePack string    `json:"knowledge_pack_id"`
	GeneratedAt   time.Time `json:"generated_at"`
	QualityScore  float64   `json:"quality_score"`
}
```

---

## 4. Key Mapping & Table Synchronization inside GG-CMS

When GG-CMS parses the `SyncPayload`, it executes a transaction to map the properties into its PostgreSQL relational schemas:

1. **Category Mapping:** Matches the incoming metadata category name or creates a new node in the hierarchical `categories` table.
2. **Author Mapping:** Creates or maps a default user/group as the designated "Author" of the newly synchronized piece.
3. **Draft Separation:** Inserts the entry with status `DRAFT` first. If the campaign specifies automatic publishing, sets the status directly to `PUBLISHED`.
4. **Learning Objects:** Populates the `tasks` and `enrollments` maps, immediately making the new quizzes and practical exercises visible on learners' dashboards.
5. **Highlighter Readiness:** Because the synchronized paragraphs and section markdown are cleanly structured into distinct segments with semantic HTML elements (`<p>`, `<h2>`), the client-side `web-highlighter` inside GG-CMS can calculate DOM character offsets and anchor selections accurately without breaking!


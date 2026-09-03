package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
)

// FactoryImportHandler handles machine-to-machine content ingest from the Python
// "content factory" app. Unlike ImportHandler (human-driven, JWT-protected), this
// endpoint is protected only by the X-Factory-Sync-Secret header (see
// middleware.FactorySecret) since the factory has no user session.
type FactoryImportHandler struct {
	cmsService     cmssvc.Service
	sectionService sectionsvc.Service
	lessonService  lessonsvc.Service
	userService    usersvc.Service
	// systemUserEmail identifies the account attributed as CreatedByID for
	// factory-ingested content (created_by_id is NOT NULL / FK'd to users.id,
	// so we need a real, already-seeded user — the master admin by default).
	systemUserEmail string
}

func NewFactoryImportHandler(cmsService cmssvc.Service, sectionService sectionsvc.Service, lessonService lessonsvc.Service, userService usersvc.Service, systemUserEmail string) *FactoryImportHandler {
	return &FactoryImportHandler{
		cmsService:      cmsService,
		sectionService:  sectionService,
		lessonService:   lessonService,
		userService:     userService,
		systemUserEmail: systemUserEmail,
	}
}

// ingestResult is the internal, transport-agnostic result of ingesting a payload.
type ingestResult struct {
	PublicID string
	Slug     string
	Version  int
}

// POST /api/import/ingest
// Body: FactorySyncPayload (see dto/factory_sync_dto.go). Protected by
// middleware.FactorySecret, NOT by JWT auth.
func (h *FactoryImportHandler) Ingest(c *gin.Context) {
	var payload dto.FactorySyncPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		msg := err.Error()
		c.JSON(400, dto.FactorySyncResult{Success: false, Message: &msg})
		return
	}

	systemUserID, err := h.resolveSystemUserID(c.Request.Context())
	if err != nil {
		msg := "factory ingest is misconfigured: " + err.Error()
		log.Printf("[factory-import] %s", msg)
		c.JSON(500, dto.FactorySyncResult{Success: false, Message: &msg})
		return
	}

	result, err := ingestSyncPayload(c.Request.Context(), h.cmsService, h.sectionService, h.lessonService, systemUserID, payload)
	if err != nil {
		msg := err.Error()
		log.Printf("[factory-import] ingest failed for content_id=%s: %v", payload.ContentID, err)
		c.JSON(400, dto.FactorySyncResult{Success: false, Message: &msg})
		return
	}

	version := result.Version
	c.JSON(201, dto.FactorySyncResult{
		Success:    true,
		ImportedID: &result.PublicID,
		Slug:       &result.Slug,
		Version:    &version,
	})
}

// resolveSystemUserID looks up the account used as CreatedByID for factory-ingested
// content. Looked up per-request (cheap, indexed) rather than cached at construction
// time so that changing the configured email/admin doesn't require a restart.
func (h *FactoryImportHandler) resolveSystemUserID(ctx context.Context) (uint, error) {
	if h.systemUserEmail == "" {
		return 0, fmt.Errorf("no system user email configured")
	}
	user, err := h.userService.GetByEmail(ctx, h.systemUserEmail)
	if err != nil {
		return 0, fmt.Errorf("system user %q not found: %w", h.systemUserEmail, err)
	}
	return user.ID, nil
}

// ingestSyncPayload maps a factory SyncPayload onto GG-CMS's CMS/section/lesson
// domain and creates the corresponding DRAFT Article or Course. Kept separate from
// the HTTP/secret-check layer so other future import sources can reuse it.
func ingestSyncPayload(ctx context.Context, cmsService cmssvc.Service, sectionService sectionsvc.Service, lessonService lessonsvc.Service, createdByID uint, payload dto.FactorySyncPayload) (*ingestResult, error) {
	if payload.ContentID == "" {
		return nil, fmt.Errorf("content_id is required")
	}
	if payload.Metadata.Title == "" {
		return nil, fmt.Errorf("metadata.title is required")
	}

	var description *string
	if payload.Metadata.Description != "" {
		description = &payload.Metadata.Description
	}

	extras := factoryExtrasBlock(payload)

	switch payload.Type {
	case "article":
		body := articleBodyFromSections(payload.ArticleBody)
		body = appendExtrasBlock(body, extras)
		bodyPtr := &body

		created, err := cmsService.Create(ctx, cmssvc.CreateRequest{
			Type:        entity.CMSTypeArticle,
			Title:       payload.Metadata.Title,
			Description: description,
			Body:        bodyPtr,
			CreatedByID: createdByID,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to create article: %w", err)
		}
		article, ok := created.(*entity.Article)
		if !ok {
			return nil, fmt.Errorf("unexpected result type from cms create")
		}
		return &ingestResult{PublicID: article.PublicID, Slug: article.Slug, Version: article.Version}, nil

	case "course":
		// Course body carries only the top-level metadata + provenance/quiz/exercise
		// extras — the actual curriculum lives in Section/Lesson rows created below.
		body := extras
		var bodyPtr *string
		if body != "" {
			bodyPtr = &body
		}

		created, err := cmsService.Create(ctx, cmssvc.CreateRequest{
			Type:        entity.CMSTypeCourse,
			Title:       payload.Metadata.Title,
			Description: description,
			Body:        bodyPtr,
			CreatedByID: createdByID,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to create course: %w", err)
		}
		course, ok := created.(*entity.Course)
		if !ok {
			return nil, fmt.Errorf("unexpected result type from cms create")
		}

		if payload.CourseDetails != nil {
			courseID := course.ID
			for _, sec := range payload.CourseDetails.Sections {
				createdSection, secErr := sectionService.Create(ctx, sectionsvc.CreateRequest{
					Title:    sec.Title,
					Order:    sec.SortOrder,
					CourseID: &courseID,
				})
				if secErr != nil {
					return nil, fmt.Errorf("failed to create section %q: %w", sec.Title, secErr)
				}
				sectionID := createdSection.ID
				for _, lesson := range sec.Lessons {
					content := lesson.MarkdownBody
					if _, lesErr := lessonService.Create(ctx, lessonsvc.CreateRequest{
						Title:     lesson.Title,
						Type:      entity.LessonTypeText,
						Content:   &content,
						Order:     lesson.SortOrder,
						SectionID: &sectionID,
					}); lesErr != nil {
						return nil, fmt.Errorf("failed to create lesson %q: %w", lesson.Title, lesErr)
					}
				}
			}
		}

		return &ingestResult{PublicID: course.PublicID, Slug: course.Slug, Version: course.Version}, nil

	default:
		return nil, fmt.Errorf("unsupported type %q (expected \"article\" or \"course\")", payload.Type)
	}
}

// articleBodyFromSections joins article_body.sections into a single markdown Body,
// each section rendered as "## {title}\n\n{markdown}" separated by a blank line.
func articleBodyFromSections(articleBody *dto.FactoryArticleBody) string {
	if articleBody == nil || len(articleBody.Sections) == 0 {
		return ""
	}
	parts := make([]string, 0, len(articleBody.Sections))
	for _, sec := range articleBody.Sections {
		parts = append(parts, fmt.Sprintf("## %s\n\n%s", sec.Title, sec.Markdown))
	}
	return strings.Join(parts, "\n\n")
}

// factoryExtrasBlock JSON-marshals quizzes/exercises/provenance (none of which have
// dedicated columns) into a clearly-delimited block appended to Body. Lossy but
// functional — avoids a schema migration for factory-only metadata.
func factoryExtrasBlock(payload dto.FactorySyncPayload) string {
	if len(payload.Quizzes) == 0 && len(payload.Exercises) == 0 && isZeroProvenance(payload.Provenance) {
		return ""
	}
	extras := struct {
		SchemaVersion string                     `json:"schema_version"`
		Learning      dto.FactoryLearningSpecs   `json:"learning,omitempty"`
		Quizzes       []dto.FactoryQuizSpec      `json:"quizzes,omitempty"`
		Exercises     []dto.FactoryExerciseSpec  `json:"exercises,omitempty"`
		Provenance    dto.FactoryProvenanceSpecs `json:"provenance"`
	}{
		SchemaVersion: payload.SchemaVersion,
		Learning:      payload.Learning,
		Quizzes:       payload.Quizzes,
		Exercises:     payload.Exercises,
		Provenance:    payload.Provenance,
	}
	b, err := json.MarshalIndent(extras, "", "  ")
	if err != nil {
		return ""
	}
	return string(b)
}

func isZeroProvenance(p dto.FactoryProvenanceSpecs) bool {
	return p.Model == "" && p.Provider == "" && p.AgentVersion == "" && p.KnowledgePackID == "" && p.GeneratedAt == "" && p.QualityScore == 0
}

func appendExtrasBlock(body, extras string) string {
	if extras == "" {
		return body
	}
	const delim = "\n\n<!-- factory-sync-extras\n%s\n-->\n"
	return body + fmt.Sprintf(delim, extras)
}

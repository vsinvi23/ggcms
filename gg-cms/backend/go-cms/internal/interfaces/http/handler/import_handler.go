package handler

import (
	"context"
	"fmt"
	"io"
	"log"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/application/importer"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type ImportHandler struct {
	cmsService     cmssvc.Service
	taskService    tasksvc.Service
	sectionService sectionsvc.Service
	lessonService  lessonsvc.Service
}

func NewImportHandler(cmsService cmssvc.Service, taskService tasksvc.Service, sectionService sectionsvc.Service, lessonService lessonsvc.Service) *ImportHandler {
	return &ImportHandler{
		cmsService:     cmsService,
		taskService:    taskService,
		sectionService: sectionService,
		lessonService:  lessonService,
	}
}

// POST /api/import/preview
// Accepts multipart/form-data with field "files" (multiple). Returns parsed preview items.
func (h *ImportHandler) Preview(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		response.BadRequest(c, "expected multipart/form-data with a 'files' field")
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		response.BadRequest(c, "no files uploaded")
		return
	}

	var items []dto.ImportPreviewItem
	for _, fh := range files {
		f, openErr := fh.Open()
		if openErr != nil {
			items = append(items, dto.ImportPreviewItem{
				FileName: fh.Filename,
				Index:    len(items),
				Valid:    false,
				Error:    "could not open file",
			})
			continue
		}
		content, readErr := io.ReadAll(f)
		f.Close()
		if readErr != nil {
			items = append(items, dto.ImportPreviewItem{
				FileName: fh.Filename,
				Index:    len(items),
				Valid:    false,
				Error:    "could not read file content",
			})
			continue
		}

		parsed := importer.Parse(fh.Filename, content)
		for _, p := range parsed {
			items = append(items, dto.ImportPreviewItem{
				FileName:     p.FileName,
				Index:        len(items),
				Type:         p.Type,
				Title:        p.Title,
				Description:  p.Description,
				Body:         p.Body,
				BodyFormat:   p.BodyFormat,
				CategorySlug: p.CategorySlug,
				ArticleType:  p.ArticleType,
				CourseType:   p.CourseType,
				Tags:         p.Tags,
				Sections:     mapParsedSections(p.Sections),
				Valid:        p.Valid,
				Error:        p.Error,
			})
		}
	}

	valid := 0
	for _, it := range items {
		if it.Valid {
			valid++
		}
	}

	response.OK(c, dto.ImportPreviewResponse{
		Items:   items,
		Total:   len(items),
		Valid:   valid,
		Invalid: len(items) - valid,
	})
}

// POST /api/import/confirm
// Creates all submitted items as DRAFT. Authenticated user becomes the author.
func (h *ImportHandler) Confirm(c *gin.Context) {
	var req dto.ImportConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if len(req.Items) == 0 {
		response.BadRequest(c, "no items to import")
		return
	}

	userID := middleware.GetUserID(c)
	results := make([]dto.ImportConfirmResult, 0, len(req.Items))

	for _, item := range req.Items {
		var desc, body, artType, courseType *string
		if item.Description != "" {
			desc = &item.Description
		}
		if item.Body != "" {
			body = &item.Body
		}
		if item.ArticleType != "" {
			artType = &item.ArticleType
		}
		if item.CourseType != "" {
			courseType = &item.CourseType
		}

		result, err := h.cmsService.Create(c.Request.Context(), cmssvc.CreateRequest{
			Type:        entity.CMSType(item.Type),
			Title:       item.Title,
			Description: desc,
			Body:        body,
			ArticleType: artType,
			CourseType:  courseType,
			CategoryID:  item.CategoryID,
			CreatedByID: userID,
		})
		if err != nil {
			results = append(results, dto.ImportConfirmResult{
				Title:   item.Title,
				Success: false,
				Error:   err.Error(),
			})
			continue
		}

		taskType := entity.TaskTypeArticle
		if entity.CMSType(item.Type) == entity.CMSTypeCourse {
			taskType = entity.TaskTypeCourse
		}
		var contentID uint
		if entity.CMSType(item.Type) == entity.CMSTypeCourse {
			if course, ok := result.(*entity.Course); ok {
				contentID = course.ID
			}
		} else {
			if article, ok := result.(*entity.Article); ok {
				contentID = article.ID
			}
		}
		if contentID != 0 {
			if err := h.taskService.UpsertOwnerTask(c.Request.Context(), contentID, taskType, item.Title, userID, "draft"); err != nil {
				log.Printf("[import] Confirm: failed to upsert owner task for %s id=%d: %v", item.Type, contentID, err)
			}
		}

		var structureWarning string
		if entity.CMSType(item.Type) == entity.CMSTypeCourse && contentID != 0 && len(item.Sections) > 0 {
			if err := h.createCourseStructure(c.Request.Context(), contentID, item.Sections); err != nil {
				structureWarning = fmt.Sprintf("course created but structure import failed: %v", err)
				log.Printf("[import] Confirm: %s (course id=%d)", structureWarning, contentID)
			}
		}

		auditAction := "article.created"
		if entity.CMSType(item.Type) == entity.CMSTypeCourse {
			auditAction = "course.created"
		}
		middleware.LogAudit(c, auditAction, item.Type, fmt.Sprint(contentID), item.Title, map[string]interface{}{"source": "bulk_import"})

		results = append(results, dto.ImportConfirmResult{
			Title:   item.Title,
			ID:      contentID,
			Success: true,
			Error:   structureWarning,
		})
	}

	created, failed := 0, 0
	for _, r := range results {
		if r.Success {
			created++
		} else {
			failed++
		}
	}

	response.OK(c, dto.ImportConfirmResponse{
		Created: created,
		Failed:  failed,
		Results: results,
	})
}

// createCourseStructure creates the Sections/Lessons for an imported course, mirroring
// the pattern used by FactoryImportHandler.ingestSyncPayload for machine-ingested courses.
// Best-effort: the course shell already exists by the time this is called, so a failure
// here is reported as a warning rather than rolling back the course creation.
func (h *ImportHandler) createCourseStructure(ctx context.Context, courseID uint, sections []dto.ImportSectionItem) error {
	for _, sec := range sections {
		createdSection, err := h.sectionService.Create(ctx, sectionsvc.CreateRequest{
			Title:    sec.Title,
			Order:    sec.Order,
			CourseID: &courseID,
		})
		if err != nil {
			return fmt.Errorf("failed to create section %q: %w", sec.Title, err)
		}
		sectionID := createdSection.ID
		for _, lesson := range sec.Lessons {
			lessonType := entity.LessonType(lesson.Type)
			if lessonType == "" {
				lessonType = entity.LessonTypeText
			}
			content := lesson.Body
			if _, err := h.lessonService.Create(ctx, lessonsvc.CreateRequest{
				Title:     lesson.Title,
				Type:      lessonType,
				Content:   &content,
				Duration:  lesson.Duration,
				Order:     lesson.Order,
				SectionID: &sectionID,
			}); err != nil {
				return fmt.Errorf("failed to create lesson %q: %w", lesson.Title, err)
			}
		}
	}
	return nil
}

func mapParsedSections(sections []importer.ParsedSection) []dto.ImportSectionItem {
	if len(sections) == 0 {
		return nil
	}
	out := make([]dto.ImportSectionItem, len(sections))
	for i, sec := range sections {
		lessons := make([]dto.ImportLessonItem, len(sec.Lessons))
		for j, l := range sec.Lessons {
			lessons[j] = dto.ImportLessonItem{
				Title:    l.Title,
				Type:     l.Type,
				Duration: l.Duration,
				Order:    l.Order,
				Body:     l.Body,
			}
		}
		out[i] = dto.ImportSectionItem{Title: sec.Title, Order: sec.Order, Lessons: lessons}
	}
	return out
}

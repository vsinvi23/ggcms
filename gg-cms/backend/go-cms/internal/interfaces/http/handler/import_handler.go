package handler

import (
	"fmt"
	"io"
	"log"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/application/importer"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type ImportHandler struct {
	cmsService  cmssvc.Service
	taskService tasksvc.Service
}

func NewImportHandler(cmsService cmssvc.Service, taskService tasksvc.Service) *ImportHandler {
	return &ImportHandler{cmsService: cmsService, taskService: taskService}
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
				CategorySlug: p.CategorySlug,
				ArticleType:  p.ArticleType,
				CourseType:   p.CourseType,
				Tags:         p.Tags,
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

		auditAction := "article.created"
		if entity.CMSType(item.Type) == entity.CMSTypeCourse {
			auditAction = "course.created"
		}
		middleware.LogAudit(c, auditAction, item.Type, fmt.Sprint(contentID), item.Title, map[string]interface{}{"source": "bulk_import"})

		results = append(results, dto.ImportConfirmResult{
			Title:   item.Title,
			ID:      contentID,
			Success: true,
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

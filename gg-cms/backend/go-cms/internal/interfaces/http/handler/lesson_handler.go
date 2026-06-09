package handler

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type LessonHandler struct {
	service lessonsvc.Service
}

func NewLessonHandler(svc lessonsvc.Service) *LessonHandler {
	return &LessonHandler{service: svc}
}

// GET /api/lessons?filters[section][id][$eq]=sectionId
func (h *LessonHandler) GetAll(c *gin.Context) {
	sectionIDStr := c.Query("filters[section][id][$eq]")
	if sectionIDStr == "" {
		response.BadRequest(c, "filters[section][id][$eq] is required")
		return
	}
	sectionID64, err := strconv.ParseUint(sectionIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid section ID")
		return
	}
	lessons, err := h.service.GetBySectionID(c.Request.Context(), uint(sectionID64))
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.LessonResponse, len(lessons))
	for i, l := range lessons {
		result[i] = mapLessonToDTO(l)
	}
	response.OK(c, result)
}

// POST /api/lessons
func (h *LessonHandler) Create(c *gin.Context) {
	var req dto.CreateLessonRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	var sectionID *uint
	if req.Data.Section != nil {
		sectionID = &req.Data.Section.ID
	}
	lessonType := entity.LessonType(req.Data.Type)
	if lessonType == "" {
		lessonType = entity.LessonTypeText
	}
	lesson, err := h.service.Create(c.Request.Context(), lessonsvc.CreateRequest{
		Title:     req.Data.Title,
		Type:      lessonType,
		Content:   req.Data.Content,
		Duration:  req.Data.Duration,
		Order:     req.Data.Order,
		SectionID: sectionID,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapLessonToDTO(lesson))
	middleware.LogAudit(c, "lesson.created", "lesson", fmt.Sprint(lesson.ID), lesson.Title, nil)
}

// PUT /api/lessons/:id
func (h *LessonHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid lesson ID")
		return
	}
	var req dto.UpdateLessonRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	var lessonType *entity.LessonType
	if req.Data.Type != nil {
		lt := entity.LessonType(*req.Data.Type)
		lessonType = &lt
	}
	lesson, err := h.service.Update(c.Request.Context(), id, lessonsvc.UpdateRequest{
		Title:    req.Data.Title,
		Type:     lessonType,
		Content:  req.Data.Content,
		Duration: req.Data.Duration,
		Order:    req.Data.Order,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapLessonToDTO(lesson))
	middleware.LogAudit(c, "lesson.updated", "lesson", fmt.Sprint(lesson.ID), lesson.Title, nil)
}

// DELETE /api/lessons/:id
func (h *LessonHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid lesson ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "lesson deleted"})
	middleware.LogAudit(c, "lesson.deleted", "lesson", fmt.Sprint(id), "", nil)
}

func mapLessonToDTO(l *entity.Lesson) dto.LessonResponse {
	return dto.LessonResponse{
		ID:        l.ID,
		Title:     l.Title,
		Type:      string(l.Type),
		Content:   l.Content,
		Duration:  l.Duration,
		Order:     l.Order,
		SectionID: l.SectionID,
	}
}

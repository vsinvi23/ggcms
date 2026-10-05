package handler

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type LessonHandler struct {
	service    lessonsvc.Service
	sectionSvc sectionsvc.Service
	cmsSvc     cmssvc.Service
}

func NewLessonHandler(svc lessonsvc.Service, sectionSvc sectionsvc.Service, cmsSvc cmssvc.Service) *LessonHandler {
	return &LessonHandler{service: svc, sectionSvc: sectionSvc, cmsSvc: cmsSvc}
}

// checkParentCourseOwnership verifies the caller is an admin or owns the course
// that a lesson's section belongs to (lesson → section → course). Returns false
// (and writes the HTTP response) if denied.
func (h *LessonHandler) checkParentCourseOwnership(c *gin.Context, lesson *entity.Lesson) bool {
	if middleware.IsAdmin(c) {
		return true
	}
	if lesson.SectionID == nil {
		response.Forbidden(c, "cannot edit a lesson with no parent section")
		return false
	}
	sec, err := h.sectionSvc.GetByID(c.Request.Context(), *lesson.SectionID)
	if err != nil || sec.CourseID == nil {
		response.Forbidden(c, "cannot edit this lesson")
		return false
	}
	course, err := h.cmsSvc.GetByID(c.Request.Context(), *sec.CourseID, entity.CMSTypeCourse)
	if err != nil {
		response.Forbidden(c, "cannot edit this lesson")
		return false
	}
	_, ownerID := extractCMSTitleAndOwner(course, entity.CMSTypeCourse)
	if ownerID != middleware.GetUserID(c) {
		response.Forbidden(c, "cannot edit a lesson belonging to a course you do not own")
		return false
	}
	return true
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
	if !h.checkParentCourseOwnership(c, &entity.Lesson{SectionID: sectionID}) {
		return
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
	existing, fetchErr := h.service.GetByID(c.Request.Context(), id)
	if fetchErr != nil {
		response.NotFound(c, "lesson not found")
		return
	}
	if !h.checkParentCourseOwnership(c, existing) {
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
	existing, fetchErr := h.service.GetByID(c.Request.Context(), id)
	if fetchErr != nil {
		response.NotFound(c, "lesson not found")
		return
	}
	if !h.checkParentCourseOwnership(c, existing) {
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

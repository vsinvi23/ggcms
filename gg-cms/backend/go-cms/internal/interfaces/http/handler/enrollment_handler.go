package handler

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	enrollmentsvc "github.com/serenya/go-cms/internal/application/enrollment"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type EnrollmentHandler struct {
	service enrollmentsvc.Service
}

func NewEnrollmentHandler(svc enrollmentsvc.Service) *EnrollmentHandler {
	return &EnrollmentHandler{service: svc}
}

// GET /api/enrollments?filters[course][id][$eq]=courseId
func (h *EnrollmentHandler) GetAll(c *gin.Context) {
	userID := middleware.GetUserID(c)
	courseIDStr := c.Query("filters[course][id][$eq]")

	if courseIDStr != "" {
		courseID64, err := strconv.ParseUint(courseIDStr, 10, 64)
		if err != nil {
			response.BadRequest(c, "invalid course ID")
			return
		}
		enrollment, err := h.service.GetByUserAndCourse(c.Request.Context(), userID, uint(courseID64))
		if err != nil {
			// Not enrolled — return empty array
			response.OK(c, []dto.EnrollmentResponse{})
			return
		}
		response.OK(c, []dto.EnrollmentResponse{mapEnrollmentToDTO(enrollment)})
		return
	}

	enrollments, err := h.service.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.EnrollmentResponse, len(enrollments))
	for i, e := range enrollments {
		result[i] = mapEnrollmentToDTO(e)
	}
	response.OK(c, result)
}

// POST /api/enrollments
func (h *EnrollmentHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req dto.CreateEnrollmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	courseID := extractCourseID(req.Data.Course)
	if courseID == 0 {
		response.BadRequest(c, "course ID is required")
		return
	}

	enrollment, err := h.service.Enroll(c.Request.Context(), userID, courseID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapEnrollmentToDTO(enrollment))
}

// PUT /api/enrollments/:id
func (h *EnrollmentHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid enrollment ID")
		return
	}
	var req dto.UpdateEnrollmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	progress := 0.0
	if req.Data.Progress != nil {
		progress = *req.Data.Progress
	}

	var status *entity.EnrollmentStatus
	if req.Data.Status != nil {
		s := entity.EnrollmentStatus(*req.Data.Status)
		status = &s
	}

	lessonIDs := make([]uint, len(req.Data.CompletedLessons))
	for i, l := range req.Data.CompletedLessons {
		lessonIDs[i] = l.ID
	}

	enrollment, err := h.service.UpdateProgress(c.Request.Context(), id, progress, status, lessonIDs)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapEnrollmentToDTO(enrollment))
}

func mapEnrollmentToDTO(e *entity.Enrollment) dto.EnrollmentResponse {
	r := dto.EnrollmentResponse{
		ID:       e.ID,
		Status:   string(e.Status),
		Progress: e.Progress,
	}
	if e.EnrolledAt != nil {
		s := e.EnrolledAt.Format(time.RFC3339)
		r.EnrolledAt = &s
	}
	if e.LastAccessedAt != nil {
		s := e.LastAccessedAt.Format(time.RFC3339)
		r.LastAccessedAt = &s
	}
	if e.CompletedAt != nil {
		s := e.CompletedAt.Format(time.RFC3339)
		r.CompletedAt = &s
	}
	if e.Course.ID != 0 {
		r.Course = &dto.CourseRef{ID: e.Course.ID, Title: e.Course.Title}
	}
	completedLessons := make([]dto.IDRef, len(e.CompletedLessons))
	for i, l := range e.CompletedLessons {
		completedLessons[i] = dto.IDRef{ID: l.ID}
	}
	r.CompletedLessons = completedLessons
	return r
}

// extractCourseID handles both int and {id: N} formats for the course field.
func extractCourseID(v interface{}) uint {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return uint(val)
	case map[string]interface{}:
		if id, ok := val["id"]; ok {
			if f, ok := id.(float64); ok {
				return uint(f)
			}
		}
	case json.Number:
		n, _ := val.Int64()
		return uint(n)
	}
	return 0
}

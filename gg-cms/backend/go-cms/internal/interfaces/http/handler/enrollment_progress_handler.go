package handler

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	enrollmentsvc "github.com/serenya/go-cms/internal/application/enrollment"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

func respondEnrollmentError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, enrollmentsvc.ErrCourseNotFound), errors.Is(err, enrollmentsvc.ErrNotEnrolled), errors.Is(err, enrollmentsvc.ErrPathNotFound):
		response.NotFound(c, err.Error())
	case errors.Is(err, enrollmentsvc.ErrLessonNotInCourse), errors.Is(err, enrollmentsvc.ErrInvalidStatus), errors.Is(err, enrollmentsvc.ErrSyncTooLarge):
		response.BadRequest(c, err.Error())
	default:
		response.InternalError(c, err.Error())
	}
}

// GET /api/enrollments/me/:courseId/resume
func (h *EnrollmentHandler) Resume(c *gin.Context) {
	courseID, err := parseID(c, "courseId")
	if err != nil || courseID == 0 {
		response.BadRequest(c, "invalid course ID")
		return
	}
	r, err := h.service.GetResume(c.Request.Context(), middleware.GetUserID(c), courseID)
	if err != nil {
		respondEnrollmentError(c, err)
		return
	}
	out := dto.ResumeResponse{
		EnrollmentID:       r.EnrollmentID,
		CourseID:           r.CourseID,
		Status:             string(r.Status),
		Progress:           r.Progress,
		TotalLessons:       r.TotalLessons,
		CompletedCount:     r.CompletedCount,
		CompletedLessonIDs: r.CompletedLessonIDs,
		LastLessonID:       r.LastLessonID,
		AwaitingAssessment: r.AwaitingAssessment,
		AssessmentID:       r.AssessmentID,
	}
	if r.NextLesson != nil {
		out.NextLesson = &dto.ResumeLesson{ID: r.NextLesson.ID, Title: r.NextLesson.Title, Type: string(r.NextLesson.Type), SectionID: r.NextLesson.SectionID}
	}
	response.OK(c, out)
}

// POST /api/enrollments/sync-local
func (h *EnrollmentHandler) SyncLocal(c *gin.Context) {
	var req dto.SyncLocalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if len(req.Items) > enrollmentsvc.MaxSyncCourses {
		response.BadRequest(c, enrollmentsvc.ErrSyncTooLarge.Error())
		return
	}
	items := make([]enrollmentsvc.SyncItem, len(req.Items))
	for i, it := range req.Items {
		items[i] = enrollmentsvc.SyncItem{CourseID: it.CourseID, CompletedLessonIDs: it.CompletedLessonIDs}
	}
	results, err := h.service.SyncLocal(c.Request.Context(), middleware.GetUserID(c), items)
	if err != nil {
		respondEnrollmentError(c, err)
		return
	}
	out := make([]dto.SyncLocalResult, len(results))
	for i, r := range results {
		out[i] = dto.SyncLocalResult{CourseID: r.CourseID, Accepted: r.Accepted, Rejected: r.Rejected, Progress: r.Progress, Status: r.Status, Error: r.Error}
	}
	response.OK(c, out)
}

// GET /api/learning-paths/:id/progress
func (h *EnrollmentHandler) PathProgress(c *gin.Context) {
	p, err := h.service.GetPathProgress(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		respondEnrollmentError(c, err)
		return
	}
	out := dto.PathProgressResponse{
		PathID: p.PathID, Title: p.Title, TotalCourses: p.TotalCourses, CompletedCourses: p.CompletedCourses,
		Progress: p.Progress, NextCourseID: p.NextCourseID, Courses: make([]dto.PathCourseProgressResponse, len(p.Courses)),
	}
	for i, cp := range p.Courses {
		row := dto.PathCourseProgressResponse{CourseID: cp.CourseID, Title: cp.Title, SortOrder: cp.SortOrder, Enrolled: cp.Enrolled, Status: cp.Status, Progress: cp.Progress}
		if cp.CompletedAt != nil {
			s := cp.CompletedAt.Format(time.RFC3339)
			row.CompletedAt = &s
		}
		out.Courses[i] = row
	}
	response.OK(c, out)
}

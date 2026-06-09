package handler

import (
	"fmt"

	"github.com/gin-gonic/gin"
	lpsvc "github.com/serenya/go-cms/internal/application/learningpath"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type LearningPathHandler struct {
	service lpsvc.Service
}

func NewLearningPathHandler(svc lpsvc.Service) *LearningPathHandler {
	return &LearningPathHandler{service: svc}
}

type learningPathCourseResponse struct {
	CourseID  uint `json:"courseId"`
	SortOrder int  `json:"sortOrder"`
}

type learningPathResponse struct {
	ID          uint                         `json:"id"`
	Kind        string                       `json:"kind"`
	Title       string                       `json:"title"`
	Description string                       `json:"description"`
	CreatedByID uint                         `json:"createdById"`
	CourseCount int                          `json:"courseCount"`
	Courses     []learningPathCourseResponse `json:"courses"`
	CreatedAt   string                       `json:"createdAt"`
	UpdatedAt   string                       `json:"updatedAt"`
}

func mapLearningPath(lp *entity.LearningPath) learningPathResponse {
	courses := make([]learningPathCourseResponse, len(lp.Courses))
	for i, c := range lp.Courses {
		courses[i] = learningPathCourseResponse{CourseID: c.CourseID, SortOrder: c.SortOrder}
	}
	return learningPathResponse{
		ID:          lp.ID,
		Kind:        lp.Kind,
		Title:       lp.Title,
		Description: lp.Description,
		CreatedByID: lp.CreatedByID,
		CourseCount: len(lp.Courses),
		Courses:     courses,
		CreatedAt:   lp.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   lp.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// GET /api/learning-paths?kind=LEARNING_PLAN
func (h *LearningPathHandler) GetAll(c *gin.Context) {
	kind := c.Query("kind")
	paths, err := h.service.List(c.Request.Context(), kind)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]learningPathResponse, len(paths))
	for i, lp := range paths {
		items[i] = mapLearningPath(lp)
	}
	response.OK(c, items)
}

// GET /api/learning-paths/:id
func (h *LearningPathHandler) GetByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	lp, err := h.service.GetByID(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "learning path not found")
		return
	}
	response.OK(c, mapLearningPath(lp))
}

// POST /api/learning-paths  (admin only)
func (h *LearningPathHandler) Create(c *gin.Context) {
	var req struct {
		Kind        string `json:"kind" binding:"required"`
		Title       string `json:"title" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	userID := middleware.GetUserID(c)
	lp, err := h.service.Create(c.Request.Context(), lpsvc.CreateRequest{
		Kind:        req.Kind,
		Title:       req.Title,
		Description: req.Description,
		CreatedByID: userID,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapLearningPath(lp))
	middleware.LogAudit(c, "learning_path.created", "learning_path", fmt.Sprint(lp.ID), lp.Title, map[string]interface{}{"kind": lp.Kind})
}

// PUT /api/learning-paths/:id  (admin only)
func (h *LearningPathHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	var req struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	lp, err := h.service.Update(c.Request.Context(), id, lpsvc.UpdateRequest{
		Title:       req.Title,
		Description: req.Description,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapLearningPath(lp))
	middleware.LogAudit(c, "learning_path.updated", "learning_path", fmt.Sprint(lp.ID), lp.Title, nil)
}

// DELETE /api/learning-paths/:id  (admin only)
func (h *LearningPathHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "deleted"})
	middleware.LogAudit(c, "learning_path.deleted", "learning_path", fmt.Sprint(id), "", nil)
}

// PUT /api/learning-paths/:id/courses  (admin only)
// Body: {"courses": [{"courseId": 1, "sortOrder": 0}, ...]}
func (h *LearningPathHandler) SetCourses(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	var req struct {
		Courses []struct {
			CourseID  uint `json:"courseId"`
			SortOrder int  `json:"sortOrder"`
		} `json:"courses"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	entries := make([]lpsvc.CourseEntry, len(req.Courses))
	for i, c := range req.Courses {
		entries[i] = lpsvc.CourseEntry{CourseID: c.CourseID, SortOrder: c.SortOrder}
	}
	if err := h.service.SetCourses(c.Request.Context(), id, entries); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "courses updated"})
	middleware.LogAudit(c, "learning_path.courses_updated", "learning_path", fmt.Sprint(id), "", nil)
}

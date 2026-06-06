package handler

import (
	"github.com/gin-gonic/gin"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type TaskHandler struct {
	service tasksvc.Service
}

func NewTaskHandler(svc tasksvc.Service) *TaskHandler {
	return &TaskHandler{service: svc}
}

// GET /api/tasks with Strapi-style filters
func (h *TaskHandler) GetAll(c *gin.Context) {
	p := pagination.FromStrapiQuery(c)

	// Always scope tasks to the authenticated user
	currentUserID := middleware.GetUserID(c)
	filter := repository.TaskFilter{
		UserID: &currentUserID,
	}

	if v := c.Query("filters[type][$eq]"); v != "" {
		// normalize plural → singular (articles→article, courses→course)
		typStr := v
		if len(typStr) > 0 && typStr[len(typStr)-1] == 's' {
			typStr = typStr[:len(typStr)-1]
		}
		t := entity.TaskType(typStr)
		filter.Type = &t
	}
	if v := c.Query("filters[status][$eq]"); v != "" {
		s := v
		filter.Status = &s
	}
	if v := c.Query("filters[ownershipType][$eq]"); v != "" {
		ot := entity.TaskOwnershipType(v)
		filter.OwnershipType = &ot
	}

	tasks, total, err := h.service.GetAll(c.Request.Context(), filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.TaskResponse, len(tasks))
	for i, t := range tasks {
		items[i] = mapTaskToDTO(t)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// GET /api/tasks/:id
func (h *TaskHandler) GetByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid task ID")
		return
	}
	task, err := h.service.GetByID(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "task not found")
		return
	}
	response.OK(c, mapTaskToDTO(task))
}

// POST /api/tasks
func (h *TaskHandler) Create(c *gin.Context) {
	var req dto.CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	userID := middleware.GetUserID(c)
	task, err := h.service.Create(c.Request.Context(), tasksvc.CreateRequest{
		Type:          entity.TaskType(req.Data.Type),
		Title:         req.Data.Title,
		Status:        req.Data.Status,
		OwnershipType: entity.TaskOwnershipType(req.Data.OwnershipType),
		UserID:        userID,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapTaskToDTO(task))
}

// PUT /api/tasks/:id
func (h *TaskHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid task ID")
		return
	}
	var req dto.UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	task, err := h.service.Update(c.Request.Context(), id, req.Data.Title, req.Data.Status)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapTaskToDTO(task))
}

// DELETE /api/tasks/:id
func (h *TaskHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid task ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "task deleted"})
}

func mapTaskToDTO(t *entity.Task) dto.TaskResponse {
	return dto.TaskResponse{
		ID:                  t.ID,
		ContentID:           t.ContentID,
		Type:                string(t.Type),
		Title:               t.Title,
		Status:              t.Status,
		OwnershipType:       string(t.OwnershipType),
		CreatedAt:           t.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:           t.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		CMSVersion:          t.CMSVersion,
		CMSStatus:           t.CMSStatus,
		CMSHasPendingDraft:  t.CMSHasPendingDraft,
		CMSPublishedVersion: t.CMSPublishedVersion,
	}
}


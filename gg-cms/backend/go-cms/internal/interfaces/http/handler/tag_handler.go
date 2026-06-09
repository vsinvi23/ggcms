package handler

import (
	"fmt"

	"github.com/gin-gonic/gin"
	tagsvc "github.com/serenya/go-cms/internal/application/tag"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type TagHandler struct {
	service tagsvc.Service
}

func NewTagHandler(svc tagsvc.Service) *TagHandler {
	return &TagHandler{service: svc}
}

type tagResponse struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

// GET /api/tags
func (h *TagHandler) GetAll(c *gin.Context) {
	tags, err := h.service.GetAll(c.Request.Context())
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]tagResponse, len(tags))
	for i, t := range tags {
		items[i] = tagResponse{ID: t.ID, Name: t.Name}
	}
	response.OK(c, items)
}

// POST /api/tags  body: {"name": "golang"}
func (h *TagHandler) Create(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	tag, err := h.service.Create(c.Request.Context(), req.Name)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, tagResponse{ID: tag.ID, Name: tag.Name})
	middleware.LogAudit(c, "tag.created", "tag", fmt.Sprint(tag.ID), tag.Name, nil)
}

// DELETE /api/tags/:id
func (h *TagHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid tag ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "tag deleted"})
	middleware.LogAudit(c, "tag.deleted", "tag", fmt.Sprint(id), "", nil)
}

// GET /api/categories/:id/tags
func (h *TagHandler) GetCategoryTags(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	tags, err := h.service.GetCategoryTags(c.Request.Context(), id)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]tagResponse, len(tags))
	for i, t := range tags {
		items[i] = tagResponse{ID: t.ID, Name: t.Name}
	}
	response.OK(c, items)
}

// PUT /api/categories/:id/tags  body: {"tagIds": [1,2,3]}
func (h *TagHandler) SetCategoryTags(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	var req struct {
		TagIDs []uint `json:"tagIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.service.SetCategoryTags(c.Request.Context(), id, req.TagIDs); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "tags updated"})
	middleware.LogAudit(c, "tag.category_tags_updated", "category", fmt.Sprint(id), "", map[string]interface{}{"tagIds": req.TagIDs})
}

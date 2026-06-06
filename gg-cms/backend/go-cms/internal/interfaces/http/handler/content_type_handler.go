package handler

import (
	"fmt"

	"github.com/gin-gonic/gin"
	ctsvc "github.com/serenya/go-cms/internal/application/contenttype"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type ContentTypeHandler struct {
	service ctsvc.Service
}

func NewContentTypeHandler(svc ctsvc.Service) *ContentTypeHandler {
	return &ContentTypeHandler{service: svc}
}

type contentTypeResponse struct {
	ID          uint   `json:"id"`
	Kind        string `json:"kind"`
	Value       string `json:"value"`
	Label       string `json:"label"`
	Description string `json:"description"`
	SortOrder   int    `json:"sortOrder"`
}

func contentTypeToDTO(ct *entity.ContentType) contentTypeResponse {
	return contentTypeResponse{
		ID:          ct.ID,
		Kind:        ct.Kind,
		Value:       ct.Value,
		Label:       ct.Label,
		Description: ct.Description,
		SortOrder:   ct.SortOrder,
	}
}

// GET /api/content-types?kind=article
func (h *ContentTypeHandler) GetAll(c *gin.Context) {
	kind := c.DefaultQuery("kind", "article")
	types, err := h.service.List(c.Request.Context(), kind)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]contentTypeResponse, len(types))
	for i, t := range types {
		items[i] = contentTypeToDTO(t)
	}
	response.OK(c, items)
}

// POST /api/content-types  (admin only)
func (h *ContentTypeHandler) Create(c *gin.Context) {
	var req struct {
		Kind        string `json:"kind" binding:"required"`
		Value       string `json:"value" binding:"required"`
		Label       string `json:"label" binding:"required"`
		Description string `json:"description"`
		SortOrder   int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	ct, err := h.service.Create(c.Request.Context(), ctsvc.CreateRequest{
		Kind:        req.Kind,
		Value:       req.Value,
		Label:       req.Label,
		Description: req.Description,
		SortOrder:   req.SortOrder,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, contentTypeToDTO(ct))
	middleware.LogAudit(c, "content_type.created", "content_type", fmt.Sprint(ct.ID), ct.Label, map[string]interface{}{"kind": ct.Kind, "value": ct.Value})
}

// PUT /api/content-types/:id  (admin only)
func (h *ContentTypeHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	var req struct {
		Label       *string `json:"label"`
		Description *string `json:"description"`
		SortOrder   *int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	ct, err := h.service.Update(c.Request.Context(), id, ctsvc.UpdateRequest{
		Label:       req.Label,
		Description: req.Description,
		SortOrder:   req.SortOrder,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, contentTypeToDTO(ct))
	middleware.LogAudit(c, "content_type.updated", "content_type", fmt.Sprint(ct.ID), ct.Label, nil)
}

// DELETE /api/content-types/:id  (admin only)
func (h *ContentTypeHandler) Delete(c *gin.Context) {
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
	middleware.LogAudit(c, "content_type.deleted", "content_type", fmt.Sprint(id), "", nil)
}

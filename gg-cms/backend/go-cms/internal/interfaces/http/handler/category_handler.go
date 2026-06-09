package handler

import (
	"errors"
	"fmt"

	"github.com/gin-gonic/gin"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type CategoryHandler struct {
	service categorysvc.Service
}

func NewCategoryHandler(svc categorysvc.Service) *CategoryHandler {
	return &CategoryHandler{service: svc}
}

// GET /api/categories?tree=true OR pagination params
// Optional query param: includeVirtual=true (admin only) — exposes the "geek" root node.
func (h *CategoryHandler) GetAll(c *gin.Context) {
	if c.Query("tree") == "true" {
		includeVirtual := c.Query("includeVirtual") == "true"
		cats, err := h.service.GetTree(c.Request.Context(), includeVirtual)
		if err != nil {
			response.InternalError(c, err.Error())
			return
		}
		result := make([]dto.CategoryResponse, len(cats))
		for i, cat := range cats {
			result[i] = mapCategoryToDTO(cat)
		}
		response.OK(c, result)
		return
	}

	p := pagination.FromStrapiQuery(c)
	cats, total, err := h.service.GetAll(c.Request.Context(), p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.CategoryResponse, len(cats))
	for i, cat := range cats {
		result[i] = mapCategoryToDTO(cat)
	}
	response.StrapiPaged(c, result, total, p.Page, p.Size)
}

// GET /api/categories/:id
func (h *CategoryHandler) GetByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	cat, err := h.service.GetByID(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "category not found")
		return
	}
	response.OK(c, mapCategoryToDTO(cat))
}

// POST /api/categories
func (h *CategoryHandler) Create(c *gin.Context) {
	var req dto.CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	cat, err := h.service.Create(c.Request.Context(), req.Data.Name, req.Data.ParentID)
	if err != nil {
		if errors.Is(err, categorysvc.ErrDuplicateCategoryName) {
			response.Conflict(c, err.Error())
			return
		}
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapCategoryToDTO(cat))
	middleware.LogAudit(c, "category.created", "category", fmt.Sprint(cat.ID), cat.Name, nil)
}

// PUT /api/categories/:id
func (h *CategoryHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	var req dto.UpdateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	cat, err := h.service.Update(c.Request.Context(), id, req.Data.Name, req.Data.ParentID, req.Data.RequiredApprovals)
	if err != nil {
		if errors.Is(err, categorysvc.ErrDuplicateCategoryName) {
			response.Conflict(c, err.Error())
			return
		}
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapCategoryToDTO(cat))
	middleware.LogAudit(c, "category.updated", "category", fmt.Sprint(cat.ID), cat.Name, nil)
}

// DELETE /api/categories/:id
func (h *CategoryHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "category deleted"})
	middleware.LogAudit(c, "category.deleted", "category", fmt.Sprint(id), "", nil)
}

// GET /api/categories/:id/reviewer-groups
func (h *CategoryHandler) GetReviewerGroups(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	groups, err := h.service.GetReviewerGroups(c.Request.Context(), id)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.ReviewerGroupResponse, len(groups))
	for i, g := range groups {
		result[i] = dto.ReviewerGroupResponse{ID: g.ID, Name: g.Name, Role: g.Role}
	}
	response.OK(c, result)
}

// POST /api/categories/:id/reviewer-groups  body: { groupId }
func (h *CategoryHandler) AddReviewerGroup(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	var req dto.AddReviewerGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.service.AddReviewerGroup(c.Request.Context(), id, req.GroupID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "reviewer group added"})
}

// DELETE /api/categories/:id/reviewer-groups/:gid
func (h *CategoryHandler) RemoveReviewerGroup(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	gid, err := parseID(c, "gid")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	if err := h.service.RemoveReviewerGroup(c.Request.Context(), id, gid); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "reviewer group removed"})
}

// GET /api/categories/:id/reviewers
// Returns a flat, deduplicated list of all users from the category's reviewer groups.
// Used by the admin "Assign Reviewer" dropdown.
func (h *CategoryHandler) GetReviewers(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid category ID")
		return
	}
	users, err := h.service.GetReviewers(c.Request.Context(), id)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.ReviewerResponse, len(users))
	for i, u := range users {
		name := u.Name
		if name == "" {
			name = u.Email
		}
		result[i] = dto.ReviewerResponse{ID: u.ID, Name: name}
	}
	response.OK(c, result)
}

// GET /api/user-groups/:id/categories
// Returns all non-virtual categories where the given group acts as a reviewer.
func (h *CategoryHandler) GetGroupCategories(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	cats, err := h.service.GetGroupCategories(c.Request.Context(), id)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.CategoryResponse, len(cats))
	for i, cat := range cats {
		result[i] = mapCategoryToDTO(cat)
	}
	response.OK(c, result)
}

func mapCategoryToDTO(c *entity.Category) dto.CategoryResponse {
	children := make([]dto.CategoryResponse, len(c.Children))
	for i, child := range c.Children {
		children[i] = mapCategoryToDTO(&child)
	}
	return dto.CategoryResponse{
		ID:                c.ID,
		Name:              c.Name,
		Slug:              c.Slug,
		ParentID:          c.ParentID,
		IsVirtual:         c.IsVirtual,
		RequiredApprovals: c.RequiredApprovals,
		Children:          children,
	}
}

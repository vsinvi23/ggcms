package handler

import (
	"fmt"

	"github.com/gin-gonic/gin"
	groupsvc "github.com/serenya/go-cms/internal/application/group"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type GroupHandler struct {
	service groupsvc.Service
}

func NewGroupHandler(svc groupsvc.Service) *GroupHandler {
	return &GroupHandler{service: svc}
}

// GET /api/user-groups
func (h *GroupHandler) GetAll(c *gin.Context) {
	p := pagination.FromStrapiQuery(c)
	groups, total, err := h.service.GetAll(c.Request.Context(), p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.GroupResponse, len(groups))
	for i, g := range groups {
		items[i] = mapGroupToDTO(g)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// GET /api/user-groups/:id
func (h *GroupHandler) GetByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	group, err := h.service.GetByID(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "group not found")
		return
	}
	response.OK(c, mapGroupToDTO(group))
}

// POST /api/user-groups
func (h *GroupHandler) Create(c *gin.Context) {
	var req dto.CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	group, err := h.service.Create(c.Request.Context(), req.Data.Name, req.Data.Role, req.Data.Permissions)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapGroupToDTO(group))
	middleware.LogAudit(c, "group.created", "group", fmt.Sprint(group.ID), group.Name, nil)
}

// PUT /api/user-groups/:id
func (h *GroupHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	var req dto.UpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	group, err := h.service.Update(c.Request.Context(), id, req.Data.Name, req.Data.Role, req.Data.Permissions)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapGroupToDTO(group))
	middleware.LogAudit(c, "group.updated", "group", fmt.Sprint(group.ID), group.Name, nil)
}

// DELETE /api/user-groups/:id
func (h *GroupHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "group deleted"})
	middleware.LogAudit(c, "group.deleted", "group", fmt.Sprint(id), "", nil)
}

// GET /api/user-groups/:id/members
func (h *GroupHandler) GetMembers(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	members, err := h.service.GetMembers(c.Request.Context(), id)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.GroupUserResponse, len(members))
	for i, m := range members {
		result[i] = dto.GroupUserResponse{ID: m.ID, Name: m.Name, Email: m.Email}
	}
	response.OK(c, result)
}

// POST /api/user-groups/:id/members
func (h *GroupHandler) AddMember(c *gin.Context) {
	groupID, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	var req dto.AddMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.service.AddMember(c.Request.Context(), groupID, req.UserID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "member added"})
	middleware.LogAudit(c, "group.member_added", "group", fmt.Sprint(groupID), "", map[string]interface{}{"userId": req.UserID})
}

// DELETE /api/user-groups/:id/members/:userId
func (h *GroupHandler) RemoveMember(c *gin.Context) {
	groupID, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid group ID")
		return
	}
	userID, err := parseID(c, "userId")
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}
	if err := h.service.RemoveMember(c.Request.Context(), groupID, userID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "member removed"})
	middleware.LogAudit(c, "group.member_removed", "group", fmt.Sprint(groupID), "", map[string]interface{}{"userId": userID})
}

func mapGroupToDTO(g *entity.Group) dto.GroupResponse {
	users := make([]dto.GroupUserResponse, len(g.Users))
	for i, u := range g.Users {
		users[i] = dto.GroupUserResponse{ID: u.ID, Name: u.Name, Email: u.Email}
	}
	return dto.GroupResponse{ID: g.ID, Name: g.Name, Role: g.Role, Permissions: g.Permissions, Users: users}
}

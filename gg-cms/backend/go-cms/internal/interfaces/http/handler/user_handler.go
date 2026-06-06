package handler

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type UserHandler struct {
	service usersvc.Service
}

func NewUserHandler(svc usersvc.Service) *UserHandler {
	return &UserHandler{service: svc}
}

// GET /api/users
// Returns Strapi-compatible paged response: { data: [...], meta: { pagination: {...} } }
func (h *UserHandler) GetAll(c *gin.Context) {
	p := pagination.FromQuery(c)
	users, total, err := h.service.GetAll(c.Request.Context(), p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.UserResponse, len(users))
	for i, u := range users {
		items[i] = mapUserToDTO(u)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// GET /api/users/:id
// Returns the user object directly (no wrapper) to match Strapi's /users/:id shape.
func (h *UserHandler) GetByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}
	user, err := h.service.GetByID(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "user not found")
		return
	}
	// Return user directly — frontend does transformStrapiUser(response.data)
	c.JSON(200, mapUserToDTO(user))
}

// GET /api/users/:id/groups
func (h *UserHandler) GetGroups(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}
	groups, err := h.service.GetGroups(c.Request.Context(), id)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.GroupUserResponse, len(groups))
	for i, g := range groups {
		result[i] = dto.GroupUserResponse{ID: g.ID, Name: g.Name}
	}
	response.OK(c, result)
}

// POST /api/users
func (h *UserHandler) Create(c *gin.Context) {
	var req dto.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	user, err := h.service.CreateUser(c.Request.Context(), req.Email, req.Password, req.Name, req.GroupID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	c.JSON(201, mapUserToDTO(user))
	middleware.LogAudit(c, "user.created", "user", fmt.Sprint(user.ID), user.Email, nil)
}

// PUT /api/users/:id
func (h *UserHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}

	authenticatedID := middleware.GetUserID(c)
	isAdmin := middleware.IsAdmin(c)
	if id != authenticatedID && !isAdmin {
		response.Forbidden(c, "cannot modify another user's profile")
		return
	}

	var req dto.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if !isAdmin && req.Status != nil {
		response.Forbidden(c, "only admins may change user status")
		return
	}

	if !isAdmin && req.GroupID != nil {
		response.Forbidden(c, "only admins may change group assignments")
		return
	}

	user, err := h.service.Update(c.Request.Context(), id, req.Name, req.MobileNo, req.Status, req.GroupID)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapUserToDTO(user))
	middleware.LogAudit(c, "user.updated", "user", fmt.Sprint(user.ID), user.Email, nil)
}

// DELETE /api/users/:id
// Users may delete their own account; admins may delete any account.
func (h *UserHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}
	if id != middleware.GetUserID(c) && !middleware.IsAdmin(c) {
		response.Forbidden(c, "cannot delete another user's account")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "user deleted"})
	middleware.LogAudit(c, "user.deleted", "user", fmt.Sprint(id), "", nil)
}

// POST /api/users/:id/activate
func (h *UserHandler) Activate(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}
	if err := h.service.Activate(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "user activated"})
	middleware.LogAudit(c, "user.activated", "user", fmt.Sprint(id), "", nil)
}

// POST /api/users/:id/deactivate
func (h *UserHandler) Deactivate(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}
	if err := h.service.Deactivate(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "user deactivated"})
	middleware.LogAudit(c, "user.deactivated", "user", fmt.Sprint(id), "", nil)
}

func mapUserToDTO(u *entity.User) dto.UserResponse {
	groups := make([]string, len(u.Groups))
	groupIDs := make([]uint, len(u.Groups))
	for i, g := range u.Groups {
		groups[i] = g.Name
		groupIDs[i] = g.ID
	}
	var lastLogin *string
	if u.LastLogin != nil {
		s := u.LastLogin.Format(time.RFC3339)
		lastLogin = &s
	}
	return dto.UserResponse{
		ID:        u.ID,
		Email:     u.Email,
		Name:      u.Name,
		MobileNo:  u.MobileNo,
		Status:    string(u.Status),
		LastLogin: lastLogin,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
		Groups:    groups,
		GroupIDs:  groupIDs,
	}
}

func parseID(c *gin.Context, param string) (uint, error) {
	v, err := strconv.ParseUint(c.Param(param), 10, 64)
	return uint(v), err
}

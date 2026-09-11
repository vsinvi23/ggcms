package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	authsvc "github.com/serenya/go-cms/internal/application/auth"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type AuthHandler struct {
	service authsvc.Service
}

func NewAuthHandler(svc authsvc.Service) *AuthHandler {
	return &AuthHandler{service: svc}
}

// POST /api/auth/local
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	token, user, err := h.service.Login(c.Request.Context(), req.Identifier, req.Password)
	if err != nil {
		response.Unauthorized(c, err.Error())
		return
	}

	// Resolve role from group membership so frontend can use it immediately
	role := resolveUserRole(user.Groups)

	setAuthCookies(c, token)

	// Return flat { jwt, user } — matches Strapi format expected by the frontend.
	c.JSON(http.StatusOK, dto.AuthResponse{
		JWT: token,
		User: dto.AuthUserResponse{
			ID:     user.ID,
			Email:  user.Email,
			Name:   user.Name,
			Status: string(user.Status),
			Role:   role,
		},
	})
	// Audit: actor == the logged-in user themselves (actorID from the response, not JWT context)
	middleware.LogAudit(c, "user.login", "user", fmt.Sprint(user.ID), user.Email, nil)
}

// POST /api/auth/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	clearAuthCookies(c)
	response.OK(c, gin.H{"message": "logged out"})
}

// POST /api/auth/local/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	token, user, err := h.service.Register(c.Request.Context(), req.Email, req.Password, req.Name, nil)
	if err != nil {
		response.Conflict(c, err.Error())
		return
	}

	// Return flat { jwt, user } — matches Strapi format expected by the frontend.
	c.JSON(http.StatusCreated, dto.AuthResponse{
		JWT: token,
		User: dto.AuthUserResponse{
			ID:     user.ID,
			Email:  user.Email,
			Name:   user.Name,
			Status: string(user.Status),
			Role:   "user", // new registrants are always regular users
		},
	})
	middleware.LogAudit(c, "user.registered", "user", fmt.Sprint(user.ID), user.Email, nil)
}

// POST /api/auth/forgot-password
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req dto.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	_ = h.service.RequestReset(c.Request.Context(), req.Email)
	response.OK(c, gin.H{"message": "if that email is registered, a reset link has been sent"})
}

// POST /api/auth/reset-password
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req dto.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.service.ConfirmReset(c.Request.Context(), req.Code, req.Password); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	response.OK(c, gin.H{"message": "password reset successful"})
}

// POST /api/admin/recover-password — secret-gated break-glass master-admin
// recovery, protected by middleware.AdminRecoverySecret (not JWT).
func (h *AuthHandler) RecoverPassword(c *gin.Context) {
	var req dto.RecoverPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.service.RecoverPassword(c.Request.Context(), req.Email, req.NewPassword); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	middleware.LogAudit(c, "admin.password_recovered", "user", req.Email, req.Email, nil)
	response.OK(c, gin.H{"message": "password updated"})
}

// GET /api/users/me
func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.service.GetCurrentUser(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, "user not found")
		return
	}

	groups := make([]string, len(user.Groups))
	for i, g := range user.Groups {
		groups[i] = g.Name
	}
	role := resolveUserRole(user.Groups)

	var lastLogin *string
	if user.LastLogin != nil {
		s := user.LastLogin.Format(time.RFC3339)
		lastLogin = &s
	}

	response.OK(c, dto.UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		Name:      user.Name,
		MobileNo:  user.MobileNo,
		Status:    string(user.Status),
		Role:      role,
		LastLogin: lastLogin,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		Groups:    groups,
	})
}

func resolveUserRole(groups []entity.Group) string {
	for _, g := range groups {
		name := strings.ToLower(g.Name)
		if name == "admin" || name == "superadmin" || name == "super_admin" || name == "super-admin" || name == "masteradmin" || name == "master_admin" {
			return "admin"
		}
	}
	return "user"
}

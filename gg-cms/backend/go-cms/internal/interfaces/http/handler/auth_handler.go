package handler

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	authsvc "github.com/serenya/go-cms/internal/application/auth"
	"github.com/serenya/go-cms/internal/application/identity"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/logger"
	"github.com/serenya/go-cms/pkg/password"
	"github.com/serenya/go-cms/pkg/response"
	"go.uber.org/zap"
)

type AuthHandler struct {
	service authsvc.Service
}

func NewAuthHandler(svc authsvc.Service) *AuthHandler {
	return &AuthHandler{service: svc}
}

func authUserDTO(u *entity.User, role string) dto.AuthUserResponse {
	return dto.AuthUserResponse{
		ID:            u.ID,
		Email:         u.Email,
		Name:          u.Name,
		Status:        string(u.Status),
		Role:          role,
		EmailVerified: u.EmailVerified,
		PasswordSet:   u.PasswordSet,
	}
}

func errorJSON(c *gin.Context, status int, code, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"success": false, "message": msg, "code": code})
}

// authError maps service errors to responses without leaking internals.
func auditAuthFailure(c *gin.Context, action, identifier, reason string) {
	middleware.LogAudit(c, action, "user", "", identity.AccountHash(identifier), map[string]interface{}{"reason": reason})
}

func authError(c *gin.Context, err error, fallback string) {
	var pe *password.PolicyError
	switch {
	case errors.As(err, &pe), errors.Is(err, password.ErrBreached):
		response.BadRequest(c, err.Error())
	case errors.Is(err, authsvc.ErrTooManyAttempts):
		var tm *identity.TooManyAttemptsError
		if errors.As(err, &tm) {
			c.Header("Retry-After", fmt.Sprint(int(tm.RetryAfter.Seconds())+1))
		}
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "too many failed attempts, try again later"})
	case errors.Is(err, authsvc.ErrInvalidCredentials):
		response.Unauthorized(c, "invalid credentials")
	case errors.Is(err, authsvc.ErrAccountDisabled):
		errorJSON(c, http.StatusForbidden, "account_disabled", "account is disabled")
	case errors.Is(err, authsvc.ErrReauthRequired):
		errorJSON(c, http.StatusForbidden, "reauth_required", "recent authentication required")
	case errors.Is(err, authsvc.ErrInvalidResetCode):
		response.BadRequest(c, "invalid or expired reset code")
	case errors.Is(err, identity.ErrInvalidTicket):
		response.BadRequest(c, "invalid or expired link")
	case errors.Is(err, identity.ErrInvalidSession):
		response.Unauthorized(c, "invalid session")
	default:
		logger.Error("auth: request failed", zap.Error(err))
		response.InternalError(c, fallback)
	}
}

// POST /api/auth/local
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	sess, err := h.service.Login(c.Request.Context(), req.Identifier, req.Password, clientMeta(c))
	if err != nil {
		switch {
		case errors.Is(err, authsvc.ErrTooManyAttempts):
			auditAuthFailure(c, "auth.login_locked", req.Identifier, "lockout")
		case errors.Is(err, authsvc.ErrInvalidCredentials):
			auditAuthFailure(c, "auth.login_failed", req.Identifier, "invalid_credentials")
		case errors.Is(err, authsvc.ErrAccountDisabled):
			auditAuthFailure(c, "auth.login_failed", req.Identifier, "account_disabled")
		}
		authError(c, err, "login failed")
		return
	}

	setSessionCookies(c, sess.Tokens)
	c.JSON(http.StatusOK, dto.AuthResponse{User: authUserDTO(sess.User, sess.Role)})
	middleware.SetActor(c, sess.User.ID, sess.User.Email)
	middleware.LogAudit(c, "user.login", "user", fmt.Sprint(sess.User.ID), sess.User.Email, nil)
}

// POST /api/auth/refresh — rotates the refresh token and issues a new access token.
func (h *AuthHandler) Refresh(c *gin.Context) {
	raw, _ := c.Cookie(refreshCookie)
	sess, err := h.service.Refresh(c.Request.Context(), raw, clientMeta(c))
	if err != nil {
		if errors.Is(err, identity.ErrRefreshReuse) {
			middleware.LogAudit(c, "auth.refresh_reuse_detected", "session", "", "", nil)
			logger.Warn("SECURITY ALERT: refresh token reuse detected, session family revoked", zap.String("ip", c.ClientIP()))
		}
		clearAuthCookies(c)
		response.Unauthorized(c, "invalid session")
		return
	}
	setSessionCookies(c, sess.Tokens)
	c.JSON(http.StatusOK, dto.AuthResponse{User: authUserDTO(sess.User, sess.Role)})
}

// POST /api/auth/logout — revokes the refresh-token family and clears cookies.
func (h *AuthHandler) Logout(c *gin.Context) {
	raw, _ := c.Cookie(refreshCookie)
	_ = h.service.Logout(c.Request.Context(), raw)
	clearAuthCookies(c)
	response.OK(c, gin.H{"message": "logged out"})
}

// POST /api/auth/logout-all — revokes every session of the current user.
func (h *AuthHandler) LogoutAll(c *gin.Context) {
	if err := h.service.LogoutAll(c.Request.Context(), middleware.GetUserID(c)); err != nil {
		authError(c, err, "failed to log out")
		return
	}
	clearAuthCookies(c)
	response.OK(c, gin.H{"message": "logged out everywhere"})
}

// POST /api/auth/local/register — uniform response whether or not the email exists.
func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.service.Register(c.Request.Context(), req.Email, req.Password, req.Name); err != nil {
		authError(c, err, "registration failed")
		return
	}
	c.JSON(http.StatusAccepted, gin.H{
		"success": true,
		"message": "if the email can be used, a confirmation has been sent; you can now sign in",
	})
}

// POST /api/auth/forgot-password
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req dto.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	_ = h.service.RequestReset(c.Request.Context(), req.Email)
	middleware.LogAudit(c, "auth.password_reset_requested", "user", "", identity.AccountHash(req.Email), nil)
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
		if errors.Is(err, authsvc.ErrInvalidResetCode) {
			middleware.LogAudit(c, "auth.password_reset_failed", "user", "", "", map[string]interface{}{"reason": "invalid_code"})
		}
		authError(c, err, "password reset failed")
		return
	}
	middleware.LogAudit(c, "auth.password_reset_confirmed", "user", "", "", nil)

	response.OK(c, gin.H{"message": "password reset successful"})
}

// POST /api/users/me/password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req dto.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	userID := middleware.GetUserID(c)
	sess, err := h.service.ChangePassword(c.Request.Context(), userID, req.CurrentPassword, req.NewPassword, middleware.GetAuthTime(c), clientMeta(c))
	if err != nil {
		if errors.Is(err, authsvc.ErrInvalidCredentials) {
			errorJSON(c, http.StatusBadRequest, "invalid_current_password", "current password is incorrect")
			return
		}
		authError(c, err, "failed to change password")
		return
	}
	setSessionCookies(c, sess.Tokens)
	response.OK(c, gin.H{"message": "password changed; other sessions were signed out"})
	middleware.LogAudit(c, "user.password_changed", "user", fmt.Sprint(userID), middleware.GetUserEmail(c), nil)
}

// POST /api/auth/reauth — re-prove the password to refresh the "recent login" window.
func (h *AuthHandler) Reauth(c *gin.Context) {
	var req dto.ReauthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	sess, err := h.service.Reauth(c.Request.Context(), middleware.GetUserID(c), req.Password, clientMeta(c))
	if err != nil {
		authError(c, err, "re-authentication failed")
		return
	}
	setSessionCookies(c, sess.Tokens)
	response.OK(c, gin.H{"message": "re-authenticated"})
}

// POST /api/auth/email/verify — consumes an emailed token (verify / link confirm / social signup).
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var req dto.VerifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	res, err := h.service.VerifyEmail(c.Request.Context(), req.Token, clientMeta(c))
	if err != nil {
		authError(c, err, "verification failed")
		return
	}
	out := dto.VerifyEmailResponse{Status: res.Kind}
	if res.Session != nil {
		setSessionCookies(c, res.Session.Tokens)
		u := authUserDTO(res.Session.User, res.Session.Role)
		out.User = &u
		middleware.SetActor(c, res.Session.User.ID, res.Session.User.Email)
		middleware.LogAudit(c, "auth.email.verified_login", "user", fmt.Sprint(res.Session.User.ID), res.Session.User.Email, map[string]interface{}{"kind": res.Kind})
	}
	response.OK(c, out)
}

// POST /api/auth/email/resend
func (h *AuthHandler) ResendVerification(c *gin.Context) {
	if err := h.service.ResendVerification(c.Request.Context(), middleware.GetUserID(c)); err != nil {
		authError(c, err, "could not send verification email")
		return
	}
	response.OK(c, gin.H{"message": "verification email sent if the address is not yet verified"})
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
		var pe *password.PolicyError
		if errors.As(err, &pe) {
			middleware.RecoveryAlert(c, "admin.recovery_failed", "password policy")
			response.BadRequest(c, err.Error())
			return
		}
		middleware.RecoveryAlert(c, "admin.recovery_failed", "target rejected")
		response.BadRequest(c, "recovery failed")
		return
	}

	middleware.RecoveryAlert(c, "admin.password_recovered", "break-glass recovery succeeded for "+identity.AccountHash(req.Email))
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
	groupIDs := make([]uint, len(user.Groups))
	for i, g := range user.Groups {
		groups[i] = g.Name
		groupIDs[i] = g.ID
	}

	var lastLogin *string
	if user.LastLogin != nil {
		s := user.LastLogin.Format(time.RFC3339)
		lastLogin = &s
	}

	avatar := ""
	if user.AvatarURL != nil {
		avatar = *user.AvatarURL
	}

	response.OK(c, dto.MeResponse{
		UserResponse: dto.UserResponse{
			ID:        user.ID,
			Email:     user.Email,
			Name:      user.Name,
			MobileNo:  user.MobileNo,
			Status:    string(user.Status),
			Role:      identity.RoleFromGroups(user.Groups),
			LastLogin: lastLogin,
			CreatedAt: user.CreatedAt.Format(time.RFC3339),
			Groups:    groups,
			GroupIDs:  groupIDs,
		},
		EmailVerified: user.EmailVerified,
		PasswordSet:   user.PasswordSet,
		AvatarURL:     avatar,
	})
}

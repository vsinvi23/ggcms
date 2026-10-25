package handler

import (
	"errors"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	authsvc "github.com/serenya/go-cms/internal/application/auth"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/logger"
	"github.com/serenya/go-cms/pkg/response"
	"go.uber.org/zap"
)

// MeHandler serves the authenticated user's self-service endpoints.
type MeHandler struct {
	self         usersvc.SelfService
	prefs        notificationsvc.Service
	auth         authsvc.Service
	reauthWindow time.Duration
	retention    dto.RetentionPolicyResponse
}

func NewMeHandler(self usersvc.SelfService, prefs notificationsvc.Service, auth authsvc.Service, reauthWindow time.Duration, retention dto.RetentionPolicyResponse) *MeHandler {
	return &MeHandler{self: self, prefs: prefs, auth: auth, reauthWindow: reauthWindow, retention: retention}
}

func (h *MeHandler) fail(c *gin.Context, err error, msg string) {
	switch {
	case errors.Is(err, usersvc.ErrInvalidProfile), errors.Is(err, notificationsvc.ErrInvalidPreference):
		response.BadRequest(c, err.Error())
	case errors.Is(err, usersvc.ErrLastAdmin):
		response.Conflict(c, err.Error())
	case errors.Is(err, repository.ErrNotFound):
		response.NotFound(c, "not found")
	default:
		logger.Error("self-service request failed", zap.String("op", msg), zap.Error(err))
		response.InternalError(c, msg)
	}
}

// PUT /api/users/me updates name, phone, avatar and profile details only; never status, groups or email.
func (h *MeHandler) UpdateProfile(c *gin.Context) {
	var req dto.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	uid := middleware.GetUserID(c)
	p, err := h.self.UpdateProfile(c.Request.Context(), uid, usersvc.ProfileUpdate(req))
	if err != nil {
		h.fail(c, err, "could not update profile")
		return
	}
	response.OK(c, p)
	middleware.LogAudit(c, "user.profile_updated", "user", fmt.Sprint(uid), p.Email, nil)
}

// GET /api/users/me/consent
func (h *MeHandler) GetConsent(c *gin.Context) {
	v, err := h.self.GetConsent(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		h.fail(c, err, "could not load consent")
		return
	}
	response.OK(c, v)
}

// POST /api/users/me/consent
func (h *MeHandler) RecordConsent(c *gin.Context) {
	var req dto.ConsentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	uid := middleware.GetUserID(c)
	v, err := h.self.RecordConsent(c.Request.Context(), uid, usersvc.ConsentInput(req), "")
	if err != nil {
		h.fail(c, err, "could not record consent")
		return
	}
	response.Created(c, v)
	middleware.LogAudit(c, "user.consent_recorded", "user", fmt.Sprint(uid), "", map[string]interface{}{
		"policyVersion": req.PolicyVersion, "analytics": req.Analytics, "personalization": req.Personalization, "marketing": req.Marketing,
	})
}

// GET /api/users/me/export returns the user's data as a JSON download.
func (h *MeHandler) Export(c *gin.Context) {
	uid := middleware.GetUserID(c)
	out, err := h.self.Export(c.Request.Context(), uid)
	if err != nil {
		h.fail(c, err, "could not export data")
		return
	}
	c.Header("Content-Disposition", `attachment; filename="my-data-export.json"`)
	response.OK(c, out)
	middleware.LogAudit(c, "user.data_exported", "user", fmt.Sprint(uid), "", nil)
}

// DELETE /api/users/me requires a recent login or the account password in the body.
func (h *MeHandler) Delete(c *gin.Context) {
	var req dto.DeleteAccountRequest
	_ = c.ShouldBindJSON(&req)
	uid := middleware.GetUserID(c)
	if time.Since(middleware.GetAuthTime(c)) > h.reauthWindow {
		if req.Password == "" {
			errorJSON(c, 403, "reauth_required", "recent authentication required")
			return
		}
		if _, err := h.auth.Reauth(c.Request.Context(), uid, req.Password, clientMeta(c)); err != nil {
			authError(c, err, "re-authentication failed")
			return
		}
	}
	email := middleware.GetUserEmail(c)
	res, err := h.self.DeleteAccount(c.Request.Context(), uid)
	if err != nil {
		h.fail(c, err, "could not delete account")
		return
	}
	clearAuthCookies(c)
	response.OK(c, gin.H{"message": "account deleted"})
	middleware.LogAudit(c, "user.self_deleted", "user", fmt.Sprint(uid), email, map[string]interface{}{
		"analyticsEventsPurged": res.AnalyticsEvents, "engagementPurged": res.Content,
	})
}

// GET /api/users/me/preferences
func (h *MeHandler) GetPreferences(c *gin.Context) {
	p, err := h.prefs.GetPreferences(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		h.fail(c, err, "could not load preferences")
		return
	}
	response.OK(c, p)
}

// PUT /api/users/me/preferences applies a partial update.
func (h *MeHandler) UpdatePreferences(c *gin.Context) {
	var req notificationsvc.PreferencesUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	p, err := h.prefs.UpdatePreferences(c.Request.Context(), middleware.GetUserID(c), req)
	if err != nil {
		h.fail(c, err, "could not save preferences")
		return
	}
	response.OK(c, p)
}

// GET /api/privacy/retention (public)
func (h *MeHandler) Retention(c *gin.Context) {
	response.OK(c, h.retention)
}

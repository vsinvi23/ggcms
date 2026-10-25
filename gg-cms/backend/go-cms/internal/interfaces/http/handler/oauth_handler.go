package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/application/identity"
	oauthsvc "github.com/serenya/go-cms/internal/application/oauth"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

// OAuthHandler serves the provider-agnostic social-login flow.
type OAuthHandler struct {
	service     oauthsvc.Service
	frontendURL string
	reauthWin   time.Duration
}

func NewOAuthHandler(svc oauthsvc.Service, frontendURL string, reauthWindow time.Duration) *OAuthHandler {
	return &OAuthHandler{service: svc, frontendURL: frontendURL, reauthWin: reauthWindow}
}

// GET /api/auth/providers — enabled providers; replaces the global feature flag.
func (h *OAuthHandler) Providers(c *gin.Context) {
	response.OK(c, gin.H{"providers": h.service.Providers()})
}

// GET /api/auth/:provider/start?redirect=/path
func (h *OAuthHandler) Start(c *gin.Context) {
	res, err := h.service.Start(c.Request.Context(), c.Param("provider"), c.Query("redirect"), oauthsvc.IntentLogin, 0)
	if err != nil {
		h.redirectError(c, oauthsvc.ErrorCode(err))
		return
	}
	setOAuthTxCookie(c, res.Binding, res.TTL)
	c.Redirect(http.StatusFound, res.URL)
}

// POST /api/users/me/identities/:provider/link — returns the provider URL for the signed-in user.
func (h *OAuthHandler) StartLink(c *gin.Context) {
	if time.Since(middleware.GetAuthTime(c)) > h.reauthWin {
		errorJSON(c, http.StatusForbidden, "reauth_required", "recent authentication required")
		return
	}
	var body struct {
		Redirect string `json:"redirect"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.service.Start(c.Request.Context(), c.Param("provider"), body.Redirect, oauthsvc.IntentLink, middleware.GetUserID(c))
	if err != nil {
		code := oauthsvc.ErrorCode(err)
		status := http.StatusInternalServerError
		if code == oauthsvc.CodeProviderDisabled {
			status = http.StatusNotFound
		}
		errorJSON(c, status, code, "could not start provider link")
		return
	}
	setOAuthTxCookie(c, res.Binding, res.TTL)
	response.OK(c, gin.H{"url": res.URL})
}

// GET /api/auth/:provider/callback
func (h *OAuthHandler) Callback(c *gin.Context) {
	binding, _ := c.Cookie(oauthTxCookie)
	clearOAuthTxCookie(c)

	res, err := h.service.Callback(c.Request.Context(), c.Param("provider"), c.Query("code"), c.Query("state"), c.Query("error"), binding, clientMeta(c))
	if err != nil {
		code := oauthsvc.ErrorCode(err)
		action := "auth.social.failed"
		if code == oauthsvc.CodeInvalidState {
			action = "auth.state.invalid"
		}
		middleware.LogAudit(c, action, "auth", c.Param("provider"), c.Param("provider"), map[string]interface{}{"code": code})
		h.redirectError(c, code)
		return
	}

	q := url.Values{"status": {res.Status}, "redirect": {res.Redirect}}
	switch res.Status {
	case oauthsvc.StatusOK:
		setSessionCookies(c, res.Tokens)
		middleware.SetActor(c, res.User.ID, res.User.Email)
		action := "auth.social.login"
		if res.Created {
			action = "auth.social.signup"
			q.Set("new", "1")
		}
		middleware.LogAudit(c, action, "user", fmt.Sprint(res.User.ID), res.User.Email, map[string]interface{}{"provider": res.Provider})
	case oauthsvc.StatusLinkRequired, oauthsvc.StatusEmailNeeded:
		q.Set("ticket", res.Ticket)
	case oauthsvc.StatusLinked:
		middleware.LogAudit(c, "auth.identity.linked", "user", "", "", map[string]interface{}{"provider": res.Provider})
	}
	c.Redirect(http.StatusFound, h.frontendURL+"/auth/callback?"+q.Encode())
}

// POST /api/auth/link/confirm — password confirmation of a link_required flow.
func (h *OAuthHandler) ConfirmLink(c *gin.Context) {
	var req dto.LinkConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	user, tokens, err := h.service.ConfirmLink(c.Request.Context(), req.Ticket, req.Password, clientMeta(c))
	if err != nil {
		middleware.LogAudit(c, "auth.link.rejected", "auth", "", "", nil)
		switch {
		case errors.Is(err, identity.ErrInvalidCredentials):
			response.Unauthorized(c, "invalid credentials")
		case errors.Is(err, identity.ErrInvalidTicket):
			response.BadRequest(c, "invalid or expired link request")
		case errors.Is(err, identity.ErrAccountDisabled):
			errorJSON(c, http.StatusForbidden, "account_disabled", "account is disabled")
		case errors.Is(err, identity.ErrIdentityAlreadyLinked):
			errorJSON(c, http.StatusConflict, "identity_already_linked", "identity already linked")
		default:
			response.InternalError(c, "could not confirm link")
		}
		return
	}
	setSessionCookies(c, tokens)
	middleware.SetActor(c, user.ID, user.Email)
	middleware.LogAudit(c, "auth.identity.linked", "user", fmt.Sprint(user.ID), user.Email, nil)
	c.JSON(http.StatusOK, dto.AuthResponse{User: authUserDTO(user, identity.RoleFromGroups(user.Groups))})
}

// POST /api/auth/link/email — mail the account owner a one-time confirmation link.
func (h *OAuthHandler) SendLinkEmail(c *gin.Context) {
	var req dto.TicketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.service.SendLinkEmail(c.Request.Context(), req.Ticket); err != nil && errors.Is(err, identity.ErrInvalidTicket) {
		response.BadRequest(c, "invalid or expired link request")
		return
	}
	response.OK(c, gin.H{"message": "if the account exists, a confirmation email has been sent"})
}

// POST /api/auth/social/email — supply an email when the provider did not return a verified one.
func (h *OAuthHandler) SubmitSignupEmail(c *gin.Context) {
	var req dto.SocialEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.service.SubmitSignupEmail(c.Request.Context(), req.Ticket, req.Email); err != nil {
		switch {
		case errors.Is(err, identity.ErrInvalidTicket):
			response.BadRequest(c, "invalid or expired request")
		case errors.Is(err, identity.ErrInvalidEmail):
			response.BadRequest(c, "invalid email address")
		default:
			response.InternalError(c, "could not send verification email")
		}
		return
	}
	response.OK(c, gin.H{"message": "if the address can be used, a verification email has been sent"})
}

// GET /api/users/me/identities
func (h *OAuthHandler) ListIdentities(c *gin.Context) {
	list, err := h.service.ListIdentities(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		response.InternalError(c, "could not load connected accounts")
		return
	}
	response.OK(c, gin.H{"identities": list})
}

// DELETE /api/users/me/identities/:provider
func (h *OAuthHandler) Unlink(c *gin.Context) {
	userID := middleware.GetUserID(c)
	provider := c.Param("provider")
	tokens, err := h.service.Unlink(c.Request.Context(), userID, provider, clientMeta(c))
	if err != nil {
		switch {
		case errors.Is(err, identity.ErrLastLoginMethod):
			errorJSON(c, http.StatusConflict, "last_login_method", "set a password or link another account first")
		case errors.Is(err, identity.ErrIdentityNotFound):
			response.NotFound(c, "account is not linked")
		default:
			response.InternalError(c, "could not unlink account")
		}
		return
	}
	setSessionCookies(c, tokens)
	middleware.LogAudit(c, "auth.identity.unlinked", "user", fmt.Sprint(userID), middleware.GetUserEmail(c), map[string]interface{}{"provider": provider})
	response.OK(c, gin.H{"message": "account unlinked; other sessions were signed out"})
}

func (h *OAuthHandler) redirectError(c *gin.Context, code string) {
	c.Redirect(http.StatusFound, h.frontendURL+"/auth/callback?error="+url.QueryEscape(code))
}

package handler

import (
	"fmt"
	"net/url"

	"github.com/gin-gonic/gin"
	oauthsvc "github.com/serenya/go-cms/internal/application/oauth"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

// OAuthHandler handles Google and GitHub OAuth2 redirect flows.
type OAuthHandler struct {
	service     oauthsvc.Service
	frontendURL string
}

func NewOAuthHandler(svc oauthsvc.Service, frontendURL string) *OAuthHandler {
	return &OAuthHandler{service: svc, frontendURL: frontendURL}
}

// GET /api/auth/google
// Returns a JSON object with the Google consent-page URL.
// The frontend must redirect window.location.href to this URL.
func (h *OAuthHandler) GoogleRedirect(c *gin.Context) {
	state, err := h.service.GenerateState()
	if err != nil {
		response.InternalError(c, "failed to generate state")
		return
	}
	authURL := h.service.GetGoogleAuthURL(state)
	c.JSON(200, gin.H{"url": authURL})
}

// GET /api/auth/google/callback?code=...&state=...
// Called by Google after the user grants permission.
// Exchanges the code for a JWT and redirects the browser back to the frontend.
func (h *OAuthHandler) GoogleCallback(c *gin.Context) {
	if errMsg := c.Query("error"); errMsg != "" {
		h.redirectError(c, errMsg)
		return
	}

	state := c.Query("state")
	if !h.service.ValidateState(state) {
		h.redirectError(c, "invalid_state")
		return
	}

	code := c.Query("code")
	if code == "" {
		h.redirectError(c, "missing_code")
		return
	}

	ou, err := h.service.ExchangeGoogleCode(c.Request.Context(), code)
	if err != nil {
		h.redirectError(c, "google_exchange_failed")
		return
	}

	result, err := h.service.FindOrCreate(c.Request.Context(), ou, "google")
	if err != nil {
		h.redirectError(c, url.QueryEscape(err.Error()))
		return
	}

	middleware.LogAudit(c, "user.oauth_login", "user", fmt.Sprint(result.User.ID), result.User.Email,
		map[string]interface{}{"provider": "google"})

	h.redirectSuccess(c, result.Token)
}

// GET /api/auth/github
// Returns a JSON object with the GitHub consent-page URL.
func (h *OAuthHandler) GitHubRedirect(c *gin.Context) {
	state, err := h.service.GenerateState()
	if err != nil {
		response.InternalError(c, "failed to generate state")
		return
	}
	authURL := h.service.GetGitHubAuthURL(state)
	c.JSON(200, gin.H{"url": authURL})
}

// GET /api/auth/github/callback?code=...&state=...
// Called by GitHub after the user grants permission.
func (h *OAuthHandler) GitHubCallback(c *gin.Context) {
	if errMsg := c.Query("error"); errMsg != "" {
		h.redirectError(c, errMsg)
		return
	}

	state := c.Query("state")
	if !h.service.ValidateState(state) {
		h.redirectError(c, "invalid_state")
		return
	}

	code := c.Query("code")
	if code == "" {
		h.redirectError(c, "missing_code")
		return
	}

	ou, err := h.service.ExchangeGitHubCode(c.Request.Context(), code)
	if err != nil {
		h.redirectError(c, "github_exchange_failed")
		return
	}

	result, err := h.service.FindOrCreate(c.Request.Context(), ou, "github")
	if err != nil {
		h.redirectError(c, url.QueryEscape(err.Error()))
		return
	}

	middleware.LogAudit(c, "user.oauth_login", "user", fmt.Sprint(result.User.ID), result.User.Email,
		map[string]interface{}{"provider": "github"})

	h.redirectSuccess(c, result.Token)
}

func (h *OAuthHandler) redirectSuccess(c *gin.Context, token string) {
	dest := h.frontendURL + "/auth/callback?token=" + url.QueryEscape(token)
	c.Redirect(302, dest)
}

func (h *OAuthHandler) redirectError(c *gin.Context, errMsg string) {
	dest := h.frontendURL + "/auth/callback?error=" + url.QueryEscape(errMsg)
	c.Redirect(302, dest)
}

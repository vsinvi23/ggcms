package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/application/identity"
)

const (
	accessCookie  = "jwt"
	refreshCookie = "refresh_token"
	csrfCookie    = "csrf_token"
	oauthTxCookie = "oauth_tx"
	authCookieDir = "/api/auth"
)

var cookieSettings = struct {
	secure bool
	domain string
}{secure: true}

// ConfigureAuthCookies sets the Secure flag and optional Domain for every auth
// cookie. Secure may only be disabled for local plain-HTTP development.
func ConfigureAuthCookies(secure bool, domain string) {
	cookieSettings.secure = secure
	cookieSettings.domain = domain
}

func setCookie(c *gin.Context, name, value, path string, maxAge int, httpOnly bool, sameSite http.SameSite) {
	c.SetSameSite(sameSite)
	c.SetCookie(name, value, maxAge, path, cookieSettings.domain, cookieSettings.secure, httpOnly)
}

// setSessionCookies writes the short-lived access cookie, the rotating refresh
// cookie and a readable CSRF cookie.
func setSessionCookies(c *gin.Context, t *identity.Tokens) {
	setCookie(c, accessCookie, t.Access, "/", secondsUntil(t.AccessExpires), true, http.SameSiteLaxMode)
	setCookie(c, refreshCookie, t.Refresh, authCookieDir, secondsUntil(t.RefreshExpires), true, http.SameSiteStrictMode)
	setCookie(c, csrfCookie, generateCSRFToken(), "/", secondsUntil(t.RefreshExpires), false, http.SameSiteLaxMode)
}

func clearAuthCookies(c *gin.Context) {
	setCookie(c, accessCookie, "", "/", -1, true, http.SameSiteLaxMode)
	setCookie(c, refreshCookie, "", authCookieDir, -1, true, http.SameSiteStrictMode)
	setCookie(c, csrfCookie, "", "/", -1, false, http.SameSiteLaxMode)
}

func setOAuthTxCookie(c *gin.Context, binding string, ttl time.Duration) {
	setCookie(c, oauthTxCookie, binding, authCookieDir, int(ttl.Seconds()), true, http.SameSiteLaxMode)
}

func clearOAuthTxCookie(c *gin.Context) {
	setCookie(c, oauthTxCookie, "", authCookieDir, -1, true, http.SameSiteLaxMode)
}

func secondsUntil(t time.Time) int {
	if s := int(time.Until(t).Seconds()); s > 0 {
		return s
	}
	return 1
}

func clientMeta(c *gin.Context) identity.Meta {
	return identity.Meta{UserAgent: c.Request.UserAgent(), IP: c.ClientIP()}
}

func generateCSRFToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

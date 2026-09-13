package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"github.com/gin-gonic/gin"
)

const cookieMaxAgeSeconds = 7 * 24 * 60 * 60 // 7 days

// setAuthCookies sets the HttpOnly "jwt" session cookie and a readable
// "csrf_token" cookie, then returns the csrf token (in case a caller needs it).
func setAuthCookies(c *gin.Context, token string) string {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("jwt", token, cookieMaxAgeSeconds, "/", "", true, true)

	csrfToken := generateCSRFToken()
	c.SetCookie("csrf_token", csrfToken, cookieMaxAgeSeconds, "/", "", true, false)
	return csrfToken
}

// clearAuthCookies clears the jwt and csrf_token cookies using the same
// path/domain/SameSite attributes they were set with.
func clearAuthCookies(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("jwt", "", -1, "/", "", true, true)
	c.SetCookie("csrf_token", "", -1, "/", "", true, false)
}

func generateCSRFToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

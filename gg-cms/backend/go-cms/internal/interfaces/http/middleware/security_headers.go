package middleware

import (
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

const spaCSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
	"img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; " +
	"object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

const apiCSP = "default-src 'none'; frame-ancestors 'none'"

// SecurityHeaders sets baseline browser security headers on every response.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		path := c.Request.URL.Path
		switch {
		case strings.HasPrefix(path, "/api"), strings.HasPrefix(path, "/graphql"):
			h.Set("Cache-Control", "no-store")
			h.Set("Content-Security-Policy", apiCSP)
		case strings.HasPrefix(path, "/uploads"):
			h.Set("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox")
		default:
			h.Set("Content-Security-Policy", spaCSP)
		}
		c.Next()
	}
}

// UploadHeaders hardens user-uploaded content served from /uploads: no sniffing, sandboxed CSP,
// and forced download for anything that is not a plain image or video.
func UploadHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
		switch strings.ToLower(path.Ext(c.Request.URL.Path)) {
		case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm":
		default:
			h.Set("Content-Disposition", "attachment")
		}
		c.Next()
	}
}

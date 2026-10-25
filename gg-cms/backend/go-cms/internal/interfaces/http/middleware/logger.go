package middleware

import (
	"bytes"
	"io"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

// responseCapture wraps gin.ResponseWriter so we can read the response body
// without consuming it. Only allocated when debug logging is active.
type responseCapture struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (rc *responseCapture) Write(b []byte) (int, error) {
	rc.body.Write(b)
	return rc.ResponseWriter.Write(b)
}

const maxBodyLog = 4096 // bytes — truncate larger bodies in logs

var sensitiveJSONField = regexp.MustCompile(`(?i)("(?:password|newPassword|currentPassword|confirmPassword|code|jwt|token|accessToken|refreshToken|secret|identifier)"\s*:\s*)"(?:[^"\\]|\\.)*"`)

func redactBody(s string) string {
	return sensitiveJSONField.ReplaceAllString(s, `$1"[REDACTED]"`)
}

func isSensitiveHeader(k string) bool {
	k = strings.ToLower(k)
	switch k {
	case "authorization", "cookie", "set-cookie", "x-csrf-token", "proxy-authorization":
		return true
	}
	return strings.HasPrefix(k, "x-") && strings.HasSuffix(k, "-secret")
}

func isSensitivePath(path string) bool {
	return strings.HasPrefix(path, "/api/auth/") ||
		strings.HasPrefix(path, "/api/admin/") ||
		strings.HasPrefix(path, "/api/import/ingest")
}

func bodyLoggingAllowed(path string) bool {
	return logger.IsDebug() && os.Getenv("GIN_MODE") != "release" && !isSensitivePath(path)
}

// Logger is the HTTP request/response logging middleware.
//
//   - INFO level  → method, path, status, latency, client IP
//   - DEBUG level → additionally dumps request headers, request body,
//     response body (truncated at 4 KB), and query parameters
//
// HTTP 4xx lines are logged at WARN; HTTP 5xx at ERROR.
// Sensitive headers and bodies are redacted; bodies are never logged in release mode.
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		method := c.Request.Method
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// ── Debug: capture request body ───────────────────────────────────────
		var reqBody string
		logBodies := bodyLoggingAllowed(path)
		if logBodies && c.Request.Body != nil {
			raw, err := io.ReadAll(c.Request.Body)
			if err == nil {
				c.Request.Body = io.NopCloser(bytes.NewBuffer(raw))
				if len(raw) > 0 {
					reqBody = truncate(redactBody(string(raw)), maxBodyLog)
				}
			}
		}

		// ── Debug: wrap writer to capture response body ───────────────────────
		var capture *responseCapture
		if logBodies {
			capture = &responseCapture{ResponseWriter: c.Writer, body: &bytes.Buffer{}}
			c.Writer = capture
		}

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		clientIP := c.ClientIP()

		fullPath := maskEmailsIn(path)
		if query != "" {
			fullPath = fullPath + "?" + maskEmailsIn(query)
			if isSensitivePath(path) {
				fullPath = path + "?[REDACTED]"
			}
		}

		// ── Base fields (always logged) ───────────────────────────────────────
		fields := []zap.Field{
			zap.String("method", method),
			zap.String("path", fullPath),
			zap.Int("status", status),
			zap.Duration("latency", latency),
			zap.String("ip", clientIP),
			zap.String("request_id", GetRequestID(c)),
		}

		// ── Debug fields ──────────────────────────────────────────────────────
		if logger.IsDebug() {
			// Request headers (Authorization redacted)
			headers := make(map[string]string, len(c.Request.Header))
			for k, v := range c.Request.Header {
				if isSensitiveHeader(k) {
					headers[k] = "[REDACTED]"
				} else {
					headers[k] = strings.Join(v, ", ")
				}
			}
			fields = append(fields, zap.Any("req_headers", headers))

			if reqBody != "" {
				fields = append(fields, zap.String("req_body", reqBody))
			}

			if capture != nil && capture.body.Len() > 0 {
				fields = append(fields, zap.String("resp_body", truncate(redactBody(capture.body.String()), maxBodyLog)))
			}
		}

		// ── Gin errors (e.g. bound from c.Error()) ────────────────────────────
		if errs := c.Errors.ByType(gin.ErrorTypePrivate); len(errs) > 0 {
			fields = append(fields, zap.String("errors", errs.String()))
		}

		// ── Log at appropriate level ──────────────────────────────────────────
		switch {
		case status >= 500:
			logger.Error("http", fields...)
		case status >= 400:
			logger.Warn("http", fields...)
		default:
			logger.Info("http", fields...)
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + " …[truncated]"
}

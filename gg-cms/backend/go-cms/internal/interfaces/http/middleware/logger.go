package middleware

import (
	"bytes"
	"io"
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

// Logger is the HTTP request/response logging middleware.
//
//   - INFO level  → method, path, status, latency, client IP
//   - DEBUG level → additionally dumps request headers, request body,
//     response body (truncated at 4 KB), and query parameters
//
// HTTP 4xx lines are logged at WARN; HTTP 5xx at ERROR.
// The Authorization header is never logged.
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		method := c.Request.Method
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// ── Debug: capture request body ───────────────────────────────────────
		var reqBody string
		if logger.IsDebug() && c.Request.Body != nil {
			raw, err := io.ReadAll(c.Request.Body)
			if err == nil {
				c.Request.Body = io.NopCloser(bytes.NewBuffer(raw))
				if len(raw) > 0 {
					reqBody = truncate(string(raw), maxBodyLog)
				}
			}
		}

		// ── Debug: wrap writer to capture response body ───────────────────────
		var capture *responseCapture
		if logger.IsDebug() {
			capture = &responseCapture{ResponseWriter: c.Writer, body: &bytes.Buffer{}}
			c.Writer = capture
		}

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		clientIP := c.ClientIP()

		fullPath := path
		if query != "" {
			fullPath = path + "?" + query
		}

		// ── Base fields (always logged) ───────────────────────────────────────
		fields := []zap.Field{
			zap.String("method", method),
			zap.String("path", fullPath),
			zap.Int("status", status),
			zap.Duration("latency", latency),
			zap.String("ip", clientIP),
		}

		// ── Debug fields ──────────────────────────────────────────────────────
		if logger.IsDebug() {
			// Request headers (Authorization redacted)
			headers := make(map[string]string, len(c.Request.Header))
			for k, v := range c.Request.Header {
				if strings.EqualFold(k, "Authorization") {
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
				fields = append(fields, zap.String("resp_body", truncate(capture.body.String(), maxBodyLog)))
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

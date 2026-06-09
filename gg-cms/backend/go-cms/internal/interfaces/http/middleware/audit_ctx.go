package middleware

import (
	"context"

	"github.com/gin-gonic/gin"
	auditsvc "github.com/serenya/go-cms/internal/application/audit"
	"github.com/serenya/go-cms/internal/domain/repository"
)

const keyAuditSvc = "auditService"

// AuditMiddleware stores the audit service on every gin context so handlers can
// call LogAudit without having the service injected directly.
func AuditMiddleware(svc auditsvc.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(keyAuditSvc, svc)
		c.Next()
	}
}

// LogAudit fires an audit log entry from within a gin handler.
//
// It reads actor info (user ID + email) from the context (set by the Auth middleware),
// and runs the log in a background goroutine so it never delays the HTTP response.
// Failures are silently swallowed — audit logging must never fail the main request.
//
// Parameters:
//
//	action     — e.g. "user.created", "group.deleted"
//	targetType — e.g. "user", "group", "article"
//	targetID   — string representation of the target's primary key
//	targetName — human-readable label for the target (email, name, title …)
//	meta       — optional extra context (pass nil if not needed)
func LogAudit(c *gin.Context, action, targetType, targetID, targetName string, meta map[string]interface{}) {
	svcAny, exists := c.Get(keyAuditSvc)
	if !exists {
		return
	}
	svc, ok := svcAny.(auditsvc.Service)
	if !ok {
		return
	}

	actorID    := GetUserID(c)
	actorEmail := GetUserEmail(c)
	ip         := c.ClientIP()

	// Run asynchronously so the HTTP response is never held up by MongoDB.
	go func() {
		_ = svc.Log(context.Background(), actorID, actorEmail, action, targetType, targetID, targetName, meta, ip)
	}()
}

// GetAuditFilter builds an AuditLogFilter from common query params.
// Used by the admin audit endpoint.
func GetAuditFilter(c *gin.Context) repository.AuditLogFilter {
	f := repository.AuditLogFilter{}

	if v := c.Query("action"); v != "" {
		f.Action = v
	}
	if v := c.Query("targetType"); v != "" {
		f.TargetType = v
	}
	return f
}

package audit

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// Service records and retrieves system-wide audit events.
type Service interface {
	// Log asynchronously persists an audit event. Failures are silently dropped
	// so they never block the main request path.
	Log(ctx context.Context, actorID uint, actorEmail, action, targetType, targetID, targetName string, meta map[string]interface{}, ip string) error

	// List returns a paginated, filtered list of audit logs for the admin UI.
	List(ctx context.Context, filter repository.AuditLogFilter, page, size int) ([]*entity.AuditLog, int64, error)
}

type auditService struct {
	repo repository.AuditLogRepository
}

func NewService(repo repository.AuditLogRepository) Service {
	return &auditService{repo: repo}
}

func (s *auditService) Log(ctx context.Context, actorID uint, actorEmail, action, targetType, targetID, targetName string, meta map[string]interface{}, ip string) error {
	entry := &entity.AuditLog{
		Action:     action,
		ActorID:    actorID,
		ActorEmail: actorEmail,
		TargetType: targetType,
		TargetID:   targetID,
		TargetName: targetName,
		Meta:       meta,
		IPAddress:  ip,
	}
	if err := s.repo.Create(ctx, entry); err != nil {
		// Audit failures must never block the caller — log to stderr and return
		fmt.Printf("[audit] failed to write log: %v\n", err)
		return err
	}
	return nil
}

func (s *auditService) List(ctx context.Context, filter repository.AuditLogFilter, page, size int) ([]*entity.AuditLog, int64, error) {
	return s.repo.List(ctx, filter, page, size)
}

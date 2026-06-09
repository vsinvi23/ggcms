package handler

import (
	"github.com/gin-gonic/gin"
	auditsvc "github.com/serenya/go-cms/internal/application/audit"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

// AuditHandler exposes the audit log to admin users.
type AuditHandler struct {
	service auditsvc.Service
}

func NewAuditHandler(svc auditsvc.Service) *AuditHandler {
	return &AuditHandler{service: svc}
}

// GET /api/audit?action=&targetType=&page=0&size=20
func (h *AuditHandler) List(c *gin.Context) {
	p := pagination.FromQuery(c)
	filter := middleware.GetAuditFilter(c)

	logs, total, err := h.service.List(c.Request.Context(), filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	items := make([]auditLogResponse, len(logs))
	for i, l := range logs {
		items[i] = mapAuditLog(l)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

type auditLogResponse struct {
	ID         string                 `json:"id"`
	Action     string                 `json:"action"`
	ActorID    uint                   `json:"actorId"`
	ActorEmail string                 `json:"actorEmail"`
	TargetType string                 `json:"targetType"`
	TargetID   string                 `json:"targetId"`
	TargetName string                 `json:"targetName"`
	Meta       map[string]interface{} `json:"meta,omitempty"`
	IPAddress  string                 `json:"ip,omitempty"`
	CreatedAt  string                 `json:"createdAt"`
}

func mapAuditLog(l *entity.AuditLog) auditLogResponse {
	return auditLogResponse{
		ID:         l.ID.Hex(),
		Action:     l.Action,
		ActorID:    l.ActorID,
		ActorEmail: l.ActorEmail,
		TargetType: l.TargetType,
		TargetID:   l.TargetID,
		TargetName: l.TargetName,
		Meta:       l.Meta,
		IPAddress:  l.IPAddress,
		CreatedAt:  l.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

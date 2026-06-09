package handler

import (
	"github.com/gin-gonic/gin"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	"github.com/serenya/go-cms/pkg/response"
)

type AnalyticsHandler struct {
	service analyticssvc.Service
}

func NewAnalyticsHandler(svc analyticssvc.Service) *AnalyticsHandler {
	return &AnalyticsHandler{service: svc}
}

// GET /api/analytics/dashboard (admin only)
func (h *AnalyticsHandler) GetDashboard(c *gin.Context) {
	stats, err := h.service.GetDashboardStats(c.Request.Context())
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, stats)
}

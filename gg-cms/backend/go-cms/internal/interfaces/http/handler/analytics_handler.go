package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

const maxIngestBytes = 32 << 10

type AnalyticsHandler struct {
	service analyticssvc.Service
}

func NewAnalyticsHandler(svc analyticssvc.Service) *AnalyticsHandler {
	return &AnalyticsHandler{service: svc}
}

// POST /api/analytics/events (public, rate-limited, optional auth)
func (h *AnalyticsHandler) Ingest(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxIngestBytes)
	var req analyticssvc.IngestRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "payload too large"})
			return
		}
		response.BadRequest(c, "invalid JSON body")
		return
	}
	meta := analyticssvc.IngestMeta{IP: c.ClientIP(), UserAgent: c.Request.UserAgent()}
	if uid := middleware.GetUserID(c); uid != 0 {
		meta.UserID = &uid
	}
	res, err := h.service.Ingest(c.Request.Context(), req, meta)
	switch {
	case errors.Is(err, analyticssvc.ErrEmptyBatch):
		response.BadRequest(c, "events must not be empty")
	case errors.Is(err, analyticssvc.ErrBatchTooBig):
		response.BadRequest(c, "at most 20 events per request")
	case err != nil:
		response.InternalError(c, "could not record events")
	default:
		c.JSON(http.StatusAccepted, response.Response{Success: true, Data: res})
	}
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

func parseDay(c *gin.Context, name string) (time.Time, bool) {
	v := c.Query(name)
	if v == "" {
		return time.Time{}, true
	}
	t, err := time.Parse("2006-01-02", v)
	if err != nil {
		response.BadRequest(c, name+" must be YYYY-MM-DD")
		return time.Time{}, false
	}
	return t, true
}

func parseRange(c *gin.Context) (time.Time, time.Time, bool) {
	from, ok := parseDay(c, "from")
	if !ok {
		return from, from, false
	}
	to, ok := parseDay(c, "to")
	return from, to, ok
}

func intQuery(c *gin.Context, name string, def int) int {
	if n, err := strconv.Atoi(c.Query(name)); err == nil {
		return n
	}
	return def
}

func reportError(c *gin.Context) {
	response.InternalError(c, "could not build report")
}

// GET /api/analytics/overview?from=&to= (admin)
func (h *AnalyticsHandler) Overview(c *gin.Context) {
	from, to, ok := parseRange(c)
	if !ok {
		return
	}
	out, err := h.service.Overview(c.Request.Context(), from, to)
	if err != nil {
		reportError(c)
		return
	}
	response.OK(c, out)
}

// GET /api/analytics/content?from=&to=&limit= (admin)
func (h *AnalyticsHandler) Content(c *gin.Context) {
	from, to, ok := parseRange(c)
	if !ok {
		return
	}
	out, err := h.service.ContentReport(c.Request.Context(), from, to, intQuery(c, "limit", 20))
	if err != nil {
		reportError(c)
		return
	}
	response.OK(c, out)
}

// GET /api/analytics/search?from=&to=&limit= (admin)
func (h *AnalyticsHandler) Search(c *gin.Context) {
	from, to, ok := parseRange(c)
	if !ok {
		return
	}
	out, err := h.service.SearchReport(c.Request.Context(), from, to, intQuery(c, "limit", 20))
	if err != nil {
		reportError(c)
		return
	}
	response.OK(c, out)
}

// GET /api/analytics/funnel?from=&to= (admin)
func (h *AnalyticsHandler) Funnel(c *gin.Context) {
	from, to, ok := parseRange(c)
	if !ok {
		return
	}
	out, err := h.service.Funnel(c.Request.Context(), from, to)
	if err != nil {
		reportError(c)
		return
	}
	response.OK(c, out)
}

// GET /api/analytics/cohorts?weeks= (admin)
func (h *AnalyticsHandler) Cohorts(c *gin.Context) {
	out, err := h.service.Cohorts(c.Request.Context(), intQuery(c, "weeks", 8))
	if err != nil {
		reportError(c)
		return
	}
	response.OK(c, out)
}

// GET /api/analytics/recommendations?from=&to= (admin)
func (h *AnalyticsHandler) Recommendations(c *gin.Context) {
	from, to, ok := parseRange(c)
	if !ok {
		return
	}
	out, err := h.service.Recommendations(c.Request.Context(), from, to)
	if err != nil {
		reportError(c)
		return
	}
	response.OK(c, out)
}

// GET /api/analytics/users/engagement?page=&size= (admin)
func (h *AnalyticsHandler) Engagement(c *gin.Context) {
	page, size := intQuery(c, "page", 0), intQuery(c, "size", 25)
	out, total, err := h.service.Engagement(c.Request.Context(), page, size)
	if err != nil {
		reportError(c)
		return
	}
	response.Paged(c, out, total, page, size)
}

package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	"github.com/serenya/go-cms/internal/infrastructure/logging"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type LogHandler struct {
	settingsSvc settingssvc.Service
}

func NewLogHandler(settingsSvc settingssvc.Service) *LogHandler {
	return &LogHandler{settingsSvc: settingsSvc}
}

type clientLogRequest struct {
	Level    string                 `json:"level"`
	Message  string                 `json:"message"`
	Metadata map[string]interface{} `json:"metadata"`
}

// POST /api/logs/client — Record UI client log event
func (h *LogHandler) RecordClientLog(c *gin.Context) {
	// Check if debug logging is enabled in settings
	if h.settingsSvc != nil {
		all, err := h.settingsSvc.GetAll(c.Request.Context())
		if err == nil && all["logging.debug_enabled"] == "false" {
			response.OK(c, gin.H{"status": "disabled"})
			return
		}
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
	var req clientLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid log payload")
		return
	}

	level := strings.ToUpper(strings.TrimSpace(req.Level))
	switch level {
	case "DEBUG", "INFO", "WARN", "ERROR":
	default:
		level = "INFO"
	}
	req.Message = sanitizeLogText(req.Message, 1000)

	userEmail := middleware.GetUserEmail(c)
	logging.GetGlobalLogStore().Record(level, "ui_client", req.Message, userEmail, req.Metadata)

	response.OK(c, gin.H{"status": "recorded"})
}

// GET /api/logs/debug — Admin debug log listing
func (h *LogHandler) GetDebugLogs(c *gin.Context) {
	level := c.Query("level")
	limitStr := c.DefaultQuery("limit", "100")
	limit, _ := strconv.Atoi(limitStr)

	logs := logging.GetGlobalLogStore().List(level, limit)
	response.OK(c, gin.H{
		"items": logs,
		"total": len(logs),
	})
}

// GET /api/logs/download — Admin debug log download
func (h *LogHandler) DownloadLogs(c *gin.Context) {
	format := strings.ToLower(c.DefaultQuery("format", "txt"))
	data, contentType, filename := logging.GetGlobalLogStore().Export(format)

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Data(http.StatusOK, contentType, data)
}

func sanitizeLogText(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return ' '
		}
		return r
	}, s)
	if len(s) > max {
		s = s[:max]
	}
	return s
}

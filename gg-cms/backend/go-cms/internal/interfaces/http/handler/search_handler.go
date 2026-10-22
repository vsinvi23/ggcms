package handler

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	searchsvc "github.com/serenya/go-cms/internal/application/search"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/logger"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
	"go.uber.org/zap"
)

type SearchHandler struct {
	svc searchsvc.Service
}

func NewSearchHandler(svc searchsvc.Service) *SearchHandler {
	return &SearchHandler{svc: svc}
}

// GET /api/public/search?q=&type=article|course|all&category=&topic=&level=&page=0&size=10
func (h *SearchHandler) Search(c *gin.Context) {
	p := pagination.FromQuery(c)
	var uid *uint
	if id := middleware.GetUserID(c); id > 0 {
		uid = &id
	}
	res, err := h.svc.Search(c.Request.Context(), searchsvc.Request{
		Query:    c.Query("q"),
		Type:     c.Query("type"),
		Category: c.Query("category"),
		Topic:    c.Query("topic"),
		Level:    c.Query("level"),
		Page:     p.Page,
		Size:     p.Size,
		UserID:   uid,
	})
	if err != nil {
		if errors.Is(err, searchsvc.ErrInvalidFilter) {
			response.BadRequest(c, "invalid type or level filter")
			return
		}
		logger.Error("search failed", zap.Error(err))
		response.InternalError(c, "search failed")
		return
	}
	c.Header("Cache-Control", "private, max-age=30")
	response.OK(c, res)
}

// GET /api/public/search/suggest?q=&limit=5
func (h *SearchHandler) Suggest(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	res, err := h.svc.Suggest(c.Request.Context(), c.Query("q"), limit)
	if err != nil {
		logger.Error("search suggest failed", zap.Error(err))
		response.InternalError(c, "suggest failed")
		return
	}
	c.Header("Cache-Control", "public, max-age=30")
	response.OK(c, res)
}

package handler

import (
	"context"
	"errors"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	seosvc "github.com/serenya/go-cms/internal/application/seo"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

type SEOHandler struct {
	svc       seosvc.Service
	indexPath string

	mu        sync.Mutex
	indexData []byte
	indexMod  time.Time
}

func NewSEOHandler(svc seosvc.Service, indexPath string) *SEOHandler {
	return &SEOHandler{svc: svc, indexPath: indexPath}
}

// GET /sitemap.xml and GET /sitemaps/:file
func (h *SEOHandler) Sitemap(c *gin.Context) {
	file := c.Param("file")
	sm, err := h.svc.Sitemap(c.Request.Context(), file)
	if err != nil {
		if errors.Is(err, seosvc.ErrNotFound) {
			c.Status(http.StatusNotFound)
			return
		}
		logger.Error("sitemap build failed", zap.Error(err))
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Cache-Control", "public, max-age=3600")
	c.Header("ETag", sm.ETag)
	if c.GetHeader("If-None-Match") == sm.ETag {
		c.Status(http.StatusNotModified)
		return
	}
	c.Data(http.StatusOK, "application/xml; charset=utf-8", sm.Body)
}

// GET /robots.txt
func (h *SEOHandler) Robots(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(h.svc.Robots()))
}

func (h *SEOHandler) index() ([]byte, error) {
	st, err := os.Stat(h.indexPath)
	if err != nil {
		return nil, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.indexData == nil || !st.ModTime().Equal(h.indexMod) {
		data, err := os.ReadFile(h.indexPath)
		if err != nil {
			return nil, err
		}
		h.indexData, h.indexMod = data, st.ModTime()
	}
	return h.indexData, nil
}

// ServeSPA serves the SPA shell, injecting per-page SEO metadata for public
// content routes. Preview requests and unknown/unpublished content get the plain shell.
func (h *SEOHandler) ServeSPA(c *gin.Context) {
	if c.Request.Method == http.MethodGet && c.Query("preview") == "" {
		if shell, err := h.index(); err == nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
			meta, mErr := h.svc.PageMeta(ctx, c.Request.URL.Path)
			cancel()
			if mErr != nil {
				logger.Warn("seo meta lookup failed", zap.Error(mErr))
			}
			if meta != nil {
				body := h.svc.Render(shell, meta)
				c.Header("Cache-Control", "public, max-age=60, s-maxage=300")
				c.Data(http.StatusOK, "text/html; charset=utf-8", body)
				return
			}
		}
	}
	if c.Query("preview") != "" {
		c.Header("X-Robots-Tag", "noindex, nofollow")
	}
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.File(h.indexPath)
}

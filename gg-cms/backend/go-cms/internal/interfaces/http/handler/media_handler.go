package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	"github.com/serenya/go-cms/pkg/config"
)

type MediaHandler struct {
	uploadCfg   config.UploadConfig
	settingsSvc settingssvc.Service
}

func NewMediaHandler(cfg config.UploadConfig, svc settingssvc.Service) *MediaHandler {
	return &MediaHandler{uploadCfg: cfg, settingsSvc: svc}
}

// POST /api/upload — accepts multipart form with "files" field
func (h *MediaHandler) Upload(c *gin.Context) {
	// Determine max size and allowed MIME types from settings
	maxMB := int64(10)
	allowedMIMEs := map[string]struct{}{}
	if all, err := h.settingsSvc.GetAll(c.Request.Context()); err == nil {
		if v, ok := all["upload.max_size_mb"]; ok {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
				maxMB = n
			}
		}
		if v, ok := all["upload.allowed_types"]; ok && v != "" {
			for _, mt := range strings.Split(v, ",") {
				mt = strings.TrimSpace(mt)
				if mt != "" {
					allowedMIMEs[mt] = struct{}{}
				}
			}
		}
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxMB<<20)

	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid multipart form or file too large"})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "no files provided"})
		return
	}

	storageProvider, err := h.settingsSvc.GetStorageProvider(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": fmt.Sprintf("storage error: %v", err)})
		return
	}

	type UploadResult struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		URL  string `json:"url"`
		Mime string `json:"mime"`
		Size int64  `json:"size"`
	}

	var results []UploadResult
	for _, fh := range files {
		f, err := fh.Open()
		if err != nil {
			continue
		}
		mime := fh.Header.Get("Content-Type")
		if mime == "" {
			mime = "application/octet-stream"
		}
		// Strip any parameters (e.g. "image/jpeg; charset=utf-8" → "image/jpeg")
		if idx := strings.Index(mime, ";"); idx != -1 {
			mime = strings.TrimSpace(mime[:idx])
		}
		if len(allowedMIMEs) > 0 {
			if _, ok := allowedMIMEs[mime]; !ok {
				f.Close()
				c.JSON(http.StatusUnsupportedMediaType, gin.H{"success": false, "message": fmt.Sprintf("file type not allowed: %s", mime)})
				return
			}
		}
		key, publicURL, err := storageProvider.Save(f, fh.Filename, mime, fh.Size)
		f.Close()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": fmt.Sprintf("upload failed: %v", err)})
			return
		}
		results = append(results, UploadResult{
			ID:   key,
			Name: fh.Filename,
			URL:  publicURL,
			Mime: mime,
			Size: fh.Size,
		})
	}

	c.JSON(http.StatusOK, results)
}

package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
)

type SettingsHandler struct {
	service settingssvc.Service
}

func NewSettingsHandler(svc settingssvc.Service) *SettingsHandler {
	return &SettingsHandler{service: svc}
}

// GET /api/settings — admin only
func (h *SettingsHandler) GetAll(c *gin.Context) {
	settings, err := h.service.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	// Mask S3 secret key — never expose it in plaintext
	if v, ok := settings["storage.s3.secret_key"]; ok && v != "" {
		settings["storage.s3.secret_key"] = "••••••••"
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": settings})
}

// allowedSettingKeys is the set of keys that may be written via the settings API.
var allowedSettingKeys = map[string]struct{}{
	"storage.provider":         {},
	"storage.local.upload_dir": {},
	"storage.local.base_url":   {},
	"storage.s3.bucket":        {},
	"storage.s3.region":        {},
	"storage.s3.access_key":    {},
	"storage.s3.secret_key":    {},
	"storage.s3.endpoint":      {},
	"storage.s3.public_url":    {},
	"upload.max_size_mb":        {},
	"upload.allowed_types":      {},
	// Feature flags
	"feature.learning_paths": {},
	"feature.interview_prep": {},
	"feature.social_login":   {},
}

// GET /api/features — public (no auth required)
// Returns only the feature-flag subset of settings so the frontend can gate UI.
func (h *SettingsHandler) GetFeatures(c *gin.Context) {
	all, err := h.service.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	boolVal := func(key, def string) bool {
		v, ok := all[key]
		if !ok {
			v = def
		}
		return v == "true"
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"learning_paths": boolVal("feature.learning_paths", "false"),
			"interview_prep": boolVal("feature.interview_prep", "false"),
			"social_login":   boolVal("feature.social_login", "true"),
		},
	})
}

// PUT /api/settings — admin only
func (h *SettingsHandler) Update(c *gin.Context) {
	var body map[string]string
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid JSON body"})
		return
	}
	// Do not allow overwriting the secret key with the masked placeholder
	if v, ok := body["storage.s3.secret_key"]; ok && v == "••••••••" {
		delete(body, "storage.s3.secret_key")
	}
	// Strip any keys that are not in the allowlist
	for k := range body {
		if _, ok := allowedSettingKeys[k]; !ok {
			delete(body, k)
		}
	}
	if len(body) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "no settings provided"})
		return
	}
	if err := h.service.SetMany(c.Request.Context(), body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "settings updated"})
}

// POST /api/settings/test-storage — admin only, tests current storage config
func (h *SettingsHandler) TestStorage(c *gin.Context) {
	provider, err := h.service.GetStorageProvider(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "storage provider: " + provider.Name()})
}

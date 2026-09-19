package middleware

import (
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORS() gin.HandlerFunc {
	originsStr := os.Getenv("CORS_ALLOWED_ORIGINS")
	var allowedOrigins []string
	if originsStr != "" {
		for _, o := range strings.Split(originsStr, ",") {
			if s := strings.TrimSpace(o); s != "" {
				allowedOrigins = append(allowedOrigins, s)
			}
		}
	}
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{"http://localhost:5173", "http://localhost:3000", "http://localhost:8080"}
	}

	headersStr := os.Getenv("CORS_ALLOWED_HEADERS")
	allowedHeaders := []string{"Origin", "Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With", "Accept"}
	if headersStr != "" {
		allowedHeaders = nil
		for _, h := range strings.Split(headersStr, ",") {
			if s := strings.TrimSpace(h); s != "" {
				allowedHeaders = append(allowedHeaders, s)
			}
		}
	}

	cfg := cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     allowedHeaders,
		ExposeHeaders:    []string{"Content-Length", "X-CSRF-Token"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	return cors.New(cfg)
}

package middleware

import (
	"crypto/subtle"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/pkg/response"
)

// FactorySecretHeader is the header the content-factory app sends its shared secret in.
const FactorySecretHeader = "X-Factory-Sync-Secret"

// FactorySecret validates the X-Factory-Sync-Secret header against the configured
// FACTORY_SYNC_SECRET for machine-to-machine ingest calls that have no user session
// (and therefore cannot use the JWT Auth middleware). Aborts with 401 when the
// configured secret is empty (ingest disabled) or the header doesn't match.
func FactorySecret(configuredSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if configuredSecret == "" {
			response.Unauthorized(c, "factory sync is not configured")
			c.Abort()
			return
		}
		provided := c.GetHeader(FactorySecretHeader)
		if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(configuredSecret)) != 1 {
			response.Unauthorized(c, "invalid or missing "+FactorySecretHeader)
			c.Abort()
			return
		}
		c.Next()
	}
}

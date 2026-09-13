package middleware

import (
	"crypto/subtle"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/pkg/response"
)

// AdminRecoverySecretHeader is the header the break-glass admin-recovery
// caller sends its shared secret in.
const AdminRecoverySecretHeader = "X-Admin-Recovery-Secret"

// AdminRecoverySecret validates the X-Admin-Recovery-Secret header against the
// configured ADMIN_RECOVERY_SECRET for the break-glass password-recovery
// endpoint, which has no user session (and therefore cannot use the JWT Auth
// middleware). Aborts with 401 when the configured secret is empty (recovery
// disabled) or the header doesn't match.
func AdminRecoverySecret(configuredSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if configuredSecret == "" {
			response.Unauthorized(c, "admin recovery is not configured")
			c.Abort()
			return
		}
		provided := c.GetHeader(AdminRecoverySecretHeader)
		if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(configuredSecret)) != 1 {
			response.Unauthorized(c, "invalid or missing "+AdminRecoverySecretHeader)
			c.Abort()
			return
		}
		c.Next()
	}
}

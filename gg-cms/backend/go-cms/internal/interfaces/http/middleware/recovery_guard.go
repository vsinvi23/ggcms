package middleware

import (
	"fmt"
	"net"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/pkg/logger"
	"github.com/serenya/go-cms/pkg/response"
	"go.uber.org/zap"
)

// ParseCIDRs parses a comma-separated list of CIDRs or bare IPs.
func ParseCIDRs(list string) ([]*net.IPNet, error) {
	var out []*net.IPNet
	for _, raw := range strings.Split(list, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if !strings.Contains(raw, "/") {
			if ip := net.ParseIP(raw); ip != nil && ip.To4() != nil {
				raw += "/32"
			} else {
				raw += "/128"
			}
		}
		_, n, err := net.ParseCIDR(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid CIDR %q: %w", raw, err)
		}
		out = append(out, n)
	}
	return out, nil
}

// RecoveryIPAllowList rejects callers outside the allowed networks before the
// shared secret is even evaluated. An empty list allows every address.
func RecoveryIPAllowList(allowed []*net.IPNet) gin.HandlerFunc {
	return func(c *gin.Context) {
		if len(allowed) == 0 {
			c.Next()
			return
		}
		ip := net.ParseIP(c.ClientIP())
		for _, n := range allowed {
			if ip != nil && n.Contains(ip) {
				c.Next()
				return
			}
		}
		RecoveryAlert(c, "admin.recovery_ip_denied", "source address not in RECOVERY_ALLOWED_CIDRS")
		response.Forbidden(c, "forbidden")
		c.Abort()
	}
}

// RecoveryAlert writes an audit record and a high-severity log line for any
// denied or successful use of the break-glass recovery endpoint.
func RecoveryAlert(c *gin.Context, action, reason string) {
	logger.Warn("SECURITY ALERT: admin recovery endpoint",
		zap.String("event", action), zap.String("reason", reason), zap.String("ip", c.ClientIP()))
	LogAudit(c, action, "admin_recovery", "", "", map[string]interface{}{"reason": reason})
}

package middleware

import (
	"regexp"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	keyRequestID    = "requestID"
	requestIDHeader = "X-Request-ID"
)

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{8,64}$`)

// RequestID accepts a well-formed inbound X-Request-ID or generates one, echoes it on
// the response and stores it on the context for logging.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(requestIDHeader)
		if !requestIDPattern.MatchString(id) {
			id = uuid.NewString()
		}
		c.Set(keyRequestID, id)
		c.Header(requestIDHeader, id)
		c.Next()
	}
}

func GetRequestID(c *gin.Context) string {
	id, _ := c.Get(keyRequestID)
	s, _ := id.(string)
	return s
}

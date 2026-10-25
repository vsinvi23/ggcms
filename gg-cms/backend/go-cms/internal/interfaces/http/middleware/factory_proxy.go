package middleware

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	FactoryTokenIssuer   = "gg-cms-factory-proxy"
	FactoryTokenAudience = "content-factory"
	factoryTokenTTL      = time.Minute
)

// FactoryServiceToken mints the short-lived HS256 token the /factory proxy
// sends upstream in place of the caller's cookies. It is only issued after
// Auth + AdminOnly + CSRF have passed.
func FactoryServiceToken(secret string, userID uint, email string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   fmt.Sprint(userID),
		"email": email,
		"role":  "admin",
		"iss":   FactoryTokenIssuer,
		"aud":   FactoryTokenAudience,
		"jti":   uuid.NewString(),
		"iat":   now.Unix(),
		"exp":   now.Add(factoryTokenTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

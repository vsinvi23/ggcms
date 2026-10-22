package middleware_test

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
)

func TestFactoryServiceToken(t *testing.T) {
	secret := "0123456789abcdef0123456789abcdef"
	tok, err := middleware.FactoryServiceToken(secret, 7, "a@x.io")
	if err != nil {
		t.Fatal(err)
	}
	claims := jwt.MapClaims{}
	_, err = jwt.ParseWithClaims(tok, claims, func(*jwt.Token) (interface{}, error) { return []byte(secret), nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(middleware.FactoryTokenIssuer),
		jwt.WithAudience(middleware.FactoryTokenAudience), jwt.WithExpirationRequired())
	if err != nil {
		t.Fatalf("token did not validate: %v", err)
	}
	if claims["sub"] != "7" || claims["role"] != "admin" {
		t.Fatalf("unexpected claims: %v", claims)
	}
	exp, _ := claims.GetExpirationTime()
	if time.Until(exp.Time) > 2*time.Minute {
		t.Fatal("service token lifetime too long")
	}
	if _, err := jwt.Parse(tok, func(*jwt.Token) (interface{}, error) { return []byte("other-secret-other-secret-other!!"), nil }); err == nil {
		t.Fatal("token validated with the wrong secret")
	}
}

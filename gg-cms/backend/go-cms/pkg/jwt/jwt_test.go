package jwt

import (
	"testing"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
	"github.com/serenya/go-cms/pkg/config"
)

func newMgr(iss, aud string, ttlMin int) *Manager {
	return NewManager(&config.JWTConfig{Secret: "0123456789abcdef0123456789abcdef", Issuer: iss, Audience: aud, AccessTTLMinutes: ttlMin})
}

func TestGenerateValidateRoundTrip(t *testing.T) {
	m := newMgr("iss", "aud", 15)
	tok, err := m.Generate(7, "a@b.c", "user", 3, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	c, err := m.Validate(tok)
	if err != nil || c.UserID != 7 || c.TokenVersion != 3 || c.ID == "" || c.Issuer != "iss" {
		t.Fatalf("bad claims %+v %v", c, err)
	}
	if exp := c.ExpiresAt.Sub(c.IssuedAt.Time); exp != 15*time.Minute {
		t.Fatalf("access TTL must be 15m, got %v", exp)
	}
}

func TestValidateRejects(t *testing.T) {
	m := newMgr("iss", "aud", 15)
	secret := []byte("0123456789abcdef0123456789abcdef")
	base := func() *Claims {
		now := time.Now()
		return &Claims{UserID: 1, RegisteredClaims: gojwt.RegisteredClaims{
			Issuer: "iss", Audience: gojwt.ClaimStrings{"aud"}, ID: "j",
			ExpiresAt: gojwt.NewNumericDate(now.Add(time.Minute)), IssuedAt: gojwt.NewNumericDate(now),
		}}
	}
	sign := func(method gojwt.SigningMethod, c *Claims, key interface{}) string {
		s, err := gojwt.NewWithClaims(method, c).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}

	wrongIss := base()
	wrongIss.Issuer = "other"
	wrongAud := base()
	wrongAud.Audience = gojwt.ClaimStrings{"other"}
	expired := base()
	expired.ExpiresAt = gojwt.NewNumericDate(time.Now().Add(-time.Hour))
	noExp := base()
	noExp.ExpiresAt = nil

	cases := map[string]string{
		"wrong issuer":   sign(gojwt.SigningMethodHS256, wrongIss, secret),
		"wrong audience": sign(gojwt.SigningMethodHS256, wrongAud, secret),
		"expired":        sign(gojwt.SigningMethodHS256, expired, secret),
		"no exp":         sign(gojwt.SigningMethodHS256, noExp, secret),
		"HS512":          sign(gojwt.SigningMethodHS512, base(), secret),
		"wrong secret":   sign(gojwt.SigningMethodHS256, base(), []byte("another-secret-another-secret-123")),
		"alg none":       sign(gojwt.SigningMethodNone, base(), gojwt.UnsafeAllowNoneSignatureType),
		"garbage":        "not.a.jwt",
	}
	for name, tok := range cases {
		if _, err := m.Validate(tok); err == nil {
			t.Errorf("%s must be rejected", name)
		}
	}
	if _, err := m.Validate(sign(gojwt.SigningMethodHS256, base(), secret)); err != nil {
		t.Fatalf("control token must pass: %v", err)
	}
}

package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/serenya/go-cms/pkg/config"
)

type Claims struct {
	UserID       uint   `json:"userId"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	TokenVersion int    `json:"tv"`
	AuthTime     int64  `json:"auth_time"`
	jwt.RegisteredClaims
}

type Manager struct {
	secret   []byte
	issuer   string
	audience string
	ttl      time.Duration
}

func NewManager(cfg *config.JWTConfig) *Manager {
	ttl := time.Duration(cfg.AccessTTLMinutes) * time.Minute
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	return &Manager{
		secret:   []byte(cfg.Secret),
		issuer:   cfg.Issuer,
		audience: cfg.Audience,
		ttl:      ttl,
	}
}

func (m *Manager) AccessTTL() time.Duration { return m.ttl }

func (m *Manager) Generate(userID uint, email, role string, tokenVersion int, authTime time.Time) (string, error) {
	now := time.Now()
	claims := &Claims{
		UserID:       userID,
		Email:        email,
		Role:         role,
		TokenVersion: tokenVersion,
		AuthTime:     authTime.Unix(),
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", userID),
			Issuer:    m.issuer,
			Audience:  jwt.ClaimStrings{m.audience},
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *Manager) Validate(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return m.secret, nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer(m.issuer),
		jwt.WithAudience(m.audience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(5*time.Second),
	)
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid || claims.UserID == 0 || claims.ID == "" {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

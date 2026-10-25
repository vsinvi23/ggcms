package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

var (
	ErrInvalidSession  = errors.New("invalid session")
	ErrSessionRevoked  = errors.New("session revoked")
	ErrRefreshReuse    = fmt.Errorf("refresh token reuse detected: %w", ErrInvalidSession)
	ErrAccountDisabled = errors.New("account is disabled")
)

const (
	guardTTL          = 10 * time.Second
	guardMaxEntries   = 10000
	refreshReuseGrace = 10 * time.Second
)

type Meta struct {
	UserAgent string
	IP        string
}

type Tokens struct {
	Access         string
	Refresh        string
	AccessExpires  time.Time
	RefreshExpires time.Time
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func RandomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func IsActive(s entity.UserStatus) bool {
	return s != entity.UserStatusDeactivated && s != entity.UserStatusInactive
}

type SessionInfo struct {
	Role          string
	EmailVerified bool
}

type guardEntry struct {
	version int
	active  bool
	info    SessionInfo
	expires time.Time
}

// SessionGuard validates token_version / account status / role for every
// authenticated request, caching the user state briefly.
type SessionGuard struct {
	users repository.UserRepository
	mu    sync.Mutex
	cache map[uint]guardEntry
	ttl   time.Duration
}

func NewSessionGuard(users repository.UserRepository) *SessionGuard {
	return &SessionGuard{users: users, cache: make(map[uint]guardEntry), ttl: guardTTL}
}

func (g *SessionGuard) Invalidate(userID uint) {
	g.mu.Lock()
	delete(g.cache, userID)
	g.mu.Unlock()
}

func (g *SessionGuard) Check(ctx context.Context, userID uint, tokenVersion int) (*SessionInfo, error) {
	now := time.Now()
	g.mu.Lock()
	e, ok := g.cache[userID]
	g.mu.Unlock()
	if !ok || now.After(e.expires) {
		u, err := g.users.FindByID(ctx, userID)
		if err != nil {
			return nil, ErrSessionRevoked
		}
		e = guardEntry{
			version: u.TokenVersion,
			active:  IsActive(u.Status),
			info:    SessionInfo{Role: RoleFromGroups(u.Groups), EmailVerified: u.EmailVerified},
			expires: now.Add(g.ttl),
		}
		g.mu.Lock()
		if len(g.cache) >= guardMaxEntries {
			for k, v := range g.cache {
				if now.After(v.expires) {
					delete(g.cache, k)
				}
			}
			if len(g.cache) >= guardMaxEntries {
				g.cache = make(map[uint]guardEntry)
			}
		}
		g.cache[userID] = e
		g.mu.Unlock()
	}
	if !e.active || e.version != tokenVersion {
		return nil, ErrSessionRevoked
	}
	info := e.info
	return &info, nil
}

// Sessions issues, rotates and revokes access + refresh token pairs.
type Sessions struct {
	users      repository.UserRepository
	userAuth   repository.UserAuthRepository
	refresh    repository.RefreshTokenRepository
	jwt        *jwtpkg.Manager
	guard      *SessionGuard
	refreshTTL time.Duration
}

func NewSessions(
	users repository.UserRepository,
	userAuth repository.UserAuthRepository,
	refresh repository.RefreshTokenRepository,
	jwtManager *jwtpkg.Manager,
	guard *SessionGuard,
	refreshTTL time.Duration,
) *Sessions {
	return &Sessions{users: users, userAuth: userAuth, refresh: refresh, jwt: jwtManager, guard: guard, refreshTTL: refreshTTL}
}

func (s *Sessions) Guard() *SessionGuard { return s.guard }

// Issue starts a new refresh-token family for the user (a fresh login).
func (s *Sessions) Issue(ctx context.Context, userID uint, meta Meta, authTime time.Time) (*entity.User, *Tokens, error) {
	return s.issue(ctx, userID, uuid.NewString(), meta, authTime)
}

func (s *Sessions) issue(ctx context.Context, userID uint, family string, meta Meta, authTime time.Time) (*entity.User, *Tokens, error) {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, nil, fmt.Errorf("load user for session: %w", err)
	}
	if !IsActive(u.Status) {
		return nil, nil, ErrAccountDisabled
	}
	role := RoleFromGroups(u.Groups)
	access, err := s.jwt.Generate(u.ID, u.Email, role, u.TokenVersion, authTime)
	if err != nil {
		return nil, nil, fmt.Errorf("sign access token: %w", err)
	}
	raw, err := RandomToken(32)
	if err != nil {
		return nil, nil, err
	}
	now := time.Now()
	rt := &entity.RefreshToken{
		ID:        uuid.NewString(),
		UserID:    u.ID,
		FamilyID:  family,
		TokenHash: HashToken(raw),
		AuthTime:  authTime,
		ExpiresAt: now.Add(s.refreshTTL),
		UserAgent: truncate(meta.UserAgent, 255),
		IP:        truncate(meta.IP, 64),
	}
	if err := s.refresh.Create(ctx, rt); err != nil {
		return nil, nil, fmt.Errorf("store refresh token: %w", err)
	}
	return u, &Tokens{
		Access:         access,
		Refresh:        raw,
		AccessExpires:  now.Add(s.jwt.AccessTTL()),
		RefreshExpires: rt.ExpiresAt,
	}, nil
}

// Refresh rotates the refresh token. Presenting an already-rotated token (outside
// the short concurrency grace window) is treated as theft and revokes the family.
func (s *Sessions) Refresh(ctx context.Context, raw string, meta Meta) (*entity.User, *Tokens, error) {
	if raw == "" {
		return nil, nil, ErrInvalidSession
	}
	now := time.Now()
	rt, err := s.refresh.FindByHash(ctx, HashToken(raw))
	if err != nil {
		return nil, nil, ErrInvalidSession
	}
	if rt.RevokedAt != nil || now.After(rt.ExpiresAt) {
		return nil, nil, ErrInvalidSession
	}
	if rt.UsedAt != nil {
		if now.Sub(*rt.UsedAt) > refreshReuseGrace {
			_ = s.refresh.RevokeFamily(ctx, rt.FamilyID)
			logger.Warn("auth: refresh token reuse detected, family revoked",
				zap.Uint("userId", rt.UserID), zap.String("family", rt.FamilyID))
			return nil, nil, ErrRefreshReuse
		}
		return nil, nil, ErrInvalidSession
	}
	ok, err := s.refresh.Consume(ctx, rt.ID, now)
	if err != nil || !ok {
		return nil, nil, ErrInvalidSession
	}
	u, tokens, err := s.issue(ctx, rt.UserID, rt.FamilyID, meta, rt.AuthTime)
	if err != nil {
		_ = s.refresh.RevokeFamily(ctx, rt.FamilyID)
		return nil, nil, ErrInvalidSession
	}
	return u, tokens, nil
}

// RevokeByToken revokes the refresh-token family the raw token belongs to.
func (s *Sessions) RevokeByToken(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	rt, err := s.refresh.FindByHash(ctx, HashToken(raw))
	if err != nil {
		return nil
	}
	return s.refresh.RevokeFamily(ctx, rt.FamilyID)
}

// RevokeAll invalidates every access and refresh token of the user.
func (s *Sessions) RevokeAll(ctx context.Context, userID uint) error {
	if err := s.userAuth.BumpTokenVersion(ctx, userID); err != nil {
		return fmt.Errorf("bump token version: %w", err)
	}
	s.guard.Invalidate(userID)
	if err := s.refresh.RevokeAllForUser(ctx, userID); err != nil {
		return fmt.Errorf("revoke refresh tokens: %w", err)
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

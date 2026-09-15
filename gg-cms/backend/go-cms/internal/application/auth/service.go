package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"github.com/serenya/go-cms/pkg/mailer"
	"github.com/serenya/go-cms/pkg/password"
)

const resetTokenTTL = time.Hour

type Service interface {
	Login(ctx context.Context, email, pwd string) (token string, user *entity.User, err error)
	Register(ctx context.Context, email, pwd, name string, mobileNo *string) (token string, user *entity.User, err error)
	GetCurrentUser(ctx context.Context, userID uint) (*entity.User, error)
	RequestReset(ctx context.Context, email string) error
	ConfirmReset(ctx context.Context, code, newPassword string) error
	// RecoverPassword sets a user's password directly by email, bypassing the
	// token/email flow. Used only by the secret-gated break-glass endpoint.
	RecoverPassword(ctx context.Context, email, newPassword string) error
}

type service struct {
	userRepo    repository.UserRepository
	groupRepo   repository.GroupRepository
	resetRepo   repository.PasswordResetTokenRepository
	jwtManager  *jwtpkg.Manager
	mailer      *mailer.Mailer
	frontendURL string
}

func NewService(
	userRepo repository.UserRepository,
	groupRepo repository.GroupRepository,
	resetRepo repository.PasswordResetTokenRepository,
	jwtManager *jwtpkg.Manager,
	mailer *mailer.Mailer,
	frontendURL string,
) Service {
	return &service{
		userRepo:    userRepo,
		groupRepo:   groupRepo,
		resetRepo:   resetRepo,
		jwtManager:  jwtManager,
		mailer:      mailer,
		frontendURL: frontendURL,
	}
}

func (s *service) Login(ctx context.Context, email, pwd string) (string, *entity.User, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	if !password.Compare(user.PasswordHash, pwd) {
		return "", nil, errors.New("invalid credentials")
	}

	if user.Status == entity.UserStatusDeactivated || user.Status == entity.UserStatusInactive {
		return "", nil, fmt.Errorf("account is %s", user.Status)
	}

	groups, _ := s.groupRepo.FindByUserID(ctx, user.ID)
	user.Groups = groups

	role := s.resolveRole(groups)
	token, err := s.jwtManager.Generate(user.ID, user.Email, role)
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate token: %w", err)
	}

	s.userRepo.UpdateLastLogin(ctx, user.ID, time.Now())
	return token, user, nil
}

func (s *service) Register(ctx context.Context, email, pwd, name string, mobileNo *string) (string, *entity.User, error) {
	existing, _ := s.userRepo.FindByEmail(ctx, email)
	if existing != nil {
		return "", nil, errors.New("email already registered")
	}

	hash, err := password.Hash(pwd)
	if err != nil {
		return "", nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := &entity.User{
		Email:        email,
		PasswordHash: hash,
		Name:         name,
		MobileNo:     mobileNo,
		Status:       entity.UserStatusActive,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return "", nil, fmt.Errorf("failed to create user: %w", err)
	}

	token, err := s.jwtManager.Generate(user.ID, user.Email, "user")
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return token, user, nil
}

func (s *service) GetCurrentUser(ctx context.Context, userID uint) (*entity.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}

// RequestReset always returns nil regardless of whether the email exists, to
// avoid leaking which emails are registered (anti-enumeration).
func (s *service) RequestReset(ctx context.Context, email string) error {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil
	}

	rawToken := make([]byte, 32)
	if _, err := rand.Read(rawToken); err != nil {
		return nil
	}
	rawTokenHex := hex.EncodeToString(rawToken)
	hash := sha256.Sum256([]byte(rawTokenHex))

	resetToken := &entity.PasswordResetToken{
		UserID:    user.ID,
		TokenHash: hex.EncodeToString(hash[:]),
		ExpiresAt: time.Now().Add(resetTokenTTL),
	}
	if err := s.resetRepo.Create(ctx, resetToken); err != nil {
		return nil
	}

	link := fmt.Sprintf("%s/reset-password?code=%s", s.frontendURL, rawTokenHex)
	body := fmt.Sprintf("Reset your password: %s\n\nThis link expires in 1 hour.", link)
	_ = s.mailer.Send(user.Email, "Reset your password", body)

	return nil
}

// ConfirmReset validates the raw token, updates the password, and marks the
// token used.
func (s *service) ConfirmReset(ctx context.Context, code, newPassword string) error {
	hash := sha256.Sum256([]byte(code))
	resetToken, err := s.resetRepo.FindValidByHash(ctx, hex.EncodeToString(hash[:]))
	if err != nil {
		return errors.New("invalid or expired reset code")
	}

	user, err := s.userRepo.FindByID(ctx, resetToken.UserID)
	if err != nil {
		return errors.New("invalid or expired reset code")
	}

	newHash, err := password.Hash(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	user.PasswordHash = newHash
	if err := s.userRepo.Update(ctx, user); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	return s.resetRepo.MarkUsed(ctx, resetToken.ID)
}

// RecoverPassword sets a user's password directly by email. Used only by the
// secret-gated break-glass endpoint, which is the only caller expected to
// have verified authorization before reaching this method.
func (s *service) RecoverPassword(ctx context.Context, email, newPassword string) error {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return errors.New("user not found")
	}

	hash, err := password.Hash(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	user.PasswordHash = hash
	return s.userRepo.Update(ctx, user)
}

// resolveRole returns "admin" if user belongs to an admin/superadmin/masteradmin group, otherwise "user".
func (s *service) resolveRole(groups []entity.Group) string {
	for _, g := range groups {
		name := strings.ToLower(g.Name)
		if name == "admin" || name == "superadmin" || name == "super_admin" || name == "super-admin" || name == "masteradmin" || name == "master_admin" {
			return "admin"
		}
	}
	return "user"
}

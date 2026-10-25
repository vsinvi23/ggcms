package auth

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/serenya/go-cms/internal/application/identity"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/logger"
	"github.com/serenya/go-cms/pkg/password"
	"go.uber.org/zap"
)

const resetTokenTTL = time.Hour

var (
	ErrInvalidCredentials = identity.ErrInvalidCredentials
	ErrAccountDisabled    = identity.ErrAccountDisabled
	ErrInvalidResetCode   = errors.New("invalid or expired reset code")
	ErrReauthRequired     = errors.New("recent authentication required")
	ErrTooManyAttempts    = identity.ErrTooManyAttempts
	ErrRecoveryTarget     = errors.New("recovery is restricted to administrator accounts")
)

type Option func(*service)

func WithLoginThrottle(t *identity.LoginThrottle) Option {
	return func(s *service) { s.throttle = t }
}

type Session struct {
	User   *entity.User
	Role   string
	Tokens *identity.Tokens
}

type VerifyResult struct {
	Kind    string
	Session *Session
}

type Service interface {
	Login(ctx context.Context, identifier, pwd string, meta identity.Meta) (*Session, error)
	// Register never reveals whether the email is already taken; it always returns nil for
	// a well-formed request.
	Register(ctx context.Context, email, pwd, name string) error
	Refresh(ctx context.Context, rawRefresh string, meta identity.Meta) (*Session, error)
	Logout(ctx context.Context, rawRefresh string) error
	LogoutAll(ctx context.Context, userID uint) error
	ChangePassword(ctx context.Context, userID uint, current, newPwd string, authTime time.Time, meta identity.Meta) (*Session, error)
	Reauth(ctx context.Context, userID uint, pwd string, meta identity.Meta) (*Session, error)
	GetCurrentUser(ctx context.Context, userID uint) (*entity.User, error)
	RequestReset(ctx context.Context, email string) error
	ConfirmReset(ctx context.Context, code, newPassword string) error
	// RecoverPassword sets a user's password directly by email, bypassing the
	// token/email flow. Used only by the secret-gated break-glass endpoint.
	RecoverPassword(ctx context.Context, email, newPassword string) error
	VerifyEmail(ctx context.Context, token string, meta identity.Meta) (*VerifyResult, error)
	ResendVerification(ctx context.Context, userID uint) error
}

type service struct {
	userRepo    repository.UserRepository
	userAuth    repository.UserAuthRepository
	resetRepo   repository.PasswordResetTokenRepository
	sessions    *identity.Sessions
	identity    *identity.Service
	notifier    *identity.Notifier
	frontendURL string
	hibp        bool
	reauthWin   time.Duration
	throttle    *identity.LoginThrottle
}

func NewService(
	userRepo repository.UserRepository,
	userAuth repository.UserAuthRepository,
	resetRepo repository.PasswordResetTokenRepository,
	sessions *identity.Sessions,
	idSvc *identity.Service,
	notifier *identity.Notifier,
	frontendURL string,
	hibp bool,
	reauthWindow time.Duration,
	opts ...Option,
) Service {
	s := &service{
		userRepo: userRepo, userAuth: userAuth, resetRepo: resetRepo, sessions: sessions,
		identity: idSvc, notifier: notifier, frontendURL: strings.TrimRight(frontendURL, "/"),
		hibp: hibp, reauthWin: reauthWindow,
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

func (s *service) checkPassword(ctx context.Context, pwd string, hints ...string) error {
	if err := password.Validate(pwd, hints...); err != nil {
		return err
	}
	if s.hibp {
		return password.CheckBreached(ctx, pwd)
	}
	return nil
}

func (s *service) newSession(ctx context.Context, userID uint, meta identity.Meta, authTime time.Time) (*Session, error) {
	u, tokens, err := s.sessions.Issue(ctx, userID, meta, authTime)
	if err != nil {
		return nil, err
	}
	return &Session{User: u, Role: identity.RoleFromGroups(u.Groups), Tokens: tokens}, nil
}

func (s *service) Login(ctx context.Context, identifier, pwd string, meta identity.Meta) (*Session, error) {
	if err := s.throttle.Check(identifier, meta.IP); err != nil {
		return nil, err
	}
	sess, err := s.login(ctx, identifier, pwd, meta)
	switch {
	case err == nil:
		s.throttle.Success(identifier, meta.IP)
	case errors.Is(err, ErrInvalidCredentials):
		if s.throttle.Fail(identifier, meta.IP) {
			if lockErr := s.throttle.Check(identifier, meta.IP); lockErr != nil {
				return nil, lockErr
			}
		}
	}
	return sess, err
}

func (s *service) login(ctx context.Context, identifier, pwd string, meta identity.Meta) (*Session, error) {
	user, err := s.userRepo.FindByEmail(ctx, identifier)
	if err != nil {
		if !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
		password.DummyCompare(pwd)
		return nil, ErrInvalidCredentials
	}
	if !user.PasswordSet {
		password.DummyCompare(pwd)
		return nil, ErrInvalidCredentials
	}
	if !password.Compare(user.PasswordHash, pwd) {
		return nil, ErrInvalidCredentials
	}
	if !identity.IsActive(user.Status) {
		return nil, ErrAccountDisabled
	}

	now := time.Now()
	sess, err := s.newSession(ctx, user.ID, meta, now)
	if err != nil {
		return nil, err
	}
	_ = s.userRepo.UpdateLastLogin(ctx, user.ID, now)
	return sess, nil
}

func (s *service) Register(ctx context.Context, email, pwd, name string) error {
	email = identity.NormalizeEmail(email)
	name = strings.TrimSpace(name)
	if a, err := mail.ParseAddress(email); err != nil || a.Address != email || len(email) > 254 {
		return &password.PolicyError{Msg: "invalid email address"}
	}
	if name == "" || utf8.RuneCountInString(name) > password.MaxName {
		return &password.PolicyError{Msg: fmt.Sprintf("name must be 1-%d characters", password.MaxName)}
	}
	if err := s.checkPassword(ctx, pwd, email, name); err != nil {
		return err
	}

	hash, err := password.Hash(pwd)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	existing, err := s.userRepo.FindByEmail(ctx, email)
	if err == nil {
		s.notifier.Send(existing.Email, "Sign-up attempt with your email",
			"Someone tried to create an account with this email address. If it was you, sign in or reset your password instead. If not, you can ignore this message.")
		return nil
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return err
	}

	user := &entity.User{
		Email:        email,
		PasswordHash: hash,
		Name:         name,
		Status:       entity.UserStatusActive,
		PasswordSet:  true,
	}
	if err := s.userAuth.CreateWithGroup(ctx, user, identity.LearnerGroup); err != nil {
		if strings.Contains(err.Error(), "SQLSTATE 23505") {
			return nil
		}
		return fmt.Errorf("failed to create user: %w", err)
	}
	if err := s.identity.SendVerification(ctx, user); err != nil {
		logger.Warn("auth: could not create verification token", zap.Error(err))
	}
	return nil
}

func (s *service) Refresh(ctx context.Context, rawRefresh string, meta identity.Meta) (*Session, error) {
	u, tokens, err := s.sessions.Refresh(ctx, rawRefresh, meta)
	if err != nil {
		return nil, err
	}
	return &Session{User: u, Role: identity.RoleFromGroups(u.Groups), Tokens: tokens}, nil
}

func (s *service) Logout(ctx context.Context, rawRefresh string) error {
	return s.sessions.RevokeByToken(ctx, rawRefresh)
}

func (s *service) LogoutAll(ctx context.Context, userID uint) error {
	return s.sessions.RevokeAll(ctx, userID)
}

func (s *service) ChangePassword(ctx context.Context, userID uint, current, newPwd string, authTime time.Time, meta identity.Meta) (*Session, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user.PasswordSet {
		if !password.Compare(user.PasswordHash, current) {
			return nil, ErrInvalidCredentials
		}
	} else if time.Since(authTime) > s.reauthWin {
		return nil, ErrReauthRequired
	}
	if err := s.checkPassword(ctx, newPwd, user.Email, user.Name); err != nil {
		return nil, err
	}
	hash, err := password.Hash(newPwd)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}
	if err := s.userAuth.SetPassword(ctx, userID, hash, true); err != nil {
		return nil, fmt.Errorf("failed to update password: %w", err)
	}
	_ = s.resetRepo.InvalidateForUser(ctx, userID)
	if err := s.sessions.RevokeAll(ctx, userID); err != nil {
		return nil, err
	}
	s.notifier.Send(user.Email, "Your password was changed",
		"The password for your account was just changed. If this wasn't you, reset your password immediately.")
	return s.newSession(ctx, userID, meta, time.Now())
}

func (s *service) Reauth(ctx context.Context, userID uint, pwd string, meta identity.Meta) (*Session, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !user.PasswordSet || !password.Compare(user.PasswordHash, pwd) {
		return nil, ErrInvalidCredentials
	}
	return s.newSession(ctx, userID, meta, time.Now())
}

func (s *service) GetCurrentUser(ctx context.Context, userID uint) (*entity.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}

// RequestReset always returns nil and does its work asynchronously so neither the
// response nor its timing reveals whether the email is registered.
func (s *service) RequestReset(_ context.Context, email string) error {
	email = identity.NormalizeEmail(email)
	go func() {
		defer func() { _ = recover() }()
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		s.sendReset(ctx, email)
	}()
	return nil
}

func (s *service) sendReset(ctx context.Context, email string) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil || !identity.IsActive(user.Status) {
		return
	}
	raw, err := identity.RandomToken(32)
	if err != nil {
		return
	}
	_ = s.resetRepo.InvalidateForUser(ctx, user.ID)
	if err := s.resetRepo.Create(ctx, &entity.PasswordResetToken{
		UserID:    user.ID,
		TokenHash: identity.HashToken(raw),
		ExpiresAt: time.Now().Add(resetTokenTTL),
	}); err != nil {
		return
	}
	link := fmt.Sprintf("%s/reset-password?code=%s", s.frontendURL, raw)
	s.notifier.Send(user.Email, "Reset your password",
		fmt.Sprintf("Reset your password: %s\n\nThis link expires in 1 hour. If you didn't request it, ignore this message.", link))
}

// ConfirmReset validates the raw token, updates the password, revokes every
// session and outstanding reset token, and notifies the owner.
func (s *service) ConfirmReset(ctx context.Context, code, newPassword string) error {
	resetToken, err := s.resetRepo.FindValidByHash(ctx, identity.HashToken(code))
	if err != nil {
		return ErrInvalidResetCode
	}
	user, err := s.userRepo.FindByID(ctx, resetToken.UserID)
	if err != nil {
		return ErrInvalidResetCode
	}
	if err := s.checkPassword(ctx, newPassword, user.Email, user.Name); err != nil {
		return err
	}
	newHash, err := password.Hash(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	if err := s.resetRepo.MarkUsed(ctx, resetToken.ID); err != nil {
		return ErrInvalidResetCode
	}
	if err := s.userAuth.SetPassword(ctx, user.ID, newHash, true); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}
	if !user.EmailVerified {
		_ = s.userAuth.MarkEmailVerified(ctx, user.ID, time.Now())
	}
	_ = s.resetRepo.InvalidateForUser(ctx, user.ID)
	if err := s.sessions.RevokeAll(ctx, user.ID); err != nil {
		return err
	}
	s.notifier.Send(user.Email, "Your password was reset",
		"The password for your account was just reset. If this wasn't you, contact support immediately.")
	return nil
}

// RecoverPassword sets a user's password directly by email. Used only by the
// secret-gated break-glass endpoint, which is the only caller expected to
// have verified authorization before reaching this method. Only administrator
// accounts can be recovered this way.
func (s *service) RecoverPassword(ctx context.Context, email, newPassword string) error {
	user, err := s.userRepo.FindByEmail(ctx, identity.NormalizeEmail(email))
	if err != nil {
		return errors.New("user not found")
	}
	if identity.RoleFromGroups(user.Groups) != identity.RoleAdmin {
		return ErrRecoveryTarget
	}
	if err := s.checkPassword(ctx, newPassword, user.Email, user.Name); err != nil {
		return err
	}
	hash, err := password.Hash(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	if err := s.userAuth.SetPassword(ctx, user.ID, hash, true); err != nil {
		return err
	}
	return s.sessions.RevokeAll(ctx, user.ID)
}

func (s *service) VerifyEmail(ctx context.Context, token string, meta identity.Meta) (*VerifyResult, error) {
	kind, user, err := s.identity.VerifyToken(ctx, token)
	if err != nil {
		return nil, err
	}
	res := &VerifyResult{Kind: kind}
	if kind != identity.VerifiedResult {
		sess, err := s.newSession(ctx, user.ID, meta, time.Now())
		if err != nil {
			return nil, err
		}
		_ = s.userRepo.UpdateLastLogin(ctx, user.ID, time.Now())
		res.Session = sess
	}
	return res, nil
}

func (s *service) ResendVerification(ctx context.Context, userID uint) error {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	return s.identity.SendVerification(ctx, user)
}

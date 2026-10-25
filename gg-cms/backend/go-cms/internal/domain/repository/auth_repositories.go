package repository

import (
	"context"
	"errors"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
)

var ErrNotFound = errors.New("not found")

type UserAuthRepository interface {
	SetPassword(ctx context.Context, userID uint, hash string, passwordSet bool) error
	BumpTokenVersion(ctx context.Context, userID uint) error
	MarkEmailVerified(ctx context.Context, userID uint, at time.Time) error
	NeutralisePassword(ctx context.Context, userID uint, randomHash string, at time.Time) error
	CreateWithGroup(ctx context.Context, user *entity.User, groupName string) error
}

type RefreshTokenRepository interface {
	Create(ctx context.Context, t *entity.RefreshToken) error
	FindByHash(ctx context.Context, hash string) (*entity.RefreshToken, error)
	// Consume atomically marks the token used; false means it was already used or revoked.
	Consume(ctx context.Context, id string, at time.Time) (bool, error)
	RevokeFamily(ctx context.Context, familyID string) error
	RevokeAllForUser(ctx context.Context, userID uint) error
}

type IdentityRepository interface {
	FindByProvider(ctx context.Context, provider, providerUserID string) (*entity.UserIdentity, error)
	ListByUser(ctx context.Context, userID uint) ([]entity.UserIdentity, error)
	Create(ctx context.Context, identity *entity.UserIdentity) error
	Delete(ctx context.Context, userID uint, provider string) (bool, error)
	TouchLogin(ctx context.Context, id uint, at time.Time) error
}

type OAuthTransactionRepository interface {
	Create(ctx context.Context, tx *entity.OAuthTransaction) error
	// Consume atomically marks the transaction used and returns it; ErrNotFound when missing, used or expired.
	Consume(ctx context.Context, state string, at time.Time) (*entity.OAuthTransaction, error)
}

type EmailTokenRepository interface {
	Create(ctx context.Context, t *entity.EmailVerificationToken) error
	// Consume atomically marks a valid token of the given purposes used and returns it.
	Consume(ctx context.Context, tokenHash string, at time.Time, purposes ...string) (*entity.EmailVerificationToken, error)
	// Peek returns a valid unused token without consuming it.
	Peek(ctx context.Context, tokenHash string, at time.Time, purposes ...string) (*entity.EmailVerificationToken, error)
}

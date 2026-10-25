package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

func mapNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return repository.ErrNotFound
	}
	return err
}

// ── users (auth-specific writes) ────────────────────────────────────────────

type userAuthRepository struct{ write *gorm.DB }

func NewUserAuthRepository(write *gorm.DB) repository.UserAuthRepository {
	return &userAuthRepository{write: write}
}

func (r *userAuthRepository) SetPassword(ctx context.Context, userID uint, hash string, passwordSet bool) error {
	return r.write.WithContext(ctx).Model(&entity.User{}).Where("id = ?", userID).
		Updates(map[string]interface{}{
			"password_hash": hash,
			"password_set":  passwordSet,
			"token_version": gorm.Expr("token_version + 1"),
		}).Error
}

func (r *userAuthRepository) BumpTokenVersion(ctx context.Context, userID uint) error {
	return r.write.WithContext(ctx).Model(&entity.User{}).Where("id = ?", userID).
		Update("token_version", gorm.Expr("token_version + 1")).Error
}

func (r *userAuthRepository) MarkEmailVerified(ctx context.Context, userID uint, at time.Time) error {
	return r.write.WithContext(ctx).Model(&entity.User{}).Where("id = ?", userID).
		Updates(map[string]interface{}{"email_verified": true, "email_verified_at": at}).Error
}

func (r *userAuthRepository) NeutralisePassword(ctx context.Context, userID uint, randomHash string, at time.Time) error {
	return r.write.WithContext(ctx).Model(&entity.User{}).Where("id = ?", userID).
		Updates(map[string]interface{}{
			"password_hash":     randomHash,
			"password_set":      false,
			"email_verified":    true,
			"email_verified_at": at,
			"token_version":     gorm.Expr("token_version + 1"),
		}).Error
}

func (r *userAuthRepository) CreateWithGroup(ctx context.Context, user *entity.User, groupName string) error {
	user.Email = normalizeEmail(user.Email)
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		return tx.Exec(
			"INSERT INTO user_groups (user_id, group_id) SELECT ?, id FROM groups WHERE name = ? AND deleted_at IS NULL ON CONFLICT DO NOTHING",
			user.ID, groupName,
		).Error
	})
}

// ── refresh tokens ──────────────────────────────────────────────────────────

type refreshTokenRepository struct{ write, read *gorm.DB }

func NewRefreshTokenRepository(write, read *gorm.DB) repository.RefreshTokenRepository {
	return &refreshTokenRepository{write: write, read: read}
}

func (r *refreshTokenRepository) Create(ctx context.Context, t *entity.RefreshToken) error {
	if t.ID == "" {
		t.ID = uuid.NewString()
	}
	return r.write.WithContext(ctx).Create(t).Error
}

func (r *refreshTokenRepository) FindByHash(ctx context.Context, hash string) (*entity.RefreshToken, error) {
	var t entity.RefreshToken
	if err := r.write.WithContext(ctx).Where("token_hash = ?", hash).First(&t).Error; err != nil {
		return nil, mapNotFound(err)
	}
	return &t, nil
}

func (r *refreshTokenRepository) Consume(ctx context.Context, id string, at time.Time) (bool, error) {
	res := r.write.WithContext(ctx).Model(&entity.RefreshToken{}).
		Where("id = ? AND used_at IS NULL AND revoked_at IS NULL", id).
		Update("used_at", at)
	return res.RowsAffected == 1, res.Error
}

func (r *refreshTokenRepository) RevokeFamily(ctx context.Context, familyID string) error {
	return r.write.WithContext(ctx).Model(&entity.RefreshToken{}).
		Where("family_id = ? AND revoked_at IS NULL", familyID).
		Update("revoked_at", time.Now()).Error
}

func (r *refreshTokenRepository) RevokeAllForUser(ctx context.Context, userID uint) error {
	return r.write.WithContext(ctx).Model(&entity.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", time.Now()).Error
}

// ── identities ──────────────────────────────────────────────────────────────

type identityRepository struct{ write, read *gorm.DB }

func NewIdentityRepository(write, read *gorm.DB) repository.IdentityRepository {
	return &identityRepository{write: write, read: read}
}

func (r *identityRepository) FindByProvider(ctx context.Context, provider, providerUserID string) (*entity.UserIdentity, error) {
	var i entity.UserIdentity
	if err := r.write.WithContext(ctx).Where("provider = ? AND provider_user_id = ?", provider, providerUserID).First(&i).Error; err != nil {
		return nil, mapNotFound(err)
	}
	return &i, nil
}

func (r *identityRepository) ListByUser(ctx context.Context, userID uint) ([]entity.UserIdentity, error) {
	var out []entity.UserIdentity
	err := r.write.WithContext(ctx).Where("user_id = ?", userID).Order("linked_at ASC").Find(&out).Error
	return out, err
}

func (r *identityRepository) Create(ctx context.Context, i *entity.UserIdentity) error {
	if i.LinkedAt.IsZero() {
		i.LinkedAt = time.Now()
	}
	return r.write.WithContext(ctx).Create(i).Error
}

func (r *identityRepository) Delete(ctx context.Context, userID uint, provider string) (bool, error) {
	res := r.write.WithContext(ctx).Where("user_id = ? AND provider = ?", userID, provider).Delete(&entity.UserIdentity{})
	return res.RowsAffected > 0, res.Error
}

func (r *identityRepository) TouchLogin(ctx context.Context, id uint, at time.Time) error {
	return r.write.WithContext(ctx).Model(&entity.UserIdentity{}).Where("id = ?", id).Update("last_login_at", at).Error
}

// ── oauth transactions ──────────────────────────────────────────────────────

type oauthTransactionRepository struct{ write *gorm.DB }

func NewOAuthTransactionRepository(write *gorm.DB) repository.OAuthTransactionRepository {
	return &oauthTransactionRepository{write: write}
}

func (r *oauthTransactionRepository) Create(ctx context.Context, tx *entity.OAuthTransaction) error {
	return r.write.WithContext(ctx).Create(tx).Error
}

func (r *oauthTransactionRepository) Consume(ctx context.Context, state string, at time.Time) (*entity.OAuthTransaction, error) {
	var tx entity.OAuthTransaction
	res := r.write.WithContext(ctx).Raw(
		"UPDATE oauth_transactions SET used_at = ? WHERE state = ? AND used_at IS NULL AND expires_at > ? RETURNING *",
		at, state, at,
	).Scan(&tx)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, repository.ErrNotFound
	}
	return &tx, nil
}

// ── email tokens ────────────────────────────────────────────────────────────

type emailTokenRepository struct{ write *gorm.DB }

func NewEmailTokenRepository(write *gorm.DB) repository.EmailTokenRepository {
	return &emailTokenRepository{write: write}
}

func (r *emailTokenRepository) Create(ctx context.Context, t *entity.EmailVerificationToken) error {
	if t.ID == "" {
		t.ID = uuid.NewString()
	}
	return r.write.WithContext(ctx).Create(t).Error
}

func (r *emailTokenRepository) Consume(ctx context.Context, tokenHash string, at time.Time, purposes ...string) (*entity.EmailVerificationToken, error) {
	var t entity.EmailVerificationToken
	res := r.write.WithContext(ctx).Raw(
		"UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ? AND purpose IN ? AND used_at IS NULL AND expires_at > ? RETURNING *",
		at, tokenHash, purposes, at,
	).Scan(&t)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, repository.ErrNotFound
	}
	return &t, nil
}

func (r *emailTokenRepository) Peek(ctx context.Context, tokenHash string, at time.Time, purposes ...string) (*entity.EmailVerificationToken, error) {
	var t entity.EmailVerificationToken
	err := r.write.WithContext(ctx).
		Where("token_hash = ? AND purpose IN ? AND used_at IS NULL AND expires_at > ?", tokenHash, purposes, at).
		First(&t).Error
	if err != nil {
		return nil, mapNotFound(err)
	}
	return &t, nil
}

package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ----- user preferences -----

type userPreferencesRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewUserPreferencesRepository(write, read *gorm.DB) repository.UserPreferencesRepository {
	return &userPreferencesRepository{write: write, read: read}
}

func (r *userPreferencesRepository) Find(ctx context.Context, userID uint) (*entity.UserPreferences, error) {
	var p entity.UserPreferences
	err := r.write.WithContext(ctx).Where("user_id = ?", userID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrNotFound
	}
	return &p, err
}

func (r *userPreferencesRepository) Save(ctx context.Context, p *entity.UserPreferences) error {
	return r.write.WithContext(ctx).Clauses(clause.OnConflict{UpdateAll: true}).Create(p).Error
}

func (r *userPreferencesRepository) FindByUnsubscribeToken(ctx context.Context, token string) (*entity.UserPreferences, error) {
	var p entity.UserPreferences
	err := r.write.WithContext(ctx).Where("unsubscribe_token = ?", token).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrNotFound
	}
	return &p, err
}

func (r *userPreferencesRepository) DigestCandidates(ctx context.Context, freq string, before time.Time, limit int) ([]repository.DigestUser, error) {
	var rows []repository.DigestUser
	err := r.read.WithContext(ctx).Raw(`SELECT u.id AS user_id, u.email, u.name
		FROM users u
		LEFT JOIN user_preferences p ON p.user_id = u.id
		WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE' AND u.email_verified = TRUE
		  AND COALESCE(p.digest_frequency, 'weekly') = ?
		  AND COALESCE(p.email_unsubscribed, FALSE) = FALSE
		  AND u.created_at < ? AND (p.last_digest_at IS NULL OR p.last_digest_at < ?)
		  AND COALESCE((SELECT c.marketing FROM user_consents c WHERE c.user_id = u.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1), TRUE) = TRUE
		ORDER BY u.id LIMIT ?`, freq, before, before, limit).Scan(&rows).Error
	return rows, err
}

func (r *userPreferencesRepository) MarkDigestSent(ctx context.Context, userID uint, at time.Time) error {
	return r.write.WithContext(ctx).Exec(`INSERT INTO user_preferences (user_id, notif_in_app, notif_email, last_digest_at)
		VALUES (?, '{}'::jsonb, '{}'::jsonb, ?)
		ON CONFLICT (user_id) DO UPDATE SET last_digest_at = EXCLUDED.last_digest_at`, userID, at).Error
}

// ----- consent -----

type consentRepository struct {
	write *gorm.DB
}

func NewConsentRepository(write *gorm.DB) repository.ConsentRepository {
	return &consentRepository{write: write}
}

func (r *consentRepository) Create(ctx context.Context, c *entity.UserConsent) error {
	return r.write.WithContext(ctx).Create(c).Error
}

func (r *consentRepository) Latest(ctx context.Context, userID uint) (*entity.UserConsent, error) {
	var c entity.UserConsent
	err := r.write.WithContext(ctx).Where("user_id = ?", userID).Order("created_at DESC, id DESC").First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrNotFound
	}
	return &c, err
}

func (r *consentRepository) ListByUser(ctx context.Context, userID uint) ([]*entity.UserConsent, error) {
	var out []*entity.UserConsent
	err := r.write.WithContext(ctx).Where("user_id = ?", userID).Order("created_at DESC, id DESC").Find(&out).Error
	return out, err
}

// ----- email queue -----

type emailQueueRepository struct {
	write *gorm.DB
}

func NewEmailQueueRepository(write *gorm.DB) repository.EmailQueueRepository {
	return &emailQueueRepository{write: write}
}

func (r *emailQueueRepository) Enqueue(ctx context.Context, item *entity.EmailQueueItem) (bool, error) {
	if item.NextAttemptAt.IsZero() {
		item.NextAttemptAt = time.Now()
	}
	res := r.write.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(item)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (r *emailQueueRepository) Claim(ctx context.Context, limit int, lease time.Duration) ([]*entity.EmailQueueItem, error) {
	var items []*entity.EmailQueueItem
	now := time.Now()
	err := r.write.WithContext(ctx).Raw(`UPDATE email_queue SET status = 'sending', locked_until = ?, attempts = attempts + 1
		WHERE id IN (
			SELECT id FROM email_queue
			WHERE (status = 'pending' AND next_attempt_at <= ?) OR (status = 'sending' AND locked_until < ?)
			ORDER BY next_attempt_at LIMIT ? FOR UPDATE SKIP LOCKED)
		RETURNING *`, now.Add(lease), now, now, limit).Scan(&items).Error
	return items, err
}

func (r *emailQueueRepository) MarkSent(ctx context.Context, id uint, at time.Time) error {
	return r.write.WithContext(ctx).Model(&entity.EmailQueueItem{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": entity.EmailStatusSent, "sent_at": at, "locked_until": nil, "last_error": nil,
			"data": gorm.Expr("CASE WHEN template = 'raw' THEN '{}'::jsonb ELSE data END")}).Error
}

func (r *emailQueueRepository) MarkFailed(ctx context.Context, id uint, next time.Time, errMsg string, dead bool) error {
	status := entity.EmailStatusPending
	if dead {
		status = entity.EmailStatusDead
	}
	return r.write.WithContext(ctx).Model(&entity.EmailQueueItem{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": status, "next_attempt_at": next, "last_error": errMsg, "locked_until": nil}).Error
}

func (r *emailQueueRepository) PurgeOlderThan(ctx context.Context, before time.Time) (int64, error) {
	res := r.write.WithContext(ctx).Exec(`DELETE FROM email_queue WHERE status IN ('sent','dead') AND created_at < ?`, before)
	return res.RowsAffected, res.Error
}

func (r *emailQueueRepository) DeletePendingForUser(ctx context.Context, userID uint) error {
	return r.write.WithContext(ctx).Exec(`DELETE FROM email_queue WHERE user_id = ?`, userID).Error
}

func (r *emailQueueRepository) RecentlyVerifiedUsers(ctx context.Context, since time.Time, limit int) ([]repository.DigestUser, error) {
	var rows []repository.DigestUser
	err := r.write.WithContext(ctx).Raw(`SELECT id AS user_id, email, name FROM users
		WHERE deleted_at IS NULL AND status = 'ACTIVE' AND email_verified = TRUE AND email_verified_at >= ? ORDER BY id LIMIT ?`, since, limit).Scan(&rows).Error
	return rows, err
}

// ----- per-user export / erasure -----

type userDataRepository struct {
	write *gorm.DB
}

func NewUserDataRepository(write *gorm.DB) repository.UserDataRepository {
	return &userDataRepository{write: write}
}

var exportQueries = []struct{ name, query string }{
	{"account", `SELECT row_to_json(t)::text FROM (SELECT id, email, name, mobile_no, status, email_verified, email_verified_at, avatar_url, last_login, created_at FROM users WHERE id = ?) t`},
	{"enrollments", `SELECT row_to_json(t)::text FROM enrollments t WHERE user_id = ?`},
	{"certificates", `SELECT row_to_json(t)::text FROM certificates t WHERE user_id = ?`},
	{"assessment_attempts", `SELECT row_to_json(t)::text FROM assessment_attempts t WHERE user_id = ?`},
	{"notifications", `SELECT row_to_json(t)::text FROM notifications t WHERE user_id = ? AND deleted_at IS NULL`},
	{"learning_profiles", `SELECT row_to_json(t)::text FROM user_profiles t WHERE user_id = ?`},
	{"preferences", `SELECT row_to_json(t)::text FROM (SELECT user_id, bio, location, job_title, notif_in_app, notif_email, digest_frequency, email_unsubscribed, profile_public, show_activity, theme, language, created_at, updated_at FROM user_preferences WHERE user_id = ?) t`},
	{"consents", `SELECT row_to_json(t)::text FROM (SELECT policy_version, analytics, personalization, marketing, created_at FROM user_consents WHERE user_id = ? ORDER BY created_at) t`},
	{"linked_identities", `SELECT row_to_json(t)::text FROM (SELECT provider, provider_email, display_name, linked_at FROM user_identities WHERE user_id = ?) t`},
}

func (r *userDataRepository) ExportTables(ctx context.Context, userID uint) (map[string][]json.RawMessage, error) {
	out := map[string][]json.RawMessage{}
	for _, q := range exportQueries {
		var raws []string
		err := r.write.WithContext(ctx).Raw(q.query, userID).Scan(&raws).Error
		if err != nil {
			if strings.Contains(err.Error(), "does not exist") {
				continue
			}
			return nil, err
		}
		rows := make([]json.RawMessage, len(raws))
		for i, s := range raws {
			rows[i] = json.RawMessage(s)
		}
		out[q.name] = rows
	}
	return out, nil
}

func (r *userDataRepository) EraseUser(ctx context.Context, userID uint) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, stmt := range []string{
			`DELETE FROM notifications WHERE user_id = ?`,
			`DELETE FROM user_preferences WHERE user_id = ?`,
			`DELETE FROM user_consents WHERE user_id = ?`,
			`DELETE FROM user_profiles WHERE user_id = ?`,
			`DELETE FROM user_identities WHERE user_id = ?`,
			`DELETE FROM email_queue WHERE user_id = ?`,
			`UPDATE certificates SET recipient_name = 'Deleted user' WHERE user_id = ?`,
		} {
			if err := tx.Exec(stmt, userID).Error; err != nil {
				return err
			}
		}
		return tx.Exec(`UPDATE users SET
			email = 'deleted+' || id || '@deleted.invalid', name = 'Deleted user', mobile_no = NULL, avatar_url = NULL,
			password_hash = '!', password_set = FALSE, status = 'DEACTIVATED', email_verified = FALSE,
			google_id = NULL, github_id = NULL,
			token_version = token_version + 1, deleted_at = NOW(), updated_at = NOW()
			WHERE id = ?`, userID).Error
	})
}

func NewNotificationLookup(write *gorm.DB) repository.NotificationLookup {
	return &notificationRepository{write: write, read: write}
}

package postgres

import (
	"context"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type certificateRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewCertificateRepository(write, read *gorm.DB) repository.CertificateRepository {
	return &certificateRepository{write: write, read: read}
}

func (r *certificateRepository) CreateIfAbsent(ctx context.Context, cert *entity.Certificate) (bool, *entity.Certificate, error) {
	res := r.write.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(cert)
	if res.Error != nil {
		return false, nil, res.Error
	}
	if res.RowsAffected > 0 {
		return true, cert, nil
	}
	existing, err := r.FindByUserAndCourse(ctx, cert.UserID, cert.CourseID)
	return false, existing, err
}

func (r *certificateRepository) FindByCode(ctx context.Context, code string) (*entity.Certificate, error) {
	var c entity.Certificate
	if err := r.write.WithContext(ctx).Where("code = ?", code).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *certificateRepository) FindByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Certificate, error) {
	var c entity.Certificate
	if err := r.write.WithContext(ctx).Where("user_id = ? AND course_id = ?", userID, courseID).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *certificateRepository) ListByUser(ctx context.Context, userID uint) ([]*entity.Certificate, error) {
	var out []*entity.Certificate
	err := r.read.WithContext(ctx).Where("user_id = ?", userID).Order("issued_at DESC").Find(&out).Error
	return out, err
}

func (r *certificateRepository) Revoke(ctx context.Context, code string, byUserID uint, reason string, at time.Time) (bool, error) {
	res := r.write.WithContext(ctx).Model(&entity.Certificate{}).
		Where("code = ? AND revoked = false", code).
		Updates(map[string]interface{}{"revoked": true, "revoked_at": at, "revoked_by_id": byUserID, "revoke_reason": reason})
	return res.RowsAffected > 0, res.Error
}

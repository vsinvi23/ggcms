package postgres

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type appSettingsRepository struct {
	db *gorm.DB
}

func NewAppSettingsRepository(db *gorm.DB) repository.AppSettingsRepository {
	return &appSettingsRepository{db: db}
}

func (r *appSettingsRepository) GetAll(ctx context.Context) (map[string]string, error) {
	var rows []entity.AppSetting
	if err := r.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, s := range rows {
		out[s.Key] = s.Value
	}
	return out, nil
}

func (r *appSettingsRepository) Set(ctx context.Context, key, value string) error {
	row := entity.AppSetting{Key: key, Value: value}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&row).Error
}

func (r *appSettingsRepository) SetMany(ctx context.Context, settings map[string]string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for k, v := range settings {
			row := entity.AppSetting{Key: k, Value: v}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "key"}},
				DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
			}).Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

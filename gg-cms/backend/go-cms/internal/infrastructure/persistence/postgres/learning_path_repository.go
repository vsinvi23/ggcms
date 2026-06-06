package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type learningPathRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewLearningPathRepository(write, read *gorm.DB) repository.LearningPathRepository {
	return &learningPathRepository{write: write, read: read}
}

func (r *learningPathRepository) Create(ctx context.Context, lp *entity.LearningPath) error {
	return r.write.WithContext(ctx).Create(lp).Error
}

func (r *learningPathRepository) Update(ctx context.Context, lp *entity.LearningPath) error {
	lp.UpdatedAt = time.Now()
	return r.write.WithContext(ctx).Save(lp).Error
}

func (r *learningPathRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.LearningPath{}, id).Error
}

func (r *learningPathRepository) FindByID(ctx context.Context, id uint) (*entity.LearningPath, error) {
	var lp entity.LearningPath
	err := r.read.WithContext(ctx).
		Preload("Courses", func(db *gorm.DB) *gorm.DB { return db.Order("sort_order ASC") }).
		First(&lp, id).Error
	if err != nil {
		return nil, fmt.Errorf("learning path not found: %w", err)
	}
	return &lp, nil
}

func (r *learningPathRepository) FindAll(ctx context.Context, kind string) ([]*entity.LearningPath, error) {
	var paths []*entity.LearningPath
	db := r.read.WithContext(ctx).
		Preload("Courses", func(db *gorm.DB) *gorm.DB { return db.Order("sort_order ASC") }).
		Order("created_at DESC")
	if kind != "" {
		db = db.Where("kind = ?", kind)
	}
	return paths, db.Find(&paths).Error
}

func (r *learningPathRepository) SetCourses(ctx context.Context, pathID uint, courses []entity.LearningPathCourse) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("learning_path_id = ?", pathID).Delete(&entity.LearningPathCourse{}).Error; err != nil {
			return err
		}
		if len(courses) == 0 {
			return nil
		}
		for i := range courses {
			courses[i].LearningPathID = pathID
		}
		return tx.Create(&courses).Error
	})
}

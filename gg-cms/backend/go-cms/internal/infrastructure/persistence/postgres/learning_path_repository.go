package postgres

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

func orderedCourses(db *gorm.DB) *gorm.DB { return db.Order("sort_order ASC") }

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
		Preload("Courses", orderedCourses).Preload("Courses.Course.Category").
		First(&lp, id).Error
	if err != nil {
		return nil, fmt.Errorf("learning path not found: %w", err)
	}
	return &lp, nil
}

func (r *learningPathRepository) FindBySlug(ctx context.Context, slug string) (*entity.LearningPath, error) {
	var lp entity.LearningPath
	err := r.read.WithContext(ctx).
		Preload("Courses", orderedCourses).Preload("Courses.Course.Category").
		Where("slug = ?", slug).
		First(&lp).Error
	if err != nil {
		return nil, fmt.Errorf("learning path not found: %w", err)
	}
	return &lp, nil
}

func (r *learningPathRepository) FindByIDOrSlug(ctx context.Context, idOrSlug string) (*entity.LearningPath, error) {
	var lp entity.LearningPath
	db := r.read.WithContext(ctx).Preload("Courses", orderedCourses).Preload("Courses.Course.Category")

	// Check numeric ID first
	if id, err := strconv.ParseUint(idOrSlug, 10, 64); err == nil {
		if err := db.Where("id = ?", id).First(&lp).Error; err == nil {
			return &lp, nil
		}
	}

	// Fallback to slug or lowercase title match
	if err := db.Where("slug = ? OR LOWER(title) = ?", idOrSlug, strings.ToLower(idOrSlug)).First(&lp).Error; err != nil {
		return nil, fmt.Errorf("learning path not found: %w", err)
	}
	return &lp, nil
}

func (r *learningPathRepository) FindAll(ctx context.Context, kind string) ([]*entity.LearningPath, error) {
	var paths []*entity.LearningPath
	db := r.read.WithContext(ctx).
		Preload("Courses", orderedCourses).Preload("Courses.Course.Category").
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

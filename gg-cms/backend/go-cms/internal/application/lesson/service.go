package lesson

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type CreateRequest struct {
	Title     string
	Type      entity.LessonType
	Content   *string
	Duration  int
	Order     int
	SectionID *uint
	Published bool
}

type UpdateRequest struct {
	Title     *string
	Type      *entity.LessonType
	Content   *string
	Duration  *int
	Order     *int
	Published *bool
}

type Service interface {
	Create(ctx context.Context, req CreateRequest) (*entity.Lesson, error)
	Update(ctx context.Context, id uint, req UpdateRequest) (*entity.Lesson, error)
	Delete(ctx context.Context, id uint) error
	GetByID(ctx context.Context, id uint) (*entity.Lesson, error)
	GetBySectionID(ctx context.Context, sectionID uint) ([]*entity.Lesson, error)
}

type service struct {
	lessonRepo repository.LessonRepository
}

func NewService(lessonRepo repository.LessonRepository) Service {
	return &service{lessonRepo: lessonRepo}
}

func (s *service) Create(ctx context.Context, req CreateRequest) (*entity.Lesson, error) {
	lessonType := req.Type
	if lessonType == "" {
		lessonType = entity.LessonTypeText
	}
	lesson := &entity.Lesson{
		Title:     req.Title,
		Type:      lessonType,
		Content:   req.Content,
		Duration:  req.Duration,
		Order:     req.Order,
		SectionID: req.SectionID,
	}
	if err := s.lessonRepo.Create(ctx, lesson); err != nil {
		return nil, fmt.Errorf("failed to create lesson: %w", err)
	}
	return lesson, nil
}

func (s *service) Update(ctx context.Context, id uint, req UpdateRequest) (*entity.Lesson, error) {
	lesson, err := s.lessonRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("lesson not found: %w", err)
	}
	if req.Title != nil {
		lesson.Title = *req.Title
	}
	if req.Type != nil {
		lesson.Type = *req.Type
	}
	if req.Content != nil {
		lesson.Content = req.Content
	}
	if req.Duration != nil {
		lesson.Duration = *req.Duration
	}
	if req.Order != nil {
		lesson.Order = *req.Order
	}
	if err := s.lessonRepo.Update(ctx, lesson); err != nil {
		return nil, fmt.Errorf("failed to update lesson: %w", err)
	}
	return lesson, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.lessonRepo.Delete(ctx, id)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Lesson, error) {
	return s.lessonRepo.FindByID(ctx, id)
}

func (s *service) GetBySectionID(ctx context.Context, sectionID uint) ([]*entity.Lesson, error) {
	return s.lessonRepo.FindBySectionID(ctx, sectionID)
}

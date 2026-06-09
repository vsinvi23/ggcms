package learningpath

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type CourseEntry struct {
	CourseID  uint
	SortOrder int
}

type CreateRequest struct {
	Kind        string
	Title       string
	Description string
	CreatedByID uint
}

type UpdateRequest struct {
	Title       *string
	Description *string
}

type Service interface {
	List(ctx context.Context, kind string) ([]*entity.LearningPath, error)
	GetByID(ctx context.Context, id uint) (*entity.LearningPath, error)
	Create(ctx context.Context, req CreateRequest) (*entity.LearningPath, error)
	Update(ctx context.Context, id uint, req UpdateRequest) (*entity.LearningPath, error)
	Delete(ctx context.Context, id uint) error
	SetCourses(ctx context.Context, id uint, courses []CourseEntry) error
}

type service struct {
	repo repository.LearningPathRepository
}

func NewService(repo repository.LearningPathRepository) Service {
	return &service{repo: repo}
}

func (s *service) List(ctx context.Context, kind string) ([]*entity.LearningPath, error) {
	return s.repo.FindAll(ctx, kind)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.LearningPath, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *service) Create(ctx context.Context, req CreateRequest) (*entity.LearningPath, error) {
	lp := &entity.LearningPath{
		Kind:        req.Kind,
		Title:       req.Title,
		Description: req.Description,
		CreatedByID: req.CreatedByID,
	}
	if err := s.repo.Create(ctx, lp); err != nil {
		return nil, fmt.Errorf("failed to create learning path: %w", err)
	}
	return lp, nil
}

func (s *service) Update(ctx context.Context, id uint, req UpdateRequest) (*entity.LearningPath, error) {
	lp, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.Title != nil {
		lp.Title = *req.Title
	}
	if req.Description != nil {
		lp.Description = *req.Description
	}
	if err := s.repo.Update(ctx, lp); err != nil {
		return nil, fmt.Errorf("failed to update learning path: %w", err)
	}
	return lp, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.repo.Delete(ctx, id)
}

func (s *service) SetCourses(ctx context.Context, id uint, courses []CourseEntry) error {
	rows := make([]entity.LearningPathCourse, len(courses))
	for i, c := range courses {
		rows[i] = entity.LearningPathCourse{
			CourseID:  c.CourseID,
			SortOrder: c.SortOrder,
		}
	}
	return s.repo.SetCourses(ctx, id, rows)
}

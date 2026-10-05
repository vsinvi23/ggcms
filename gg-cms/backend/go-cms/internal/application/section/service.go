package section

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type CreateRequest struct {
	Title           string
	Order           int
	CourseID        *uint
	ParentSectionID *uint
}

type UpdateRequest struct {
	Title       *string
	Description *string
	Order       *int
}

type Service interface {
	Create(ctx context.Context, req CreateRequest) (*entity.Section, error)
	Update(ctx context.Context, id uint, req UpdateRequest) (*entity.Section, error)
	Delete(ctx context.Context, id uint) error
	GetByID(ctx context.Context, id uint) (*entity.Section, error)
	GetByCourseID(ctx context.Context, courseID uint) ([]*entity.Section, error)
	// ReplaceCourseStructure atomically replaces a course's sections and lessons (used by import overwrite).
	ReplaceCourseStructure(ctx context.Context, courseID uint, sections []StructureSection) error
}

// StructureLesson / StructureSection describe a section tree to be written in one step.
type StructureLesson struct {
	Title    string
	Type     entity.LessonType
	Content  *string
	Duration int
	Order    int
}

type StructureSection struct {
	Title       string
	Description *string
	Order       int
	Lessons     []StructureLesson
}

type service struct {
	sectionRepo repository.SectionRepository
}

func NewService(sectionRepo repository.SectionRepository) Service {
	return &service{sectionRepo: sectionRepo}
}

func (s *service) Create(ctx context.Context, req CreateRequest) (*entity.Section, error) {
	section := &entity.Section{
		Title:           req.Title,
		Order:           req.Order,
		CourseID:        req.CourseID,
		ParentSectionID: req.ParentSectionID,
	}
	if err := s.sectionRepo.Create(ctx, section); err != nil {
		return nil, fmt.Errorf("failed to create section: %w", err)
	}
	return section, nil
}

func (s *service) Update(ctx context.Context, id uint, req UpdateRequest) (*entity.Section, error) {
	sec, err := s.sectionRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("section not found: %w", err)
	}
	if req.Title != nil {
		sec.Title = *req.Title
	}
	if req.Description != nil {
		sec.Description = req.Description
	}
	if req.Order != nil {
		sec.Order = *req.Order
	}
	if err := s.sectionRepo.Update(ctx, sec); err != nil {
		return nil, fmt.Errorf("failed to update section: %w", err)
	}
	return sec, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.sectionRepo.Delete(ctx, id)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Section, error) {
	return s.sectionRepo.FindByID(ctx, id)
}

func (s *service) GetByCourseID(ctx context.Context, courseID uint) ([]*entity.Section, error) {
	return s.sectionRepo.FindByCourseID(ctx, courseID)
}

func (s *service) ReplaceCourseStructure(ctx context.Context, courseID uint, sections []StructureSection) error {
	tree := make([]*entity.Section, len(sections))
	for i, sec := range sections {
		lessons := make([]entity.Lesson, len(sec.Lessons))
		for j, l := range sec.Lessons {
			lt := l.Type
			if lt == "" {
				lt = entity.LessonTypeText
			}
			lessons[j] = entity.Lesson{Title: l.Title, Type: lt, Content: l.Content, Duration: l.Duration, Order: l.Order}
		}
		tree[i] = &entity.Section{Title: sec.Title, Description: sec.Description, Order: sec.Order, Lessons: lessons}
	}
	if err := s.sectionRepo.ReplaceCourseStructure(ctx, courseID, tree); err != nil {
		return fmt.Errorf("failed to replace course structure: %w", err)
	}
	return nil
}

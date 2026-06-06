package task

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type CreateRequest struct {
	Type          entity.TaskType
	Title         string
	Status        string
	OwnershipType entity.TaskOwnershipType
	UserID        uint
	ContentID     *uint
}

type Service interface {
	GetAll(ctx context.Context, filter repository.TaskFilter, page, size int) ([]*entity.Task, int64, error)
	GetByID(ctx context.Context, id uint) (*entity.Task, error)
	Create(ctx context.Context, req CreateRequest) (*entity.Task, error)
	Update(ctx context.Context, id uint, title, status *string) (*entity.Task, error)
	Delete(ctx context.Context, id uint) error
	UpdateStatusByContentID(ctx context.Context, contentID uint, taskType entity.TaskType, status string) (int64, error)
	UpsertPublishedTask(ctx context.Context, contentID uint, taskType entity.TaskType, title string, userID uint) error
	// UpsertOwnerTask creates or updates the owned task for a content item at any status.
	// Used by the CMS Create handler (draft) and Submit handler (in_review) so that
	// content always shows up in the owner's My Tasks list from creation onward.
	UpsertOwnerTask(ctx context.Context, contentID uint, taskType entity.TaskType, title string, userID uint, status string) error
	// UpsertReviewerTask creates or updates the reviewing task for the assigned reviewer.
	// Safe to call on re-submissions — if a reviewer task already exists it is updated in-place.
	UpsertReviewerTask(ctx context.Context, contentID uint, taskType entity.TaskType, title string, userID uint) error
}

type service struct {
	taskRepo repository.TaskRepository
}

func NewService(taskRepo repository.TaskRepository) Service {
	return &service{taskRepo: taskRepo}
}

func (s *service) GetAll(ctx context.Context, filter repository.TaskFilter, page, size int) ([]*entity.Task, int64, error) {
	return s.taskRepo.FindAll(ctx, filter, page, size)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Task, error) {
	return s.taskRepo.FindByID(ctx, id)
}

func (s *service) Create(ctx context.Context, req CreateRequest) (*entity.Task, error) {
	status := req.Status
	if status == "" {
		status = "pending"
	}
	task := &entity.Task{
		Type:          req.Type,
		Title:         req.Title,
		Status:        status,
		OwnershipType: req.OwnershipType,
		UserID:        req.UserID,
		ContentID:     req.ContentID,
	}
	if err := s.taskRepo.Create(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}
	return task, nil
}

func (s *service) Update(ctx context.Context, id uint, title, status *string) (*entity.Task, error) {
	task, err := s.taskRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}
	if title != nil {
		task.Title = *title
	}
	if status != nil {
		task.Status = *status
	}
	if err := s.taskRepo.Update(ctx, task); err != nil {
		return nil, fmt.Errorf("failed to update task: %w", err)
	}
	return task, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.taskRepo.Delete(ctx, id)
}

func (s *service) UpdateStatusByContentID(ctx context.Context, contentID uint, taskType entity.TaskType, status string) (int64, error) {
	return s.taskRepo.UpdateStatusByContentID(ctx, contentID, taskType, status)
}

func (s *service) UpsertOwnerTask(ctx context.Context, contentID uint, taskType entity.TaskType, title string, userID uint, status string) error {
	ownerTask, err := s.taskRepo.FindByOwner(ctx, contentID, taskType, userID)
	if err != nil {
		task := &entity.Task{
			Type:          taskType,
			Title:         title,
			Status:        status,
			OwnershipType: entity.TaskOwnershipOwned,
			UserID:        userID,
			ContentID:     &contentID,
		}
		return s.taskRepo.Create(ctx, task)
	}
	// Always update to reflect the current workflow state.
	// This allows the revision cycle (published → in_review on re-submit) to work correctly.
	ownerTask.Status = status
	ownerTask.Title = title
	return s.taskRepo.Update(ctx, ownerTask)
}

func (s *service) UpsertReviewerTask(ctx context.Context, contentID uint, taskType entity.TaskType, title string, userID uint) error {
	reviewerTask, err := s.taskRepo.FindByReviewer(ctx, contentID, taskType, userID)
	if err != nil {
		task := &entity.Task{
			Type:          taskType,
			Title:         title,
			Status:        "in_review",
			OwnershipType: entity.TaskOwnershipReviewing,
			UserID:        userID,
			ContentID:     &contentID,
		}
		return s.taskRepo.Create(ctx, task)
	}
	// Re-submission: reset to in_review so the reviewer sees it again.
	reviewerTask.Status = "in_review"
	reviewerTask.Title = title
	return s.taskRepo.Update(ctx, reviewerTask)
}

func (s *service) UpsertPublishedTask(ctx context.Context, contentID uint, taskType entity.TaskType, title string, userID uint) error {
	// Update ALL existing tasks for this content to "published" (owner + reviewer).
	s.taskRepo.UpdateStatusByContentID(ctx, contentID, taskType, "published") //nolint:errcheck

	// Always ensure the article/course owner has their own task regardless of
	// whether tasks for other users already existed.
	ownerTask, err := s.taskRepo.FindByOwner(ctx, contentID, taskType, userID)
	if err != nil {
		// Task doesn't exist for this user — create it.
		task := &entity.Task{
			Type:          taskType,
			Title:         title,
			Status:        "published",
			OwnershipType: entity.TaskOwnershipOwned,
			UserID:        userID,
			ContentID:     &contentID,
		}
		return s.taskRepo.Create(ctx, task)
	}
	// Task already exists — ensure status is up to date.
	ownerTask.Status = "published"
	ownerTask.Title = title
	return s.taskRepo.Update(ctx, ownerTask)
}

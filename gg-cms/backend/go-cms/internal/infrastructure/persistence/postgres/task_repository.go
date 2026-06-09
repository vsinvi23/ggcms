package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type taskRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewTaskRepository(write, read *gorm.DB) repository.TaskRepository {
	return &taskRepository{write: write, read: read}
}

func (r *taskRepository) Create(ctx context.Context, task *entity.Task) error {
	return r.write.WithContext(ctx).Create(task).Error
}

func (r *taskRepository) Update(ctx context.Context, task *entity.Task) error {
	return r.write.WithContext(ctx).Save(task).Error
}

func (r *taskRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Task{}, id).Error
}

func (r *taskRepository) FindByID(ctx context.Context, id uint) (*entity.Task, error) {
	var task entity.Task
	err := r.read.WithContext(ctx).Preload("User").First(&task, id).Error
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}
	return &task, nil
}

func (r *taskRepository) UpdateStatusByContentID(ctx context.Context, contentID uint, taskType entity.TaskType, status string) (int64, error) {
	result := r.write.WithContext(ctx).Model(&entity.Task{}).
		Where("content_id = ? AND type = ?", contentID, taskType).
		Update("status", status)
	return result.RowsAffected, result.Error
}

func (r *taskRepository) FindByContentID(ctx context.Context, contentID uint, taskType entity.TaskType) (*entity.Task, error) {
	var task entity.Task
	err := r.read.WithContext(ctx).
		Where("content_id = ? AND type = ?", contentID, taskType).
		First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *taskRepository) FindByOwner(ctx context.Context, contentID uint, taskType entity.TaskType, userID uint) (*entity.Task, error) {
	var task entity.Task
	err := r.read.WithContext(ctx).
		Where("content_id = ? AND type = ? AND user_id = ? AND ownership_type = ?",
			contentID, taskType, userID, entity.TaskOwnershipOwned).
		First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *taskRepository) FindByReviewer(ctx context.Context, contentID uint, taskType entity.TaskType, userID uint) (*entity.Task, error) {
	var task entity.Task
	err := r.read.WithContext(ctx).
		Where("content_id = ? AND type = ? AND user_id = ? AND ownership_type = ?",
			contentID, taskType, userID, entity.TaskOwnershipReviewing).
		First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

// cmsVersionRow holds the minimal CMS metadata we need for task enrichment.
// Explicit gorm tags ensure the column names are matched correctly during Scan.
type cmsVersionRow struct {
	ID              uint   `gorm:"column:id"`
	Version         int    `gorm:"column:version"`
	Status          string `gorm:"column:status"`
	HasPendingDraft bool   `gorm:"column:has_pending_draft"`
	PublishedVersion *int  `gorm:"column:published_version"`
}

func (r *taskRepository) FindAll(ctx context.Context, filter repository.TaskFilter, page, size int) ([]*entity.Task, int64, error) {
	var tasks []*entity.Task
	var total int64

	db := r.read.WithContext(ctx).Model(&entity.Task{})

	if filter.UserID != nil {
		db = db.Where("user_id = ?", *filter.UserID)
	}
	if filter.Type != nil {
		db = db.Where("type = ?", *filter.Type)
	}
	if filter.Status != nil {
		db = db.Where("status = ?", *filter.Status)
	}
	if filter.OwnershipType != nil {
		db = db.Where("ownership_type = ?", *filter.OwnershipType)
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := db.Preload("User").Offset(page * size).Limit(size).Order("created_at DESC").Find(&tasks).Error; err != nil {
		return nil, 0, err
	}

	// Enrich tasks with CMS version metadata via two batch queries.
	r.enrichWithCMSVersion(ctx, tasks)

	return tasks, total, nil
}

// enrichWithCMSVersion batch-fetches version/pending-draft info from the
// articles and courses tables and sets the transient CMS* fields on each task.
func (r *taskRepository) enrichWithCMSVersion(ctx context.Context, tasks []*entity.Task) {
	var articleIDs, courseIDs []uint
	byArticle := map[uint]*entity.Task{}
	byCourse := map[uint]*entity.Task{}

	for _, t := range tasks {
		if t.ContentID == nil {
			continue
		}
		switch t.Type {
		case entity.TaskTypeArticle:
			articleIDs = append(articleIDs, *t.ContentID)
			byArticle[*t.ContentID] = t
		case entity.TaskTypeCourse:
			courseIDs = append(courseIDs, *t.ContentID)
			byCourse[*t.ContentID] = t
		}
	}

	if len(articleIDs) > 0 {
		var rows []cmsVersionRow
		r.read.WithContext(ctx).
			Table("articles").
			Select("id, version, status, has_pending_draft, published_version").
			Where("id IN ?", articleIDs).
			Scan(&rows)
		for _, row := range rows {
			if t, ok := byArticle[row.ID]; ok {
				t.CMSVersion = row.Version
				t.CMSStatus = row.Status
				t.CMSHasPendingDraft = row.HasPendingDraft
				t.CMSPublishedVersion = row.PublishedVersion
			}
		}
	}

	if len(courseIDs) > 0 {
		var rows []cmsVersionRow
		r.read.WithContext(ctx).
			Table("courses").
			Select("id, version, status, has_pending_draft, published_version").
			Where("id IN ?", courseIDs).
			Scan(&rows)
		for _, row := range rows {
			if t, ok := byCourse[row.ID]; ok {
				t.CMSVersion = row.Version
				t.CMSStatus = row.Status
				t.CMSHasPendingDraft = row.HasPendingDraft
				t.CMSPublishedVersion = row.PublishedVersion
			}
		}
	}
}

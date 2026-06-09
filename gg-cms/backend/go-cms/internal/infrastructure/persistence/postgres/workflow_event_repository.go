package postgres

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type workflowEventRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewWorkflowEventRepository(write, read *gorm.DB) repository.WorkflowEventRepository {
	return &workflowEventRepository{write: write, read: read}
}

func (r *workflowEventRepository) Create(ctx context.Context, event *entity.WorkflowEvent) error {
	return r.write.WithContext(ctx).Create(event).Error
}

func (r *workflowEventRepository) FindByEntity(ctx context.Context, entityType string, entityID uint) ([]*entity.WorkflowEvent, error) {
	var events []*entity.WorkflowEvent
	err := r.read.WithContext(ctx).
		Preload("User").
		Where("entity_type = ? AND entity_id = ?", entityType, entityID).
		Order("created_at ASC").
		Find(&events).Error
	return events, err
}

package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type groupRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewGroupRepository(write, read *gorm.DB) repository.GroupRepository {
	return &groupRepository{write: write, read: read}
}

func (r *groupRepository) Create(ctx context.Context, group *entity.Group) error {
	return r.write.WithContext(ctx).Create(group).Error
}

func (r *groupRepository) Update(ctx context.Context, group *entity.Group) error {
	return r.write.WithContext(ctx).Save(group).Error
}

func (r *groupRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Group{}, id).Error
}

func (r *groupRepository) AddMember(ctx context.Context, groupID, userID uint) error {
	group := &entity.Group{}
	group.ID = groupID
	user := &entity.User{}
	user.ID = userID
	return r.write.WithContext(ctx).Model(group).Association("Users").Append(user)
}

func (r *groupRepository) RemoveMember(ctx context.Context, groupID, userID uint) error {
	group := &entity.Group{}
	group.ID = groupID
	user := &entity.User{}
	user.ID = userID
	return r.write.WithContext(ctx).Model(group).Association("Users").Delete(user)
}

func (r *groupRepository) FindByID(ctx context.Context, id uint) (*entity.Group, error) {
	var group entity.Group
	err := r.read.WithContext(ctx).Preload("Users").First(&group, id).Error
	if err != nil {
		return nil, fmt.Errorf("group not found: %w", err)
	}
	return &group, nil
}

func (r *groupRepository) FindByName(ctx context.Context, name string) (*entity.Group, error) {
	var group entity.Group
	err := r.read.WithContext(ctx).Where("name = ?", name).First(&group).Error
	if err != nil {
		return nil, fmt.Errorf("group not found: %w", err)
	}
	return &group, nil
}

func (r *groupRepository) FindAll(ctx context.Context, page, size int) ([]*entity.Group, int64, error) {
	var groups []*entity.Group
	var total int64

	db := r.read.WithContext(ctx).Model(&entity.Group{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Preload("Users").Offset(page * size).Limit(size).
		Order("name ASC").Find(&groups).Error
	return groups, total, err
}

func (r *groupRepository) FindMembers(ctx context.Context, groupID uint) ([]*entity.User, error) {
	var users []*entity.User
	err := r.read.WithContext(ctx).
		Joins("JOIN user_groups ON user_groups.user_id = users.id").
		Where("user_groups.group_id = ? AND users.deleted_at IS NULL", groupID).
		Find(&users).Error
	return users, err
}

func (r *groupRepository) FindByUserID(ctx context.Context, userID uint) ([]entity.Group, error) {
	var groups []entity.Group
	err := r.read.WithContext(ctx).
		Joins("JOIN user_groups ON user_groups.group_id = groups.id").
		Where("user_groups.user_id = ? AND groups.deleted_at IS NULL", userID).
		Find(&groups).Error
	return groups, err
}

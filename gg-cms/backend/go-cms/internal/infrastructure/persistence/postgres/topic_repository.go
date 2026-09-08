package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type topicRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewTopicRepository(write, read *gorm.DB) repository.TopicRepository {
	return &topicRepository{write: write, read: read}
}

func (r *topicRepository) Create(ctx context.Context, topic *entity.Topic) error {
	return r.write.WithContext(ctx).Create(topic).Error
}

func (r *topicRepository) FindAll(ctx context.Context) ([]*entity.Topic, error) {
	var topics []*entity.Topic
	err := r.read.WithContext(ctx).Order("name ASC").Find(&topics).Error
	return topics, err
}

func (r *topicRepository) FindByID(ctx context.Context, id uint) (*entity.Topic, error) {
	var topic entity.Topic
	err := r.read.WithContext(ctx).First(&topic, id).Error
	if err != nil {
		return nil, fmt.Errorf("topic not found: %w", err)
	}
	return &topic, nil
}

func (r *topicRepository) FindBySlug(ctx context.Context, slug string) (*entity.Topic, error) {
	var topic entity.Topic
	err := r.read.WithContext(ctx).Where("slug = ?", slug).First(&topic).Error
	if err != nil {
		return nil, err
	}
	return &topic, nil
}

func (r *topicRepository) Update(ctx context.Context, topic *entity.Topic) error {
	return r.write.WithContext(ctx).Save(topic).Error
}

func (r *topicRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Topic{}, id).Error
}

func (r *topicRepository) ListRelationships(ctx context.Context, topicID uint) ([]*entity.TopicRelationship, error) {
	var relationships []*entity.TopicRelationship
	err := r.read.WithContext(ctx).Where("source_topic_id = ?", topicID).Find(&relationships).Error
	return relationships, err
}

func (r *topicRepository) SetRelationships(ctx context.Context, topicID uint, relationships []entity.TopicRelationship) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("source_topic_id = ?", topicID).Delete(&entity.TopicRelationship{}).Error; err != nil {
			return err
		}
		if len(relationships) == 0 {
			return nil
		}
		for i := range relationships {
			relationships[i].SourceTopicID = topicID
		}
		return tx.Create(&relationships).Error
	})
}

func (r *topicRepository) GetContentTopics(ctx context.Context, contentID uint, contentType string) ([]*entity.Topic, error) {
	var topics []*entity.Topic
	err := r.read.WithContext(ctx).
		Table("topics").
		Joins("JOIN content_topics ON content_topics.topic_id = topics.id").
		Where("content_topics.content_id = ? AND content_topics.content_type = ?", contentID, contentType).
		Find(&topics).Error
	return topics, err
}

func (r *topicRepository) SetContentTopics(ctx context.Context, contentID uint, contentType string, topicIDs []uint) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("content_id = ? AND content_type = ?", contentID, contentType).Delete(&entity.ContentTopic{}).Error; err != nil {
			return err
		}
		if len(topicIDs) == 0 {
			return nil
		}
		rows := make([]entity.ContentTopic, len(topicIDs))
		for i, tid := range topicIDs {
			rows[i] = entity.ContentTopic{ContentID: contentID, ContentType: contentType, TopicID: tid}
		}
		return tx.Create(&rows).Error
	})
}

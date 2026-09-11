package topic

import (
	"context"
	"fmt"
	"strings"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/slugify"
)

type Service interface {
	GetAll(ctx context.Context) ([]*entity.Topic, error)
	GetByID(ctx context.Context, id uint) (*entity.Topic, error)
	Create(ctx context.Context, name, entityType, description string) (*entity.Topic, error)
	Update(ctx context.Context, id uint, name, entityType, description string) (*entity.Topic, error)
	Delete(ctx context.Context, id uint) error
	GetRelationships(ctx context.Context, topicID uint) ([]*entity.TopicRelationship, error)
	SetRelationships(ctx context.Context, topicID uint, relationships []entity.TopicRelationship) error
	GetContentTopics(ctx context.Context, contentID uint, contentType string) ([]*entity.Topic, error)
	GetContentTopicEntries(ctx context.Context, contentID uint, contentType string) ([]*entity.ContentTopic, error)
	SetContentTopics(ctx context.Context, contentID uint, contentType string, topicIDs []uint) error
	SetContentTopicEntries(ctx context.Context, contentID uint, contentType string, entries []entity.ContentTopic) error
	ResolveTopic(ctx context.Context, rawName string) (*repository.TopicResolutionResult, error)
	FindBySlugs(ctx context.Context, slugs []string) ([]*entity.Topic, error)
	FindReachable(ctx context.Context, topicID uint, maxDepth int) ([]*repository.ReachableTopic, error)
	FindContentByTopicIDs(ctx context.Context, topicIDs []uint, excludeContentID uint, excludeContentType string, limit int) ([]*entity.ContentTopic, error)
}

type service struct {
	topicRepo repository.TopicRepository
}

func NewService(topicRepo repository.TopicRepository) Service {
	return &service{topicRepo: topicRepo}
}

func (s *service) GetAll(ctx context.Context) ([]*entity.Topic, error) {
	return s.topicRepo.FindAll(ctx)
}

func (s *service) GetByID(ctx context.Context, id uint) (*entity.Topic, error) {
	return s.topicRepo.FindByID(ctx, id)
}

func (s *service) Create(ctx context.Context, name, entityType, description string) (*entity.Topic, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, fmt.Errorf("topic name cannot be empty")
	}
	slug := slugify.Slug(trimmed)
	// Return existing topic if it already exists (idempotent)
	existing, err := s.topicRepo.FindBySlug(ctx, slug)
	if err == nil {
		return existing, nil
	}
	if entityType == "" {
		entityType = "concept"
	}
	topic := &entity.Topic{
		Name:        trimmed,
		Slug:        slug,
		EntityType:  entityType,
		Description: description,
		Status:      "ACTIVE",
	}
	if err := s.topicRepo.Create(ctx, topic); err != nil {
		return nil, err
	}
	return topic, nil
}

func (s *service) Update(ctx context.Context, id uint, name, entityType, description string) (*entity.Topic, error) {
	topic, err := s.topicRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, fmt.Errorf("topic name cannot be empty")
	}
	topic.Name = trimmed
	topic.Slug = slugify.Slug(trimmed)
	if entityType == "" {
		entityType = "concept"
	}
	topic.EntityType = entityType
	topic.Description = description
	if err := s.topicRepo.Update(ctx, topic); err != nil {
		return nil, err
	}
	return topic, nil
}

func (s *service) Delete(ctx context.Context, id uint) error {
	return s.topicRepo.Delete(ctx, id)
}

func (s *service) GetRelationships(ctx context.Context, topicID uint) ([]*entity.TopicRelationship, error) {
	return s.topicRepo.ListRelationships(ctx, topicID)
}

func (s *service) SetRelationships(ctx context.Context, topicID uint, relationships []entity.TopicRelationship) error {
	return s.topicRepo.SetRelationships(ctx, topicID, relationships)
}

func (s *service) GetContentTopics(ctx context.Context, contentID uint, contentType string) ([]*entity.Topic, error) {
	return s.topicRepo.GetContentTopics(ctx, contentID, contentType)
}

func (s *service) GetContentTopicEntries(ctx context.Context, contentID uint, contentType string) ([]*entity.ContentTopic, error) {
	return s.topicRepo.GetContentTopicEntries(ctx, contentID, contentType)
}

func (s *service) SetContentTopics(ctx context.Context, contentID uint, contentType string, topicIDs []uint) error {
	return s.topicRepo.SetContentTopics(ctx, contentID, contentType, topicIDs)
}

func (s *service) SetContentTopicEntries(ctx context.Context, contentID uint, contentType string, entries []entity.ContentTopic) error {
	return s.topicRepo.SetContentTopicEntries(ctx, contentID, contentType, entries)
}

func (s *service) ResolveTopic(ctx context.Context, rawName string) (*repository.TopicResolutionResult, error) {
	return s.topicRepo.ResolveTopic(ctx, rawName)
}

func (s *service) FindBySlugs(ctx context.Context, slugs []string) ([]*entity.Topic, error) {
	return s.topicRepo.FindBySlugs(ctx, slugs)
}

func (s *service) FindReachable(ctx context.Context, topicID uint, maxDepth int) ([]*repository.ReachableTopic, error) {
	return s.topicRepo.FindReachable(ctx, topicID, maxDepth)
}

func (s *service) FindContentByTopicIDs(ctx context.Context, topicIDs []uint, excludeContentID uint, excludeContentType string, limit int) ([]*entity.ContentTopic, error) {
	return s.topicRepo.FindContentByTopicIDs(ctx, topicIDs, excludeContentID, excludeContentType, limit)
}


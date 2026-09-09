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

func (r *topicRepository) FindBySlugs(ctx context.Context, slugs []string) ([]*entity.Topic, error) {
	if len(slugs) == 0 {
		return nil, nil
	}
	var topics []*entity.Topic
	err := r.read.WithContext(ctx).Where("slug IN ?", slugs).Find(&topics).Error
	return topics, err
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

func (r *topicRepository) GetContentTopicEntries(ctx context.Context, contentID uint, contentType string) ([]*entity.ContentTopic, error) {
	var entries []*entity.ContentTopic
	err := r.read.WithContext(ctx).
		Where("content_id = ? AND content_type = ?", contentID, contentType).
		Find(&entries).Error
	return entries, err
}

func (r *topicRepository) SetContentTopics(ctx context.Context, contentID uint, contentType string, topicIDs []uint) error {
	entries := make([]entity.ContentTopic, len(topicIDs))
	for i, tid := range topicIDs {
		entries[i] = entity.ContentTopic{
			ContentID:   contentID,
			ContentType: contentType,
			TopicID:     tid,
			Role:        "PRIMARY",
			Weight:      1.0,
		}
	}
	return r.SetContentTopicEntries(ctx, contentID, contentType, entries)
}

func (r *topicRepository) SetContentTopicEntries(ctx context.Context, contentID uint, contentType string, entries []entity.ContentTopic) error {
	return r.write.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("content_id = ? AND content_type = ?", contentID, contentType).Delete(&entity.ContentTopic{}).Error; err != nil {
			return err
		}
		if len(entries) == 0 {
			return nil
		}
		for i := range entries {
			entries[i].ContentID = contentID
			entries[i].ContentType = contentType
			if entries[i].Role == "" {
				entries[i].Role = "PRIMARY"
			}
			if entries[i].Weight <= 0 {
				entries[i].Weight = 1.0
			}
		}
		return tx.Create(&entries).Error
	})
}

func (r *topicRepository) ResolveTopic(ctx context.Context, rawName string) (*repository.TopicResolutionResult, error) {
	if rawName == "" {
		return &repository.TopicResolutionResult{
			Status:   repository.TopicResolutionNew,
			RawInput: rawName,
		}, nil
	}

	// 1. Direct name/slug exact hit
	var exactTopic entity.Topic
	err := r.read.WithContext(ctx).
		Where("LOWER(name) = LOWER(?) OR LOWER(slug) = LOWER(?)", rawName, rawName).
		First(&exactTopic).Error
	if err == nil {
		return &repository.TopicResolutionResult{
			Status:       repository.TopicResolutionMatch,
			MatchedTopic: &exactTopic,
			Confidence:   1.0,
			RawInput:     rawName,
		}, nil
	}

	// 2. Alias exact / normalized hit
	var alias entity.TopicAlias
	err = r.read.WithContext(ctx).
		Where("LOWER(alias) = LOWER(?) OR LOWER(normalized_alias) = LOWER(?)", rawName, rawName).
		First(&alias).Error
	if err == nil {
		matched, err := r.FindByID(ctx, alias.TopicID)
		if err == nil {
			return &repository.TopicResolutionResult{
				Status:       repository.TopicResolutionMatch,
				MatchedTopic: matched,
				Confidence:   1.0,
				RawInput:     rawName,
			}, nil
		}
	}

	// 3. Partial/Fuzzy Candidate lookup -> SUGGESTION
	var suggested []*entity.Topic
	likePattern := "%" + rawName + "%"
	r.read.WithContext(ctx).
		Where("LOWER(name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?)", likePattern, likePattern).
		Limit(5).
		Find(&suggested)

	if len(suggested) > 0 {
		return &repository.TopicResolutionResult{
			Status:          repository.TopicResolutionSuggestion,
			SuggestedTopics: suggested,
			Confidence:      0.8,
			RawInput:        rawName,
		}, nil
	}

	// 4. NEW
	return &repository.TopicResolutionResult{
		Status:     repository.TopicResolutionNew,
		Confidence: 0.0,
		RawInput:   rawName,
	}, nil
}

func (r *topicRepository) FindReachable(ctx context.Context, topicID uint, maxDepth int) ([]*repository.ReachableTopic, error) {
	if maxDepth <= 0 {
		maxDepth = 2
	}

	type cteResult struct {
		TopicID          uint
		Depth            int
		RelationshipType string
		Weight           float64
	}

	var results []cteResult
	rawSQL := `
		WITH RECURSIVE topic_tree AS (
			SELECT target_topic_id AS topic_id, 1 AS depth, relationship_type, weight
			FROM topic_relationships
			WHERE source_topic_id = ? AND status = 'ACTIVE'

			UNION ALL

			SELECT tr.target_topic_id AS topic_id, tt.depth + 1 AS depth, tr.relationship_type, (tt.weight * tr.weight) AS weight
			FROM topic_relationships tr
			INNER JOIN topic_tree tt ON tr.source_topic_id = tt.topic_id
			WHERE tt.depth < ? AND tr.status = 'ACTIVE'
		)
		SELECT topic_id, depth, relationship_type, weight FROM topic_tree
	`

	err := r.read.WithContext(ctx).Raw(rawSQL, topicID, maxDepth).Scan(&results).Error
	if err != nil {
		return nil, err
	}

	if len(results) == 0 {
		return nil, nil
	}

	topicIDs := make([]uint, len(results))
	for i, res := range results {
		topicIDs[i] = res.TopicID
	}

	var topics []*entity.Topic
	if err := r.read.WithContext(ctx).Where("id IN ?", topicIDs).Find(&topics).Error; err != nil {
		return nil, err
	}

	topicMap := make(map[uint]*entity.Topic)
	for _, t := range topics {
		topicMap[t.ID] = t
	}

	var reachable []*repository.ReachableTopic
	for _, res := range results {
		if top, ok := topicMap[res.TopicID]; ok {
			reachable = append(reachable, &repository.ReachableTopic{
				Topic:            top,
				Depth:            res.Depth,
				RelationshipType: res.RelationshipType,
				Weight:           res.Weight,
				Path:             []uint{topicID, top.ID},
			})
		}
	}

	return reachable, nil
}


package topic_test

import (
	"context"
	"errors"
	"testing"

	"github.com/serenya/go-cms/internal/application/topic"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type mockTopicRepository struct {
	topics        map[uint]*entity.Topic
	aliases       []*entity.TopicAlias
	relationships []*entity.TopicRelationship
	contentTopics map[string][]entity.ContentTopic
}

func newMockTopicRepository() *mockTopicRepository {
	return &mockTopicRepository{
		topics:        make(map[uint]*entity.Topic),
		contentTopics: make(map[string][]entity.ContentTopic),
	}
}

func (m *mockTopicRepository) Create(ctx context.Context, t *entity.Topic) error {
	t.ID = uint(len(m.topics) + 1)
	m.topics[t.ID] = t
	return nil
}

func (m *mockTopicRepository) FindAll(ctx context.Context) ([]*entity.Topic, error) {
	var list []*entity.Topic
	for _, t := range m.topics {
		list = append(list, t)
	}
	return list, nil
}

func (m *mockTopicRepository) FindByID(ctx context.Context, id uint) (*entity.Topic, error) {
	if t, ok := m.topics[id]; ok {
		return t, nil
	}
	return nil, errors.New("not found")
}

func (m *mockTopicRepository) FindBySlug(ctx context.Context, slug string) (*entity.Topic, error) {
	for _, t := range m.topics {
		if t.Slug == slug {
			return t, nil
		}
	}
	return nil, errors.New("not found")
}

func (m *mockTopicRepository) FindBySlugs(ctx context.Context, slugs []string) ([]*entity.Topic, error) {
	var matched []*entity.Topic
	slugSet := make(map[string]bool)
	for _, s := range slugs {
		slugSet[s] = true
	}
	for _, t := range m.topics {
		if slugSet[t.Slug] {
			matched = append(matched, t)
		}
	}
	return matched, nil
}

func (m *mockTopicRepository) Update(ctx context.Context, t *entity.Topic) error {
	m.topics[t.ID] = t
	return nil
}

func (m *mockTopicRepository) Delete(ctx context.Context, id uint) error {
	delete(m.topics, id)
	return nil
}

func (m *mockTopicRepository) ListRelationships(ctx context.Context, topicID uint) ([]*entity.TopicRelationship, error) {
	var rels []*entity.TopicRelationship
	for _, r := range m.relationships {
		if r.SourceTopicID == topicID {
			rels = append(rels, r)
		}
	}
	return rels, nil
}

func (m *mockTopicRepository) SetRelationships(ctx context.Context, topicID uint, rels []entity.TopicRelationship) error {
	var newRels []*entity.TopicRelationship
	for _, r := range m.relationships {
		if r.SourceTopicID != topicID {
			newRels = append(newRels, r)
		}
	}
	for i := range rels {
		rels[i].SourceTopicID = topicID
		newRels = append(newRels, &rels[i])
	}
	m.relationships = newRels
	return nil
}

func (m *mockTopicRepository) GetContentTopics(ctx context.Context, contentID uint, contentType string) ([]*entity.Topic, error) {
	key := string(rune(contentID)) + ":" + contentType
	entries := m.contentTopics[key]
	var list []*entity.Topic
	for _, e := range entries {
		if t, ok := m.topics[e.TopicID]; ok {
			list = append(list, t)
		}
	}
	return list, nil
}

func (m *mockTopicRepository) GetContentTopicEntries(ctx context.Context, contentID uint, contentType string) ([]*entity.ContentTopic, error) {
	key := string(rune(contentID)) + ":" + contentType
	entries := m.contentTopics[key]
	var list []*entity.ContentTopic
	for i := range entries {
		list = append(list, &entries[i])
	}
	return list, nil
}

func (m *mockTopicRepository) SetContentTopics(ctx context.Context, contentID uint, contentType string, topicIDs []uint) error {
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
	return m.SetContentTopicEntries(ctx, contentID, contentType, entries)
}

func (m *mockTopicRepository) SetContentTopicEntries(ctx context.Context, contentID uint, contentType string, entries []entity.ContentTopic) error {
	key := string(rune(contentID)) + ":" + contentType
	m.contentTopics[key] = entries
	return nil
}

func (m *mockTopicRepository) ResolveTopic(ctx context.Context, rawName string) (*repository.TopicResolutionResult, error) {
	for _, t := range m.topics {
		if t.Name == rawName || t.Slug == rawName {
			return &repository.TopicResolutionResult{
				Status:       repository.TopicResolutionMatch,
				MatchedTopic: t,
				Confidence:   1.0,
				RawInput:     rawName,
			}, nil
		}
	}
	return &repository.TopicResolutionResult{
		Status:     repository.TopicResolutionNew,
		Confidence: 0.0,
		RawInput:   rawName,
	}, nil
}

func (m *mockTopicRepository) FindReachable(ctx context.Context, topicID uint, maxDepth int) ([]*repository.ReachableTopic, error) {
	var reachable []*repository.ReachableTopic
	for _, r := range m.relationships {
		if r.SourceTopicID == topicID {
			if target, ok := m.topics[r.TargetTopicID]; ok {
				reachable = append(reachable, &repository.ReachableTopic{
					Topic:            target,
					Depth:            1,
					RelationshipType: r.RelationshipType,
					Weight:           r.Weight,
					Path:             []uint{topicID, target.ID},
				})
			}
		}
	}
	return reachable, nil
}

func TestTopicService_CreateAndResolve(t *testing.T) {
	repo := newMockTopicRepository()
	svc := topic.NewService(repo)
	ctx := context.Background()

	top, err := svc.Create(ctx, "OAuth 2.0", "standard", "OAuth protocol")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if top.Name != "OAuth 2.0" || top.Slug != "oauth-2-0" {
		t.Errorf("unexpected topic properties: %+v", top)
	}

	res, err := svc.ResolveTopic(ctx, "OAuth 2.0")
	if err != nil {
		t.Fatalf("expected resolve success, got %v", err)
	}
	if res.Status != repository.TopicResolutionMatch {
		t.Errorf("expected MATCH status, got %s", res.Status)
	}
}

func TestTopicService_ContentTopicsWithRoles(t *testing.T) {
	repo := newMockTopicRepository()
	svc := topic.NewService(repo)
	ctx := context.Background()

	t1, _ := svc.Create(ctx, "Go", "language", "Go language")
	t2, _ := svc.Create(ctx, "OAuth 2.0", "standard", "OAuth protocol")

	entries := []entity.ContentTopic{
		{TopicID: t1.ID, Role: "PRIMARY", Weight: 1.0},
		{TopicID: t2.ID, Role: "SECONDARY", Weight: 0.8},
	}

	err := svc.SetContentTopicEntries(ctx, 101, "ARTICLE", entries)
	if err != nil {
		t.Fatalf("expected success setting entries, got %v", err)
	}

	fetchedEntries, err := svc.GetContentTopicEntries(ctx, 101, "ARTICLE")
	if err != nil {
		t.Fatalf("expected success getting entries, got %v", err)
	}
	if len(fetchedEntries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(fetchedEntries))
	}
	if fetchedEntries[1].Role != "SECONDARY" || fetchedEntries[1].Weight != 0.8 {
		t.Errorf("unexpected role/weight on second entry: %+v", fetchedEntries[1])
	}
}

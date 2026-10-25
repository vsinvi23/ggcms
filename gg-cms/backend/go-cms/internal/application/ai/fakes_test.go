package ai

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/infrastructure/llm"
)

type fakeProvider struct {
	mu        sync.Mutex
	available bool
	reply     func(req llm.Request) (*llm.Response, error)
	calls     []llm.Request
}

func newFakeProvider(text string) *fakeProvider {
	return &fakeProvider{available: true, reply: func(llm.Request) (*llm.Response, error) {
		return &llm.Response{Text: text, InputTokens: 1000, OutputTokens: 200, StopReason: "end_turn"}, nil
	}}
}

func (f *fakeProvider) Name() string    { return "fake" }
func (f *fakeProvider) Available() bool { return f.available }
func (f *fakeProvider) Complete(_ context.Context, req llm.Request) (*llm.Response, error) {
	f.mu.Lock()
	f.calls = append(f.calls, req)
	f.mu.Unlock()
	return f.reply(req)
}
func (f *fakeProvider) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}
func (f *fakeProvider) lastRequest() llm.Request {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[len(f.calls)-1]
}

type memSettings struct {
	mu sync.Mutex
	m  map[string]string
}

func newSettings(kv ...string) *memSettings {
	s := &memSettings{m: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		s.m[kv[i]] = kv[i+1]
	}
	return s
}

func (s *memSettings) GetAll(context.Context) (map[string]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]string{}
	for k, v := range s.m {
		out[k] = v
	}
	return out, nil
}

func (s *memSettings) SetMany(_ context.Context, m map[string]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, v := range m {
		s.m[k] = v
	}
	return nil
}

type memUsage struct {
	mu   sync.Mutex
	rows []*entity.AIUsage
}

func (u *memUsage) RecordUsage(_ context.Context, r *entity.AIUsage) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	r.CreatedAt = time.Now()
	u.rows = append(u.rows, r)
	return nil
}

func (u *memUsage) CostSince(_ context.Context, since time.Time) (int64, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	var t int64
	for _, r := range u.rows {
		if !r.CreatedAt.Before(since) {
			t += r.CostMicroUSD
		}
	}
	return t, nil
}

func (u *memUsage) CountSince(_ context.Context, userID uint, tasks []string, since time.Time) (int64, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	var n int64
	for _, r := range u.rows {
		if r.UserID == nil || *r.UserID != userID || r.Status != "ok" {
			continue
		}
		for _, t := range tasks {
			if t == r.Task {
				n++
			}
		}
	}
	return n, nil
}

func (u *memUsage) UsageReport(context.Context, time.Time, time.Time) (*repository.AIUsageReport, error) {
	return &repository.AIUsageReport{}, nil
}

func (u *memUsage) count() int {
	u.mu.Lock()
	defer u.mu.Unlock()
	return len(u.rows)
}

type memDrafts struct {
	drafts map[string]*entity.AIDraft
}

func (d *memDrafts) CreateDraft(_ context.Context, x *entity.AIDraft) error {
	if d.drafts == nil {
		d.drafts = map[string]*entity.AIDraft{}
	}
	d.drafts[x.ID] = x
	return nil
}
func (d *memDrafts) GetDraft(_ context.Context, id string) (*entity.AIDraft, error) {
	if x, ok := d.drafts[id]; ok {
		return x, nil
	}
	return nil, errors.New("not found")
}
func (d *memDrafts) ListDrafts(context.Context, string, uint, string) ([]*entity.AIDraft, error) {
	return nil, nil
}
func (d *memDrafts) SetDraftStatus(_ context.Context, id, status string, _ uint) error {
	d.drafts[id].Status = status
	return nil
}

type memCatalog struct {
	topics, cats, tags []repository.AITaxon
	courses, paths     []repository.AICatalogItem
	exists             map[string]bool
}

func (c *memCatalog) Tags(context.Context) ([]repository.AITaxon, error)       { return c.tags, nil }
func (c *memCatalog) Topics(context.Context) ([]repository.AITaxon, error)     { return c.topics, nil }
func (c *memCatalog) Categories(context.Context) ([]repository.AITaxon, error) { return c.cats, nil }
func (c *memCatalog) PublishedCourses(context.Context, int) ([]repository.AICatalogItem, error) {
	return c.courses, nil
}
func (c *memCatalog) LearningPaths(context.Context, int) ([]repository.AICatalogItem, error) {
	return c.paths, nil
}
func (c *memCatalog) ContentExists(_ context.Context, ref string) (bool, error) {
	return c.exists[ref], nil
}

type memChunks struct {
	repository.AIChunkRepository
	doc    *repository.PublishedDoc
	chunks []entity.ContentChunk
}

func (c *memChunks) PublishedDoc(context.Context, string, uint) (*repository.PublishedDoc, error) {
	return c.doc, nil
}
func (c *memChunks) SearchChunks(context.Context, string, string, uint, int) ([]entity.ContentChunk, error) {
	return c.chunks, nil
}

type memConvos struct {
	mu    sync.Mutex
	convs map[string]*entity.AIConversation
	msgs  []*entity.AIMessage
}

func (m *memConvos) CreateConversation(_ context.Context, c *entity.AIConversation) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.convs == nil {
		m.convs = map[string]*entity.AIConversation{}
	}
	m.convs[c.ID] = c
	return nil
}
func (m *memConvos) GetConversation(_ context.Context, id string, userID uint) (*entity.AIConversation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.convs[id]; ok && c.UserID == userID {
		return c, nil
	}
	return nil, errors.New("not found")
}
func (m *memConvos) ListConversations(context.Context, uint, int) ([]*entity.AIConversation, error) {
	return nil, nil
}
func (m *memConvos) DeleteConversation(_ context.Context, id string, userID uint) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.convs[id]; ok && c.UserID == userID {
		delete(m.convs, id)
		return true, nil
	}
	return false, nil
}
func (m *memConvos) AppendMessage(_ context.Context, msg *entity.AIMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg.ID = uint(len(m.msgs) + 1)
	m.msgs = append(m.msgs, msg)
	return nil
}
func (m *memConvos) RecentMessages(_ context.Context, id string, _ int) ([]*entity.AIMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []*entity.AIMessage
	for _, x := range m.msgs {
		if x.ConversationID == id {
			out = append(out, x)
		}
	}
	return out, nil
}
func (m *memConvos) SetFeedback(_ context.Context, id, userID uint, rating int, _ string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, x := range m.msgs {
		if x.ID == id && x.Role == "assistant" && m.convs[x.ConversationID].UserID == userID {
			x.Rating = rating
			return true, nil
		}
	}
	return false, nil
}

type memModeration struct {
	items map[string]*entity.AIModerationItem
}

func (m *memModeration) UpsertModeration(_ context.Context, it *entity.AIModerationItem) error {
	if m.items == nil {
		m.items = map[string]*entity.AIModerationItem{}
	}
	m.items[it.CommentID] = it
	return nil
}
func (m *memModeration) HiddenCommentIDs(_ context.Context, ids []string) (map[string]bool, error) {
	out := map[string]bool{}
	for _, id := range ids {
		if it, ok := m.items[id]; ok && it.Status != StatusApproved {
			out[id] = true
		}
	}
	return out, nil
}
func (m *memModeration) ListModeration(context.Context, string, int, int) ([]*entity.AIModerationItem, int64, error) {
	return nil, 0, nil
}
func (m *memModeration) ResolveModeration(_ context.Context, id uint, status string, _ uint) (bool, error) {
	for _, it := range m.items {
		if it.ID == id {
			it.Status = status
			return true, nil
		}
	}
	return false, nil
}

type fakeContent struct {
	docs map[uint]*ContentDoc
}

func (f *fakeContent) Get(_ context.Context, _ entity.CMSType, id uint) (*ContentDoc, error) {
	if d, ok := f.docs[id]; ok {
		return d, nil
	}
	return nil, fmt.Errorf("missing")
}

type harness struct {
	svc      Service
	provider *fakeProvider
	usage    *memUsage
	settings *memSettings
	drafts   *memDrafts
	catalog  *memCatalog
	chunks   *memChunks
	convos   *memConvos
	mod      *memModeration
	content  *fakeContent
}

var enabledAll = []string{KeyEnabled, "true", KeyEditorial, "true", KeyModeration, "true", KeyTutor, "true", KeyQuiz, "true", KeyStudyPlan, "true"}

func newHarness(reply string, kv ...string) *harness {
	h := &harness{
		provider: newFakeProvider(reply),
		usage:    &memUsage{},
		settings: newSettings(append(append([]string{}, enabledAll...), kv...)...),
		drafts:   &memDrafts{},
		catalog:  &memCatalog{exists: map[string]bool{}},
		chunks:   &memChunks{},
		convos:   &memConvos{},
		mod:      &memModeration{},
		content:  &fakeContent{docs: map[uint]*ContentDoc{}},
	}
	gw := NewGateway(h.provider, h.usage, h.settings, []string{"geekgully.com"})
	h.svc = NewService(Deps{Gateway: gw, Content: h.content, Catalog: h.catalog, Drafts: h.drafts, Chunks: h.chunks, Convos: h.convos, Moderation: h.mod, UsageRepo: h.usage, Settings: h.settings})
	return h
}

func (h *harness) addDoc(id uint, createdBy uint, body string) {
	h.content.docs[id] = &ContentDoc{Type: entity.CMSTypeArticle, ID: id, Title: "Intro to OAuth", Description: "desc", Body: body, CreatedByID: createdBy}
}

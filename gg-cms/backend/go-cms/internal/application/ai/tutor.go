package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

const (
	tutorTopK         = 6
	tutorHistory      = 6
	tutorChunkChars   = 1500
	maxQuestionRunes  = 1000
	tutorAnswerMax    = 2500
	RefusalAnswer     = "I couldn't find support for that in this material, so I can't answer it reliably. Try rephrasing the question or check the relevant lesson directly."
	tutorSystemPrompt = `Task: answer the learner's question using ONLY the numbered context passages supplied in <untrusted_data> blocks labelled c1, c2, ...
Rules: if the passages do not contain the answer, set supported to false and leave answer empty. Never use outside knowledge. Cite every passage you used by its label. Keep the answer concise and in plain markdown.
Output only JSON: {"supported":true,"answer":"...","citations":["c1"]}`
)

type AskInput struct {
	CourseID       uint
	ContentID      uint
	ContentType    string
	Question       string
	ConversationID string
}

type Citation struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Heading     string `json:"heading"`
	URL         string `json:"url"`
	Anchor      string `json:"anchor"`
	ContentType string `json:"contentType"`
	ContentID   uint   `json:"contentId"`
}

type AskResult struct {
	ConversationID string     `json:"conversationId"`
	MessageID      uint       `json:"messageId"`
	Answer         string     `json:"answer"`
	Citations      []Citation `json:"citations"`
	Grounded       bool       `json:"grounded"`
}

type ConversationView struct {
	Conversation *entity.AIConversation `json:"conversation"`
	Messages     []MessageView          `json:"messages"`
}

type MessageView struct {
	ID        uint       `json:"id"`
	Role      string     `json:"role"`
	Content   string     `json:"content"`
	Citations []Citation `json:"citations"`
	Grounded  bool       `json:"grounded"`
	Rating    int        `json:"rating"`
	CreatedAt string     `json:"createdAt"`
}

func scopeOf(in AskInput) (string, uint, error) {
	if in.CourseID > 0 {
		return "course", in.CourseID, nil
	}
	if in.ContentID > 0 {
		t, ok := ParseContentType(in.ContentType)
		if in.ContentType == "" {
			t, ok = entity.CMSTypeArticle, true
		}
		if !ok {
			return "", 0, invalid("contentType must be article or course")
		}
		return strings.ToLower(string(t)), in.ContentID, nil
	}
	return "", 0, invalid("courseId or contentId is required")
}

func citationURL(doc *repository.PublishedDoc, anchor string) string {
	ref := doc.Slug
	if ref == "" {
		ref = doc.PublicID
	}
	base := "/articles/"
	if doc.ContentType == "course" {
		base = "/courses/"
	}
	u := base + ref
	if anchor != "" {
		u += "#" + anchor
	}
	return u
}

func (s *service) Ask(ctx context.Context, actor Actor, in AskInput) (*AskResult, error) {
	if _, err := s.Gateway.Gate(ctx, TaskTutor); err != nil {
		return nil, err
	}
	q := strings.TrimSpace(in.Question)
	if n := utf8.RuneCountInString(q); n < 3 || n > maxQuestionRunes {
		return nil, invalid("question must be between 3 and 1000 characters")
	}
	scopeType, scopeID, err := scopeOf(in)
	if err != nil {
		return nil, err
	}
	doc, err := s.Chunks.PublishedDoc(ctx, scopeType, scopeID)
	if err != nil || doc == nil {
		return nil, ErrNotFound
	}

	var conv *entity.AIConversation
	var history []*entity.AIMessage
	if in.ConversationID != "" {
		conv, err = s.Convos.GetConversation(ctx, in.ConversationID, actor.UserID)
		if err != nil || conv == nil || conv.ScopeType != scopeType || conv.ScopeID != scopeID {
			return nil, ErrNotFound
		}
		history, _ = s.Convos.RecentMessages(ctx, conv.ID, tutorHistory)
	}

	chunks, err := s.Chunks.SearchChunks(ctx, BuildTSQuery(q), scopeType, scopeID, tutorTopK)
	if err != nil {
		return nil, ErrUpstream
	}

	answer, citations, grounded := RefusalAnswer, []Citation{}, false
	if len(chunks) > 0 {
		answer, citations, grounded, err = s.answerFromChunks(ctx, actor, q, doc, chunks, history)
		if err != nil {
			return nil, err
		}
	}

	if conv == nil {
		conv = &entity.AIConversation{ID: uuid.NewString(), UserID: actor.UserID, ScopeType: scopeType, ScopeID: scopeID, Title: Clip(RedactPII(q), 80)}
		if err := s.Convos.CreateConversation(ctx, conv); err != nil {
			return nil, ErrUpstream
		}
	}
	if err := s.Convos.AppendMessage(ctx, &entity.AIMessage{ConversationID: conv.ID, Role: "user", Content: q, Citations: "[]", Grounded: true}); err != nil {
		return nil, ErrUpstream
	}
	cj, _ := json.Marshal(citations)
	msg := &entity.AIMessage{ConversationID: conv.ID, Role: "assistant", Content: answer, Citations: string(cj), Grounded: grounded}
	if err := s.Convos.AppendMessage(ctx, msg); err != nil {
		return nil, ErrUpstream
	}
	s.track(ctx, actor.UserID, scopeType, scopeID, grounded, len(citations))
	return &AskResult{ConversationID: conv.ID, MessageID: msg.ID, Answer: answer, Citations: citations, Grounded: grounded}, nil
}

func (s *service) answerFromChunks(ctx context.Context, actor Actor, q string, doc *repository.PublishedDoc, chunks []entity.ContentChunk, history []*entity.AIMessage) (string, []Citation, bool, error) {
	data := make([]DataBlock, 0, len(chunks))
	byLabel := map[string]entity.ContentChunk{}
	for i, c := range chunks {
		label := fmt.Sprintf("c%d", i+1)
		byLabel[label] = c
		data = append(data, DataBlock{Label: label, Text: c.Heading + "\n" + Clip(c.Body, tutorChunkChars)})
	}
	var turns []Turn
	for _, m := range history {
		turns = append(turns, Turn{Role: m.Role, Text: Clip(m.Content, 800)})
	}
	res, err := s.Gateway.Complete(ctx, Call{Task: TaskTutor, UserID: actor.UserID, System: tutorSystemPrompt, Data: data, History: turns, User: "Question: " + q})
	if err != nil {
		return "", nil, false, err
	}
	var p struct {
		Supported bool     `json:"supported"`
		Answer    string   `json:"answer"`
		Citations []string `json:"citations"`
	}
	if err := ParseJSON(res.Text, &p); err != nil {
		return "", nil, false, err
	}
	var citations []Citation
	seen := map[string]bool{}
	for _, l := range p.Citations {
		l = strings.ToLower(strings.TrimSpace(l))
		c, ok := byLabel[l]
		if !ok || seen[l] {
			continue
		}
		seen[l] = true
		citations = append(citations, Citation{ID: l, Title: c.Title, Heading: c.Heading, Anchor: c.Anchor, URL: citationURL(doc, c.Anchor), ContentType: c.ContentType, ContentID: c.ContentID})
	}
	if !p.Supported || strings.TrimSpace(p.Answer) == "" || len(citations) == 0 {
		return RefusalAnswer, []Citation{}, false, nil
	}
	return Clip(p.Answer, tutorAnswerMax), citations, true, nil
}

func (s *service) track(ctx context.Context, userID uint, scopeType string, scopeID uint, grounded bool, citations int) {
	if s.Analytics == nil {
		return
	}
	id := fmt.Sprint(scopeID)
	uid := userID
	go func() {
		_ = s.Analytics.TrackEvent(context.WithoutCancel(ctx), "ai_tutor_question", &uid, &id, &scopeType, map[string]interface{}{"grounded": grounded, "citations": citations})
	}()
}

func (s *service) ListConversations(ctx context.Context, userID uint) ([]*entity.AIConversation, error) {
	return s.Convos.ListConversations(ctx, userID, 50)
}

func (s *service) GetConversation(ctx context.Context, userID uint, id string) (*ConversationView, error) {
	conv, err := s.Convos.GetConversation(ctx, id, userID)
	if err != nil || conv == nil {
		return nil, ErrNotFound
	}
	msgs, err := s.Convos.RecentMessages(ctx, id, 200)
	if err != nil {
		return nil, ErrUpstream
	}
	view := &ConversationView{Conversation: conv, Messages: make([]MessageView, 0, len(msgs))}
	for _, m := range msgs {
		cits := []Citation{}
		_ = json.Unmarshal([]byte(m.Citations), &cits)
		view.Messages = append(view.Messages, MessageView{ID: m.ID, Role: m.Role, Content: m.Content, Citations: cits, Grounded: m.Grounded, Rating: m.Rating, CreatedAt: m.CreatedAt.UTC().Format("2006-01-02T15:04:05Z")})
	}
	return view, nil
}

func (s *service) DeleteConversation(ctx context.Context, userID uint, id string) error {
	ok, err := s.Convos.DeleteConversation(ctx, id, userID)
	if err != nil {
		return ErrUpstream
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

func (s *service) Feedback(ctx context.Context, userID, messageID uint, rating int, comment string) error {
	if rating != 1 && rating != -1 {
		return invalid("rating must be 1 or -1")
	}
	ok, err := s.Convos.SetFeedback(ctx, messageID, userID, rating, Clip(RedactPII(comment), 500))
	if err != nil {
		return ErrUpstream
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

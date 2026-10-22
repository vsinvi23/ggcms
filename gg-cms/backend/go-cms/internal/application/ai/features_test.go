package ai

import (
	"context"
	"strings"
	"testing"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/infrastructure/llm"
)

var owner = Actor{UserID: 10}

func blocksBody() string {
	return `[{"type":"heading1","content":"OAuth basics"},{"type":"paragraph","content":"OAuth 2.0 delegates authorisation using access tokens."},` +
		`{"type":"heading2","content":"Refresh tokens"},{"type":"paragraph","content":"Refresh tokens obtain new access tokens. See [intro](/articles/missing-slug)."}]`
}

func TestEditorialAccessControl(t *testing.T) {
	h := newHarness(`{"tldr":"x","takeaways":["a"]}`)
	h.addDoc(1, 10, blocksBody())
	if _, err := h.svc.Summarise(context.Background(), Actor{UserID: 99}, "article", 1); err == nil {
		t.Fatal("non-owner must not access content")
	}
	if _, err := h.svc.Summarise(context.Background(), Actor{UserID: 99, Admin: true}, "article", 1); err != nil {
		t.Fatalf("admin must be allowed: %v", err)
	}
	if _, err := h.svc.Summarise(context.Background(), owner, "podcast", 1); err == nil {
		t.Fatal("invalid content type must fail")
	}
}

func TestSummaryStoredAsDraftAndAccept(t *testing.T) {
	h := newHarness("```json\n{\"tldr\":\"OAuth delegates access.\",\"takeaways\":[\"Tokens\",\"Scopes\"]}\n```")
	h.addDoc(1, 10, blocksBody())
	res, err := h.svc.Summarise(context.Background(), owner, "article", 1)
	if err != nil || res.DraftID == "" || res.Status != "draft" || len(res.Takeaways) != 2 {
		t.Fatalf("summary: %+v %v", res, err)
	}
	if h.drafts.drafts[res.DraftID].Status != "draft" {
		t.Fatal("summary must not be applied without human accept")
	}
	d, err := h.svc.ResolveDraft(context.Background(), owner, res.DraftID, true)
	if err != nil || d.Status != "accepted" {
		t.Fatalf("accept: %v %v", d, err)
	}
	if _, err := h.svc.ResolveDraft(context.Background(), owner, res.DraftID, true); err == nil {
		t.Fatal("double resolve must fail")
	}
}

func TestSEOLengthLimits(t *testing.T) {
	long := strings.Repeat("word ", 40)
	h := newHarness(`{"metaTitle":"` + long + `","metaDescription":"` + long + long + `","keywords":["oauth","tokens"]}`)
	h.addDoc(1, 10, blocksBody())
	res, err := h.svc.SuggestSEO(context.Background(), owner, "article", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len([]rune(res.MetaTitle)) > seoTitleMax || len([]rune(res.MetaDescription)) > seoDescMax || !res.LengthAdjusted {
		t.Fatalf("lengths not enforced: %d %d", len(res.MetaTitle), len(res.MetaDescription))
	}
}

func TestTagSuggestionConstrainedToTaxonomy(t *testing.T) {
	h := newHarness(`{"topics":[{"id":1,"reason":"core"},{"id":999,"reason":"invented"}],"categories":[{"id":5,"reason":"fits"}],"tags":[{"id":42,"reason":"x"}]}`)
	h.addDoc(1, 10, blocksBody())
	h.catalog.topics = []repository.AITaxon{{ID: 1, Name: "OAuth 2.0"}, {ID: 2, Name: "Kubernetes"}}
	h.catalog.cats = []repository.AITaxon{{ID: 5, Name: "Identity"}}
	h.catalog.tags = []repository.AITaxon{{ID: 7, Name: "oauth"}}
	res, err := h.svc.SuggestTags(context.Background(), owner, "article", 1)
	if err != nil {
		t.Fatal(err)
	}
	if res.Source != "llm" || len(res.Topics) != 1 || res.Topics[0].ID != 1 || len(res.Categories) != 1 || len(res.Tags) != 0 {
		t.Fatalf("unexpected suggestions: %+v", res)
	}
	if res.Topics[0].Score <= 0 {
		t.Fatal("heuristic score should be carried for parity with the factory resolver")
	}
}

func TestTagSuggestionFallsBackToHeuristics(t *testing.T) {
	h := newHarness("")
	h.provider.reply = func(llm.Request) (*llm.Response, error) { return nil, &llm.APIError{Status: 503, Retryable: true} }
	h.addDoc(1, 10, blocksBody())
	h.catalog.topics = []repository.AITaxon{{ID: 1, Name: "OAuth tokens"}, {ID: 2, Name: "Kubernetes"}}
	res, err := h.svc.SuggestTags(context.Background(), owner, "article", 1)
	if err != nil || res.Source != "heuristic" || len(res.Topics) != 1 || res.Topics[0].ID != 1 || res.Note == "" {
		t.Fatalf("fallback: %+v %v", res, err)
	}
}

func TestQualityCheckFlagsBrokenInternalLinks(t *testing.T) {
	h := newHarness(`{"missingSections":["Security considerations"],"unsupportedClaims":[{"claim":"OAuth is unbreakable","why":"no evidence"}],"structureNotes":[]}`)
	h.addDoc(1, 10, blocksBody())
	res, err := h.svc.QualityCheck(context.Background(), owner, "article", 1)
	if err != nil || !res.AIUsed {
		t.Fatalf("quality: %+v %v", res, err)
	}
	cats := map[string]bool{}
	for _, i := range res.Issues {
		cats[i.Category] = true
	}
	for _, want := range []string{"broken_link", "missing_section", "unsupported_claim"} {
		if !cats[want] {
			t.Fatalf("missing %s issue in %+v", want, res.Issues)
		}
	}
	if res.Score >= 100 || res.Stats.Headings != 2 {
		t.Fatalf("score/stats: %+v", res)
	}
}

func TestQuizValidation(t *testing.T) {
	h := newHarness(`{"questions":[{"question":"Q1","options":["a","b","c"],"correctIndex":1,"explanation":"e"},{"question":"bad","options":["a","b","c"],"correctIndex":9,"explanation":"e"},{"question":"few","options":["a"],"correctIndex":0}]}`)
	h.addDoc(1, 10, blocksBody())
	res, err := h.svc.GenerateQuiz(context.Background(), owner, "article", 1, 5, "")
	if err != nil || len(res.Questions) != 1 || res.DraftID == "" || res.Difficulty != "medium" {
		t.Fatalf("quiz: %+v %v", res, err)
	}
	if _, err := h.svc.GenerateQuiz(context.Background(), owner, "article", 1, 50, ""); err == nil {
		t.Fatal("count cap must be enforced")
	}
}

func TestStudyPlanOnlyExistingItems(t *testing.T) {
	h := newHarness(`{"summary":"Start here","items":[{"type":"course","id":2,"reason":"fits"},{"type":"course","id":777,"reason":"invented"},{"type":"path","id":1,"reason":"next"},{"type":"course","id":2,"reason":"dup"}]}`)
	h.catalog.courses = []repository.AICatalogItem{{ID: 2, Title: "AWS Basics", Description: "intro"}}
	h.catalog.paths = []repository.AICatalogItem{{ID: 1, Title: "Cloud Path"}}
	plan, err := h.svc.StudyPlan(context.Background(), 4, "learn cloud security", "beginner")
	if err != nil || len(plan.Items) != 2 || plan.Items[0].Title != "AWS Basics" || plan.Items[1].Order != 2 {
		t.Fatalf("plan: %+v %v", plan, err)
	}
	if !h.provider.lastRequest().Messages[0].Blocks[0].Cache {
		t.Fatal("catalog block should be cache-marked")
	}
	if _, err := h.svc.StudyPlan(context.Background(), 4, "x", "beginner"); err == nil {
		t.Fatal("short goals must fail")
	}
}

func tutorHarness(reply string) *harness {
	h := newHarness(reply)
	h.chunks.doc = &repository.PublishedDoc{ContentType: "course", ContentID: 3, PublicID: "pub-3", Slug: "oauth-course", Title: "OAuth"}
	h.chunks.chunks = []entity.ContentChunk{
		{ContentType: "course", ContentID: 3, Title: "OAuth", Heading: "Refresh tokens", Anchor: "refresh-tokens", Body: "Refresh tokens obtain new access tokens without user interaction."},
		{ContentType: "course", ContentID: 3, Title: "OAuth", Heading: "Scopes", Anchor: "scopes", Body: "Scopes limit what an access token may do."},
	}
	return h
}

func TestTutorGroundedAnswerWithCitations(t *testing.T) {
	h := tutorHarness(`{"supported":true,"answer":"Refresh tokens get new access tokens.","citations":["c1","c9"]}`)
	res, err := h.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: "What are refresh tokens?"})
	if err != nil || !res.Grounded || len(res.Citations) != 1 {
		t.Fatalf("ask: %+v %v", res, err)
	}
	c := res.Citations[0]
	if c.URL != "/courses/oauth-course#refresh-tokens" || c.Heading != "Refresh tokens" {
		t.Fatalf("citation: %+v", c)
	}
	body := h.provider.lastRequest().Messages[0].Blocks
	if !strings.Contains(body[0].Text, `<untrusted_data label="c1">`) {
		t.Fatalf("context must be delimited: %s", body[0].Text)
	}
	follow, err := h.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: "And scopes?", ConversationID: res.ConversationID})
	if err != nil || follow.ConversationID != res.ConversationID {
		t.Fatalf("follow-up: %+v %v", follow, err)
	}
	if got := len(h.provider.lastRequest().Messages); got != 3 {
		t.Fatalf("history should be replayed (2 prior + 1 new), got %d messages", got)
	}
	if _, err := h.svc.Ask(context.Background(), Actor{UserID: 5}, AskInput{CourseID: 3, Question: "hijack?", ConversationID: res.ConversationID}); err == nil {
		t.Fatal("other users must not reuse a conversation")
	}
}

func TestTutorRefusesWithoutSupport(t *testing.T) {
	h := tutorHarness(`{"supported":true,"answer":"Made up answer","citations":["c42"]}`)
	res, err := h.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: "What is quantum tunnelling?"})
	if err != nil || res.Grounded || res.Answer != RefusalAnswer || len(res.Citations) != 0 {
		t.Fatalf("uncited answer must be refused: %+v %v", res, err)
	}

	h2 := tutorHarness(`{"supported":false,"answer":"","citations":[]}`)
	res, _ = h2.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: "Unrelated question here"})
	if res.Grounded || res.Answer != RefusalAnswer {
		t.Fatalf("unsupported must refuse: %+v", res)
	}

	h3 := tutorHarness("unused")
	h3.chunks.chunks = nil
	res, err = h3.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: "Anything at all"})
	if err != nil || res.Grounded || h3.provider.callCount() != 0 {
		t.Fatalf("no retrieval must not spend tokens: %+v %v calls=%d", res, err, h3.provider.callCount())
	}
}

func TestTutorGuardsAndFeedback(t *testing.T) {
	h := tutorHarness(`{"supported":true,"answer":"ok","citations":["c1"]}`)
	if _, err := h.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{Question: "no scope given"}); err == nil {
		t.Fatal("scope required")
	}
	if _, err := h.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: strings.Repeat("a", 1001)}); err == nil {
		t.Fatal("question length cap")
	}
	h.chunks.doc = nil
	if _, err := h.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: "unpublished?"}); err == nil {
		t.Fatal("unpublished content must be unavailable")
	}
	h.chunks.doc = &repository.PublishedDoc{ContentType: "course", ContentID: 3, Slug: "s"}
	res, err := h.svc.Ask(context.Background(), Actor{UserID: 4}, AskInput{CourseID: 3, Question: "What are scopes?"})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.svc.Feedback(context.Background(), 4, res.MessageID, 1, "great"); err != nil {
		t.Fatal(err)
	}
	if err := h.svc.Feedback(context.Background(), 5, res.MessageID, 1, ""); err == nil {
		t.Fatal("feedback on someone else's message must fail")
	}
	if err := h.svc.DeleteConversation(context.Background(), 5, res.ConversationID); err == nil {
		t.Fatal("cannot delete another user's conversation")
	}
	if err := h.svc.DeleteConversation(context.Background(), 4, res.ConversationID); err != nil {
		t.Fatal(err)
	}
}

func TestModerationHeuristicsAvoidLLM(t *testing.T) {
	h := newHarness(`{"toxicity":0.1,"spam":0.1,"pii":false}`)
	ctx := context.Background()
	if out := h.svc.Screen(ctx, ModerationInput{CommentID: "c1", Text: "Great explanation of PKCE, thanks"}); out.Status != StatusApproved || h.provider.callCount() != 0 {
		t.Fatalf("clean comment must pass without LLM: %+v", out)
	}
	out := h.svc.Screen(ctx, ModerationInput{CommentID: "c2", Text: "call me on +91 98765 43210 or mail me@x.io"})
	if out.Status != StatusPending || h.provider.callCount() != 0 || h.mod.items["c2"] == nil {
		t.Fatalf("pii must be flagged by heuristics: %+v", out)
	}
	if strings.Contains(h.mod.items["c2"].Excerpt, "98765") {
		t.Fatal("queue excerpt must be redacted")
	}
	ids := h.svc.HiddenComments(ctx, []string{"c1", "c2"})
	if !ids["c2"] || ids["c1"] {
		t.Fatalf("hidden: %v", ids)
	}
}

func TestModerationAmbiguousUsesLLMAndFailModes(t *testing.T) {
	h := newHarness(`{"toxicity":0.9,"spam":0.0,"pii":false}`)
	out := h.svc.Screen(context.Background(), ModerationInput{CommentID: "c3", Text: "this tutorial is garbage honestly"})
	if out.Status != StatusPending || out.Source != "llm" || h.provider.callCount() != 1 {
		t.Fatalf("ambiguous+toxic: %+v", out)
	}
	if h.provider.lastRequest().Model != DefaultCheapModel {
		t.Fatal("moderation must use the cheap tier")
	}

	fail := func(mode string) ModerationOutcome {
		hh := newHarness("", KeyModerationFail, mode)
		hh.provider.reply = func(llm.Request) (*llm.Response, error) { return nil, &llm.APIError{Status: 500} }
		return hh.svc.Screen(context.Background(), ModerationInput{CommentID: "c4", Text: "this is garbage"})
	}
	if o := fail("open"); o.Status != StatusApproved || o.Source != "fail_open" {
		t.Fatalf("fail open: %+v", o)
	}
	if o := fail("closed"); o.Status != StatusPending || o.Source != "fail_closed" {
		t.Fatalf("fail closed: %+v", o)
	}
}

func TestModerationDisabledSkips(t *testing.T) {
	h := newHarness("{}", KeyModeration, "false")
	if out := h.svc.Screen(context.Background(), ModerationInput{CommentID: "x", Text: "buy followers now http://a http://b http://c http://d"}); out.Status != StatusApproved {
		t.Fatalf("disabled moderation must be a no-op: %+v", out)
	}
}

func TestSettingsUpdateValidation(t *testing.T) {
	h := newHarness("{}")
	ctx := context.Background()
	if _, err := h.svc.UpdateSettings(ctx, map[string]string{"ai.enabled": "maybe"}); err == nil {
		t.Fatal("bool validation")
	}
	if _, err := h.svc.UpdateSettings(ctx, map[string]string{"ANTHROPIC_API_KEY": "sk-x"}); err == nil {
		t.Fatal("unknown keys (including secrets) must be rejected")
	}
	if _, err := h.svc.UpdateSettings(ctx, map[string]string{KeyModelDefault: "gpt-4"}); err == nil {
		t.Fatal("model validation")
	}
	v, err := h.svc.UpdateSettings(ctx, map[string]string{KeyUserPerMinute: "3", KeyEnabled: "false"})
	if err != nil || v.UserPerMinute != 3 || v.Enabled || !v.KeyConfigured {
		t.Fatalf("update: %+v %v", v, err)
	}
	if st := h.svc.Status(ctx); st.Enabled || st.Features["tutor"] {
		t.Fatalf("status must reflect kill switch: %+v", st)
	}
}

func TestChunkingAndQuery(t *testing.T) {
	md := "# Title\nintro text\n\n## Refresh tokens\nbody one\n\n```\n# not a heading\n```\n\n## Scopes\nbody two"
	chunks := ChunkMarkdown("Doc", md)
	if len(chunks) != 3 || chunks[1].Heading != "Refresh tokens" || chunks[1].Anchor != "refresh-tokens" || !strings.Contains(chunks[1].Body, "# not a heading") {
		t.Fatalf("chunks: %+v", chunks)
	}
	if q := BuildTSQuery("What are the Refresh tokens? '; DROP TABLE x"); q != "refresh | tokens | drop | table" {
		t.Fatalf("tsquery: %q", q)
	}
	if BuildTSQuery("a an the") != "" {
		t.Fatal("stopwords only must yield empty query")
	}
}

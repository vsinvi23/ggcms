package ai

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"unicode"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const (
	StatusPending  = "pending_review"
	StatusApproved = "approved"
	StatusRejected = "rejected"
)

type ModerationInput struct {
	CommentID   string
	ContentType string
	ContentID   string
	AuthorID    uint
	Text        string
}

type ModerationOutcome struct {
	Status  string
	Reasons []string
	Source  string
}

var (
	urlCountRe    = regexp.MustCompile(`(?i)https?://|www\.`)
	spamPhrases   = []string{"viagra", "casino", "free money", "crypto giveaway", "click here to win", "buy followers", "work from home and earn", "telegram me", "whatsapp me"}
	toxicPhrases  = []string{"kill yourself", "i will kill", "go die", "you should die", "i will find you", "nigger", "faggot", "retard"}
	mildProfanity = []string{"idiot", "stupid", "moron", "dumb", "shut up", "trash", "garbage", "scam", "fuck", "shit", "bitch", "asshole", "bastard"}
)

type heuristicVerdict struct {
	definite  []string
	ambiguous []string
}

func screenHeuristics(text string) heuristicVerdict {
	var v heuristicVerdict
	lower := strings.ToLower(text)
	if RedactPII(text) != text {
		v.definite = append(v.definite, "pii")
	}
	for _, p := range toxicPhrases {
		if strings.Contains(lower, p) {
			v.definite = append(v.definite, "toxicity")
			break
		}
	}
	for _, p := range spamPhrases {
		if strings.Contains(lower, p) {
			v.definite = append(v.definite, "spam")
			break
		}
	}
	urls := len(urlCountRe.FindAllString(text, -1))
	switch {
	case urls >= 4:
		v.definite = append(v.definite, "spam")
	case urls >= 1:
		v.ambiguous = append(v.ambiguous, "links")
	}
	for _, p := range mildProfanity {
		if strings.Contains(lower, p) {
			v.ambiguous = append(v.ambiguous, "profanity")
			break
		}
	}
	letters, upper := 0, 0
	for _, r := range text {
		if unicode.IsLetter(r) {
			letters++
			if unicode.IsUpper(r) {
				upper++
			}
		}
	}
	if letters >= 20 && float64(upper)/float64(letters) > 0.7 {
		v.ambiguous = append(v.ambiguous, "shouting")
	}
	if hasRun(text, 12) {
		v.ambiguous = append(v.ambiguous, "repetition")
	}
	return v
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

const moderationSystem = `Task: screen a user comment on a learning platform.
Score toxicity (harassment, hate, threats, abusive language) and spam (promotion, scams, link farming) from 0 to 1, and report whether it contains personal contact details (pii). Technical criticism and strong but civil disagreement are not toxic.
Output only JSON: {"toxicity":0.0,"spam":0.0,"pii":false}`

func (s *service) Screen(ctx context.Context, in ModerationInput) ModerationOutcome {
	st := s.Gateway.Settings(ctx)
	if !st.Enabled || !st.Moderation || strings.TrimSpace(in.Text) == "" {
		return ModerationOutcome{Status: StatusApproved, Source: "skipped"}
	}
	v := screenHeuristics(in.Text)
	if len(v.definite) == 0 && len(v.ambiguous) == 0 {
		return ModerationOutcome{Status: StatusApproved, Source: "heuristic"}
	}
	if len(v.definite) > 0 {
		return s.flag(ctx, in, dedupe(append(v.definite, v.ambiguous...)), "heuristic")
	}

	res, err := s.Gateway.Complete(ctx, Call{Task: TaskModeration, System: moderationSystem, Data: []DataBlock{{Label: "comment", Text: in.Text}}, User: "Screen the comment."})
	var p struct {
		Toxicity float64 `json:"toxicity"`
		Spam     float64 `json:"spam"`
		PII      bool    `json:"pii"`
	}
	if err == nil {
		err = ParseJSON(res.Text, &p)
	}
	if err != nil {
		if st.ModerationFailClosed {
			return s.flag(ctx, in, append(v.ambiguous, "unscreened"), "fail_closed")
		}
		logger.Warn("ai moderation failed open", zap.String("comment", in.CommentID))
		return ModerationOutcome{Status: StatusApproved, Source: "fail_open"}
	}
	var reasons []string
	if p.Toxicity >= 0.7 {
		reasons = append(reasons, "toxicity")
	}
	if p.Spam >= 0.7 {
		reasons = append(reasons, "spam")
	}
	if p.PII {
		reasons = append(reasons, "pii")
	}
	if len(reasons) == 0 {
		return ModerationOutcome{Status: StatusApproved, Source: "llm"}
	}
	return s.flag(ctx, in, reasons, "llm")
}

func (s *service) flag(ctx context.Context, in ModerationInput, reasons []string, source string) ModerationOutcome {
	reasons = dedupe(reasons)
	rj, _ := json.Marshal(reasons)
	item := &entity.AIModerationItem{
		CommentID: in.CommentID, ContentType: in.ContentType, ContentID: in.ContentID, AuthorID: in.AuthorID,
		Excerpt: Clip(RedactPII(in.Text), 300), Reasons: string(rj), Source: source, Status: StatusPending,
	}
	if err := s.Moderation.UpsertModeration(ctx, item); err != nil {
		logger.Warn("ai moderation record failed", zap.Error(err))
	}
	return ModerationOutcome{Status: StatusPending, Reasons: reasons, Source: source}
}

func (s *service) HiddenComments(ctx context.Context, ids []string) map[string]bool {
	if len(ids) == 0 {
		return nil
	}
	hidden, err := s.Moderation.HiddenCommentIDs(ctx, ids)
	if err != nil {
		return nil
	}
	return hidden
}

func (s *service) ModerationQueue(ctx context.Context, status string, page, size int) ([]*entity.AIModerationItem, int64, error) {
	switch status {
	case "":
		status = StatusPending
	case StatusPending, StatusApproved, StatusRejected:
	default:
		return nil, 0, invalid("status must be pending_review, approved or rejected")
	}
	return s.Moderation.ListModeration(ctx, status, page, size)
}

func (s *service) ResolveModeration(ctx context.Context, id uint, approve bool, reviewerID uint) error {
	status := StatusRejected
	if approve {
		status = StatusApproved
	}
	ok, err := s.Moderation.ResolveModeration(ctx, id, status, reviewerID)
	if err != nil {
		return ErrUpstream
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

func hasRun(text string, n int) bool {
	run := 0
	var prev rune
	for _, r := range text {
		if r == prev {
			run++
			if run >= n {
				return true
			}
		} else {
			prev, run = r, 1
		}
	}
	return false
}

package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/serenya/go-cms/internal/domain/repository"
)

const (
	maxEditorialChars = 24000
	maxSuggestions    = 5
	fullTaxonomyLimit = 120
	seoTitleMax       = 60
	seoDescMax        = 160
)

func tokenize(s string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, f := range strings.FieldsFunc(strings.ToLower(s), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		out[f] = struct{}{}
	}
	return out
}

func overlapScore(query map[string]struct{}, name string) float64 {
	nt := tokenize(name)
	if len(nt) == 0 {
		return 0
	}
	inter, union := 0, len(nt)
	for t := range query {
		if _, ok := nt[t]; ok {
			inter++
		} else {
			union++
		}
	}
	if inter == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

type TaxonSuggestion struct {
	ID     uint    `json:"id"`
	Name   string  `json:"name"`
	Score  float64 `json:"score"`
	Reason string  `json:"reason,omitempty"`
}

type TagSuggestions struct {
	Topics     []TaxonSuggestion `json:"topics"`
	Categories []TaxonSuggestion `json:"categories"`
	Tags       []TaxonSuggestion `json:"tags"`
	Source     string            `json:"source"`
	Note       string            `json:"note,omitempty"`
}

func heuristicRank(query map[string]struct{}, taxa []repository.AITaxon, limit int) []TaxonSuggestion {
	var out []TaxonSuggestion
	for _, t := range taxa {
		if sc := overlapScore(query, t.Name); sc > 0 {
			out = append(out, TaxonSuggestion{ID: t.ID, Name: t.Name, Score: float64(int(sc*10000)) / 10000})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func candidateLines(taxa []repository.AITaxon, ranked []TaxonSuggestion) string {
	pick := taxa
	if len(taxa) > fullTaxonomyLimit {
		pick = nil
		byID := map[uint]repository.AITaxon{}
		for _, t := range taxa {
			byID[t.ID] = t
		}
		for _, r := range ranked {
			pick = append(pick, byID[r.ID])
		}
	}
	var b strings.Builder
	for _, t := range pick {
		fmt.Fprintf(&b, "%d|%s\n", t.ID, t.Name)
	}
	return b.String()
}

type llmPick struct {
	ID     uint   `json:"id"`
	Reason string `json:"reason"`
}

type llmTaxonomy struct {
	Topics     []llmPick `json:"topics"`
	Categories []llmPick `json:"categories"`
	Tags       []llmPick `json:"tags"`
}

const tagsSystem = `Task: classify the content into the platform's EXISTING taxonomy.
Choose up to 5 topics, up to 2 categories (most specific first) and up to 8 tags, using ONLY ids from the provided lists (format id|name). Never invent ids or names.
Output only JSON: {"topics":[{"id":1,"reason":"short"}],"categories":[{"id":1,"reason":"short"}],"tags":[{"id":1,"reason":"short"}]}`

func (s *service) SuggestTags(ctx context.Context, actor Actor, contentType string, contentID uint) (*TagSuggestions, error) {
	if _, err := s.Gateway.Gate(ctx, TaskTags); err != nil {
		return nil, err
	}
	doc, err := s.loadEditable(ctx, actor, contentType, contentID)
	if err != nil {
		return nil, err
	}
	topics, e1 := s.Catalog.Topics(ctx)
	cats, e2 := s.Catalog.Categories(ctx)
	tags, e3 := s.Catalog.Tags(ctx)
	if e1 != nil || e2 != nil || e3 != nil {
		return nil, ErrUpstream
	}
	text := doc.Title + " " + doc.Description + " " + Clip(BodyToMarkdown(doc.Body), 3000)
	query := tokenize(text)
	hTopics, hCats, hTags := heuristicRank(query, topics, maxSuggestions), heuristicRank(query, cats, maxSuggestions), heuristicRank(query, tags, 8)
	result := &TagSuggestions{Topics: hTopics, Categories: hCats, Tags: hTags, Source: "heuristic"}

	data := []DataBlock{
		{Label: "content", Text: doc.Title + "\n" + doc.Description + "\n" + Clip(BodyToMarkdown(doc.Body), 6000)},
		{Label: "topics", Text: candidateLines(topics, heuristicRank(query, topics, 60))},
		{Label: "categories", Text: candidateLines(cats, heuristicRank(query, cats, 40))},
		{Label: "tags", Text: candidateLines(tags, heuristicRank(query, tags, 60))},
	}
	res, err := s.Gateway.Complete(ctx, Call{Task: TaskTags, UserID: actor.UserID, System: tagsSystem, Data: data, User: "Classify the content."})
	if err != nil {
		if isSoft(err) {
			result.Note = "AI unavailable, returned keyword matches only"
			return result, nil
		}
		return nil, err
	}
	var parsed llmTaxonomy
	if err := ParseJSON(res.Text, &parsed); err != nil {
		result.Note = "AI output unusable, returned keyword matches only"
		return result, nil
	}
	result.Topics = validatePicks(parsed.Topics, topics, hTopics, maxSuggestions)
	result.Categories = validatePicks(parsed.Categories, cats, hCats, 2)
	result.Tags = validatePicks(parsed.Tags, tags, hTags, 8)
	result.Source = "llm"
	return result, nil
}

func isSoft(err error) bool {
	var e *Error
	return errors.As(err, &e) && (e.Code == ErrUpstream.Code || e.Code == ErrBadOutput.Code || e.Code == ErrRefused.Code)
}

func validatePicks(picks []llmPick, taxa []repository.AITaxon, heuristic []TaxonSuggestion, limit int) []TaxonSuggestion {
	names := map[uint]string{}
	for _, t := range taxa {
		names[t.ID] = t.Name
	}
	scores := map[uint]float64{}
	for _, h := range heuristic {
		scores[h.ID] = h.Score
	}
	seen := map[uint]bool{}
	out := []TaxonSuggestion{}
	for _, p := range picks {
		name, ok := names[p.ID]
		if !ok || seen[p.ID] {
			continue
		}
		seen[p.ID] = true
		out = append(out, TaxonSuggestion{ID: p.ID, Name: name, Score: scores[p.ID], Reason: Clip(p.Reason, 160)})
		if len(out) == limit {
			break
		}
	}
	return out
}

type SummaryResult struct {
	DraftID   string   `json:"draftId"`
	TLDR      string   `json:"tldr"`
	Takeaways []string `json:"takeaways"`
	Status    string   `json:"status"`
}

const summarySystem = `Task: summarise the content for readers.
Write a TL;DR of at most 2 sentences (max 280 characters) and 3 to 6 key takeaways (each under 160 characters). Use only facts stated in the content.
Output only JSON: {"tldr":"...","takeaways":["..."]}`

func (s *service) Summarise(ctx context.Context, actor Actor, contentType string, contentID uint) (*SummaryResult, error) {
	if _, err := s.Gateway.Gate(ctx, TaskSummary); err != nil {
		return nil, err
	}
	doc, err := s.loadEditable(ctx, actor, contentType, contentID)
	if err != nil {
		return nil, err
	}
	res, err := s.Gateway.Complete(ctx, Call{Task: TaskSummary, UserID: actor.UserID, System: summarySystem,
		Data: []DataBlock{{Label: "content", Text: doc.Title + "\n\n" + Clip(BodyToMarkdown(doc.Body), maxEditorialChars)}}, User: "Summarise the content."})
	if err != nil {
		return nil, err
	}
	var p struct {
		TLDR      string   `json:"tldr"`
		Takeaways []string `json:"takeaways"`
	}
	if err := ParseJSON(res.Text, &p); err != nil || strings.TrimSpace(p.TLDR) == "" {
		return nil, ErrBadOutput
	}
	out := &SummaryResult{TLDR: Clip(p.TLDR, 300), Takeaways: []string{}, Status: "draft"}
	for _, t := range p.Takeaways {
		if t = Clip(t, 200); t != "" && len(out.Takeaways) < 6 {
			out.Takeaways = append(out.Takeaways, t)
		}
	}
	payload, _ := json.Marshal(out)
	out.DraftID = s.saveDraft(ctx, "summary", doc, actor, string(payload))
	return out, nil
}

type SEOResult struct {
	DraftID         string   `json:"draftId"`
	MetaTitle       string   `json:"metaTitle"`
	MetaDescription string   `json:"metaDescription"`
	Keywords        []string `json:"keywords"`
	LengthAdjusted  bool     `json:"lengthAdjusted"`
}

const seoSystem = `Task: write SEO metadata for the content.
metaTitle: max 60 characters. metaDescription: 120 to 160 characters, accurate, no clickbait. keywords: 3 to 8 short phrases that appear in or are clearly supported by the content.
Output only JSON: {"metaTitle":"...","metaDescription":"...","keywords":["..."]}`

func (s *service) SuggestSEO(ctx context.Context, actor Actor, contentType string, contentID uint) (*SEOResult, error) {
	if _, err := s.Gateway.Gate(ctx, TaskSEO); err != nil {
		return nil, err
	}
	doc, err := s.loadEditable(ctx, actor, contentType, contentID)
	if err != nil {
		return nil, err
	}
	res, err := s.Gateway.Complete(ctx, Call{Task: TaskSEO, UserID: actor.UserID, System: seoSystem,
		Data: []DataBlock{{Label: "content", Text: doc.Title + "\n" + doc.Description + "\n" + Clip(BodyToMarkdown(doc.Body), 6000)}}, User: "Write the metadata."})
	if err != nil {
		return nil, err
	}
	var p struct {
		MetaTitle       string   `json:"metaTitle"`
		MetaDescription string   `json:"metaDescription"`
		Keywords        []string `json:"keywords"`
	}
	if err := ParseJSON(res.Text, &p); err != nil || strings.TrimSpace(p.MetaTitle) == "" || strings.TrimSpace(p.MetaDescription) == "" {
		return nil, ErrBadOutput
	}
	out := &SEOResult{MetaTitle: Clip(p.MetaTitle, seoTitleMax), MetaDescription: Clip(p.MetaDescription, seoDescMax), Keywords: []string{}}
	out.LengthAdjusted = out.MetaTitle != strings.TrimSpace(p.MetaTitle) || out.MetaDescription != strings.TrimSpace(p.MetaDescription)
	for _, k := range p.Keywords {
		if k = Clip(k, 60); k != "" && len(out.Keywords) < 8 {
			out.Keywords = append(out.Keywords, k)
		}
	}
	payload, _ := json.Marshal(out)
	out.DraftID = s.saveDraft(ctx, "seo", doc, actor, string(payload))
	return out, nil
}

type QualityIssue struct {
	Severity string `json:"severity"`
	Category string `json:"category"`
	Message  string `json:"message"`
	Location string `json:"location,omitempty"`
}

type QualityStats struct {
	Words            int     `json:"words"`
	Headings         int     `json:"headings"`
	Paragraphs       int     `json:"paragraphs"`
	CodeBlocks       int     `json:"codeBlocks"`
	AvgSentenceWords float64 `json:"avgSentenceWords"`
	InternalLinks    int     `json:"internalLinks"`
}

type QualityResult struct {
	Score  int            `json:"score"`
	Issues []QualityIssue `json:"issues"`
	Stats  QualityStats   `json:"stats"`
	AIUsed bool           `json:"aiUsed"`
	Note   string         `json:"note,omitempty"`
}

var (
	headingRe   = regexp.MustCompile(`(?m)^#{1,3}\s+\S`)
	sentenceRe  = regexp.MustCompile(`[.!?]+(\s|$)`)
	linkRe      = regexp.MustCompile(`\]\(([^)\s]+)`)
	codeFenceRe = regexp.MustCompile("(?s)```.*?```")
)

func (s *service) lint(ctx context.Context, doc *ContentDoc) ([]QualityIssue, QualityStats) {
	md := BodyToMarkdown(doc.Body)
	var issues []QualityIssue
	st := QualityStats{Headings: len(headingRe.FindAllString(md, -1)), CodeBlocks: strings.Count(md, "```") / 2}
	prose := md
	prose = codeFenceRe.ReplaceAllString(prose, " ")
	st.Words = len(strings.Fields(prose))
	for _, p := range strings.Split(prose, "\n\n") {
		w := len(strings.Fields(p))
		if w == 0 {
			continue
		}
		st.Paragraphs++
		if w > 180 && !strings.HasPrefix(strings.TrimSpace(p), "#") {
			issues = append(issues, QualityIssue{"warn", "readability", "Very long paragraph, consider splitting", Clip(p, 60)})
		}
	}
	if n := len(sentenceRe.FindAllString(prose, -1)); n > 0 {
		st.AvgSentenceWords = float64(int(float64(st.Words)/float64(n)*10)) / 10
	}
	if strings.TrimSpace(doc.Description) == "" {
		issues = append(issues, QualityIssue{"warn", "structure", "Missing description", "description"})
	}
	if st.Words < 150 {
		issues = append(issues, QualityIssue{"warn", "structure", "Body is very short", "body"})
	}
	if st.Words > 400 && st.Headings == 0 {
		issues = append(issues, QualityIssue{"error", "structure", "Long content without any headings", "body"})
	}
	if st.AvgSentenceWords > 28 {
		issues = append(issues, QualityIssue{"warn", "readability", "Average sentence length is high", "body"})
	}
	seen := map[string]bool{}
	for _, m := range linkRe.FindAllStringSubmatch(md, -1) {
		ref := m[1]
		internal := strings.HasPrefix(ref, "/") && !strings.HasPrefix(ref, "//")
		if !internal {
			for _, h := range s.Gateway.AllowedHosts() {
				if strings.Contains(strings.ToLower(ref), "//"+h+"/") || strings.HasSuffix(strings.ToLower(ref), "//"+h) {
					internal = true
				}
			}
		}
		if !internal || seen[ref] {
			continue
		}
		seen[ref] = true
		st.InternalLinks++
		path := strings.SplitN(strings.SplitN(ref, "#", 2)[0], "?", 2)[0]
		path = strings.TrimRight(path, "/")
		last := path[strings.LastIndex(path, "/")+1:]
		if last == "" {
			continue
		}
		if ok, err := s.Catalog.ContentExists(ctx, last); err == nil && !ok {
			issues = append(issues, QualityIssue{"error", "broken_link", "Internal link does not resolve to published content", ref})
		}
	}
	return issues, st
}

const qualitySystem = `Task: review the content as a technical editor.
List sections a reader would expect but that are missing, factual claims that are stated without support or evidence in the content, and structural problems. Be specific and brief; do not rewrite the content.
Output only JSON: {"missingSections":["..."],"unsupportedClaims":[{"claim":"...","why":"..."}],"structureNotes":["..."]}`

func (s *service) QualityCheck(ctx context.Context, actor Actor, contentType string, contentID uint) (*QualityResult, error) {
	if _, err := s.Gateway.Gate(ctx, TaskQuality); err != nil {
		return nil, err
	}
	doc, err := s.loadEditable(ctx, actor, contentType, contentID)
	if err != nil {
		return nil, err
	}
	issues, stats := s.lint(ctx, doc)
	out := &QualityResult{Stats: stats}

	res, err := s.Gateway.Complete(ctx, Call{Task: TaskQuality, UserID: actor.UserID, System: qualitySystem,
		Data: []DataBlock{{Label: "content", Text: doc.Title + "\n\n" + Clip(BodyToMarkdown(doc.Body), maxEditorialChars)}}, User: "Review the content."})
	switch {
	case err != nil && !isSoft(err):
		return nil, err
	case err != nil:
		out.Note = "AI review unavailable, lint checks only"
	default:
		var p struct {
			MissingSections   []string `json:"missingSections"`
			UnsupportedClaims []struct {
				Claim string `json:"claim"`
				Why   string `json:"why"`
			} `json:"unsupportedClaims"`
			StructureNotes []string `json:"structureNotes"`
		}
		if perr := ParseJSON(res.Text, &p); perr != nil {
			out.Note = "AI review unusable, lint checks only"
			break
		}
		out.AIUsed = true
		for _, m := range p.MissingSections {
			issues = append(issues, QualityIssue{"warn", "missing_section", Clip(m, 200), ""})
		}
		for _, c := range p.UnsupportedClaims {
			issues = append(issues, QualityIssue{"warn", "unsupported_claim", Clip(c.Why, 200), Clip(c.Claim, 200)})
		}
		for _, n := range p.StructureNotes {
			issues = append(issues, QualityIssue{"info", "structure", Clip(n, 200), ""})
		}
	}
	if len(issues) > 40 {
		issues = issues[:40]
	}
	out.Issues = issues
	if out.Issues == nil {
		out.Issues = []QualityIssue{}
	}
	score := 100
	for _, i := range issues {
		switch i.Severity {
		case "error":
			score -= 15
		case "warn":
			score -= 7
		default:
			score -= 2
		}
	}
	if score < 0 {
		score = 0
	}
	out.Score = score
	return out, nil
}

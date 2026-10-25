package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type QuizQuestion struct {
	Type         string   `json:"type"`
	Question     string   `json:"question"`
	Options      []string `json:"options"`
	CorrectIndex int      `json:"correctIndex"`
	Explanation  string   `json:"explanation"`
	Anchor       string   `json:"anchor,omitempty"`
}

type QuizResult struct {
	DraftID    string         `json:"draftId"`
	Difficulty string         `json:"difficulty"`
	Questions  []QuizQuestion `json:"questions"`
	Status     string         `json:"status"`
}

const quizSystem = `Task: write multiple-choice quiz questions that test understanding of the content.
Every question must be answerable from the content alone, have 3 to 5 options with exactly one correct option, and include a one-sentence explanation. correctIndex is the zero-based index of the correct option. anchor is the nearest section heading from the content, or empty.
Output only JSON: {"questions":[{"question":"...","options":["..."],"correctIndex":0,"explanation":"...","anchor":"..."}]}`

func (s *service) GenerateQuiz(ctx context.Context, actor Actor, contentType string, contentID uint, count int, difficulty string) (*QuizResult, error) {
	if _, err := s.Gateway.Gate(ctx, TaskQuiz); err != nil {
		return nil, err
	}
	if count <= 0 {
		count = 5
	}
	if count > 15 {
		return nil, invalid("count must be at most 15")
	}
	switch difficulty {
	case "":
		difficulty = "medium"
	case "easy", "medium", "hard":
	default:
		return nil, invalid("difficulty must be easy, medium or hard")
	}
	doc, err := s.loadEditable(ctx, actor, contentType, contentID)
	if err != nil {
		return nil, err
	}
	res, err := s.Gateway.Complete(ctx, Call{Task: TaskQuiz, UserID: actor.UserID, System: quizSystem,
		Data: []DataBlock{{Label: "content", Text: doc.Title + "\n\n" + Clip(BodyToMarkdown(doc.Body), maxEditorialChars)}},
		User: fmt.Sprintf("Write %d %s questions.", count, difficulty)})
	if err != nil {
		return nil, err
	}
	var p struct {
		Questions []QuizQuestion `json:"questions"`
	}
	if err := ParseJSON(res.Text, &p); err != nil {
		return nil, err
	}
	out := &QuizResult{Difficulty: difficulty, Questions: []QuizQuestion{}, Status: "draft"}
	for _, q := range p.Questions {
		q.Question = Clip(q.Question, 400)
		q.Explanation = Clip(q.Explanation, 400)
		q.Anchor = Clip(q.Anchor, 120)
		if q.Question == "" || len(q.Options) < 3 || len(q.Options) > 5 || q.CorrectIndex < 0 || q.CorrectIndex >= len(q.Options) {
			continue
		}
		opts := make([]string, 0, len(q.Options))
		for _, o := range q.Options {
			opts = append(opts, Clip(o, 250))
		}
		q.Options, q.Type = opts, "mcq"
		out.Questions = append(out.Questions, q)
		if len(out.Questions) == count {
			break
		}
	}
	if len(out.Questions) == 0 {
		return nil, ErrBadOutput
	}
	payload, _ := json.Marshal(out)
	out.DraftID = s.saveDraft(ctx, "quiz", doc, actor, string(payload))
	return out, nil
}

type PlanItem struct {
	Type   string `json:"type"`
	ID     uint   `json:"id"`
	Title  string `json:"title"`
	Reason string `json:"reason"`
	Order  int    `json:"order"`
}

type StudyPlanResult struct {
	Summary string     `json:"summary"`
	Items   []PlanItem `json:"items"`
	Note    string     `json:"note,omitempty"`
}

const studyPlanSystem = `Task: build an ordered study plan for the learner using ONLY items from the catalog in the <untrusted_data> block labelled catalog.
Catalog lines look like type:id|title|description. Select at most 8 items that match the learner's goals and level, ordered from first to last, each with a one-sentence reason. Use ids exactly as listed; never invent items.
Output only JSON: {"summary":"...","items":[{"type":"course","id":1,"reason":"..."}]}`

func (s *service) StudyPlan(ctx context.Context, userID uint, goals, level string) (*StudyPlanResult, error) {
	if _, err := s.Gateway.Gate(ctx, TaskStudyPlan); err != nil {
		return nil, err
	}
	goals = strings.TrimSpace(goals)
	if n := len([]rune(goals)); n < 3 || n > 600 {
		return nil, invalid("goals must be between 3 and 600 characters")
	}
	switch level {
	case "beginner", "intermediate", "advanced":
	default:
		return nil, invalid("level must be beginner, intermediate or advanced")
	}
	courses, err := s.Catalog.PublishedCourses(ctx, 60)
	if err != nil {
		return nil, ErrUpstream
	}
	paths, err := s.Catalog.LearningPaths(ctx, 30)
	if err != nil {
		return nil, ErrUpstream
	}
	valid := map[string]string{}
	var cat strings.Builder
	for _, c := range courses {
		valid[fmt.Sprintf("course:%d", c.ID)] = c.Title
		fmt.Fprintf(&cat, "course:%d|%s|%s\n", c.ID, oneLine(c.Title, 120), oneLine(c.Description, 160))
	}
	for _, p := range paths {
		valid[fmt.Sprintf("path:%d", p.ID)] = p.Title
		fmt.Fprintf(&cat, "path:%d|%s|%s\n", p.ID, oneLine(p.Title, 120), oneLine(p.Description, 160))
	}
	if len(valid) == 0 {
		return &StudyPlanResult{Items: []PlanItem{}, Note: "no published courses available yet"}, nil
	}
	res, err := s.Gateway.Complete(ctx, Call{Task: TaskStudyPlan, UserID: userID, System: studyPlanSystem,
		Data: []DataBlock{{Label: "catalog", Text: cat.String()}}, CacheData: true,
		User: "Learner level: " + level + "\nLearner goals: " + goals})
	if err != nil {
		return nil, err
	}
	var p struct {
		Summary string `json:"summary"`
		Items   []struct {
			Type   string `json:"type"`
			ID     uint   `json:"id"`
			Reason string `json:"reason"`
		} `json:"items"`
	}
	if err := ParseJSON(res.Text, &p); err != nil {
		return nil, err
	}
	out := &StudyPlanResult{Summary: Clip(p.Summary, 400), Items: []PlanItem{}}
	seen := map[string]bool{}
	for _, it := range p.Items {
		key := fmt.Sprintf("%s:%d", it.Type, it.ID)
		title, ok := valid[key]
		if !ok || seen[key] {
			continue
		}
		seen[key] = true
		out.Items = append(out.Items, PlanItem{Type: it.Type, ID: it.ID, Title: title, Reason: Clip(it.Reason, 240), Order: len(out.Items) + 1})
		if len(out.Items) == 8 {
			break
		}
	}
	if len(out.Items) == 0 {
		out.Note = "no matching courses found for these goals"
	}
	return out, nil
}

func oneLine(s string, max int) string {
	return Clip(strings.Join(strings.Fields(strings.ReplaceAll(s, "|", "/")), " "), max)
}

package assessment

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

const (
	defaultPassMark = 70.0
	maxQuestions    = 500
	maxOptions      = 20
)

type question struct {
	ID          string
	Text        string
	Options     []string
	Correct     []int
	Explanation string
}

type parsed struct {
	PassMark      float64
	MaxAttempts   int
	RevealAnswers bool
	Questions     []question
}

type rawQuestion struct {
	ID             interface{} `json:"id"`
	Question       string      `json:"question"`
	Text           string      `json:"text"`
	Prompt         string      `json:"prompt"`
	Options        []string    `json:"options"`
	CorrectIndex   *int        `json:"correctIndex"`
	Answer         *int        `json:"answer"`
	CorrectIndexes []int       `json:"correctIndexes"`
	Explanation    string      `json:"explanation"`
}

type rawMetadata struct {
	PassMark      *float64      `json:"passMark"`
	MaxAttempts   int           `json:"maxAttempts"`
	RevealAnswers bool          `json:"revealAnswers"`
	Questions     []rawQuestion `json:"questions"`
}

func parseMetadata(meta *string) (*parsed, error) {
	if meta == nil || *meta == "" {
		return nil, ErrInvalidAssessment
	}
	var raw rawMetadata
	if err := json.Unmarshal([]byte(*meta), &raw); err != nil {
		return nil, ErrInvalidAssessment
	}
	if len(raw.Questions) == 0 || len(raw.Questions) > maxQuestions {
		return nil, ErrInvalidAssessment
	}
	p := &parsed{PassMark: defaultPassMark, MaxAttempts: raw.MaxAttempts, RevealAnswers: raw.RevealAnswers}
	if raw.PassMark != nil && *raw.PassMark >= 0 && *raw.PassMark <= 100 {
		p.PassMark = *raw.PassMark
	}
	if p.MaxAttempts < 0 {
		p.MaxAttempts = 0
	}
	seen := make(map[string]bool, len(raw.Questions))
	for i, rq := range raw.Questions {
		q := question{ID: fmt.Sprintf("%d", i), Text: firstNonEmpty(rq.Question, rq.Text, rq.Prompt), Options: rq.Options, Explanation: rq.Explanation}
		if rq.ID != nil {
			if s := fmt.Sprint(rq.ID); s != "" {
				q.ID = s
			}
		}
		if seen[q.ID] || len(q.Options) < 2 || len(q.Options) > maxOptions {
			return nil, ErrInvalidAssessment
		}
		seen[q.ID] = true
		switch {
		case len(rq.CorrectIndexes) > 0:
			q.Correct = rq.CorrectIndexes
		case rq.CorrectIndex != nil:
			q.Correct = []int{*rq.CorrectIndex}
		case rq.Answer != nil:
			q.Correct = []int{*rq.Answer}
		}
		q.Correct = normalize(q.Correct, len(q.Options))
		if len(q.Correct) == 0 {
			return nil, ErrInvalidAssessment
		}
		p.Questions = append(p.Questions, q)
	}
	return p, nil
}

func normalize(idx []int, optionCount int) []int {
	set := make(map[int]bool, len(idx))
	out := make([]int, 0, len(idx))
	for _, i := range idx {
		if i < 0 || i >= optionCount {
			return nil
		}
		if !set[i] {
			set[i] = true
			out = append(out, i)
		}
	}
	sort.Ints(out)
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func sameSet(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

var answerKeyFields = []string{"correctIndex", "correctIndexes", "answer", "correct", "correctAnswer", "correctAnswers", "explanation", "rationale"}

// SanitizeMetadata strips answer-key fields from every question of an assessment's
// interactive metadata so it is safe to expose publicly.
func SanitizeMetadata(meta string) string {
	if meta == "" {
		return meta
	}
	var doc map[string]interface{}
	if err := json.Unmarshal([]byte(meta), &doc); err != nil {
		return ""
	}
	if qs, ok := doc["questions"].([]interface{}); ok {
		for _, q := range qs {
			if m, ok := q.(map[string]interface{}); ok {
				for _, f := range answerKeyFields {
					delete(m, f)
				}
			}
		}
	}
	delete(doc, "revealAnswers")
	out, err := json.Marshal(doc)
	if err != nil {
		return ""
	}
	return string(out)
}

package ai

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type GoldenContext struct {
	Heading string `json:"heading"`
	Body    string `json:"body"`
}

type GoldenCase struct {
	ID              string          `json:"id"`
	Question        string          `json:"question"`
	Contexts        []GoldenContext `json:"contexts"`
	ExpectSupported bool            `json:"expectSupported"`
	ExpectCitations []string        `json:"expectCitations"`
	MustContain     []string        `json:"mustContain"`
	MustNotContain  []string        `json:"mustNotContain"`
	FakeReply       string          `json:"fakeReply"`
}

func LoadGolden(path string) ([]GoldenCase, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cases []GoldenCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		return nil, err
	}
	return cases, nil
}

func CheckGolden(c GoldenCase, r *AskResult) []string {
	var fails []string
	lower := strings.ToLower(r.Answer)
	if c.ExpectSupported != r.Grounded {
		fails = append(fails, fmt.Sprintf("grounded=%v want %v", r.Grounded, c.ExpectSupported))
	}
	if !r.Grounded && len(r.Citations) != 0 {
		fails = append(fails, "refusal must not carry citations")
	}
	if r.Grounded && len(r.Citations) == 0 {
		fails = append(fails, "grounded answer without citations")
	}
	headings := map[string]bool{}
	for _, cit := range r.Citations {
		headings[cit.Heading] = true
		valid := false
		for _, ctx := range c.Contexts {
			if ctx.Heading == cit.Heading {
				valid = true
			}
		}
		if !valid {
			fails = append(fails, "citation to unknown passage: "+cit.Heading)
		}
	}
	for _, h := range c.ExpectCitations {
		if !headings[h] {
			fails = append(fails, "missing expected citation: "+h)
		}
	}
	for _, s := range c.MustContain {
		if !strings.Contains(lower, strings.ToLower(s)) {
			fails = append(fails, "answer lacks: "+s)
		}
	}
	for _, s := range c.MustNotContain {
		if strings.Contains(lower, strings.ToLower(s)) {
			fails = append(fails, "answer leaks: "+s)
		}
	}
	return fails
}

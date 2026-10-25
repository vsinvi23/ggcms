package ai

import (
	"context"
	"testing"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

func TestGoldenTutorSetWithFakeProvider(t *testing.T) {
	cases, err := LoadGolden("testdata/golden_tutor.json")
	if err != nil || len(cases) < 4 {
		t.Fatalf("golden set: %v (%d cases)", err, len(cases))
	}
	for _, c := range cases {
		h := newHarness(c.FakeReply)
		h.chunks.doc = &repository.PublishedDoc{ContentType: "course", ContentID: 1, Slug: "oauth"}
		for i, ctx := range c.Contexts {
			h.chunks.chunks = append(h.chunks.chunks, entity.ContentChunk{ContentType: "course", ContentID: 1, Ordinal: i, Title: "OAuth", Heading: ctx.Heading, Anchor: Anchor(ctx.Heading), Body: ctx.Body})
		}
		res, err := h.svc.Ask(context.Background(), Actor{UserID: 1}, AskInput{CourseID: 1, Question: c.Question})
		if err != nil {
			t.Fatalf("%s: %v", c.ID, err)
		}
		if fails := CheckGolden(c, res); len(fails) > 0 {
			t.Errorf("%s: %v", c.ID, fails)
		}
	}
}

func TestCheckGoldenCatchesRegressions(t *testing.T) {
	c := GoldenCase{ExpectSupported: true, ExpectCitations: []string{"A"}, Contexts: []GoldenContext{{Heading: "A"}}, MustNotContain: []string{"evil"}}
	bad := &AskResult{Answer: "go to evil.example", Grounded: true, Citations: []Citation{{Heading: "Z"}}}
	if fails := CheckGolden(c, bad); len(fails) != 3 {
		t.Fatalf("want 3 failures, got %v", fails)
	}
}

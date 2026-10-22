//go:build aieval

package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	aisvc "github.com/serenya/go-cms/internal/application/ai"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/infrastructure/llm"
)

type settings map[string]string

func (s settings) GetAll(context.Context) (map[string]string, error) { return s, nil }
func (s settings) SetMany(context.Context, map[string]string) error  { return nil }

type usage struct{}

func (usage) RecordUsage(context.Context, *entity.AIUsage) error                   { return nil }
func (usage) CostSince(context.Context, time.Time) (int64, error)                  { return 0, nil }
func (usage) CountSince(context.Context, uint, []string, time.Time) (int64, error) { return 0, nil }
func (usage) UsageReport(context.Context, time.Time, time.Time) (*repository.AIUsageReport, error) {
	return &repository.AIUsageReport{}, nil
}

type chunks struct {
	repository.AIChunkRepository
	found []entity.ContentChunk
}

func (c *chunks) PublishedDoc(context.Context, string, uint) (*repository.PublishedDoc, error) {
	return &repository.PublishedDoc{ContentType: "course", ContentID: 1, Slug: "eval"}, nil
}

func (c *chunks) SearchChunks(context.Context, string, string, uint, int) ([]entity.ContentChunk, error) {
	return c.found, nil
}

type convos struct {
	repository.AIConversationRepository
	mu   sync.Mutex
	msgs int
}

func (c *convos) CreateConversation(context.Context, *entity.AIConversation) error { return nil }
func (c *convos) AppendMessage(_ context.Context, m *entity.AIMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.msgs++
	m.ID = uint(c.msgs)
	return nil
}

func main() {
	key := os.Getenv("ANTHROPIC_API_KEY")
	if key == "" {
		fmt.Fprintln(os.Stderr, "ANTHROPIC_API_KEY is required (this script calls the real API and spends tokens)")
		os.Exit(2)
	}
	path := "internal/application/ai/testdata/golden_tutor.json"
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	cases, err := aisvc.LoadGolden(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	cfg := settings{aisvc.KeyEnabled: "true", aisvc.KeyTutor: "true", aisvc.KeyUserPerMinute: "0", aisvc.KeyGlobalPerMinute: "0",
		aisvc.KeyUserDailyTutor: "0", aisvc.KeyMonthlyBudget: "5", aisvc.KeyRequestBudget: "0.05"}
	provider := llm.NewAnthropic(llm.AnthropicConfig{APIKey: key, Timeout: 60 * time.Second, MaxRetries: 2})
	gw := aisvc.NewGateway(provider, usage{}, cfg, []string{"geekgully.com"})

	failed := 0
	for _, c := range cases {
		store := &chunks{}
		for i, ctx := range c.Contexts {
			store.found = append(store.found, entity.ContentChunk{ContentType: "course", ContentID: 1, Ordinal: i, Title: "Eval", Heading: ctx.Heading, Anchor: aisvc.Anchor(ctx.Heading), Body: ctx.Body})
		}
		svc := aisvc.NewService(aisvc.Deps{Gateway: gw, Chunks: store, Convos: &convos{}, Settings: cfg})
		res, err := svc.Ask(context.Background(), aisvc.Actor{UserID: 1}, aisvc.AskInput{CourseID: 1, Question: c.Question})
		if err != nil {
			var e *aisvc.Error
			if errors.As(err, &e) {
				fmt.Printf("FAIL %-32s %s\n", c.ID, e.Code)
			} else {
				fmt.Printf("FAIL %-32s %v\n", c.ID, err)
			}
			failed++
			continue
		}
		if fails := aisvc.CheckGolden(c, res); len(fails) > 0 {
			fmt.Printf("FAIL %-32s %v\n", c.ID, fails)
			failed++
			continue
		}
		fmt.Printf("PASS %-32s grounded=%v citations=%d\n", c.ID, res.Grounded, len(res.Citations))
	}
	fmt.Printf("\n%d/%d passed\n", len(cases)-failed, len(cases))
	if failed > 0 {
		os.Exit(1)
	}
}

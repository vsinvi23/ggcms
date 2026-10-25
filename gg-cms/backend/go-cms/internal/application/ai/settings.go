package ai

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	KeyEnabled         = "ai.enabled"
	KeyEditorial       = "ai.editorial.enabled"
	KeyModeration      = "ai.moderation.enabled"
	KeyTutor           = "ai.tutor.enabled"
	KeyQuiz            = "ai.quiz.enabled"
	KeyStudyPlan       = "ai.studyplan.enabled"
	KeyModerationFail  = "ai.moderation.fail_mode"
	KeyModelDefault    = "ai.model.default"
	KeyModelCheap      = "ai.model.cheap"
	KeyUserPerMinute   = "ai.limits.user_per_minute"
	KeyGlobalPerMinute = "ai.limits.global_per_minute"
	KeyUserDailyTutor  = "ai.limits.user_daily_tutor"
	KeyUserDailyOther  = "ai.limits.user_daily_other"
	KeyMonthlyBudget   = "ai.budget.monthly_usd"
	KeyRequestBudget   = "ai.budget.per_request_usd"
)

const (
	DefaultModel      = "claude-sonnet-5-5"
	DefaultCheapModel = "claude-haiku-5-5"
)

type Settings struct {
	Enabled              bool    `json:"enabled"`
	Editorial            bool    `json:"editorialEnabled"`
	Moderation           bool    `json:"moderationEnabled"`
	Tutor                bool    `json:"tutorEnabled"`
	Quiz                 bool    `json:"quizEnabled"`
	StudyPlan            bool    `json:"studyPlanEnabled"`
	ModerationFailClosed bool    `json:"moderationFailClosed"`
	ModelDefault         string  `json:"modelDefault"`
	ModelCheap           string  `json:"modelCheap"`
	UserPerMinute        int     `json:"userPerMinute"`
	GlobalPerMinute      int     `json:"globalPerMinute"`
	UserDailyTutor       int     `json:"userDailyTutor"`
	UserDailyOther       int     `json:"userDailyOther"`
	MonthlyBudgetUSD     float64 `json:"monthlyBudgetUsd"`
	PerRequestBudgetUSD  float64 `json:"perRequestBudgetUsd"`
}

type SettingsStore interface {
	GetAll(ctx context.Context) (map[string]string, error)
	SetMany(ctx context.Context, settings map[string]string) error
}

func parseBool(s string) bool { return strings.EqualFold(strings.TrimSpace(s), "true") }

func parseInt(s string, def int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil && n >= 0 {
		return n
	}
	return def
}

func parseFloat(s string, def float64) float64 {
	if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil && f >= 0 {
		return f
	}
	return def
}

func parseModel(s, def string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	return s
}

func settingsFromMap(m map[string]string) Settings {
	return Settings{
		Enabled:              parseBool(m[KeyEnabled]),
		Editorial:            parseBool(m[KeyEditorial]),
		Moderation:           parseBool(m[KeyModeration]),
		Tutor:                parseBool(m[KeyTutor]),
		Quiz:                 parseBool(m[KeyQuiz]),
		StudyPlan:            parseBool(m[KeyStudyPlan]),
		ModerationFailClosed: strings.EqualFold(strings.TrimSpace(m[KeyModerationFail]), "closed"),
		ModelDefault:         parseModel(m[KeyModelDefault], DefaultModel),
		ModelCheap:           parseModel(m[KeyModelCheap], DefaultCheapModel),
		UserPerMinute:        parseInt(m[KeyUserPerMinute], 10),
		GlobalPerMinute:      parseInt(m[KeyGlobalPerMinute], 120),
		UserDailyTutor:       parseInt(m[KeyUserDailyTutor], 30),
		UserDailyOther:       parseInt(m[KeyUserDailyOther], 50),
		MonthlyBudgetUSD:     parseFloat(m[KeyMonthlyBudget], 50),
		PerRequestBudgetUSD:  parseFloat(m[KeyRequestBudget], 0.05),
	}
}

type settingsCache struct {
	store SettingsStore
	mu    sync.Mutex
	val   Settings
	until time.Time
}

func (c *settingsCache) get(ctx context.Context) Settings {
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Now().Before(c.until) {
		return c.val
	}
	m, err := c.store.GetAll(ctx)
	if err != nil {
		return c.val
	}
	c.val = settingsFromMap(m)
	c.until = time.Now().Add(5 * time.Second)
	return c.val
}

func (c *settingsCache) invalidate() {
	c.mu.Lock()
	c.until = time.Time{}
	c.mu.Unlock()
}

func (s Settings) featureEnabled(task string) bool {
	switch taskFeature[task] {
	case featureEditorial:
		return s.Editorial
	case featureModeration:
		return s.Moderation
	case featureTutor:
		return s.Tutor
	case featureQuiz:
		return s.Quiz
	case featureStudyPlan:
		return s.StudyPlan
	}
	return false
}

package ai

import (
	"context"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/repository"
)

type SettingsView struct {
	Settings
	KeyConfigured bool   `json:"keyConfigured"`
	Provider      string `json:"provider"`
}

var (
	boolKeys  = map[string]bool{KeyEnabled: true, KeyEditorial: true, KeyModeration: true, KeyTutor: true, KeyQuiz: true, KeyStudyPlan: true}
	intKeys   = map[string]bool{KeyUserPerMinute: true, KeyGlobalPerMinute: true, KeyUserDailyTutor: true, KeyUserDailyOther: true}
	floatKeys = map[string]bool{KeyMonthlyBudget: true, KeyRequestBudget: true}
	modelKeys = map[string]bool{KeyModelDefault: true, KeyModelCheap: true}
	modelRe   = regexp.MustCompile(`^claude-[a-z0-9][a-z0-9.\-]{1,60}$`)
)

func (s *service) Usage(ctx context.Context, from, to time.Time) (*repository.AIUsageReport, error) {
	if to.IsZero() {
		to = time.Now().UTC()
	}
	if from.IsZero() {
		from = to.AddDate(0, 0, -30)
	}
	if !from.Before(to) || to.Sub(from) > 366*24*time.Hour {
		return nil, invalid("invalid date range")
	}
	return s.UsageRepo.UsageReport(ctx, from, to)
}

func (s *service) GetSettings(ctx context.Context) SettingsView {
	return SettingsView{Settings: s.Gateway.Settings(ctx), KeyConfigured: s.Gateway.Configured(), Provider: "anthropic"}
}

func (s *service) UpdateSettings(ctx context.Context, updates map[string]string) (SettingsView, error) {
	clean := make(map[string]string, len(updates))
	for k, v := range updates {
		v = strings.TrimSpace(v)
		switch {
		case boolKeys[k]:
			if v != "true" && v != "false" {
				return SettingsView{}, invalid(k + " must be true or false")
			}
		case k == KeyModerationFail:
			if v != "open" && v != "closed" {
				return SettingsView{}, invalid(k + " must be open or closed")
			}
		case intKeys[k]:
			if n, err := strconv.Atoi(v); err != nil || n < 0 || n > 1000000 {
				return SettingsView{}, invalid(k + " must be a non-negative integer")
			}
		case floatKeys[k]:
			if f, err := strconv.ParseFloat(v, 64); err != nil || f < 0 || f > 100000 {
				return SettingsView{}, invalid(k + " must be a non-negative number")
			}
		case modelKeys[k]:
			if !modelRe.MatchString(v) {
				return SettingsView{}, invalid(k + " must be a claude model id")
			}
		default:
			return SettingsView{}, invalid("unknown setting " + k)
		}
		clean[k] = v
	}
	if len(clean) == 0 {
		return SettingsView{}, invalid("no settings supplied")
	}
	if err := s.Settings.SetMany(ctx, clean); err != nil {
		return SettingsView{}, ErrUpstream
	}
	s.Gateway.settings.invalidate()
	return s.GetSettings(ctx), nil
}

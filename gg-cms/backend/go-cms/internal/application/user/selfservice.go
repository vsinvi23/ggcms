package user

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/serenya/go-cms/internal/application/notification"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

var ErrInvalidProfile = errors.New("invalid profile")

type ValidationError struct {
	Field string
	Msg   string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Msg }
func (e *ValidationError) Unwrap() error { return ErrInvalidProfile }

type ProfileUpdate struct {
	Name      *string `json:"name"`
	MobileNo  *string `json:"mobileNo"`
	AvatarURL *string `json:"avatarUrl"`
	Bio       *string `json:"bio"`
	Location  *string `json:"location"`
	JobTitle  *string `json:"jobTitle"`
}

type Profile struct {
	ID        uint                       `json:"id"`
	Email     string                     `json:"email"`
	Name      string                     `json:"name"`
	MobileNo  *string                    `json:"mobileNo,omitempty"`
	AvatarURL *string                    `json:"avatarUrl,omitempty"`
	Bio       string                     `json:"bio"`
	Location  string                     `json:"location"`
	JobTitle  string                     `json:"jobTitle"`
}

type ConsentInput struct {
	PolicyVersion   string `json:"policyVersion"`
	Analytics       bool   `json:"analytics"`
	Personalization bool   `json:"personalization"`
	Marketing       bool   `json:"marketing"`
}

type ConsentRecord struct {
	PolicyVersion   string    `json:"policyVersion"`
	Analytics       bool      `json:"analytics"`
	Personalization bool      `json:"personalization"`
	Marketing       bool      `json:"marketing"`
	RecordedAt      time.Time `json:"recordedAt"`
}

type ConsentView struct {
	Current              *ConsentRecord  `json:"current"`
	CurrentPolicyVersion string          `json:"currentPolicyVersion"`
	NeedsReconsent       bool            `json:"needsReconsent"`
	History              []ConsentRecord `json:"history"`
}

type DeleteResult struct {
	AnalyticsEvents int64
	Content         map[string]int64
}

type AnalyticsPurger interface {
	PurgeUser(ctx context.Context, userID uint) (int64, error)
}

type SessionRevoker interface {
	RevokeAll(ctx context.Context, userID uint) error
}

type SelfService interface {
	UpdateProfile(ctx context.Context, userID uint, in ProfileUpdate) (*Profile, error)
	GetConsent(ctx context.Context, userID uint) (*ConsentView, error)
	RecordConsent(ctx context.Context, userID uint, in ConsentInput, ipHash string) (*ConsentView, error)
	Export(ctx context.Context, userID uint) (map[string]interface{}, error)
	DeleteAccount(ctx context.Context, userID uint) (*DeleteResult, error)
}

type SelfDeps struct {
	Users         repository.UserRepository
	Groups        repository.GroupRepository
	Prefs         repository.UserPreferencesRepository
	Consents      repository.ConsentRepository
	UserData      repository.UserDataRepository
	UserContent   repository.UserContentRepository
	Analytics     AnalyticsPurger
	Sessions      SessionRevoker
	PolicyVersion string
}

type selfService struct {
	SelfDeps
}

func NewSelfService(d SelfDeps) SelfService {
	if d.PolicyVersion == "" {
		d.PolicyVersion = "1"
	}
	return &selfService{d}
}

var phonePattern = regexp.MustCompile(`^\+?[0-9][0-9 ()-]{5,18}[0-9]$`)

func hasControl(s string, allowWhitespace bool) bool {
	for _, r := range s {
		if allowWhitespace && (r == 10 || r == 13 || r == 9) {
			continue
		}
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

func validText(field, v string, max int, required bool) (string, error) {
	v = strings.TrimSpace(v)
	if required && v == "" {
		return "", &ValidationError{field, "required"}
	}
	if len([]rune(v)) > max || hasControl(v, field == "bio") {
		return "", &ValidationError{field, fmt.Sprintf("must be at most %d characters without control characters", max)}
	}
	return v, nil
}

func validAvatar(raw string) error {
	if len(raw) > 1024 {
		return &ValidationError{"avatarUrl", "too long"}
	}
	if strings.HasPrefix(raw, "/uploads/") && !strings.Contains(raw, "..") && !strings.ContainsAny(raw, " \t\r\n\\") {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || strings.ContainsAny(raw, " \t\r\n") {
		return &ValidationError{"avatarUrl", "must be an https URL or an /uploads/ path"}
	}
	return nil
}

func optional(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func (s *selfService) UpdateProfile(ctx context.Context, userID uint, in ProfileUpdate) (*Profile, error) {
	u, err := s.Users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		v, err := validText("name", *in.Name, 100, true)
		if err != nil {
			return nil, err
		}
		u.Name = v
	}
	if in.MobileNo != nil {
		v := strings.TrimSpace(*in.MobileNo)
		if v != "" && !phonePattern.MatchString(v) {
			return nil, &ValidationError{"mobileNo", "invalid phone number"}
		}
		u.MobileNo = optional(v)
	}
	if in.AvatarURL != nil {
		v := strings.TrimSpace(*in.AvatarURL)
		if v != "" {
			if err := validAvatar(v); err != nil {
				return nil, err
			}
		}
		u.AvatarURL = optional(v)
	}

	prefs, err := s.Prefs.Find(ctx, userID)
	if err != nil {
		prefs = notification.DefaultPreferences(userID)
	}
	extras := false
	for _, f := range []struct {
		in  *string
		dst **string
		nm  string
		max int
	}{{in.Bio, &prefs.Bio, "bio", 500}, {in.Location, &prefs.Location, "location", 120}, {in.JobTitle, &prefs.JobTitle, "jobTitle", 120}} {
		if f.in == nil {
			continue
		}
		v, err := validText(f.nm, *f.in, f.max, false)
		if err != nil {
			return nil, err
		}
		*f.dst = optional(v)
		extras = true
	}

	if err := s.Users.Update(ctx, u); err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}
	if extras {
		prefs.UpdatedAt = time.Now()
		if err := s.Prefs.Save(ctx, prefs); err != nil {
			return nil, fmt.Errorf("failed to save profile details: %w", err)
		}
	}
	p := &Profile{ID: u.ID, Email: u.Email, Name: u.Name, MobileNo: u.MobileNo, AvatarURL: u.AvatarURL}
	if prefs.Bio != nil {
		p.Bio = *prefs.Bio
	}
	if prefs.Location != nil {
		p.Location = *prefs.Location
	}
	if prefs.JobTitle != nil {
		p.JobTitle = *prefs.JobTitle
	}
	return p, nil
}

func toRecord(c *entity.UserConsent) ConsentRecord {
	return ConsentRecord{PolicyVersion: c.PolicyVersion, Analytics: c.Analytics, Personalization: c.Personalization, Marketing: c.Marketing, RecordedAt: c.CreatedAt}
}

func (s *selfService) GetConsent(ctx context.Context, userID uint) (*ConsentView, error) {
	rows, err := s.Consents.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	view := &ConsentView{CurrentPolicyVersion: s.PolicyVersion, History: make([]ConsentRecord, 0, len(rows))}
	for _, r := range rows {
		view.History = append(view.History, toRecord(r))
	}
	if len(rows) > 0 {
		c := toRecord(rows[0])
		view.Current = &c
	}
	view.NeedsReconsent = view.Current == nil || view.Current.PolicyVersion != s.PolicyVersion
	return view, nil
}

func (s *selfService) RecordConsent(ctx context.Context, userID uint, in ConsentInput, ipHash string) (*ConsentView, error) {
	v := strings.TrimSpace(in.PolicyVersion)
	if v == "" || len(v) > 32 || hasControl(v, false) {
		return nil, &ValidationError{"policyVersion", "required, at most 32 characters"}
	}
	rec := &entity.UserConsent{UserID: userID, PolicyVersion: v, Analytics: in.Analytics, Personalization: in.Personalization, Marketing: in.Marketing, IPHash: ipHash}
	if err := s.Consents.Create(ctx, rec); err != nil {
		return nil, err
	}
	return s.GetConsent(ctx, userID)
}

func (s *selfService) Export(ctx context.Context, userID uint) (map[string]interface{}, error) {
	tables, err := s.UserData.ExportTables(ctx, userID)
	if err != nil {
		return nil, err
	}
	content, err := s.UserContent.Export(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := map[string]interface{}{"exportVersion": 1, "exportedAt": time.Now().UTC().Format(time.RFC3339)}
	for k, v := range tables {
		out[k] = v
	}
	for k, v := range content {
		out[k] = v
	}
	return out, nil
}

func (s *selfService) DeleteAccount(ctx context.Context, userID uint) (*DeleteResult, error) {
	guard := &service{userRepo: s.Users, groupRepo: s.Groups}
	if err := guard.ensureNotLastAdmin(ctx, userID); err != nil {
		return nil, err
	}
	if err := s.Sessions.RevokeAll(ctx, userID); err != nil {
		return nil, err
	}
	res := &DeleteResult{}
	n, err := s.Analytics.PurgeUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("purge analytics: %w", err)
	}
	res.AnalyticsEvents = n
	if res.Content, err = s.UserContent.Erase(ctx, userID); err != nil {
		return nil, fmt.Errorf("purge engagement data: %w", err)
	}
	if err := s.UserData.EraseUser(ctx, userID); err != nil {
		return nil, fmt.Errorf("erase account: %w", err)
	}
	return res, nil
}

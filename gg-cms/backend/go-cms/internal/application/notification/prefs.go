package notification

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
)

const (
	TypeGeneral          = "general"
	TypeReviewDecision   = "review_decision"
	TypeReviewAssigned   = "review_assigned"
	TypeContentPublished = "content_published"
	TypeCommentReply     = "comment_reply"
	TypeCommentMention   = "comment_mention"
	TypeEnrollment       = "enrollment"
	TypeCourseCompleted  = "course_completed"
	TypeWelcome          = "welcome"
)

// Types lists the notification types a user can configure per channel.
var Types = []string{
	TypeReviewDecision, TypeReviewAssigned, TypeContentPublished, TypeCommentReply,
	TypeCommentMention, TypeEnrollment, TypeCourseCompleted, TypeWelcome,
}

var emailDefault = map[string]bool{
	TypeReviewDecision: true, TypeReviewAssigned: true, TypeContentPublished: true,
	TypeCommentReply: true, TypeCommentMention: true, TypeCourseCompleted: true, TypeWelcome: true,
}

var (
	ErrInvalidPreference = errors.New("invalid preference")
	langPattern          = regexp.MustCompile(`^[a-z]{2,3}(-[A-Za-z]{2,4})?$`)
)

type ChannelPref struct {
	InApp bool `json:"inApp"`
	Email bool `json:"email"`
}

type Preferences struct {
	Notifications     map[string]ChannelPref `json:"notifications"`
	DigestFrequency   string                 `json:"digestFrequency"`
	EmailUnsubscribed bool                   `json:"emailUnsubscribed"`
	Privacy           PrivacyPrefs           `json:"privacy"`
	Appearance        AppearancePrefs        `json:"appearance"`
	Profile           ProfileExtras          `json:"profile"`
}

type PrivacyPrefs struct {
	ProfilePublic bool `json:"profilePublic"`
	ShowActivity  bool `json:"showActivity"`
}

type AppearancePrefs struct {
	Theme    string `json:"theme"`
	Language string `json:"language"`
}

type ProfileExtras struct {
	Bio      string `json:"bio"`
	Location string `json:"location"`
	JobTitle string `json:"jobTitle"`
}

type PreferencesUpdate struct {
	Notifications     map[string]ChannelPrefUpdate `json:"notifications"`
	DigestFrequency   *string                      `json:"digestFrequency"`
	EmailUnsubscribed *bool                        `json:"emailUnsubscribed"`
	Privacy           *PrivacyUpdate               `json:"privacy"`
	Appearance        *AppearanceUpdate            `json:"appearance"`
}

type ChannelPrefUpdate struct {
	InApp *bool `json:"inApp"`
	Email *bool `json:"email"`
}

type PrivacyUpdate struct {
	ProfilePublic *bool `json:"profilePublic"`
	ShowActivity  *bool `json:"showActivity"`
}

type AppearanceUpdate struct {
	Theme    *string `json:"theme"`
	Language *string `json:"language"`
}

func DefaultPreferences(userID uint) *entity.UserPreferences {
	return &entity.UserPreferences{
		UserID: userID, NotifInApp: map[string]bool{}, NotifEmail: map[string]bool{},
		DigestFrequency: "weekly", Theme: "system", Language: "en",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
}

func inAppEnabled(p *entity.UserPreferences, t string) bool {
	if v, ok := p.NotifInApp[t]; ok {
		return v
	}
	return true
}

func emailEnabled(p *entity.UserPreferences, t string) bool {
	if p.EmailUnsubscribed {
		return false
	}
	if v, ok := p.NotifEmail[t]; ok {
		return v
	}
	return emailDefault[t]
}

func toView(p *entity.UserPreferences) *Preferences {
	v := &Preferences{
		Notifications:     map[string]ChannelPref{},
		DigestFrequency:   p.DigestFrequency,
		EmailUnsubscribed: p.EmailUnsubscribed,
		Privacy:           PrivacyPrefs{ProfilePublic: p.ProfilePublic, ShowActivity: p.ShowActivity},
		Appearance:        AppearancePrefs{Theme: p.Theme, Language: p.Language},
		Profile:           ProfileExtras{Bio: deref(p.Bio), Location: deref(p.Location), JobTitle: deref(p.JobTitle)},
	}
	for _, t := range Types {
		v.Notifications[t] = ChannelPref{InApp: inAppEnabled(p, t), Email: emailEnabled(&entity.UserPreferences{NotifEmail: p.NotifEmail}, t)}
	}
	return v
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func applyUpdate(p *entity.UserPreferences, u PreferencesUpdate) error {
	if p.NotifInApp == nil {
		p.NotifInApp = map[string]bool{}
	}
	if p.NotifEmail == nil {
		p.NotifEmail = map[string]bool{}
	}
	valid := map[string]bool{}
	for _, t := range Types {
		valid[t] = true
	}
	for t, c := range u.Notifications {
		if !valid[t] {
			return ErrInvalidPreference
		}
		if c.InApp != nil {
			p.NotifInApp[t] = *c.InApp
		}
		if c.Email != nil {
			p.NotifEmail[t] = *c.Email
		}
	}
	if u.DigestFrequency != nil {
		switch *u.DigestFrequency {
		case "off", "daily", "weekly":
			p.DigestFrequency = *u.DigestFrequency
		default:
			return ErrInvalidPreference
		}
	}
	if u.EmailUnsubscribed != nil {
		p.EmailUnsubscribed = *u.EmailUnsubscribed
	}
	if u.Privacy != nil {
		if u.Privacy.ProfilePublic != nil {
			p.ProfilePublic = *u.Privacy.ProfilePublic
		}
		if u.Privacy.ShowActivity != nil {
			p.ShowActivity = *u.Privacy.ShowActivity
		}
	}
	if u.Appearance != nil {
		if t := u.Appearance.Theme; t != nil {
			switch *t {
			case "system", "light", "dark":
				p.Theme = *t
			default:
				return ErrInvalidPreference
			}
		}
		if l := u.Appearance.Language; l != nil {
			if !langPattern.MatchString(strings.TrimSpace(*l)) {
				return ErrInvalidPreference
			}
			p.Language = strings.TrimSpace(*l)
		}
	}
	return nil
}

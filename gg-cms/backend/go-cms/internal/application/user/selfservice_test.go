package user_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/application/identity/identitytest"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type prefsFake struct{ rows map[uint]*entity.UserPreferences }

func (f *prefsFake) Find(_ context.Context, id uint) (*entity.UserPreferences, error) {
	if p, ok := f.rows[id]; ok {
		cp := *p
		return &cp, nil
	}
	return nil, repository.ErrNotFound
}
func (f *prefsFake) Save(_ context.Context, p *entity.UserPreferences) error {
	cp := *p
	f.rows[p.UserID] = &cp
	return nil
}
func (f *prefsFake) FindByUnsubscribeToken(context.Context, string) (*entity.UserPreferences, error) {
	return nil, repository.ErrNotFound
}
func (f *prefsFake) DigestCandidates(context.Context, string, time.Time, int) ([]repository.DigestUser, error) {
	return nil, nil
}
func (f *prefsFake) MarkDigestSent(context.Context, uint, time.Time) error { return nil }

type consentFake struct{ rows []*entity.UserConsent }

func (f *consentFake) Create(_ context.Context, c *entity.UserConsent) error {
	c.CreatedAt = time.Now().Add(time.Duration(len(f.rows)) * time.Second)
	f.rows = append([]*entity.UserConsent{c}, f.rows...)
	return nil
}
func (f *consentFake) Latest(context.Context, uint) (*entity.UserConsent, error) {
	if len(f.rows) == 0 {
		return nil, repository.ErrNotFound
	}
	return f.rows[0], nil
}
func (f *consentFake) ListByUser(context.Context, uint) ([]*entity.UserConsent, error) {
	return f.rows, nil
}

type calls struct {
	mu    sync.Mutex
	order []string
}

func (c *calls) add(s string) { c.mu.Lock(); c.order = append(c.order, s); c.mu.Unlock() }

type userDataFake struct{ c *calls }

func (f *userDataFake) ExportTables(context.Context, uint) (map[string][]json.RawMessage, error) {
	out := map[string][]json.RawMessage{}
	for _, k := range []string{"account", "enrollments", "certificates", "assessment_attempts", "notifications", "learning_profiles", "preferences", "consents", "linked_identities"} {
		out[k] = []json.RawMessage{json.RawMessage(`{"k":"` + k + `"}`)}
	}
	return out, nil
}
func (f *userDataFake) EraseUser(context.Context, uint) error { f.c.add("erase-user"); return nil }

type contentFake struct{ c *calls }

func (f *contentFake) Export(context.Context, uint) (map[string][]map[string]interface{}, error) {
	return map[string][]map[string]interface{}{"notes": {{"body": "n"}}, "highlights": {{"text": "h"}}, "favourites": {{"content_id": 1}}, "reactions": {{"value": 1}}}, nil
}
func (f *contentFake) Erase(context.Context, uint) (map[string]int64, error) {
	f.c.add("erase-content")
	return map[string]int64{"notes": 1}, nil
}

type purgerFake struct{ c *calls }

func (f *purgerFake) PurgeUser(context.Context, uint) (int64, error) {
	f.c.add("purge-analytics")
	return 4, nil
}

type revokerFake struct{ c *calls }

func (f *revokerFake) RevokeAll(context.Context, uint) error { f.c.add("revoke-sessions"); return nil }

type selfFixture struct {
	svc      usersvc.SelfService
	users    *identitytest.Store
	prefs    *prefsFake
	consents *consentFake
	calls    *calls
	user     *entity.User
	groups   *identitytest.GroupStore
}

func newSelf(t *testing.T) *selfFixture {
	t.Helper()
	users := identitytest.NewStore()
	groups := identitytest.NewGroupStore()
	u := users.AddUser("learner@example.com", true)
	groups.Users[u.ID] = u
	cl := &calls{}
	f := &selfFixture{users: users, prefs: &prefsFake{rows: map[uint]*entity.UserPreferences{}}, consents: &consentFake{}, calls: cl, user: u, groups: groups}
	f.svc = usersvc.NewSelfService(usersvc.SelfDeps{
		Users: users, Groups: groups, Prefs: f.prefs, Consents: f.consents,
		UserData: &userDataFake{cl}, UserContent: &contentFake{cl}, Analytics: &purgerFake{cl}, Sessions: &revokerFake{cl}, PolicyVersion: "v2",
	})
	return f
}

func str(s string) *string { return &s }

func TestUpdateProfile(t *testing.T) {
	f := newSelf(t)
	ctx := context.Background()
	p, err := f.svc.UpdateProfile(ctx, f.user.ID, usersvc.ProfileUpdate{
		Name: str("  Asha Rao "), MobileNo: str("+91 98765 43210"), AvatarURL: str("https://cdn.example.com/a.png"),
		Bio: str("Line one\nLine two"), Location: str("Pune"), JobTitle: str("SRE"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "Asha Rao" || p.Email != "learner@example.com" || p.Bio != "Line one\nLine two" || p.JobTitle != "SRE" {
		t.Fatalf("profile: %+v", p)
	}
	stored := f.users.Users[f.user.ID]
	if stored.Name != "Asha Rao" || stored.Status != entity.UserStatusActive || stored.Email != "learner@example.com" {
		t.Fatalf("stored user: %+v", stored)
	}
	if f.prefs.rows[f.user.ID].Location == nil || *f.prefs.rows[f.user.ID].Location != "Pune" {
		t.Fatal("profile extras not persisted")
	}

	long := strings.Repeat("x", 501)
	for name, in := range map[string]usersvc.ProfileUpdate{
		"empty name":      {Name: str("   ")},
		"javascript url":  {AvatarURL: str("javascript:alert(1)")},
		"http avatar":     {AvatarURL: str("http://cdn.example.com/a.png")},
		"userinfo avatar": {AvatarURL: str("https://user:pw@cdn.example.com/a.png")},
		"upload traversal": {AvatarURL: str("/uploads/../secret")},
		"bad phone":       {MobileNo: str("call me")},
		"long bio":        {Bio: str(long)},
		"control in name": {Name: str("A\x00B")},
	} {
		if _, err := f.svc.UpdateProfile(ctx, f.user.ID, in); !errors.Is(err, usersvc.ErrInvalidProfile) {
			t.Errorf("%s: expected ErrInvalidProfile, got %v", name, err)
		}
	}
	if _, err := f.svc.UpdateProfile(ctx, f.user.ID, usersvc.ProfileUpdate{AvatarURL: str("/uploads/2026/a.png"), MobileNo: str("")}); err != nil {
		t.Fatalf("relative upload path and clearing phone should be accepted: %v", err)
	}
	if f.users.Users[f.user.ID].MobileNo != nil {
		t.Fatal("empty phone should clear the field")
	}
}

func TestConsentVersioning(t *testing.T) {
	f := newSelf(t)
	ctx := context.Background()
	v, err := f.svc.GetConsent(ctx, f.user.ID)
	if err != nil || v.Current != nil || !v.NeedsReconsent || v.CurrentPolicyVersion != "v2" {
		t.Fatalf("initial: %+v %v", v, err)
	}
	if _, err := f.svc.RecordConsent(ctx, f.user.ID, usersvc.ConsentInput{PolicyVersion: " "}, ""); !errors.Is(err, usersvc.ErrInvalidProfile) {
		t.Fatal("empty policy version must be rejected")
	}
	_, _ = f.svc.RecordConsent(ctx, f.user.ID, usersvc.ConsentInput{PolicyVersion: "v1", Analytics: true}, "")
	v, _ = f.svc.RecordConsent(ctx, f.user.ID, usersvc.ConsentInput{PolicyVersion: "v2", Analytics: false, Marketing: true}, "")
	if v.Current == nil || v.Current.PolicyVersion != "v2" || v.Current.Analytics || !v.Current.Marketing || v.NeedsReconsent || len(v.History) != 2 {
		t.Fatalf("after recording: %+v", v)
	}
}

func TestExportIsComplete(t *testing.T) {
	f := newSelf(t)
	out, err := f.svc.Export(context.Background(), f.user.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"account", "enrollments", "certificates", "assessment_attempts", "notifications", "learning_profiles", "preferences", "consents",
		"linked_identities", "notes", "highlights", "favourites", "reactions", "exportedAt", "exportVersion"} {
		if _, ok := out[k]; !ok {
			t.Errorf("export is missing %q", k)
		}
	}
	if _, err := json.Marshal(out); err != nil {
		t.Fatalf("export must be JSON serialisable: %v", err)
	}
	if strings.Contains(strings.ToLower(mustJSON(out)), "password") {
		t.Error("export must never include credentials")
	}
}

func mustJSON(v interface{}) string { b, _ := json.Marshal(v); return string(b) }

func TestDeleteAccountPurgesEverythingInOrder(t *testing.T) {
	f := newSelf(t)
	res, err := f.svc.DeleteAccount(context.Background(), f.user.ID)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"revoke-sessions", "purge-analytics", "erase-content", "erase-user"}
	if strings.Join(f.calls.order, ",") != strings.Join(want, ",") {
		t.Fatalf("order %v, want %v", f.calls.order, want)
	}
	if res.AnalyticsEvents != 4 || res.Content["notes"] != 1 {
		t.Fatalf("result: %+v", res)
	}
}

func TestDeleteAccountBlockedForLastAdmin(t *testing.T) {
	f := newSelf(t)
	admin := f.groups.NewGroup("Admin")
	admin.Role = "admin"
	f.groups.Members[admin.ID][f.user.ID] = struct{}{}
	if _, err := f.svc.DeleteAccount(context.Background(), f.user.ID); !errors.Is(err, usersvc.ErrLastAdmin) {
		t.Fatalf("expected ErrLastAdmin, got %v", err)
	}
	if len(f.calls.order) != 0 {
		t.Fatalf("nothing may be purged when the guard trips: %v", f.calls.order)
	}
}

package notification_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/application/identity/identitytest"
	"github.com/serenya/go-cms/internal/application/notification"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type fakeNotifRepo struct {
	mu   sync.Mutex
	rows []*entity.Notification
}

func (f *fakeNotifRepo) Create(_ context.Context, n *entity.Notification) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rows = append(f.rows, n)
	return nil
}
func (f *fakeNotifRepo) FindByUserID(context.Context, uint, int, int) ([]*entity.Notification, int64, error) {
	return f.rows, int64(len(f.rows)), nil
}
func (f *fakeNotifRepo) MarkAsRead(context.Context, uint, uint) error { return nil }
func (f *fakeNotifRepo) MarkAllAsRead(context.Context, uint) error    { return nil }
func (f *fakeNotifRepo) HasType(_ context.Context, uid uint, t string) (bool, error) {
	for _, r := range f.rows {
		if r.UserID == uid && r.Type == t {
			return true, nil
		}
	}
	return false, nil
}
func (f *fakeNotifRepo) PurgeReadOlderThan(context.Context, time.Time) (int64, error) { return 0, nil }

type fakePrefs struct {
	mu   sync.Mutex
	rows map[uint]*entity.UserPreferences
}

func (f *fakePrefs) Find(_ context.Context, id uint) (*entity.UserPreferences, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if p, ok := f.rows[id]; ok {
		cp := *p
		return &cp, nil
	}
	return nil, repository.ErrNotFound
}
func (f *fakePrefs) Save(_ context.Context, p *entity.UserPreferences) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := *p
	f.rows[p.UserID] = &cp
	return nil
}
func (f *fakePrefs) FindByUnsubscribeToken(_ context.Context, tok string) (*entity.UserPreferences, error) {
	for _, p := range f.rows {
		if p.UnsubscribeToken != nil && *p.UnsubscribeToken == tok {
			cp := *p
			return &cp, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (f *fakePrefs) DigestCandidates(context.Context, string, time.Time, int) ([]repository.DigestUser, error) {
	return nil, nil
}
func (f *fakePrefs) MarkDigestSent(context.Context, uint, time.Time) error { return nil }

type fakeQueue struct {
	mu    sync.Mutex
	items []*entity.EmailQueueItem
}

func (f *fakeQueue) Enqueue(_ context.Context, it *entity.EmailQueueItem) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if it.DedupeKey != nil {
		for _, e := range f.items {
			if e.DedupeKey != nil && *e.DedupeKey == *it.DedupeKey {
				return false, nil
			}
		}
	}
	it.ID = uint(len(f.items) + 1)
	f.items = append(f.items, it)
	return true, nil
}
func (f *fakeQueue) Claim(_ context.Context, limit int, _ time.Duration) ([]*entity.EmailQueueItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []*entity.EmailQueueItem
	for _, it := range f.items {
		if it.Status == entity.EmailStatusPending && !it.NextAttemptAt.After(time.Now().Add(24*time.Hour)) && len(out) < limit {
			it.Status = entity.EmailStatusSending
			it.Attempts++
			out = append(out, it)
		}
	}
	return out, nil
}
func (f *fakeQueue) MarkSent(_ context.Context, id uint, at time.Time) error {
	f.items[id-1].Status, f.items[id-1].SentAt = entity.EmailStatusSent, &at
	return nil
}
func (f *fakeQueue) MarkFailed(_ context.Context, id uint, next time.Time, msg string, dead bool) error {
	it := f.items[id-1]
	it.Status, it.NextAttemptAt, it.LastError = entity.EmailStatusPending, next, &msg
	if dead {
		it.Status = entity.EmailStatusDead
	}
	return nil
}
func (f *fakeQueue) PurgeOlderThan(context.Context, time.Time) (int64, error)  { return 0, nil }
func (f *fakeQueue) DeletePendingForUser(context.Context, uint) error          { return nil }
func (f *fakeQueue) RecentlyVerifiedUsers(context.Context, time.Time, int) ([]repository.DigestUser, error) {
	return nil, nil
}

type fixture struct {
	svc    notification.Service
	notifs *fakeNotifRepo
	prefs  *fakePrefs
	queue  *fakeQueue
	user   *entity.User
}

func newFixture(t *testing.T, verified bool) *fixture {
	t.Helper()
	users := identitytest.NewStore()
	u := users.AddUser("learner@example.com", verified)
	f := &fixture{notifs: &fakeNotifRepo{}, prefs: &fakePrefs{rows: map[uint]*entity.UserPreferences{}}, queue: &fakeQueue{}, user: u}
	f.svc = notification.NewService(f.notifs, f.prefs, f.queue, users, notification.Options{AppURL: "https://app.test", APIURL: "https://api.test"})
	return f
}

func notice(uid uint, typ string) notification.Notice {
	link := "/articles/1/edit"
	return notification.Notice{UserID: uid, Type: typ, Title: "Review decision: Go", Message: "approved", Link: &link, EmailTemplate: notification.TplReviewDecision}
}

func TestNotifyDefaultsSendBothChannels(t *testing.T) {
	f := newFixture(t, true)
	if err := f.svc.Notify(context.Background(), notice(f.user.ID, notification.TypeReviewDecision)); err != nil {
		t.Fatal(err)
	}
	if len(f.notifs.rows) != 1 || f.notifs.rows[0].Type != notification.TypeReviewDecision {
		t.Fatalf("in-app: %+v", f.notifs.rows)
	}
	if len(f.queue.items) != 1 {
		t.Fatalf("email queue: %d", len(f.queue.items))
	}
	d := f.queue.items[0].Data
	if d["link"] != "https://app.test/articles/1/edit" || !strings.HasPrefix(d["unsubscribe_url"].(string), "https://api.test/api/notifications/unsubscribe?token=") {
		t.Fatalf("email data: %+v", d)
	}
}

func TestPreferencesEnforced(t *testing.T) {
	off, on := false, true
	cases := []struct {
		name      string
		update    notification.PreferencesUpdate
		wantInApp int
		wantEmail int
	}{
		{"email off for type", notification.PreferencesUpdate{Notifications: map[string]notification.ChannelPrefUpdate{notification.TypeReviewDecision: {Email: &off}}}, 1, 0},
		{"in-app off for type", notification.PreferencesUpdate{Notifications: map[string]notification.ChannelPrefUpdate{notification.TypeReviewDecision: {InApp: &off}}}, 0, 1},
		{"global unsubscribe", notification.PreferencesUpdate{EmailUnsubscribed: &on}, 1, 0},
		{"other type off is irrelevant", notification.PreferencesUpdate{Notifications: map[string]notification.ChannelPrefUpdate{notification.TypeCommentReply: {InApp: &off, Email: &off}}}, 1, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t, true)
			if _, err := f.svc.UpdatePreferences(context.Background(), f.user.ID, tc.update); err != nil {
				t.Fatal(err)
			}
			_ = f.svc.Notify(context.Background(), notice(f.user.ID, notification.TypeReviewDecision))
			if len(f.notifs.rows) != tc.wantInApp || len(f.queue.items) != tc.wantEmail {
				t.Fatalf("in-app=%d email=%d, want %d/%d", len(f.notifs.rows), len(f.queue.items), tc.wantInApp, tc.wantEmail)
			}
		})
	}

	f := newFixture(t, false)
	_ = f.svc.Notify(context.Background(), notice(f.user.ID, notification.TypeReviewDecision))
	if len(f.queue.items) != 0 {
		t.Fatal("email must not go to an unverified address")
	}
}

func TestPreferencesValidationAndUnsubscribe(t *testing.T) {
	f := newFixture(t, true)
	ctx := context.Background()
	bad := "rainbow"
	for _, u := range []notification.PreferencesUpdate{
		{DigestFrequency: &bad},
		{Appearance: &notification.AppearanceUpdate{Theme: &bad}},
		{Appearance: &notification.AppearanceUpdate{Language: &bad}},
		{Notifications: map[string]notification.ChannelPrefUpdate{"made_up": {}}},
	} {
		if _, err := f.svc.UpdatePreferences(ctx, f.user.ID, u); !errors.Is(err, notification.ErrInvalidPreference) {
			t.Errorf("expected ErrInvalidPreference for %+v, got %v", u, err)
		}
	}
	daily, hi := "daily", "hi"
	p, err := f.svc.UpdatePreferences(ctx, f.user.ID, notification.PreferencesUpdate{DigestFrequency: &daily, Appearance: &notification.AppearanceUpdate{Language: &hi}})
	if err != nil || p.DigestFrequency != "daily" || p.Appearance.Language != "hi" || len(p.Notifications) != len(notification.Types) {
		t.Fatalf("update: %+v %v", p, err)
	}

	_ = f.svc.Notify(ctx, notice(f.user.ID, notification.TypeReviewDecision))
	tok := strings.TrimPrefix(f.queue.items[0].Data["unsubscribe_url"].(string), "https://api.test/api/notifications/unsubscribe?token=")
	if err := f.svc.UnsubscribeByToken(ctx, "short"); err == nil {
		t.Fatal("malformed token must fail")
	}
	if err := f.svc.UnsubscribeByToken(ctx, tok); err != nil {
		t.Fatal(err)
	}
	after, _ := f.svc.GetPreferences(ctx, f.user.ID)
	if !after.EmailUnsubscribed || after.DigestFrequency != "off" {
		t.Fatalf("unsubscribe not applied: %+v", after)
	}
}

type failingMailer struct {
	configured bool
	calls      int
	err        error
}

func (m *failingMailer) Configured() bool { return m.configured }
func (m *failingMailer) SendMultipart(to, subject, text, html string, h map[string]string) error {
	m.calls++
	return m.err
}

func TestQueueRetryAndBackoff(t *testing.T) {
	f := newFixture(t, true)
	_ = f.svc.Notify(context.Background(), notice(f.user.ID, notification.TypeReviewDecision))
	f.queue.items[0].MaxAttempts = 2
	mail := &failingMailer{configured: true, err: errors.New("smtp down")}
	w := notification.NewWorker(f.svc, f.queue, f.prefs, f.notifs, nil, mail, notification.WorkerConfig{Production: true})
	ctx := context.Background()

	_, failed := w.ProcessBatch(ctx)
	it := f.queue.items[0]
	if failed != 1 || it.Status != entity.EmailStatusPending || it.Attempts != 1 || it.LastError == nil || !it.NextAttemptAt.After(time.Now().Add(20*time.Second)) {
		t.Fatalf("first failure should retry with backoff: %+v", it)
	}
	_, failed = w.ProcessBatch(ctx)
	if failed != 1 || it.Status != entity.EmailStatusDead || it.Attempts != 2 {
		t.Fatalf("exhausted attempts should be dead: %+v", it)
	}
	if _, f2 := w.ProcessBatch(ctx); f2 != 0 || mail.calls != 2 {
		t.Fatalf("dead items must not be retried: calls=%d", mail.calls)
	}

	f2 := newFixture(t, true)
	_ = f2.svc.Notify(context.Background(), notice(f2.user.ID, notification.TypeReviewDecision))
	ok := &failingMailer{configured: true}
	sent, _ := notification.NewWorker(f2.svc, f2.queue, f2.prefs, f2.notifs, nil, ok, notification.WorkerConfig{Production: true}).ProcessBatch(ctx)
	if sent != 1 || f2.queue.items[0].Status != entity.EmailStatusSent {
		t.Fatalf("successful send: %+v", f2.queue.items[0])
	}

	f3 := newFixture(t, true)
	_ = f3.svc.Notify(context.Background(), notice(f3.user.ID, notification.TypeReviewDecision))
	dev := &failingMailer{configured: false}
	sent, _ = notification.NewWorker(f3.svc, f3.queue, f3.prefs, f3.notifs, nil, dev, notification.WorkerConfig{Production: false}).ProcessBatch(ctx)
	if sent != 1 || dev.calls != 0 {
		t.Fatal("non-production without SMTP should log and mark sent")
	}
	f4 := newFixture(t, true)
	_ = f4.svc.Notify(context.Background(), notice(f4.user.ID, notification.TypeReviewDecision))
	_, failed = notification.NewWorker(f4.svc, f4.queue, f4.prefs, f4.notifs, nil, dev, notification.WorkerConfig{Production: true}).ProcessBatch(ctx)
	if failed != 1 {
		t.Fatal("production without SMTP must fail and retry")
	}
}

func TestBackoffCurve(t *testing.T) {
	want := []time.Duration{30 * time.Second, time.Minute, 2 * time.Minute, 4 * time.Minute}
	for i, w := range want {
		if got := notification.Backoff(i + 1); got != w {
			t.Errorf("attempt %d: %v, want %v", i+1, got, w)
		}
	}
	if notification.Backoff(20) != time.Hour {
		t.Error("backoff must cap at one hour")
	}
}

func TestDedupeKeyPreventsDuplicateEmail(t *testing.T) {
	f := newFixture(t, true)
	n := notice(f.user.ID, notification.TypeWelcome)
	n.EmailTemplate, n.DedupeKey = notification.TplWelcome, "welcome:1"
	_ = f.svc.Notify(context.Background(), n)
	_ = f.svc.Notify(context.Background(), n)
	if len(f.queue.items) != 1 {
		t.Fatalf("dedupe key should keep one email, got %d", len(f.queue.items))
	}
}

func TestTemplatesRender(t *testing.T) {
	data := map[string]interface{}{
		"name": "Asha <b>", "title": "Intro to Go", "message": "Done & dusted", "link": "https://app.test/x?a=1&b=2",
		"unsubscribe_url": "https://api.test/u?token=abc",
		"items":           []interface{}{map[string]interface{}{"title": "Item", "url": "https://app.test/article/item"}},
	}
	for _, name := range []string{notification.TplWelcome, notification.TplReset, notification.TplCompletion, notification.TplReviewDecision,
		notification.TplReviewAssigned, notification.TplContentPublished, notification.TplComment, notification.TplEnrollment, notification.TplDigest} {
		subject, text, html, err := notification.Render(name, "", data)
		if err != nil || subject == "" || text == "" || !strings.Contains(html, "<html") {
			t.Fatalf("%s: %v", name, err)
		}
		if strings.Contains(html, "Asha <b>") {
			t.Errorf("%s: HTML not escaped", name)
		}
		if !strings.Contains(text, "https://api.test/u?token=abc") {
			t.Errorf("%s: text body missing unsubscribe link", name)
		}
	}
	_, text, html, err := notification.Render(notification.TplRaw, "", map[string]interface{}{"subject": "Verify", "text": "Open https://x.test/v?t=1 now"})
	if err != nil || text == "" || !strings.Contains(html, `<a href="https://x.test/v?t=1">`) {
		t.Fatalf("raw: %v %s", err, html)
	}
	if _, _, _, err := notification.Render("nope", "", nil); !errors.Is(err, notification.ErrUnknownTemplate) {
		t.Fatal("unknown template must error")
	}
}

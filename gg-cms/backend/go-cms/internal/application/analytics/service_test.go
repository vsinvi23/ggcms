package analytics

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type fakeStore struct {
	mu      sync.Mutex
	events  []*entity.AnalyticsEvent
	rollups map[string][]*entity.AnalyticsRollup
	purged  []uint
}

func newFakeStore() *fakeStore { return &fakeStore{rollups: map[string][]*entity.AnalyticsRollup{}} }

func (f *fakeStore) TrackEvent(_ context.Context, e *entity.AnalyticsEvent) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, e)
	return nil
}
func (f *fakeStore) GetContentViews(context.Context, string, string) (int64, error) { return 0, nil }
func (f *fakeStore) GetDashboardStats(context.Context) (map[string]interface{}, error) {
	return map[string]interface{}{"page_views_30d": int64(0), "top_content": []map[string]interface{}{{"contentId": "7", "contentType": "article", "views": int64(3)}}}, nil
}
func (f *fakeStore) InsertEvents(_ context.Context, evs []*entity.AnalyticsEvent) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	seen := map[string]bool{}
	for _, e := range f.events {
		seen[e.EventID] = true
	}
	for _, e := range evs {
		if e.EventID != "" && seen[e.EventID] {
			continue
		}
		f.events = append(f.events, e)
	}
	return nil
}
func (f *fakeStore) EventsBetween(_ context.Context, from, to time.Time, fn func(*entity.AnalyticsEvent)) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, e := range f.events {
		if !e.CreatedAt.Before(from) && e.CreatedAt.Before(to) {
			fn(e)
		}
	}
	return nil
}
func (f *fakeStore) ReplaceRollups(_ context.Context, day string, r []*entity.AnalyticsRollup) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rollups[day] = r
	return nil
}
func (f *fakeStore) RollupsBetween(_ context.Context, kind string, from, to time.Time) ([]*entity.AnalyticsRollup, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []*entity.AnalyticsRollup
	for _, rs := range f.rollups {
		for _, r := range rs {
			if r.Kind == kind && !r.DayTS.Before(from) && r.DayTS.Before(to) {
				out = append(out, r)
			}
		}
	}
	return out, nil
}
func (f *fakeStore) HasRollups(_ context.Context, day string) (bool, error) {
	return len(f.rollups[day]) > 0, nil
}
func (f *fakeStore) UserEventStats(context.Context, []uint, time.Time) (map[uint]repository.UserEventStat, error) {
	return map[uint]repository.UserEventStat{}, nil
}
func (f *fakeStore) DeleteByUser(_ context.Context, id uint) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.purged = append(f.purged, id)
	var kept []*entity.AnalyticsEvent
	var n int64
	for _, e := range f.events {
		if e.UserID != nil && *e.UserID == id {
			n++
			continue
		}
		kept = append(kept, e)
	}
	f.events = kept
	return n, nil
}

type fakeStats struct {
	newUsers, enrolls, completes []repository.DayCount
	signups                      []repository.SignupRow
}

func (f *fakeStats) NewUsersByDay(context.Context, time.Time, time.Time) ([]repository.DayCount, error) {
	return f.newUsers, nil
}
func (f *fakeStats) EnrollmentsByDay(context.Context, time.Time, time.Time) ([]repository.DayCount, error) {
	return f.enrolls, nil
}
func (f *fakeStats) CompletionsByDay(context.Context, time.Time, time.Time) ([]repository.DayCount, error) {
	return f.completes, nil
}
func (f *fakeStats) DistinctEnrollers(context.Context, time.Time, time.Time) (int64, error) {
	return 2, nil
}
func (f *fakeStats) DistinctCompleters(context.Context, time.Time, time.Time) (int64, error) {
	return 1, nil
}
func (f *fakeStats) SignupsBetween(context.Context, time.Time, time.Time) ([]repository.SignupRow, error) {
	return f.signups, nil
}
func (f *fakeStats) ContentInfo(_ context.Context, refs []repository.ContentRef) (map[string]repository.ContentInfo, error) {
	out := map[string]repository.ContentInfo{}
	for _, r := range refs {
		out[r.Key()] = repository.ContentInfo{Type: r.Type, ID: r.ID, Title: "Title " + r.ID, Slug: "slug-" + r.ID}
	}
	return out, nil
}
func (f *fakeStats) PublishedContent(context.Context, int) ([]repository.ContentInfo, error) {
	return nil, nil
}
func (f *fakeStats) RecentlyPublished(context.Context, time.Time, int) ([]repository.ContentInfo, error) {
	return nil, nil
}
func (f *fakeStats) UserActivityPage(context.Context, int, int) ([]repository.UserActivity, int64, error) {
	return nil, 0, nil
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newTestService(t *testing.T, store *fakeStore, stats *fakeStats, clk *clock, queue int) *service {
	t.Helper()
	if stats == nil {
		stats = &fakeStats{}
	}
	svc := NewService(store, stats, Config{IPSalt: "test-salt", QueueSize: queue, FlushInterval: time.Hour, Now: clk.now}).(*service)
	t.Cleanup(svc.Close)
	return svc
}

const humanUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

func pv(id, content string) IngestEvent {
	return IngestEvent{SchemaVersion: 1, EventID: id, EventType: EventPageView, VisitorID: "visitor-0001", SessionID: "session-0001", ContentID: content, ContentType: "article"}
}

func TestIngestValidation(t *testing.T) {
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	store := newFakeStore()
	svc := newTestService(t, store, nil, clk, 100)
	ctx := context.Background()

	if _, err := svc.Ingest(ctx, IngestRequest{}, IngestMeta{UserAgent: humanUA}); err != ErrEmptyBatch {
		t.Fatalf("empty batch: %v", err)
	}
	big := make([]IngestEvent, MaxBatch+1)
	if _, err := svc.Ingest(ctx, IngestRequest{Events: big}, IngestMeta{UserAgent: humanUA}); err != ErrBatchTooBig {
		t.Fatalf("oversized batch: %v", err)
	}

	bad := []IngestEvent{
		{SchemaVersion: 2, EventID: "evt-00000001", EventType: EventPageView, ContentID: "1", ContentType: "article"},
		{SchemaVersion: 1, EventID: "evt-00000002", EventType: "nonsense"},
		{SchemaVersion: 1, EventID: "evt-00000003", EventType: EventCourseCompleted, ContentID: "1", ContentType: "course"},
		{SchemaVersion: 1, EventID: "x", EventType: EventPageView, ContentID: "1", ContentType: "article"},
		{SchemaVersion: 1, EventID: "evt-00000005", EventType: EventPageView, ContentID: "../etc", ContentType: "article"},
		{SchemaVersion: 1, EventID: "evt-00000006", EventType: EventArticleRead, ContentID: "1", ContentType: "article", Metadata: map[string]interface{}{"scroll_pct": float64(250)}},
		{SchemaVersion: 1, EventID: "evt-00000007", EventType: EventSearch, Metadata: map[string]interface{}{"result_count": float64(1)}},
	}
	res, err := svc.Ingest(ctx, IngestRequest{Consent: true, Events: bad}, IngestMeta{UserAgent: humanUA, IP: "203.0.113.9"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Accepted != 0 || len(res.Rejected) != len(bad) {
		t.Fatalf("expected all rejected, got accepted=%d rejected=%+v", res.Accepted, res.Rejected)
	}
	want := []string{"unsupported_schema_version", "unknown_event_type", "server_only_event_type", "invalid_event_id", "invalid_content_ref", "invalid_metadata", "invalid_metadata"}
	for i, w := range want {
		if res.Rejected[i].Reason != w {
			t.Errorf("event %d: reason %q, want %q", i, res.Rejected[i].Reason, w)
		}
	}

	ok := IngestEvent{SchemaVersion: 1, EventID: "evt-00000008", EventType: EventArticleRead, ContentID: "5", ContentType: "article",
		Metadata: map[string]interface{}{"read_seconds": float64(42), "scroll_pct": float64(90), "evil": "<script>"}}
	res, _ = svc.Ingest(ctx, IngestRequest{Consent: true, Events: []IngestEvent{ok}}, IngestMeta{UserAgent: humanUA, IP: "203.0.113.9"})
	if res.Accepted != 1 {
		t.Fatalf("valid event rejected: %+v", res)
	}
	svc.Flush(ctx)
	if len(store.events) != 1 {
		t.Fatalf("stored %d events", len(store.events))
	}
	if _, has := store.events[0].Metadata["evil"]; has {
		t.Fatal("metadata outside the allow-list was stored")
	}
	if store.events[0].SchemaVersion != 1 || store.events[0].CreatedAt != clk.t {
		t.Fatal("schema version / server timestamp not set")
	}
}

func TestPageViewDedupe(t *testing.T) {
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	store := newFakeStore()
	svc := newTestService(t, store, nil, clk, 100)
	ctx := context.Background()
	meta := IngestMeta{UserAgent: humanUA, IP: "203.0.113.9"}

	r1, _ := svc.Ingest(ctx, IngestRequest{Consent: true, Events: []IngestEvent{pv("evt-00000001", "9")}}, meta)
	r2, _ := svc.Ingest(ctx, IngestRequest{Consent: true, Events: []IngestEvent{pv("evt-00000002", "9")}}, meta)
	r3, _ := svc.Ingest(ctx, IngestRequest{Consent: true, Events: []IngestEvent{pv("evt-00000003", "10")}}, meta)
	if r1.Accepted != 1 || r2.Deduped != 1 || r2.Accepted != 0 || r3.Accepted != 1 {
		t.Fatalf("dedupe wrong: %+v %+v %+v", r1, r2, r3)
	}
	clk.t = clk.t.Add(31 * time.Minute)
	r4, _ := svc.Ingest(ctx, IngestRequest{Consent: true, Events: []IngestEvent{pv("evt-00000004", "9")}}, meta)
	if r4.Accepted != 1 {
		t.Fatalf("view after 30 min window should count: %+v", r4)
	}
}

func TestBotFiltering(t *testing.T) {
	for _, ua := range []string{"", "curl/8.0", "Googlebot/2.1 (+http://www.google.com/bot.html)", "python-requests/2.31", "HeadlessChrome/120"} {
		if !IsBot(ua) {
			t.Errorf("%q should be a bot", ua)
		}
	}
	if IsBot(humanUA) {
		t.Error("browser UA flagged as bot")
	}
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	store := newFakeStore()
	svc := newTestService(t, store, nil, clk, 100)
	res, _ := svc.Ingest(context.Background(), IngestRequest{Consent: true, Events: []IngestEvent{pv("evt-00000001", "9")}}, IngestMeta{UserAgent: "Googlebot/2.1"})
	if res.Ignored != "bot" || res.Accepted != 0 {
		t.Fatalf("bot not ignored: %+v", res)
	}
	id, ct := "9", "article"
	_ = svc.TrackPageView(context.Background(), nil, &id, &ct, "203.0.113.9", "curl/8.0")
	svc.Flush(context.Background())
	if len(store.events) != 0 {
		t.Fatal("bot traffic was stored")
	}
}

func TestConsentAndIPHandling(t *testing.T) {
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	store := newFakeStore()
	svc := newTestService(t, store, nil, clk, 100)
	ctx := context.Background()
	uid := uint(7)
	search := IngestEvent{SchemaVersion: 1, EventID: "evt-00000009", EventType: EventSearch,
		Metadata: map[string]interface{}{"query_text": "kubernetes for me@example.com 123456789", "result_count": float64(0)}}

	_, _ = svc.Ingest(ctx, IngestRequest{Consent: false, Events: []IngestEvent{pv("evt-00000001", "9"), search}}, IngestMeta{UserAgent: humanUA, IP: "203.0.113.9", UserID: &uid})
	_, _ = svc.Ingest(ctx, IngestRequest{Consent: true, Events: []IngestEvent{pv("evt-00000002", "11"), func() IngestEvent { s := search; s.EventID = "evt-00000010"; return s }()}}, IngestMeta{UserAgent: humanUA, IP: "203.0.113.9", UserID: &uid})
	svc.Flush(ctx)

	var anon, consented []*entity.AnalyticsEvent
	for _, e := range store.events {
		if e.Anonymous {
			anon = append(anon, e)
		} else {
			consented = append(consented, e)
		}
	}
	if len(anon) != 2 || len(consented) != 2 {
		t.Fatalf("anon=%d consented=%d", len(anon), len(consented))
	}
	for _, e := range anon {
		if e.VisitorID != "" || e.SessionID != "" || e.UserID != nil || e.IPHash != "" || e.UserAgent != "" {
			t.Errorf("anonymous event carries identifiers: %+v", e)
		}
		if _, has := e.Metadata["query_text"]; has {
			t.Error("query text stored without consent")
		}
	}
	for _, e := range consented {
		if e.VisitorID == "" && e.EventType == EventPageView {
			t.Error("consented page view lost visitor id")
		}
		if e.UserID == nil || *e.UserID != 7 {
			t.Error("consented event lost user id")
		}
		if len(e.IPHash) != 16 || strings.Contains(e.IPHash, "203") {
			t.Errorf("ip not stored as keyed hash: %q", e.IPHash)
		}
		if txt, _ := e.Metadata["query_text"].(string); e.EventType == EventSearch && (strings.Contains(txt, "@") || strings.Contains(txt, "123456789")) {
			t.Errorf("query text not redacted: %q", txt)
		}
	}
	if hashIP([]byte("a"), "203.0.113.9") == hashIP([]byte("b"), "203.0.113.9") {
		t.Error("hash must depend on the salt")
	}
	if hashIP([]byte("a"), "203.0.113.9") != hashIP([]byte("a"), "203.0.113.200") {
		t.Error("IPv4 addresses in the same /24 should truncate to one hash")
	}
}

func TestTrackEventNormalisation(t *testing.T) {
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	store := newFakeStore()
	svc := newTestService(t, store, nil, clk, 100)
	uid, cid, ct := uint(3), "12", "ASSESSMENT"
	if err := svc.TrackEvent(context.Background(), EventQuizAttempted, &uid, &cid, &ct, map[string]interface{}{"score": 83.4, "passed": true, "attemptId": uint(5), "junk": 1}); err != nil {
		t.Fatal(err)
	}
	if err := svc.TrackEvent(context.Background(), "unknown_thing", &uid, &cid, &ct, nil); err == nil {
		t.Fatal("unknown event type should error")
	}
	svc.Flush(context.Background())
	e := store.events[0]
	if *e.ContentType != "course" || e.Metadata["score_pct"] != int64(83) || e.Metadata["attempt_id"] != "5" || e.Metadata["junk"] != nil {
		t.Fatalf("not normalised: %+v %s", e.Metadata, *e.ContentType)
	}
	if e.IPHash != "" || e.UserAgent != "" || e.Source != "server" {
		t.Fatal("server events must not carry ip/user agent")
	}
}

func TestQueueDropsWhenFull(t *testing.T) {
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	svc := newTestService(t, newFakeStore(), nil, clk, 1)
	meta := IngestMeta{UserAgent: humanUA, IP: "203.0.113.9"}
	res, _ := svc.Ingest(context.Background(), IngestRequest{Consent: true, Events: []IngestEvent{pv("evt-00000001", "1"), pv("evt-00000002", "2")}}, meta)
	depth, dropped := svc.QueueStats()
	if res.Accepted != 1 || depth != 1 || dropped != 1 || res.Rejected[0].Reason != "queue_full" {
		t.Fatalf("accepted=%d depth=%d dropped=%d rejected=%+v", res.Accepted, depth, dropped, res.Rejected)
	}
}

func mkEvent(typ string, at time.Time, user uint, content string, meta map[string]interface{}) *entity.AnalyticsEvent {
	e := &entity.AnalyticsEvent{EventType: typ, CreatedAt: at, Metadata: meta}
	if user != 0 {
		u := user
		e.UserID = &u
	}
	if content != "" {
		ct, id := "article", content
		e.ContentType, e.ContentID = &ct, &id
	}
	return e
}

func TestRollupMathAndOverview(t *testing.T) {
	day := time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC)
	at := func(h int) time.Time { return day.Add(time.Duration(h) * time.Hour) }
	clk := &clock{day.Add(36 * time.Hour)}
	store := newFakeStore()
	svc := newTestService(t, store, &fakeStats{
		newUsers:  []repository.DayCount{{Day: "2026-03-09", Count: 4}},
		enrolls:   []repository.DayCount{{Day: "2026-03-09", Count: 2}},
		completes: []repository.DayCount{{Day: "2026-03-09", Count: 1}},
	}, clk, 100)

	vA := mkEvent(EventPageView, at(1), 0, "5", nil)
	vA.VisitorID = "visitor-a"
	vA2 := mkEvent(EventPageView, at(2), 0, "5", nil)
	vA2.VisitorID = "visitor-a"
	vB := mkEvent(EventPageView, at(3), 11, "5", nil)
	cls := []*entity.AnalyticsEvent{
		vA, vA2, vB,
		mkEvent(EventArticleRead, at(3), 11, "5", map[string]interface{}{"read_seconds": int64(60), "scroll_pct": int64(90)}),
		mkEvent(EventArticleRead, at(4), 12, "5", map[string]interface{}{"read_seconds": int64(20), "scroll_pct": int64(30)}),
		mkEvent(EventSearch, at(5), 11, "", map[string]interface{}{"query_hash": "aa", "query_text": "go", "result_count": int64(0)}),
		mkEvent(EventSearch, at(5), 12, "", map[string]interface{}{"query_hash": "aa", "result_count": int64(4)}),
		mkEvent(EventRecImpression, at(6), 11, "8", map[string]interface{}{"rec_id": "home"}),
		mkEvent(EventRecImpression, at(6), 12, "8", map[string]interface{}{"rec_id": "home"}),
		mkEvent(EventRecClick, at(7), 11, "8", map[string]interface{}{"rec_id": "home"}),
		mkEvent(EventCourseCompleted, at(8), 11, "8", nil),
	}
	svc.store.(*fakeStore).events = cls

	if err := svc.RunRollup(context.Background(), day); err != nil {
		t.Fatal(err)
	}
	get := func(kind, key string) *entity.AnalyticsRollup {
		for _, r := range store.rollups["2026-03-09"] {
			if r.Kind == kind && r.Key == key {
				return r
			}
		}
		t.Fatalf("missing rollup %s/%s", kind, key)
		return nil
	}
	site := get(KindSite, "all")
	if site.Counters["page_views"] != 3 || site.Counters["visitors"] != 2 || site.Counters["active_users"] != 2 || site.Counters["reads"] != 2 {
		t.Fatalf("site counters: %+v", site.Counters)
	}
	content := get(KindContent, "article:5")
	if content.Counters["views"] != 3 || content.Counters["unique_visitors"] != 2 || content.Counters["readers"] != 2 ||
		content.Counters["read_seconds"] != 80 || content.Counters["deep_reads"] != 1 {
		t.Fatalf("content counters: %+v", content.Counters)
	}
	search := get(KindSearch, "aa")
	if search.Counters["count"] != 2 || search.Counters["zero"] != 1 || search.Counters["results"] != 4 {
		t.Fatalf("search counters: %+v", search.Counters)
	}
	rec := get(KindRec, "home")
	if rec.Counters["impressions"] != 2 || rec.Counters["clicks"] != 1 || rec.Counters["completions"] != 1 {
		t.Fatalf("rec counters: %+v", rec.Counters)
	}

	ov, err := svc.Overview(context.Background(), day, day)
	if err != nil {
		t.Fatal(err)
	}
	if ov.Totals.PageViews != 3 || ov.Totals.NewUsers != 4 || ov.Totals.Enrollments != 2 || ov.Totals.Completions != 1 || ov.DAU != 2 || ov.WAU != 2 || ov.MAU != 2 {
		t.Fatalf("overview: %+v", ov)
	}
	cr, _ := svc.ContentReport(context.Background(), day, day, 10)
	if len(cr.Top) == 0 || cr.Top[0].ContentID != "5" || cr.Top[0].AvgReadSeconds != 40 || cr.Top[0].Title != "Title 5" || cr.Top[0].CompletionRate != 0.5 {
		t.Fatalf("content report: %+v", cr.Top)
	}
	sr, _ := svc.SearchReport(context.Background(), day, day, 10)
	if sr.TotalSearches != 2 || sr.ZeroRate != 0.5 || len(sr.ZeroResults) != 1 {
		t.Fatalf("search report: %+v", sr)
	}
	rr, _ := svc.Recommendations(context.Background(), day, day)
	if rr.Total.CTR != 0.5 || rr.Total.CompletionRate != 1 {
		t.Fatalf("rec report: %+v", rr.Total)
	}
	before := len(store.rollups["2026-03-09"])
	if rerun := svc.RunRollup(context.Background(), day); rerun != nil || len(store.rollups["2026-03-09"]) != before {
		t.Fatal("rollup must be idempotent")
	}
}

func TestCohortsFunnelAndEngagement(t *testing.T) {
	first := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	signups := []repository.SignupRow{{UserID: 1, CreatedAt: first.Add(time.Hour)}, {UserID: 2, CreatedAt: first.Add(2 * time.Hour)}}
	site := []*entity.AnalyticsRollup{
		{Kind: KindSite, DayTS: first.Add(24 * time.Hour), Users: []uint{1, 2}},
		{Kind: KindSite, DayTS: first.AddDate(0, 0, 8), Users: []uint{1}},
	}
	rows := computeCohorts(signups, site, first, 3)
	if rows[0].Size != 2 || rows[0].Retention[0] != 1 || rows[0].Retention[1] != 0.5 || rows[0].Retention[2] != 0 {
		t.Fatalf("cohort retention: %+v", rows[0])
	}
	steps := buildFunnel(100, 20, 10, 5)
	if steps[1].ConversionPrev != 0.2 || steps[3].ConversionPrev != 0.5 {
		t.Fatalf("funnel: %+v", steps)
	}

	now := time.Date(2026, 3, 30, 0, 0, 0, 0, time.UTC)
	active := scoreUser(repository.UserActivity{ID: 1, CreatedAt: now.AddDate(0, -3, 0), ActiveEnrollments: 1, CompletedEnrollment: 1},
		repository.UserEventStat{ActiveDays: 12, Reads: 15, LessonsComplete: 8, LastEventAt: now.AddDate(0, 0, -1)}, now)
	if active.Score != 100 || active.Level != "high" || active.AtRisk || active.ChurnRisk != "low" {
		t.Fatalf("active user: %+v", active)
	}
	lapsed := scoreUser(repository.UserActivity{ID: 2, CreatedAt: now.AddDate(0, -3, 0), ActiveEnrollments: 1},
		repository.UserEventStat{ActiveDays: 3, Reads: 2, LastEventAt: now.AddDate(0, 0, -20)}, now)
	if lapsed.ChurnRisk != "high" || !lapsed.AtRisk {
		t.Fatalf("lapsed learner with active enrollment should be high risk: %+v", lapsed)
	}
	fresh := scoreUser(repository.UserActivity{ID: 3, CreatedAt: now.AddDate(0, 0, -2)}, repository.UserEventStat{}, now)
	if fresh.ChurnRisk != "new" || fresh.AtRisk || fresh.Level != "dormant" {
		t.Fatalf("new user: %+v", fresh)
	}
}

func TestPurgeUser(t *testing.T) {
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	store := newFakeStore()
	svc := newTestService(t, store, nil, clk, 100)
	u1, u2 := uint(1), uint(2)
	id, ct := "4", "article"
	_ = svc.TrackEvent(context.Background(), EventArticleRead, &u1, &id, &ct, map[string]interface{}{"read_seconds": 5})
	_ = svc.TrackEvent(context.Background(), EventArticleRead, &u2, &id, &ct, map[string]interface{}{"read_seconds": 5})
	n, err := svc.PurgeUser(context.Background(), 1)
	if err != nil || n != 1 || len(store.events) != 1 || *store.events[0].UserID != 2 {
		t.Fatalf("purge removed %d err=%v remaining=%d", n, err, len(store.events))
	}
}

func TestDashboardIncludesTitles(t *testing.T) {
	clk := &clock{time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)}
	svc := newTestService(t, newFakeStore(), nil, clk, 10)
	stats, err := svc.GetDashboardStats(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	top := stats["top_content"].([]map[string]interface{})
	if top[0]["title"] != "Title 7" {
		t.Fatalf("title not joined: %+v", top[0])
	}
}

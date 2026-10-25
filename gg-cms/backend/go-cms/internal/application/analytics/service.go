package analytics

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const MaxBatch = 20

var (
	ErrEmptyBatch   = errors.New("no events supplied")
	ErrBatchTooBig  = errors.New("too many events in batch")
	ErrBadSchemaVer = errors.New("unsupported_schema_version")
)

type Config struct {
	IPSalt        string
	QueueSize     int
	BatchSize     int
	FlushInterval time.Duration
	DedupeWindow  time.Duration
	Now           func() time.Time
}

type IngestEvent struct {
	SchemaVersion int                    `json:"schemaVersion"`
	EventID       string                 `json:"eventId"`
	EventType     string                 `json:"eventType"`
	VisitorID     string                 `json:"visitorId"`
	SessionID     string                 `json:"sessionId"`
	ContentID     string                 `json:"contentId"`
	ContentType   string                 `json:"contentType"`
	ClientTS      *time.Time             `json:"clientTs"`
	Metadata      map[string]interface{} `json:"metadata"`
}

type IngestRequest struct {
	Consent bool          `json:"consent"`
	Events  []IngestEvent `json:"events"`
}

type IngestMeta struct {
	IP        string
	UserAgent string
	UserID    *uint
}

type IngestRejection struct {
	Index  int    `json:"index"`
	Reason string `json:"reason"`
}

type IngestResult struct {
	Accepted int               `json:"accepted"`
	Deduped  int               `json:"deduped"`
	Rejected []IngestRejection `json:"rejected"`
	Ignored  string            `json:"ignored,omitempty"`
}

type Service interface {
	TrackPageView(ctx context.Context, userID *uint, contentID, contentType *string, ip, userAgent string) error
	// TrackEvent records a server-side event (enrollment, completion, quiz, certificate, ...).
	TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error
	Ingest(ctx context.Context, req IngestRequest, meta IngestMeta) (*IngestResult, error)
	GetDashboardStats(ctx context.Context) (map[string]interface{}, error)
	GetContentViews(ctx context.Context, contentID, contentType string) (int64, error)

	Overview(ctx context.Context, from, to time.Time) (*Overview, error)
	ContentReport(ctx context.Context, from, to time.Time, limit int) (*ContentReport, error)
	SearchReport(ctx context.Context, from, to time.Time, limit int) (*SearchReport, error)
	Funnel(ctx context.Context, from, to time.Time) (*Funnel, error)
	Cohorts(ctx context.Context, weeks int) (*CohortReport, error)
	Recommendations(ctx context.Context, from, to time.Time) (*RecommendationReport, error)
	Engagement(ctx context.Context, page, size int) ([]UserEngagement, int64, error)

	RunRollup(ctx context.Context, day time.Time) error
	StartRollups(ctx context.Context, interval time.Duration)
	PurgeUser(ctx context.Context, userID uint) (int64, error)
	Flush(ctx context.Context)
	Close()
	QueueStats() (depth int, dropped int64)
}

type service struct {
	store repository.AnalyticsStore
	stats repository.PlatformStatsRepository
	cfg   Config
	salt  []byte

	ch      chan *entity.AnalyticsEvent
	kick    chan struct{}
	stop    chan struct{}
	wg      sync.WaitGroup
	flushMu sync.Mutex
	dropped atomic.Int64
	dedupe  *dedupeCache
	once    sync.Once
}

func NewService(store repository.AnalyticsStore, stats repository.PlatformStatsRepository, cfg Config) Service {
	if cfg.QueueSize <= 0 {
		cfg.QueueSize = 5000
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 200
	}
	if cfg.FlushInterval <= 0 {
		cfg.FlushInterval = 2 * time.Second
	}
	if cfg.DedupeWindow <= 0 {
		cfg.DedupeWindow = 30 * time.Minute
	}
	if cfg.Now == nil {
		cfg.Now = func() time.Time { return time.Now().UTC() }
	}
	salt := []byte(cfg.IPSalt)
	if len(salt) == 0 {
		salt = make([]byte, 32)
		_, _ = rand.Read(salt)
		logger.Warn("ANALYTICS_IP_SALT is not set: using a random per-process salt (visitor hashes reset on restart)")
	}
	s := &service{
		store: store, stats: stats, cfg: cfg, salt: salt,
		ch:     make(chan *entity.AnalyticsEvent, cfg.QueueSize),
		kick:   make(chan struct{}, 1),
		stop:   make(chan struct{}),
		dedupe: newDedupeCache(cfg.DedupeWindow),
	}
	s.wg.Add(1)
	go s.worker()
	return s
}

func (s *service) worker() {
	defer s.wg.Done()
	t := time.NewTicker(s.cfg.FlushInterval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			s.Flush(context.Background())
		case <-s.kick:
			s.Flush(context.Background())
		case <-s.stop:
			s.Flush(context.Background())
			return
		}
	}
}

func (s *service) Flush(ctx context.Context) {
	s.flushMu.Lock()
	defer s.flushMu.Unlock()
	for {
		batch := make([]*entity.AnalyticsEvent, 0, s.cfg.BatchSize)
	drain:
		for len(batch) < s.cfg.BatchSize {
			select {
			case e := <-s.ch:
				batch = append(batch, e)
			default:
				break drain
			}
		}
		if len(batch) == 0 {
			return
		}
		c, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		err := s.store.InsertEvents(c, batch)
		cancel()
		if err != nil {
			s.dropped.Add(int64(len(batch)))
			logger.Warn("analytics: batch insert failed", zap.Int("events", len(batch)), zap.Error(err))
		}
	}
}

func (s *service) Close() {
	s.once.Do(func() {
		close(s.stop)
		s.wg.Wait()
	})
}

func (s *service) QueueStats() (int, int64) { return len(s.ch), s.dropped.Load() }

func (s *service) enqueue(e *entity.AnalyticsEvent) bool {
	select {
	case s.ch <- e:
		if len(s.ch) >= s.cfg.BatchSize {
			select {
			case s.kick <- struct{}{}:
			default:
			}
		}
		return true
	default:
		s.dropped.Add(1)
		return false
	}
}

func (s *service) newEvent(eventType string) *entity.AnalyticsEvent {
	return &entity.AnalyticsEvent{
		SchemaVersion: entity.AnalyticsSchemaVersion,
		EventID:       uuid.NewString(),
		EventType:     eventType,
		CreatedAt:     s.cfg.Now(),
	}
}

func (s *service) TrackPageView(_ context.Context, userID *uint, contentID, contentType *string, ip, userAgent string) error {
	if IsBot(userAgent) {
		return nil
	}
	ipHash := hashIP(s.salt, ip)
	key := "ip:" + ipHash + "|" + deref(contentType) + ":" + deref(contentID)
	if s.dedupe.seen(key, s.cfg.Now()) {
		return nil
	}
	e := s.newEvent(EventPageView)
	e.UserID = userID
	e.ContentID, e.ContentType = contentID, contentType
	e.IPHash = ipHash
	e.UserAgent = cleanString(userAgent, 120)
	e.Source = "server"
	e.Anonymous = userID == nil
	s.enqueue(e)
	return nil
}

func (s *service) TrackEvent(_ context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error {
	clean, err := sanitizeMetadata(eventType, metadata, true, s.salt)
	if err != nil {
		return fmt.Errorf("analytics: %s: %w", eventType, err)
	}
	e := s.newEvent(eventType)
	e.UserID = userID
	e.ContentID = contentID
	if contentType != nil {
		ct := normaliseContentType(*contentType)
		e.ContentType = &ct
	}
	if len(clean) > 0 {
		e.Metadata = clean
	}
	e.Source = "server"
	e.Anonymous = userID == nil
	s.enqueue(e)
	return nil
}

func (s *service) Ingest(_ context.Context, req IngestRequest, meta IngestMeta) (*IngestResult, error) {
	if len(req.Events) == 0 {
		return nil, ErrEmptyBatch
	}
	if len(req.Events) > MaxBatch {
		return nil, ErrBatchTooBig
	}
	res := &IngestResult{Rejected: []IngestRejection{}}
	if IsBot(meta.UserAgent) {
		res.Ignored = "bot"
		return res, nil
	}
	now := s.cfg.Now()
	ipHash := hashIP(s.salt, meta.IP)
	for i, ev := range req.Events {
		e, reason := s.buildIngestEvent(ev, req.Consent, meta, ipHash, now)
		if reason != "" {
			res.Rejected = append(res.Rejected, IngestRejection{Index: i, Reason: reason})
			continue
		}
		if e.EventType == EventPageView {
			key := "ip:" + ipHash + "|" + deref(e.ContentType) + ":" + deref(e.ContentID)
			if e.VisitorID != "" {
				key = "v:" + e.VisitorID + "|" + deref(e.ContentType) + ":" + deref(e.ContentID)
			}
			if s.dedupe.seen(key, now) {
				res.Deduped++
				continue
			}
		}
		if s.enqueue(e) {
			res.Accepted++
		} else {
			res.Rejected = append(res.Rejected, IngestRejection{Index: i, Reason: "queue_full"})
		}
	}
	return res, nil
}

func (s *service) buildIngestEvent(ev IngestEvent, consent bool, meta IngestMeta, ipHash string, now time.Time) (*entity.AnalyticsEvent, string) {
	if ev.SchemaVersion != entity.AnalyticsSchemaVersion {
		return nil, ErrBadSchemaVer.Error()
	}
	spec, ok := eventSpecs[ev.EventType]
	if !ok {
		return nil, "unknown_event_type"
	}
	if !spec.public {
		return nil, "server_only_event_type"
	}
	if !idPattern.MatchString(ev.EventID) {
		return nil, "invalid_event_id"
	}
	if consent {
		if ev.VisitorID != "" && !idPattern.MatchString(ev.VisitorID) {
			return nil, "invalid_visitor_id"
		}
		if ev.SessionID != "" && !idPattern.MatchString(ev.SessionID) {
			return nil, "invalid_session_id"
		}
	}
	e := s.newEvent(ev.EventType)
	e.EventID = ev.EventID
	if spec.needsContent {
		if !contentPattern.MatchString(ev.ContentID) || !validContentTypes[ev.ContentType] {
			return nil, "invalid_content_ref"
		}
		id, typ := ev.ContentID, ev.ContentType
		e.ContentID, e.ContentType = &id, &typ
	}
	clean, err := sanitizeMetadata(ev.EventType, ev.Metadata, consent, s.salt)
	if err != nil {
		return nil, "invalid_metadata"
	}
	if len(clean) > 0 {
		e.Metadata = clean
	}
	if ev.ClientTS != nil && ev.ClientTS.After(now.Add(-7*24*time.Hour)) && ev.ClientTS.Before(now.Add(5*time.Minute)) {
		t := ev.ClientTS.UTC()
		e.ClientTS = &t
	}
	e.Source = "client"
	e.UserAgent = cleanString(meta.UserAgent, 120)
	if consent {
		e.VisitorID, e.SessionID = ev.VisitorID, ev.SessionID
		e.UserID = meta.UserID
		e.IPHash = ipHash
	} else {
		e.Anonymous = true
		e.UserAgent = ""
	}
	return e, ""
}

func (s *service) GetDashboardStats(ctx context.Context) (map[string]interface{}, error) {
	stats, err := s.store.GetDashboardStats(ctx)
	if err != nil {
		return nil, err
	}
	top, _ := stats["top_content"].([]map[string]interface{})
	refs := make([]repository.ContentRef, 0, len(top))
	for _, row := range top {
		refs = append(refs, repository.ContentRef{Type: fmt.Sprint(row["contentType"]), ID: fmt.Sprint(row["contentId"])})
	}
	if s.stats != nil && len(refs) > 0 {
		if info, err := s.stats.ContentInfo(ctx, refs); err == nil {
			for _, row := range top {
				if ci, ok := info[repository.ContentRef{Type: fmt.Sprint(row["contentType"]), ID: fmt.Sprint(row["contentId"])}.Key()]; ok {
					row["title"], row["slug"] = ci.Title, ci.Slug
				}
			}
		}
	}
	return stats, nil
}

func (s *service) GetContentViews(ctx context.Context, contentID, contentType string) (int64, error) {
	return s.store.GetContentViews(ctx, contentID, contentType)
}

func (s *service) PurgeUser(ctx context.Context, userID uint) (int64, error) {
	s.Flush(ctx)
	return s.store.DeleteByUser(ctx, userID)
}

// LegacyTracker is the pre-v1 server-side tracking signature (with ip and user agent).
// The ip and user agent are ignored: server events never store them.
type LegacyTracker struct{ Service }

func (l LegacyTracker) TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}, _, _ string) error {
	return l.Service.TrackEvent(ctx, eventType, userID, contentID, contentType, metadata)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}

type dedupeCache struct {
	mu     sync.Mutex
	window time.Duration
	m      map[string]time.Time
}

func newDedupeCache(window time.Duration) *dedupeCache {
	return &dedupeCache{window: window, m: make(map[string]time.Time)}
}

// seen reports whether key was recorded within the window, recording it otherwise.
func (d *dedupeCache) seen(key string, now time.Time) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if t, ok := d.m[key]; ok && now.Sub(t) < d.window {
		return true
	}
	if len(d.m) >= 100000 {
		for k, t := range d.m {
			if now.Sub(t) >= d.window {
				delete(d.m, k)
			}
		}
		if len(d.m) >= 100000 {
			d.m = make(map[string]time.Time)
		}
	}
	d.m[key] = now
	return false
}

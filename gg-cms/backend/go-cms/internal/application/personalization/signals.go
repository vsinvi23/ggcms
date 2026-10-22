package personalization

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
)

const (
	defaultFeedTTL       = 60 * time.Second
	defaultCandidateTTL  = 60 * time.Second
	defaultPopularityTTL = 10 * time.Minute
	maxCachedFeeds       = 5000
)

type FavouriteLister interface {
	ListByUser(ctx context.Context, userID uint, page, size int) ([]*entity.Favourite, int64, error)
}

type ReactionCounter interface {
	CountBySentiment(ctx context.Context, contentType string, contentID uint) (likes, dislikes int64, err error)
}

type ViewCounter interface {
	GetContentViews(ctx context.Context, contentID, contentType string) (int64, error)
}

type PathLister interface {
	FindAll(ctx context.Context, kind string) ([]*entity.LearningPath, error)
}

type Option func(*service)

func WithFavourites(f FavouriteLister) Option { return func(s *service) { s.favourites = f } }
func WithReactions(r ReactionCounter) Option  { return func(s *service) { s.reactions = r } }
func WithViews(v ViewCounter) Option          { return func(s *service) { s.views = v } }
func WithPaths(p PathLister) Option           { return func(s *service) { s.paths = p } }
func WithClock(now func() time.Time) Option   { return func(s *service) { s.now = now } }
func WithRecIDGenerator(g func() string) Option {
	return func(s *service) { s.idGen = g }
}
func WithFeedTTL(d time.Duration) Option { return func(s *service) { s.feedTTL = d } }

type feedKey struct {
	user  uint
	limit int
}

type feedEntry struct {
	feed *Feed
	exp  time.Time
}

type candidateEntry struct {
	articles []*entity.Article
	courses  []*entity.Course
	exp      time.Time
}

type popEntry struct {
	raw float64
	exp time.Time
}

type signals struct {
	favourites FavouriteLister
	reactions  ReactionCounter
	views      ViewCounter
	paths      PathLister
	now        func() time.Time
	idGen      func() string
	feedTTL    time.Duration

	mu         sync.Mutex
	feeds      map[feedKey]feedEntry
	candidates *candidateEntry
	pop        map[string]popEntry
}

func newSignals() signals {
	return signals{
		now:     time.Now,
		feedTTL: defaultFeedTTL,
		feeds:   map[feedKey]feedEntry{},
		pop:     map[string]popEntry{},
	}
}

func (s *signals) newRecID() string {
	if s.idGen != nil {
		return s.idGen()
	}
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "rec_" + hex.EncodeToString(b)
}

func (s *signals) cachedFeed(k feedKey) (*Feed, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.feeds[k]
	if !ok || !s.now().Before(e.exp) {
		return nil, false
	}
	return e.feed, true
}

func (s *signals) storeFeed(k feedKey, f *Feed) {
	if s.feedTTL <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.feeds) >= maxCachedFeeds {
		s.feeds = map[feedKey]feedEntry{}
	}
	s.feeds[k] = feedEntry{feed: f, exp: s.now().Add(s.feedTTL)}
}

// InvalidateUser drops every cached feed for the user. Call it whenever the user's
// enrollments, progress or profile change.
func (s *signals) InvalidateUser(userID uint) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k := range s.feeds {
		if k.user == userID {
			delete(s.feeds, k)
		}
	}
}

type Tracker interface {
	TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error
}

type invalidatingTracker struct {
	next Tracker
	inv  interface{ InvalidateUser(userID uint) }
}

// WrapTracker returns a Tracker that invalidates the user's cached recommendations
// on enrollment/progress events before delegating to next (which may be nil).
func WrapTracker(next Tracker, svc Service) Tracker {
	return invalidatingTracker{next: next, inv: svc}
}

func (t invalidatingTracker) TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}) error {
	if userID != nil {
		switch eventType {
		case "course_enrolled", "lesson_completed", "course_completed", "certificate_issued":
			t.inv.InvalidateUser(*userID)
		}
	}
	if t.next == nil {
		return nil
	}
	return t.next.TrackEvent(ctx, eventType, userID, contentID, contentType, metadata)
}

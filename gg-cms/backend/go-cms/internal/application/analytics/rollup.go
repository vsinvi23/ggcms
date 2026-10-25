package analytics

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const (
	KindSite    = "site"
	KindContent = "content"
	KindSearch  = "search"
	KindRec     = "rec"
)

const dayLayout = "2006-01-02"

type contentAgg struct {
	typ, id  string
	counters map[string]int64
	viewers  map[string]struct{}
	readers  map[string]struct{}
}

type simpleAgg struct {
	label    string
	counters map[string]int64
}

// rollupBuilder folds one UTC day of raw events into daily rollup buckets.
type rollupBuilder struct {
	day      time.Time
	site     map[string]int64
	users    map[uint]struct{}
	visitors map[string]struct{}
	sessions map[string]struct{}
	content  map[string]*contentAgg
	search   map[string]*simpleAgg
	rec      map[string]*simpleAgg
	clicked  map[string]string
}

func newRollupBuilder(day time.Time) *rollupBuilder {
	return &rollupBuilder{
		day:      day.UTC().Truncate(24 * time.Hour),
		site:     map[string]int64{},
		users:    map[uint]struct{}{},
		visitors: map[string]struct{}{},
		sessions: map[string]struct{}{},
		content:  map[string]*contentAgg{},
		search:   map[string]*simpleAgg{},
		rec:      map[string]*simpleAgg{},
		clicked:  map[string]string{},
	}
}

func identity(e *entity.AnalyticsEvent) string {
	switch {
	case e.UserID != nil:
		return fmt.Sprintf("u:%d", *e.UserID)
	case e.VisitorID != "":
		return "v:" + e.VisitorID
	case e.IPHash != "":
		return "i:" + e.IPHash
	}
	return ""
}

func metaInt(m map[string]interface{}, k string) int64 {
	n, _ := toInt(m[k])
	return n
}

func metaStr(m map[string]interface{}, k string) string {
	s, _ := m[k].(string)
	return s
}

func (b *rollupBuilder) contentFor(e *entity.AnalyticsEvent) *contentAgg {
	if e.ContentID == nil || e.ContentType == nil {
		return nil
	}
	key := *e.ContentType + ":" + *e.ContentID
	c, ok := b.content[key]
	if !ok {
		c = &contentAgg{typ: *e.ContentType, id: *e.ContentID, counters: map[string]int64{}, viewers: map[string]struct{}{}, readers: map[string]struct{}{}}
		b.content[key] = c
	}
	return c
}

func simpleFor(m map[string]*simpleAgg, key, label string) *simpleAgg {
	a, ok := m[key]
	if !ok {
		a = &simpleAgg{label: label, counters: map[string]int64{}}
		m[key] = a
	}
	if a.label == "" {
		a.label = label
	}
	return a
}

func (b *rollupBuilder) Add(e *entity.AnalyticsEvent) {
	b.site["events"]++
	id := identity(e)
	if e.UserID != nil {
		b.users[*e.UserID] = struct{}{}
	}
	if id != "" && e.EventType == EventPageView {
		b.visitors[id] = struct{}{}
	}
	if e.SessionID != "" {
		b.sessions[e.SessionID] = struct{}{}
	}
	c := b.contentFor(e)
	switch e.EventType {
	case EventPageView:
		b.site["page_views"]++
		if c != nil {
			c.counters["views"]++
			if id != "" {
				c.viewers[id] = struct{}{}
			}
		}
	case EventArticleRead:
		b.site["reads"]++
		if c != nil {
			c.counters["reads"]++
			c.counters["read_seconds"] += metaInt(e.Metadata, "read_seconds")
			if metaInt(e.Metadata, "scroll_pct") >= 80 {
				c.counters["deep_reads"]++
			}
			if id != "" {
				c.readers[id] = struct{}{}
			}
		}
	case EventSearch:
		b.site["searches"]++
		a := simpleFor(b.search, metaStr(e.Metadata, "query_hash"), metaStr(e.Metadata, "query_text"))
		a.counters["count"]++
		n := metaInt(e.Metadata, "result_count")
		a.counters["results"] += n
		if n == 0 {
			a.counters["zero"]++
		}
	case EventCourseEnrolled:
		b.site["enrollments"]++
		if c != nil {
			c.counters["enrollments"]++
		}
	case EventLessonCompleted:
		b.site["lessons_completed"]++
		if c != nil {
			c.counters["lesson_completions"]++
		}
	case EventCourseCompleted:
		b.site["completions"]++
		if c != nil {
			c.counters["completions"]++
			if e.UserID != nil {
				if recKey, ok := b.clicked[fmt.Sprintf("%d|%s:%s", *e.UserID, c.typ, c.id)]; ok {
					b.rec[recKey].counters["completions"]++
				}
			}
		}
	case EventQuizAttempted:
		b.site["quiz_attempts"]++
	case EventCertificateIssued:
		b.site["certificates"]++
	case EventRecImpression, EventRecClick:
		recID := metaStr(e.Metadata, "rec_id")
		if recID == "" {
			recID = "default"
		}
		a := simpleFor(b.rec, recID, "")
		if e.EventType == EventRecImpression {
			a.counters["impressions"]++
			if c != nil {
				c.counters["rec_impressions"]++
			}
		} else {
			a.counters["clicks"]++
			if c != nil {
				c.counters["rec_clicks"]++
				if e.UserID != nil {
					b.clicked[fmt.Sprintf("%d|%s:%s", *e.UserID, c.typ, c.id)] = recID
				}
			}
		}
	}
}

func (b *rollupBuilder) Rollups() []*entity.AnalyticsRollup {
	day := b.day.Format(dayLayout)
	mk := func(kind, key, label string, counters map[string]int64) *entity.AnalyticsRollup {
		return &entity.AnalyticsRollup{ID: day + "|" + kind + "|" + key, Day: day, DayTS: b.day, Kind: kind, Key: key, Label: label, Counters: counters}
	}
	var out []*entity.AnalyticsRollup
	site := mk(KindSite, "all", "", b.site)
	site.Counters["active_users"] = int64(len(b.users))
	site.Counters["visitors"] = int64(len(b.visitors))
	site.Counters["sessions"] = int64(len(b.sessions))
	for u := range b.users {
		site.Users = append(site.Users, u)
	}
	sort.Slice(site.Users, func(i, j int) bool { return site.Users[i] < site.Users[j] })
	out = append(out, site)
	for key, c := range b.content {
		c.counters["unique_visitors"] = int64(len(c.viewers))
		c.counters["readers"] = int64(len(c.readers))
		out = append(out, mk(KindContent, key, "", c.counters))
	}
	for key, a := range b.search {
		out = append(out, mk(KindSearch, key, a.label, a.counters))
	}
	for key, a := range b.rec {
		out = append(out, mk(KindRec, key, "", a.counters))
	}
	return out
}

func (s *service) RunRollup(ctx context.Context, day time.Time) error {
	s.Flush(ctx)
	from := day.UTC().Truncate(24 * time.Hour)
	b := newRollupBuilder(from)
	if err := s.store.EventsBetween(ctx, from, from.Add(24*time.Hour), b.Add); err != nil {
		return err
	}
	return s.store.ReplaceRollups(ctx, from.Format(dayLayout), b.Rollups())
}

// StartRollups backfills missing days (within raw retention) then refreshes today and
// yesterday on every tick. Rollups are idempotent per day, so multiple instances are safe.
func (s *service) StartRollups(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Hour
	}
	go func() {
		now := s.cfg.Now().Truncate(24 * time.Hour)
		for d := 30; d >= 2; d-- {
			day := now.AddDate(0, 0, -d)
			if has, err := s.store.HasRollups(ctx, day.Format(dayLayout)); err == nil && !has {
				if err := s.RunRollup(ctx, day); err != nil {
					logger.Warn("analytics: backfill rollup failed", zap.String("day", day.Format(dayLayout)), zap.Error(err))
				}
			}
		}
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			now := s.cfg.Now().Truncate(24 * time.Hour)
			for _, day := range []time.Time{now.AddDate(0, 0, -1), now} {
				if err := s.RunRollup(ctx, day); err != nil {
					logger.Warn("analytics: rollup failed", zap.String("day", day.Format(dayLayout)), zap.Error(err))
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-t.C:
			}
		}
	}()
}

package analytics

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

const staleAfter = 180 * 24 * time.Hour

type OverviewPoint struct {
	Day         string `json:"day"`
	ActiveUsers int64  `json:"activeUsers"`
	Visitors    int64  `json:"visitors"`
	PageViews   int64  `json:"pageViews"`
	NewUsers    int64  `json:"newUsers"`
	Enrollments int64  `json:"enrollments"`
	Completions int64  `json:"completions"`
}

type OverviewTotals struct {
	PageViews   int64 `json:"pageViews"`
	Reads       int64 `json:"reads"`
	Searches    int64 `json:"searches"`
	NewUsers    int64 `json:"newUsers"`
	Enrollments int64 `json:"enrollments"`
	Completions int64 `json:"completions"`
}

type Overview struct {
	From     string          `json:"from"`
	To       string          `json:"to"`
	DAU      int             `json:"dau"`
	WAU      int             `json:"wau"`
	MAU      int             `json:"mau"`
	Totals   OverviewTotals  `json:"totals"`
	Timeline []OverviewPoint `json:"timeline"`
}

func dayStart(t time.Time) time.Time { return t.UTC().Truncate(24 * time.Hour) }

func normaliseRange(from, to, now time.Time) (time.Time, time.Time) {
	if to.IsZero() {
		to = now
	}
	to = dayStart(to).Add(24 * time.Hour)
	if from.IsZero() {
		from = to.AddDate(0, 0, -30)
	}
	from = dayStart(from)
	if !from.Before(to) {
		from = to.AddDate(0, 0, -1)
	}
	if to.Sub(from) > 366*24*time.Hour {
		from = to.AddDate(0, 0, -366)
	}
	return from, to
}

func unionUsers(site []*entity.AnalyticsRollup, from, to time.Time) int {
	set := map[uint]struct{}{}
	for _, r := range site {
		if !r.DayTS.Before(from) && r.DayTS.Before(to) {
			for _, u := range r.Users {
				set[u] = struct{}{}
			}
		}
	}
	return len(set)
}

func computeOverview(site []*entity.AnalyticsRollup, newUsers, enrolls, completes []repository.DayCount, from, to time.Time) *Overview {
	byDay := map[string]*OverviewPoint{}
	for d := from; d.Before(to); d = d.AddDate(0, 0, 1) {
		k := d.Format(dayLayout)
		byDay[k] = &OverviewPoint{Day: k}
	}
	ov := &Overview{From: from.Format(dayLayout), To: to.AddDate(0, 0, -1).Format(dayLayout)}
	for _, r := range site {
		p, ok := byDay[r.Day]
		if !ok {
			continue
		}
		p.ActiveUsers, p.Visitors, p.PageViews = r.Counters["active_users"], r.Counters["visitors"], r.Counters["page_views"]
		ov.Totals.PageViews += r.Counters["page_views"]
		ov.Totals.Reads += r.Counters["reads"]
		ov.Totals.Searches += r.Counters["searches"]
	}
	apply := func(rows []repository.DayCount, set func(*OverviewPoint, int64), total *int64) {
		for _, c := range rows {
			if p, ok := byDay[c.Day]; ok {
				set(p, c.Count)
				*total += c.Count
			}
		}
	}
	apply(newUsers, func(p *OverviewPoint, n int64) { p.NewUsers = n }, &ov.Totals.NewUsers)
	apply(enrolls, func(p *OverviewPoint, n int64) { p.Enrollments = n }, &ov.Totals.Enrollments)
	apply(completes, func(p *OverviewPoint, n int64) { p.Completions = n }, &ov.Totals.Completions)
	for d := from; d.Before(to); d = d.AddDate(0, 0, 1) {
		ov.Timeline = append(ov.Timeline, *byDay[d.Format(dayLayout)])
	}
	ov.DAU = unionUsers(site, to.AddDate(0, 0, -1), to)
	ov.WAU = unionUsers(site, to.AddDate(0, 0, -7), to)
	ov.MAU = unionUsers(site, to.AddDate(0, 0, -30), to)
	return ov
}

func (s *service) Overview(ctx context.Context, from, to time.Time) (*Overview, error) {
	from, to = normaliseRange(from, to, s.cfg.Now())
	siteFrom := from
	if m := to.AddDate(0, 0, -30); m.Before(siteFrom) {
		siteFrom = m
	}
	site, err := s.store.RollupsBetween(ctx, KindSite, siteFrom, to)
	if err != nil {
		return nil, err
	}
	nu, err := s.stats.NewUsersByDay(ctx, from, to)
	if err != nil {
		return nil, err
	}
	en, err := s.stats.EnrollmentsByDay(ctx, from, to)
	if err != nil {
		return nil, err
	}
	co, err := s.stats.CompletionsByDay(ctx, from, to)
	if err != nil {
		return nil, err
	}
	return computeOverview(site, nu, en, co, from, to), nil
}

type ContentRow struct {
	ContentType    string  `json:"contentType"`
	ContentID      string  `json:"contentId"`
	Title          string  `json:"title"`
	Slug           string  `json:"slug,omitempty"`
	Views          int64   `json:"views"`
	UniqueVisitors int64   `json:"uniqueVisitors"`
	UniqueReaders  int64   `json:"uniqueReaders"`
	AvgReadSeconds float64 `json:"avgReadSeconds"`
	CompletionRate float64 `json:"completionRate"`
	Enrollments    int64   `json:"enrollments"`
	Completions    int64   `json:"completions"`
	TrendPct       float64 `json:"trendPct"`
}

type StaleRow struct {
	ContentType string    `json:"contentType"`
	ContentID   string    `json:"contentId"`
	Title       string    `json:"title"`
	Slug        string    `json:"slug,omitempty"`
	Views       int64     `json:"views"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ContentReport struct {
	From     string       `json:"from"`
	To       string       `json:"to"`
	Top      []ContentRow `json:"top"`
	Trending []ContentRow `json:"trending"`
	Stale    []StaleRow   `json:"stale"`
}

type contentTotals struct {
	typ, id                                                 string
	views, unique, readers, reads, seconds, deep, enr, comp int64
	recentViews, prevViews                                  int64
}

func rate(n, d int64) float64 {
	if d <= 0 {
		return 0
	}
	return math.Round(float64(n)/float64(d)*10000) / 10000
}

func aggregateContent(rows []*entity.AnalyticsRollup, from, to time.Time) map[string]*contentTotals {
	recentFrom := to.AddDate(0, 0, -7)
	prevFrom := to.AddDate(0, 0, -14)
	out := map[string]*contentTotals{}
	for _, r := range rows {
		t, ok := out[r.Key]
		if !ok {
			t = &contentTotals{}
			t.typ, t.id = splitKey(r.Key)
			out[r.Key] = t
		}
		if !r.DayTS.Before(recentFrom) {
			t.recentViews += r.Counters["views"]
		} else if !r.DayTS.Before(prevFrom) {
			t.prevViews += r.Counters["views"]
		}
		if r.DayTS.Before(from) {
			continue
		}
		c := r.Counters
		t.views += c["views"]
		t.unique += c["unique_visitors"]
		t.readers += c["readers"]
		t.reads += c["reads"]
		t.seconds += c["read_seconds"]
		t.deep += c["deep_reads"]
		t.enr += c["enrollments"]
		t.comp += c["completions"]
	}
	return out
}

func splitKey(key string) (string, string) {
	for i := 0; i < len(key); i++ {
		if key[i] == ':' {
			return key[:i], key[i+1:]
		}
	}
	return "", key
}

func (t *contentTotals) row() ContentRow {
	r := ContentRow{
		ContentType: t.typ, ContentID: t.id, Views: t.views, UniqueVisitors: t.unique, UniqueReaders: t.readers,
		Enrollments: t.enr, Completions: t.comp,
	}
	if t.reads > 0 {
		r.AvgReadSeconds = math.Round(float64(t.seconds)/float64(t.reads)*10) / 10
	}
	if t.enr > 0 {
		r.CompletionRate = rate(t.comp, t.enr)
	} else {
		r.CompletionRate = rate(t.deep, t.reads)
	}
	r.TrendPct = math.Round((float64(t.recentViews)-float64(t.prevViews))/math.Max(float64(t.prevViews), 1)*1000) / 10
	return r
}

func (s *service) ContentReport(ctx context.Context, from, to time.Time, limit int) (*ContentReport, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	from, to = normaliseRange(from, to, s.cfg.Now())
	rows, err := s.store.RollupsBetween(ctx, KindContent, minTime(from, to.AddDate(0, 0, -14)), to)
	if err != nil {
		return nil, err
	}
	totals := aggregateContent(rows, from, to)
	all := make([]ContentRow, 0, len(totals))
	for _, t := range totals {
		if t.views > 0 || t.reads > 0 || t.enr > 0 {
			all = append(all, t.row())
		}
	}
	top := append([]ContentRow(nil), all...)
	sort.Slice(top, func(i, j int) bool { return top[i].Views > top[j].Views })
	trending := make([]ContentRow, 0)
	for _, r := range all {
		if r.TrendPct > 0 && totals[r.ContentType+":"+r.ContentID].recentViews >= 5 {
			trending = append(trending, r)
		}
	}
	sort.Slice(trending, func(i, j int) bool { return trending[i].TrendPct > trending[j].TrendPct })
	top, trending = capRows(top, limit), capRows(trending, limit)

	published, err := s.stats.PublishedContent(ctx, 500)
	if err != nil {
		return nil, err
	}
	stale := make([]StaleRow, 0)
	cutoff := s.cfg.Now().Add(-staleAfter)
	for _, p := range published {
		if p.UpdatedAt.After(cutoff) {
			continue
		}
		var views int64
		if t, ok := totals[p.Type+":"+p.ID]; ok {
			views = t.views
		}
		stale = append(stale, StaleRow{ContentType: p.Type, ContentID: p.ID, Title: p.Title, Slug: p.Slug, Views: views, UpdatedAt: p.UpdatedAt})
	}
	sort.Slice(stale, func(i, j int) bool {
		if stale[i].Views != stale[j].Views {
			return stale[i].Views < stale[j].Views
		}
		return stale[i].UpdatedAt.Before(stale[j].UpdatedAt)
	})
	if len(stale) > limit {
		stale = stale[:limit]
	}

	refs := make([]repository.ContentRef, 0, len(top)+len(trending))
	for _, r := range append(append([]ContentRow(nil), top...), trending...) {
		refs = append(refs, repository.ContentRef{Type: r.ContentType, ID: r.ContentID})
	}
	if info, err := s.stats.ContentInfo(ctx, refs); err == nil {
		for _, list := range [][]ContentRow{top, trending} {
			for i := range list {
				if ci, ok := info[list[i].ContentType+":"+list[i].ContentID]; ok {
					list[i].Title, list[i].Slug = ci.Title, ci.Slug
				}
			}
		}
	}
	return &ContentReport{From: from.Format(dayLayout), To: to.AddDate(0, 0, -1).Format(dayLayout), Top: top, Trending: trending, Stale: stale}, nil
}

func capRows(rows []ContentRow, n int) []ContentRow {
	if len(rows) > n {
		return rows[:n]
	}
	return rows
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

type SearchRow struct {
	QueryHash  string  `json:"queryHash"`
	QueryText  string  `json:"queryText,omitempty"`
	Count      int64   `json:"count"`
	ZeroCount  int64   `json:"zeroResultCount"`
	AvgResults float64 `json:"avgResults"`
}

type SearchReport struct {
	From          string      `json:"from"`
	To            string      `json:"to"`
	TotalSearches int64       `json:"totalSearches"`
	ZeroRate      float64     `json:"zeroResultRate"`
	Top           []SearchRow `json:"top"`
	ZeroResults   []SearchRow `json:"zeroResults"`
}

func computeSearch(rows []*entity.AnalyticsRollup, limit int) (top, zero []SearchRow, total, zeroTotal int64) {
	agg := map[string]*SearchRow{}
	results := map[string]int64{}
	for _, r := range rows {
		a, ok := agg[r.Key]
		if !ok {
			a = &SearchRow{QueryHash: r.Key}
			agg[r.Key] = a
		}
		if a.QueryText == "" {
			a.QueryText = r.Label
		}
		a.Count += r.Counters["count"]
		a.ZeroCount += r.Counters["zero"]
		results[r.Key] += r.Counters["results"]
		total += r.Counters["count"]
		zeroTotal += r.Counters["zero"]
	}
	for k, a := range agg {
		if a.Count > 0 {
			a.AvgResults = math.Round(float64(results[k])/float64(a.Count)*10) / 10
		}
		top = append(top, *a)
		if a.ZeroCount > 0 {
			zero = append(zero, *a)
		}
	}
	sort.Slice(top, func(i, j int) bool { return top[i].Count > top[j].Count })
	sort.Slice(zero, func(i, j int) bool { return zero[i].ZeroCount > zero[j].ZeroCount })
	if len(top) > limit {
		top = top[:limit]
	}
	if len(zero) > limit {
		zero = zero[:limit]
	}
	return
}

func (s *service) SearchReport(ctx context.Context, from, to time.Time, limit int) (*SearchReport, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	from, to = normaliseRange(from, to, s.cfg.Now())
	rows, err := s.store.RollupsBetween(ctx, KindSearch, from, to)
	if err != nil {
		return nil, err
	}
	top, zero, total, zeroTotal := computeSearch(rows, limit)
	if top == nil {
		top = []SearchRow{}
	}
	if zero == nil {
		zero = []SearchRow{}
	}
	return &SearchReport{From: from.Format(dayLayout), To: to.AddDate(0, 0, -1).Format(dayLayout), TotalSearches: total, ZeroRate: rate(zeroTotal, total), Top: top, ZeroResults: zero}, nil
}

type FunnelStep struct {
	Step           string  `json:"step"`
	Count          int64   `json:"count"`
	ConversionPrev float64 `json:"conversionFromPrevious"`
}

type Funnel struct {
	From  string       `json:"from"`
	To    string       `json:"to"`
	Steps []FunnelStep `json:"steps"`
	Note  string       `json:"note"`
}

func buildFunnel(visitors, signups, enrolled, completed int64) []FunnelStep {
	counts := []int64{visitors, signups, enrolled, completed}
	names := []string{"visit", "signup", "enroll", "complete"}
	steps := make([]FunnelStep, len(counts))
	for i, c := range counts {
		steps[i] = FunnelStep{Step: names[i], Count: c}
		if i > 0 {
			steps[i].ConversionPrev = rate(c, counts[i-1])
		}
	}
	return steps
}

func (s *service) Funnel(ctx context.Context, from, to time.Time) (*Funnel, error) {
	from, to = normaliseRange(from, to, s.cfg.Now())
	site, err := s.store.RollupsBetween(ctx, KindSite, from, to)
	if err != nil {
		return nil, err
	}
	var visitors int64
	for _, r := range site {
		visitors += r.Counters["visitors"]
	}
	signups, err := s.stats.SignupsBetween(ctx, from, to)
	if err != nil {
		return nil, err
	}
	enrolled, err := s.stats.DistinctEnrollers(ctx, from, to)
	if err != nil {
		return nil, err
	}
	completed, err := s.stats.DistinctCompleters(ctx, from, to)
	if err != nil {
		return nil, err
	}
	return &Funnel{
		From: from.Format(dayLayout), To: to.AddDate(0, 0, -1).Format(dayLayout),
		Steps: buildFunnel(visitors, int64(len(signups)), enrolled, completed),
		Note:  "visit = sum of daily distinct consented/hashed visitors on page views (a returning visitor counts once per day)",
	}, nil
}

type CohortRow struct {
	CohortWeek string    `json:"cohortWeek"`
	Size       int       `json:"size"`
	Retention  []float64 `json:"retention"`
}

type CohortReport struct {
	Weeks   int         `json:"weeks"`
	Cohorts []CohortRow `json:"cohorts"`
}

func weekStart(t time.Time) time.Time {
	d := dayStart(t)
	off := (int(d.Weekday()) + 6) % 7
	return d.AddDate(0, 0, -off)
}

func computeCohorts(signups []repository.SignupRow, site []*entity.AnalyticsRollup, firstWeek time.Time, weeks int) []CohortRow {
	activity := map[uint]map[int]bool{}
	for _, r := range site {
		w := int(weekStart(r.DayTS).Sub(firstWeek) / (7 * 24 * time.Hour))
		for _, u := range r.Users {
			if activity[u] == nil {
				activity[u] = map[int]bool{}
			}
			activity[u][w] = true
		}
	}
	cohorts := make([][]uint, weeks)
	for _, sg := range signups {
		w := int(weekStart(sg.CreatedAt).Sub(firstWeek) / (7 * 24 * time.Hour))
		if w >= 0 && w < weeks {
			cohorts[w] = append(cohorts[w], sg.UserID)
		}
	}
	rows := make([]CohortRow, 0, weeks)
	for w := 0; w < weeks; w++ {
		row := CohortRow{CohortWeek: firstWeek.AddDate(0, 0, 7*w).Format(dayLayout), Size: len(cohorts[w]), Retention: []float64{}}
		for k := 0; w+k < weeks; k++ {
			var active int64
			for _, u := range cohorts[w] {
				if activity[u][w+k] {
					active++
				}
			}
			row.Retention = append(row.Retention, rate(active, int64(len(cohorts[w]))))
		}
		rows = append(rows, row)
	}
	return rows
}

func (s *service) Cohorts(ctx context.Context, weeks int) (*CohortReport, error) {
	if weeks <= 0 || weeks > 26 {
		weeks = 8
	}
	now := s.cfg.Now()
	firstWeek := weekStart(now).AddDate(0, 0, -7*(weeks-1))
	to := dayStart(now).Add(24 * time.Hour)
	signups, err := s.stats.SignupsBetween(ctx, firstWeek, to)
	if err != nil {
		return nil, err
	}
	site, err := s.store.RollupsBetween(ctx, KindSite, firstWeek, to)
	if err != nil {
		return nil, err
	}
	return &CohortReport{Weeks: weeks, Cohorts: computeCohorts(signups, site, firstWeek, weeks)}, nil
}

type RecommendationRow struct {
	RecID          string  `json:"recId"`
	Impressions    int64   `json:"impressions"`
	Clicks         int64   `json:"clicks"`
	Completions    int64   `json:"completions"`
	CTR            float64 `json:"ctr"`
	CompletionRate float64 `json:"completionRate"`
}

type RecommendationReport struct {
	From  string              `json:"from"`
	To    string              `json:"to"`
	Rows  []RecommendationRow `json:"rows"`
	Total RecommendationRow   `json:"total"`
	Note  string              `json:"note"`
}

func computeRecs(rows []*entity.AnalyticsRollup) ([]RecommendationRow, RecommendationRow) {
	agg := map[string]*RecommendationRow{}
	total := RecommendationRow{RecID: "all"}
	for _, r := range rows {
		a, ok := agg[r.Key]
		if !ok {
			a = &RecommendationRow{RecID: r.Key}
			agg[r.Key] = a
		}
		a.Impressions += r.Counters["impressions"]
		a.Clicks += r.Counters["clicks"]
		a.Completions += r.Counters["completions"]
		total.Impressions += r.Counters["impressions"]
		total.Clicks += r.Counters["clicks"]
		total.Completions += r.Counters["completions"]
	}
	out := make([]RecommendationRow, 0, len(agg))
	for _, a := range agg {
		a.CTR, a.CompletionRate = rate(a.Clicks, a.Impressions), rate(a.Completions, a.Clicks)
		out = append(out, *a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Impressions > out[j].Impressions })
	total.CTR, total.CompletionRate = rate(total.Clicks, total.Impressions), rate(total.Completions, total.Clicks)
	return out, total
}

func (s *service) Recommendations(ctx context.Context, from, to time.Time) (*RecommendationReport, error) {
	from, to = normaliseRange(from, to, s.cfg.Now())
	rows, err := s.store.RollupsBetween(ctx, KindRec, from, to)
	if err != nil {
		return nil, err
	}
	out, total := computeRecs(rows)
	return &RecommendationReport{
		From: from.Format(dayLayout), To: to.AddDate(0, 0, -1).Format(dayLayout), Rows: out, Total: total,
		Note: "completions are attributed when the same user completes the clicked content on the same UTC day",
	}, nil
}

type UserEngagement struct {
	UserID       uint       `json:"userId"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Score        int        `json:"score"`
	Level        string     `json:"level"`
	ChurnRisk    string     `json:"churnRisk"`
	AtRisk       bool       `json:"atRisk"`
	LastActiveAt *time.Time `json:"lastActiveAt,omitempty"`
	ActiveDays   int        `json:"activeDays30d"`
	Reads        int        `json:"reads30d"`
	Lessons      int        `json:"lessonsCompleted30d"`
}

// scoreUser computes a 0-100 engagement score over the last 30 days:
//
//	40 * min(activeDays/12, 1) + 20 * min(reads/15, 1) + 20 * min(lessonsCompleted/8, 1)
//	+ 10 if the user has any enrollment + 10 if the user has completed a course
//
// Churn risk: accounts younger than 7 days are "new"; otherwise days since last activity
// (event, login or signup) >= 30 is "high"; >= 14 is "high" with an active enrollment else
// "medium"; >= 7 is "medium" with an active enrollment else "low"; otherwise "low".
// atRisk is true for "high" and "medium".
func scoreUser(u repository.UserActivity, st repository.UserEventStat, now time.Time) UserEngagement {
	minf := func(v, d float64) float64 { return math.Min(v/d, 1) }
	score := 40*minf(float64(st.ActiveDays), 12) + 20*minf(float64(st.Reads), 15) + 20*minf(float64(st.LessonsComplete), 8)
	if u.ActiveEnrollments+u.CompletedEnrollment > 0 {
		score += 10
	}
	if u.CompletedEnrollment > 0 {
		score += 10
	}
	last := u.CreatedAt
	if u.LastLogin != nil && u.LastLogin.After(last) {
		last = *u.LastLogin
	}
	if st.LastEventAt.After(last) {
		last = st.LastEventAt
	}
	idle := now.Sub(last).Hours() / 24
	risk := "low"
	switch {
	case now.Sub(u.CreatedAt) < 7*24*time.Hour:
		risk = "new"
	case idle >= 30:
		risk = "high"
	case idle >= 14 && u.ActiveEnrollments > 0:
		risk = "high"
	case idle >= 14, idle >= 7 && u.ActiveEnrollments > 0:
		risk = "medium"
	}
	n := int(math.Round(score))
	level := "dormant"
	switch {
	case n >= 70:
		level = "high"
	case n >= 40:
		level = "medium"
	case n >= 15:
		level = "low"
	}
	la := last
	return UserEngagement{
		UserID: u.ID, Name: u.Name, Email: u.Email, Score: n, Level: level, ChurnRisk: risk,
		AtRisk: risk == "high" || risk == "medium", LastActiveAt: &la,
		ActiveDays: st.ActiveDays, Reads: st.Reads, Lessons: st.LessonsComplete,
	}
}

func (s *service) Engagement(ctx context.Context, page, size int) ([]UserEngagement, int64, error) {
	if size <= 0 || size > 100 {
		size = 25
	}
	if page < 0 {
		page = 0
	}
	users, total, err := s.stats.UserActivityPage(ctx, page, size)
	if err != nil {
		return nil, 0, err
	}
	ids := make([]uint, len(users))
	for i, u := range users {
		ids[i] = u.ID
	}
	now := s.cfg.Now()
	stats, err := s.store.UserEventStats(ctx, ids, now.AddDate(0, 0, -30))
	if err != nil {
		return nil, 0, err
	}
	out := make([]UserEngagement, len(users))
	for i, u := range users {
		out[i] = scoreUser(u, stats[u.ID], now)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out, total, nil
}

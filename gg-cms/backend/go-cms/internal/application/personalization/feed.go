package personalization

import (
	"context"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const (
	ReasonNextInPath  = "NEXT_IN_PATH"
	ReasonContinue    = "CONTINUE_COURSE"
	ReasonNextStep    = "NEXT_STEP"
	ReasonTopic       = "TOPIC_AFFINITY"
	ReasonCategory    = "CATEGORY_PREFERENCE"
	ReasonTagInterest = "TAG_INTEREST"
	ReasonTrending    = "TRENDING"
	ReasonNew         = "NEW"

	candidatePageSize = 200
	popularityTopK    = 40
	popularityWorkers = 8
	maxEngagedTopics  = 15
	maxMasteredTopics = 8
	maxTopicTargets   = 30
	topicContentLimit = 300

	wTopic = 1.0
	wStep  = 0.8
	wCat   = 0.6
	wCatB  = 0.5
	wTag   = 0.3
	wLevel = 0.6
	wPop   = 0.4
	wFresh = 0.3

	diversityCategoryPenalty = 0.35
	diversityTypePenalty     = 0.1
)

var reasonText = map[string]string{
	ReasonNextInPath:  "Next course in your learning path",
	ReasonContinue:    "Pick up where you left off",
	ReasonNextStep:    "Builds on topics you have completed",
	ReasonTopic:       "Matches topics you have been learning",
	ReasonCategory:    "Matches your preferred categories",
	ReasonTagInterest: "Matches your interests",
	ReasonTrending:    "Popular with learners right now",
	ReasonNew:         "Recently published",
}

type ContinueItem struct {
	Kind          string  `json:"kind"`
	ReasonCode    string  `json:"reasonCode"`
	Reason        string  `json:"reason"`
	CourseID      uint    `json:"courseId"`
	CourseSlug    string  `json:"courseSlug"`
	CourseTitle   string  `json:"courseTitle"`
	Progress      float64 `json:"progress"`
	PathID        *uint   `json:"pathId,omitempty"`
	PathSlug      string  `json:"pathSlug,omitempty"`
	PathTitle     string  `json:"pathTitle,omitempty"`
	PathCompleted int     `json:"pathCompleted,omitempty"`
	PathTotal     int     `json:"pathTotal,omitempty"`
	RecID         string  `json:"recId"`
}

type Feed struct {
	RecID       string            `json:"recId"`
	ColdStart   bool              `json:"coldStart"`
	Partial     bool              `json:"partial,omitempty"`
	Continue    *ContinueItem     `json:"continue,omitempty"`
	Items       []RecommendedItem `json:"items"`
	GeneratedAt time.Time         `json:"generatedAt"`
}

type contentKey struct {
	typ string
	id  uint
}

type candidate struct {
	key       contentKey
	item      RecommendedItem
	categ     uint
	level     *string
	published time.Time
	topic     float64
	step      float64
	cat       float64
	tag       float64
	lvl       float64
	fresh     float64
	pop       float64
	base      float64
}

type engagement struct {
	key       contentKey
	weight    float64
	completed bool
	category  *uint
}

func (s *service) publishedCandidates(ctx context.Context) ([]*entity.Article, []*entity.Course, bool, error) {
	s.mu.Lock()
	if c := s.candidates; c != nil && s.now().Before(c.exp) {
		s.mu.Unlock()
		return c.articles, c.courses, false, nil
	}
	s.mu.Unlock()

	published := entity.CMSStatusPublished
	var partial bool
	articles, _, aErr := s.articleRepo.FindAll(ctx, repository.ArticleFilter{Status: &published}, 0, candidatePageSize)
	if aErr != nil {
		partial = true
		logger.Warn("recommendation: fetch articles failed", zap.Error(aErr))
	}
	courses, _, cErr := s.courseRepo.FindAll(ctx, repository.CourseFilter{Status: &published}, 0, candidatePageSize)
	if cErr != nil {
		partial = true
		logger.Warn("recommendation: fetch courses failed", zap.Error(cErr))
	}
	if aErr != nil && cErr != nil {
		return nil, nil, true, aErr
	}
	if !partial {
		s.mu.Lock()
		s.candidates = &candidateEntry{articles: articles, courses: courses, exp: s.now().Add(defaultCandidateTTL)}
		s.mu.Unlock()
	}
	return articles, courses, partial, nil
}

func (s *service) Recommend(ctx context.Context, userID uint, limit int) (*Feed, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	key := feedKey{user: userID, limit: limit}
	if f, ok := s.cachedFeed(key); ok {
		return f, nil
	}

	profile, err := s.GetProfile(ctx, userID)
	if err != nil {
		return nil, err
	}
	articles, courses, partial, err := s.publishedCandidates(ctx)
	if err != nil {
		return nil, err
	}

	now := s.now()
	courseByID := make(map[uint]*entity.Course, len(courses))
	for _, c := range courses {
		courseByID[c.ID] = c
	}
	articleByID := make(map[uint]*entity.Article, len(articles))
	for _, a := range articles {
		articleByID[a.ID] = a
	}

	var enrollments []*entity.Enrollment
	if s.enrollRepo != nil {
		if enrollments, err = s.enrollRepo.FindByUserID(ctx, userID); err != nil {
			partial = true
			logger.Warn("recommendation: fetch enrollments failed", zap.Uint("user", userID), zap.Error(err))
		}
	}

	excluded := map[contentKey]struct{}{}
	var engaged []engagement
	for _, e := range enrollments {
		k := contentKey{"course", e.CourseID}
		excluded[k] = struct{}{}
		var cat *uint
		if c, ok := courseByID[e.CourseID]; ok {
			cat = c.CategoryID
		} else if e.Course.ID != 0 {
			cat = e.Course.CategoryID
		}
		engaged = append(engaged, engagement{key: k, weight: enrollmentWeight(e, now), completed: e.Status == entity.EnrollmentStatusCompleted, category: cat})
	}

	if s.favourites != nil {
		favs, _, fErr := s.favourites.ListByUser(ctx, userID, 0, 50)
		if fErr != nil {
			partial = true
			logger.Warn("recommendation: fetch favourites failed", zap.Uint("user", userID), zap.Error(fErr))
		}
		for _, f := range favs {
			k := contentKey{strings.ToLower(f.ContentType), f.ContentID}
			excluded[k] = struct{}{}
			var cat *uint
			if k.typ == "article" {
				if a, ok := articleByID[k.id]; ok {
					cat = a.CategoryID
				}
			} else if c, ok := courseByID[k.id]; ok {
				cat = c.CategoryID
			}
			engaged = append(engaged, engagement{key: k, weight: 0.6 * recencyFactor(f.CreatedAt, now), category: cat})
		}
	}

	hasBehaviour := len(engaged) > 0
	hasPrefs := len(profile.PreferredCategoryIDs) > 0 || len(profile.InterestedTagIDs) > 0
	coldStart := !hasBehaviour && !hasPrefs

	affinity, mastered, catAffinity, tErr := s.topicAffinity(ctx, engaged)
	if tErr {
		partial = true
	}
	nextStep, nErr := s.nextStepTopics(ctx, mastered)
	if nErr {
		partial = true
	}
	topicScore, stepScore, eErr := s.topicScores(ctx, affinity, nextStep)
	if eErr {
		partial = true
	}

	prefCats := toSet(profile.PreferredCategoryIDs)
	tagSet := toSet(profile.InterestedTagIDs)
	var catTagMap map[uint]map[int64]struct{}
	if len(tagSet) > 0 && s.tagRepo != nil {
		var mErr error
		if catTagMap, mErr = s.buildCategoryTagMap(ctx, articles, courses); mErr != nil {
			partial = true
			logger.Warn("recommendation: fetch category tags failed", zap.Error(mErr))
		}
	}
	userLevel := levelRank(string(profile.ExperienceLevel))

	cands := make([]*candidate, 0, len(articles)+len(courses))
	add := func(typ string, id uint, publicID, slug, title string, desc, thumb *string, catID *uint, catName *string, level *string, pub *time.Time, created time.Time) {
		k := contentKey{typ, id}
		if _, skip := excluded[k]; skip {
			return
		}
		pubAt := created
		if pub != nil {
			pubAt = *pub
		}
		c := &candidate{key: k, level: level, published: pubAt}
		c.item = RecommendedItem{ID: id, PublicID: publicID, Slug: slug, Title: title, Description: desc, Thumbnail: thumb, CategoryID: catID, CategoryName: catName, ContentType: typ}
		c.topic = math.Tanh(topicScore[k]) * wTopic
		c.step = math.Tanh(stepScore[k]) * wStep
		if catID != nil {
			c.categ = *catID
			if _, ok := prefCats[int64(*catID)]; ok {
				c.cat += wCat
			}
			if a := catAffinity[*catID]; a > 0 {
				c.cat += wCatB * math.Tanh(a)
			}
			if tags, ok := catTagMap[*catID]; ok {
				matches := 0
				for t := range tagSet {
					if _, has := tags[t]; has {
						matches++
					}
				}
				if matches > 2 {
					matches = 2
				}
				c.tag = wTag * float64(matches) / 2
			}
		}
		c.lvl = levelScore(userLevel, level)
		c.fresh = wFresh * math.Exp(-now.Sub(pubAt).Hours()/24/90)
		c.base = c.topic + c.step + c.cat + c.tag + c.lvl + c.fresh
		cands = append(cands, c)
	}
	for _, a := range articles {
		cn := a.Category
		var name *string
		if cn != nil {
			name = &cn.Name
		}
		add("article", a.ID, a.PublicID, a.Slug, a.Title, a.Description, a.ThumbnailURL, a.CategoryID, name, a.Level, a.PublishedAt, a.CreatedAt)
	}
	for _, c := range courses {
		var name *string
		if c.Category != nil {
			name = &c.Category.Name
		}
		add("course", c.ID, c.PublicID, c.Slug, c.Title, c.Description, c.ThumbnailURL, c.CategoryID, name, c.Level, c.PublishedAt, c.CreatedAt)
	}

	sortCandidates(cands)
	top := cands
	if len(top) > popularityTopK {
		top = top[:popularityTopK]
	}
	if s.fetchPopularity(ctx, top) {
		partial = true
	}
	for _, c := range cands {
		c.base += wPop * c.pop
	}
	sortCandidates(cands)

	picked := diversify(cands, limit)
	recID := s.newRecID()
	items := make([]RecommendedItem, len(picked))
	for i, c := range picked {
		code := reasonFor(c, coldStart)
		c.item.Score = math.Round(c.base*1000) / 1000
		c.item.ReasonCode = code
		c.item.Reason = reasonText[code]
		c.item.Position = i + 1
		c.item.RecID = recID
		items[i] = c.item
	}

	feed := &Feed{RecID: recID, ColdStart: coldStart, Partial: partial, Items: items, GeneratedAt: now}
	feed.Continue = s.continueItem(ctx, enrollments, courseByID, recID)
	if !partial {
		s.storeFeed(key, feed)
	}
	return feed, nil
}

func enrollmentWeight(e *entity.Enrollment, now time.Time) float64 {
	var base float64
	switch e.Status {
	case entity.EnrollmentStatusCompleted:
		base = 1.0
	case entity.EnrollmentStatusDropped:
		base = -0.3
	default:
		p := e.Progress / 100
		if p < 0 {
			p = 0
		}
		if p > 1 {
			p = 1
		}
		base = 0.4 + 0.6*p
	}
	ref := e.CreatedAt
	switch {
	case e.LastAccessedAt != nil:
		ref = *e.LastAccessedAt
	case e.CompletedAt != nil:
		ref = *e.CompletedAt
	case e.EnrolledAt != nil:
		ref = *e.EnrolledAt
	}
	return base * recencyFactor(ref, now)
}

func recencyFactor(ref, now time.Time) float64 {
	if ref.IsZero() {
		return 0.5
	}
	days := now.Sub(ref).Hours() / 24
	if days < 0 {
		days = 0
	}
	return math.Max(0.2, math.Exp(-days/60))
}

func levelRank(l string) int {
	switch strings.ToLower(l) {
	case "beginner":
		return 0
	case "intermediate":
		return 1
	case "advanced":
		return 2
	case "expert":
		return 3
	}
	return -1
}

func levelScore(user int, content *string) float64 {
	if content == nil || user < 0 {
		return 0
	}
	c := levelRank(*content)
	if c < 0 {
		return 0
	}
	switch d := c - user; {
	case d == 0:
		return wLevel
	case d == 1:
		return wLevel / 3
	case d == -1:
		return 0
	default:
		return -wLevel * 2 / 3
	}
}

func (s *service) topicAffinity(ctx context.Context, engaged []engagement) (affinity map[uint]float64, mastered []uint, catAffinity map[uint]float64, failed bool) {
	affinity = map[uint]float64{}
	catAffinity = map[uint]float64{}
	if len(engaged) == 0 {
		return
	}
	sorted := append([]engagement(nil), engaged...)
	sort.SliceStable(sorted, func(i, j int) bool {
		wi, wj := math.Abs(sorted[i].weight), math.Abs(sorted[j].weight)
		if wi != wj {
			return wi > wj
		}
		if sorted[i].key.typ != sorted[j].key.typ {
			return sorted[i].key.typ < sorted[j].key.typ
		}
		return sorted[i].key.id < sorted[j].key.id
	})
	for _, e := range sorted {
		if e.category != nil {
			catAffinity[*e.category] += e.weight
		}
	}
	if s.topicRepo == nil {
		return
	}
	if len(sorted) > maxEngagedTopics {
		sorted = sorted[:maxEngagedTopics]
	}
	masteredSet := map[uint]struct{}{}
	for _, e := range sorted {
		entries, err := s.topicRepo.GetContentTopicEntries(ctx, e.key.id, strings.ToUpper(e.key.typ))
		if err != nil {
			failed = true
			logger.Warn("recommendation: fetch content topics failed", zap.Uint("content", e.key.id), zap.Error(err))
			continue
		}
		for _, t := range entries {
			affinity[t.TopicID] += e.weight * t.Weight
			if e.completed {
				masteredSet[t.TopicID] = struct{}{}
			}
		}
	}
	for t := range masteredSet {
		mastered = append(mastered, t)
	}
	sort.Slice(mastered, func(i, j int) bool {
		if affinity[mastered[i]] != affinity[mastered[j]] {
			return affinity[mastered[i]] > affinity[mastered[j]]
		}
		return mastered[i] < mastered[j]
	})
	if len(mastered) > maxMasteredTopics {
		mastered = mastered[:maxMasteredTopics]
	}
	return
}

func (s *service) nextStepTopics(ctx context.Context, mastered []uint) (map[uint]float64, bool) {
	next := map[uint]float64{}
	if s.topicRepo == nil || len(mastered) == 0 {
		return next, false
	}
	done := toUintSet(mastered)
	failed := false
	for _, t := range mastered {
		reach, err := s.topicRepo.FindReachable(ctx, t, 1)
		if err != nil {
			failed = true
			logger.Warn("recommendation: topic graph lookup failed", zap.Uint("topic", t), zap.Error(err))
			continue
		}
		for _, r := range reach {
			if r.Topic == nil || (r.RelationshipType != "PREREQUISITE_OF" && r.RelationshipType != "BUILDS_ON") {
				continue
			}
			if _, known := done[r.Topic.ID]; known {
				continue
			}
			w := r.Weight
			if w <= 0 {
				w = 1
			}
			if w > next[r.Topic.ID] {
				next[r.Topic.ID] = w
			}
		}
	}
	return next, failed
}

func (s *service) topicScores(ctx context.Context, affinity, nextStep map[uint]float64) (topic, step map[contentKey]float64, failed bool) {
	topic = map[contentKey]float64{}
	step = map[contentKey]float64{}
	if s.topicRepo == nil {
		return
	}
	idSet := map[uint]struct{}{}
	for t, a := range affinity {
		if a != 0 {
			idSet[t] = struct{}{}
		}
	}
	for t := range nextStep {
		idSet[t] = struct{}{}
	}
	if len(idSet) == 0 {
		return
	}
	ids := make([]uint, 0, len(idSet))
	for t := range idSet {
		ids = append(ids, t)
	}
	sort.Slice(ids, func(i, j int) bool {
		ai, aj := math.Abs(affinity[ids[i]])+nextStep[ids[i]], math.Abs(affinity[ids[j]])+nextStep[ids[j]]
		if ai != aj {
			return ai > aj
		}
		return ids[i] < ids[j]
	})
	if len(ids) > maxTopicTargets {
		ids = ids[:maxTopicTargets]
	}
	entries, err := s.topicRepo.FindContentByTopicIDs(ctx, ids, 0, "", topicContentLimit)
	if err != nil {
		logger.Warn("recommendation: topic content lookup failed", zap.Error(err))
		return topic, step, true
	}
	for _, e := range entries {
		k := contentKey{strings.ToLower(e.ContentType), e.ContentID}
		w := e.Weight
		if w <= 0 {
			w = 1
		}
		topic[k] += affinity[e.TopicID] * w
		step[k] += nextStep[e.TopicID] * w
	}
	return
}

func (s *service) fetchPopularity(ctx context.Context, cands []*candidate) bool {
	if s.views == nil && s.reactions == nil {
		return false
	}
	raws := make([]float64, len(cands))
	errs := make([]bool, len(cands))
	var wg sync.WaitGroup
	sem := make(chan struct{}, popularityWorkers)
	for i, c := range cands {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, k contentKey) {
			defer wg.Done()
			defer func() { <-sem }()
			raws[i], errs[i] = s.popularityRaw(ctx, k)
		}(i, c.key)
	}
	wg.Wait()
	maxRaw := 0.0
	failed := false
	for i := range cands {
		if errs[i] {
			failed = true
			continue
		}
		if raws[i] > maxRaw {
			maxRaw = raws[i]
		}
	}
	if maxRaw > 0 {
		for i, c := range cands {
			if !errs[i] && raws[i] > 0 {
				c.pop = raws[i] / maxRaw
			}
		}
	}
	return failed
}

func (s *service) popularityRaw(ctx context.Context, k contentKey) (float64, bool) {
	ck := k.typ + ":" + strconv.FormatUint(uint64(k.id), 10)
	s.mu.Lock()
	if e, ok := s.pop[ck]; ok && s.now().Before(e.exp) {
		s.mu.Unlock()
		return e.raw, false
	}
	s.mu.Unlock()

	raw := 0.0
	if s.views != nil {
		v, err := s.views.GetContentViews(ctx, strconv.FormatUint(uint64(k.id), 10), k.typ)
		if err != nil {
			logger.Warn("recommendation: view count failed", zap.String("key", ck), zap.Error(err))
			return 0, true
		}
		raw += math.Log1p(float64(v))
	}
	if s.reactions != nil {
		likes, dislikes, err := s.reactions.CountBySentiment(ctx, k.typ, k.id)
		if err != nil {
			logger.Warn("recommendation: reaction count failed", zap.String("key", ck), zap.Error(err))
			return 0, true
		}
		raw += 2*math.Log1p(float64(likes)) - math.Log1p(float64(dislikes))
	}
	if raw < 0 {
		raw = 0
	}
	s.mu.Lock()
	if len(s.pop) > 10000 {
		s.pop = map[string]popEntry{}
	}
	s.pop[ck] = popEntry{raw: raw, exp: s.now().Add(defaultPopularityTTL)}
	s.mu.Unlock()
	return raw, false
}

func sortCandidates(c []*candidate) {
	sort.SliceStable(c, func(i, j int) bool {
		if c[i].base != c[j].base {
			return c[i].base > c[j].base
		}
		if c[i].key.typ != c[j].key.typ {
			return c[i].key.typ < c[j].key.typ
		}
		return c[i].key.id < c[j].key.id
	})
}

// diversify greedily picks the best remaining candidate after penalising categories
// and content types that are already represented in the picked list.
func diversify(sorted []*candidate, limit int) []*candidate {
	remaining := append([]*candidate(nil), sorted...)
	catCount := map[uint]int{}
	typeCount := map[string]int{}
	out := make([]*candidate, 0, limit)
	for len(out) < limit && len(remaining) > 0 {
		best, bestScore := 0, math.Inf(-1)
		for i, c := range remaining {
			adj := c.base - diversityCategoryPenalty*float64(catCount[c.categ]) - diversityTypePenalty*float64(typeCount[c.key.typ])
			if adj > bestScore {
				best, bestScore = i, adj
			}
		}
		c := remaining[best]
		remaining = append(remaining[:best], remaining[best+1:]...)
		catCount[c.categ]++
		typeCount[c.key.typ]++
		out = append(out, c)
	}
	return out
}

func reasonFor(c *candidate, coldStart bool) string {
	if coldStart {
		return ReasonTrending
	}
	type comp struct {
		code string
		v    float64
	}
	comps := []comp{
		{ReasonNextStep, c.step},
		{ReasonTopic, c.topic},
		{ReasonCategory, c.cat},
		{ReasonTagInterest, c.tag},
		{ReasonTrending, wPop * c.pop},
		{ReasonNew, c.fresh},
	}
	best := comps[0]
	for _, x := range comps[1:] {
		if x.v > best.v {
			best = x
		}
	}
	return best.code
}

func (s *service) continueItem(ctx context.Context, enrollments []*entity.Enrollment, courseByID map[uint]*entity.Course, recID string) *ContinueItem {
	if len(enrollments) == 0 {
		return nil
	}
	byCourse := make(map[uint]*entity.Enrollment, len(enrollments))
	for _, e := range enrollments {
		byCourse[e.CourseID] = e
	}
	lookup := func(id uint) *entity.Course {
		if c, ok := courseByID[id]; ok {
			return c
		}
		c, err := s.courseRepo.FindByID(ctx, id)
		if err != nil || c == nil || c.Status != entity.CMSStatusPublished {
			return nil
		}
		return c
	}
	activity := func(e *entity.Enrollment) time.Time {
		switch {
		case e.LastAccessedAt != nil:
			return *e.LastAccessedAt
		case e.CompletedAt != nil:
			return *e.CompletedAt
		case e.EnrolledAt != nil:
			return *e.EnrolledAt
		}
		return e.CreatedAt
	}

	if s.paths != nil {
		paths, err := s.paths.FindAll(ctx, "")
		if err != nil {
			logger.Warn("recommendation: fetch learning paths failed", zap.Error(err))
		}
		var bestItem *ContinueItem
		var bestAt time.Time
		for _, p := range paths {
			var last time.Time
			touched, done := false, 0
			var next *entity.LearningPathCourse
			for i := range p.Courses {
				pc := &p.Courses[i]
				e, ok := byCourse[pc.CourseID]
				if ok && e.Status != entity.EnrollmentStatusDropped {
					touched = true
					if at := activity(e); at.After(last) {
						last = at
					}
				}
				if ok && e.Status == entity.EnrollmentStatusCompleted {
					done++
					continue
				}
				if next == nil {
					next = pc
				}
			}
			if !touched || next == nil {
				continue
			}
			course := lookup(next.CourseID)
			if course == nil {
				continue
			}
			if bestItem != nil && !last.After(bestAt) {
				continue
			}
			pid := p.ID
			item := &ContinueItem{
				Kind: "path_next", ReasonCode: ReasonNextInPath, Reason: reasonText[ReasonNextInPath],
				CourseID: course.ID, CourseSlug: course.Slug, CourseTitle: course.Title,
				PathID: &pid, PathSlug: p.Slug, PathTitle: p.Title, PathCompleted: done, PathTotal: len(p.Courses), RecID: recID,
			}
			if e, ok := byCourse[next.CourseID]; ok {
				item.Progress = e.Progress
				item.Kind = "in_progress"
			}
			bestItem, bestAt = item, last
		}
		if bestItem != nil {
			return bestItem
		}
	}

	var latest *entity.Enrollment
	for _, e := range enrollments {
		if e.Status != entity.EnrollmentStatusActive {
			continue
		}
		if latest == nil || activity(e).After(activity(latest)) {
			latest = e
		}
	}
	if latest == nil {
		return nil
	}
	course := lookup(latest.CourseID)
	if course == nil {
		return nil
	}
	return &ContinueItem{
		Kind: "in_progress", ReasonCode: ReasonContinue, Reason: reasonText[ReasonContinue],
		CourseID: course.ID, CourseSlug: course.Slug, CourseTitle: course.Title, Progress: latest.Progress, RecID: recID,
	}
}

func toUintSet(ids []uint) map[uint]struct{} {
	m := make(map[uint]struct{}, len(ids))
	for _, id := range ids {
		m[id] = struct{}{}
	}
	return m
}

package handler

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type PublicHandler struct {
	cmsService      cmssvc.Service
	categoryService categorysvc.Service
	analyticsService analyticssvc.Service
}

func NewPublicHandler(cmsService cmssvc.Service, categoryService categorysvc.Service, analyticsService analyticssvc.Service) *PublicHandler {
	return &PublicHandler{
		cmsService:       cmsService,
		categoryService:  categoryService,
		analyticsService: analyticsService,
	}
}

// GET /api/public/articles
func (h *PublicHandler) GetPublicArticles(c *gin.Context) {
	p := pagination.FromQuery(c)
	filter := repository.ArticleFilter{PubliclyVisible: true}
	if q := c.Query("search"); q != "" {
		filter.Search = &q
	}

	result, total, err := h.cmsService.GetAll(c.Request.Context(), entity.CMSTypeArticle, filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	articles, _ := result.([]*entity.Article)
	items := make([]dto.CMSResponse, len(articles))
	for i, a := range articles {
		items[i] = articleToPublicCMS(a)
	}

	h.trackView(c, nil, nil)
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// GET /api/public/articles/:id
// Accepts a slug, a UUID (publicId), or a numeric ID.
func (h *PublicHandler) GetPublicArticle(c *gin.Context) {
	idStr := c.Param("id")
	isPreview := c.Query("preview") == "true"

	var result interface{}
	var err error
	switch {
	case isNumericID(idStr):
		id, _ := parseID(c, "id")
		result, err = h.cmsService.GetByID(c.Request.Context(), id, entity.CMSTypeArticle)
	case isUUID(idStr):
		result, err = h.cmsService.GetByPublicID(c.Request.Context(), idStr, entity.CMSTypeArticle)
	default:
		// treat as human-readable slug
		result, err = h.cmsService.GetBySlug(c.Request.Context(), idStr, entity.CMSTypeArticle)
	}
	if err != nil {
		response.NotFound(c, "article not found")
		return
	}
	article, ok := result.(*entity.Article)
	if !ok || (!isPreview && article.Status != entity.CMSStatusPublished && !article.HasPendingDraft) {
		response.NotFound(c, "article not found")
		return
	}

	trackID := fmt.Sprintf("%d", article.ID)
	contentType := "article"
	h.trackView(c, &trackID, &contentType)

	response.OK(c, articleToPublicCMS(article))
}

// GET /api/public/articles/category/:slug
func (h *PublicHandler) GetPublicArticlesByCategory(c *gin.Context) {
	slug := c.Param("slug")
	p := pagination.FromQuery(c)

	// Use category slug-based filtering via the article repo
	filter := repository.ArticleFilter{PubliclyVisible: true}
	result, total, err := h.cmsService.GetAll(c.Request.Context(), entity.CMSTypeArticle, filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	articles, _ := result.([]*entity.Article)

	// Filter by category slug in memory (or use direct repo method)
	var filtered []dto.CMSResponse
	for _, a := range articles {
		if a.Category != nil && a.Category.Slug == slug {
			filtered = append(filtered, articleToPublicCMS(a))
		}
	}
	if filtered == nil {
		filtered = []dto.CMSResponse{}
	}
	response.StrapiPaged(c, filtered, total, p.Page, p.Size)
}

// GET /api/public/courses
func (h *PublicHandler) GetPublicCourses(c *gin.Context) {
	p := pagination.FromQuery(c)
	filter := repository.ArticleFilter{PubliclyVisible: true}
	if q := c.Query("search"); q != "" {
		filter.Search = &q
	}
	if ct := c.Query("courseType"); ct != "" {
		courseType := entity.CourseType(ct)
		filter.CourseType = &courseType
	}

	result, total, err := h.cmsService.GetAll(c.Request.Context(), entity.CMSTypeCourse, filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	courses, _ := result.([]*entity.Course)
	items := make([]dto.CMSResponse, len(courses))
	for i, co := range courses {
		items[i] = courseToPublicCMS(co)
	}

	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// GET /api/public/courses/:id
// Accepts a slug, a UUID (publicId), or a numeric ID.
func (h *PublicHandler) GetPublicCourse(c *gin.Context) {
	idStr := c.Param("id")
	isPreview := c.Query("preview") == "true"

	var result interface{}
	var err error
	switch {
	case isNumericID(idStr):
		id, _ := parseID(c, "id")
		result, err = h.cmsService.GetByID(c.Request.Context(), id, entity.CMSTypeCourse)
	case isUUID(idStr):
		result, err = h.cmsService.GetByPublicID(c.Request.Context(), idStr, entity.CMSTypeCourse)
	default:
		result, err = h.cmsService.GetBySlug(c.Request.Context(), idStr, entity.CMSTypeCourse)
	}
	if err != nil {
		response.NotFound(c, "course not found")
		return
	}
	course, ok := result.(*entity.Course)
	if !ok || (!isPreview && course.Status != entity.CMSStatusPublished && !course.HasPendingDraft) {
		response.NotFound(c, "course not found")
		return
	}

	trackID := fmt.Sprintf("%d", course.ID)
	contentType := "course"
	h.trackView(c, &trackID, &contentType)

	response.OK(c, courseToPublicCMS(course))
}

// GET /api/public/courses/category/:slug
func (h *PublicHandler) GetPublicCoursesByCategory(c *gin.Context) {
	slug := c.Param("slug")
	p := pagination.FromQuery(c)

	filter := repository.ArticleFilter{PubliclyVisible: true}
	result, total, err := h.cmsService.GetAll(c.Request.Context(), entity.CMSTypeCourse, filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	courses, _ := result.([]*entity.Course)

	var filtered []dto.CMSResponse
	for _, co := range courses {
		if co.Category != nil && co.Category.Slug == slug {
			filtered = append(filtered, courseToPublicCMS(co))
		}
	}
	if filtered == nil {
		filtered = []dto.CMSResponse{}
	}
	response.StrapiPaged(c, filtered, total, p.Page, p.Size)
}

// GET /api/public/cms?type=ARTICLE|COURSE&page=0&size=10&search=keyword
// Unified public CMS endpoint — returns published articles or courses depending on ?type
func (h *PublicHandler) GetPublicCMS(c *gin.Context) {
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))
	p := pagination.FromQuery(c)
	filter := repository.ArticleFilter{PubliclyVisible: true}
	if q := c.Query("search"); q != "" {
		filter.Search = &q
	}
	if ct := c.Query("courseType"); ct != "" && cmsType == entity.CMSTypeCourse {
		courseType := entity.CourseType(ct)
		filter.CourseType = &courseType
	}

	result, total, err := h.cmsService.GetAll(c.Request.Context(), cmsType, filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	var items []dto.CMSResponse
	switch cmsType {
	case entity.CMSTypeCourse:
		courses, _ := result.([]*entity.Course)
		items = make([]dto.CMSResponse, len(courses))
		for i, co := range courses {
			items[i] = courseToPublicCMS(co)
		}
	default:
		articles, _ := result.([]*entity.Article)
		items = make([]dto.CMSResponse, len(articles))
		for i, a := range articles {
			items[i] = articleToPublicCMS(a)
		}
	}

	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// GET /api/public/cms/:id?type=ARTICLE|COURSE
// Returns a single published CMS item by slug, UUID (publicId), or numeric ID.
func (h *PublicHandler) GetPublicCMSByID(c *gin.Context) {
	idStr := c.Param("id")
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))
	isPreview := c.Query("preview") == "true"

	var result interface{}
	var err error
	switch {
	case isNumericID(idStr):
		id, _ := parseID(c, "id")
		result, err = h.cmsService.GetByID(c.Request.Context(), id, cmsType)
	case isUUID(idStr):
		result, err = h.cmsService.GetByPublicID(c.Request.Context(), idStr, cmsType)
	default:
		result, err = h.cmsService.GetBySlug(c.Request.Context(), idStr, cmsType)
	}
	if err != nil {
		response.NotFound(c, "not found")
		return
	}

	contentTypeName := "article"
	switch cmsType {
	case entity.CMSTypeCourse:
		course, ok := result.(*entity.Course)
		if !ok || (!isPreview && course.Status != entity.CMSStatusPublished && !course.HasPendingDraft) {
			response.NotFound(c, "not found")
			return
		}
		contentTypeName = "course"
		trackID := fmt.Sprintf("%d", course.ID)
		h.trackView(c, &trackID, &contentTypeName)
		response.OK(c, courseToPublicCMS(course))
	default:
		article, ok := result.(*entity.Article)
		if !ok || (!isPreview && article.Status != entity.CMSStatusPublished && !article.HasPendingDraft) {
			response.NotFound(c, "not found")
			return
		}
		trackID := fmt.Sprintf("%d", article.ID)
		h.trackView(c, &trackID, &contentTypeName)
		response.OK(c, articleToPublicCMS(article))
	}
}

// isNumericID returns true when s consists entirely of ASCII digits.
func isNumericID(s string) bool {
	if len(s) == 0 {
		return false
	}
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

// isUUID returns true for a standard 8-4-4-4-12 hex UUID string.
func isUUID(s string) bool {
	return len(s) == 36 &&
		strings.Count(s, "-") == 4 &&
		s[8] == '-' && s[13] == '-' && s[18] == '-' && s[23] == '-'
}

// articleToPublicCMS converts an article to its public-facing DTO.
// When a new draft revision is being reviewed (has_pending_draft=true), the
// published snapshot fields are served instead of the in-progress draft content,
// so public visitors always see the last approved version.
func articleToPublicCMS(a *entity.Article) dto.CMSResponse {
	r := articleToCMS(a)
	if a.HasPendingDraft {
		r.Title = a.PublishedTitle
		if a.PublishedDescription != nil {
			r.Description = a.PublishedDescription
		}
		if a.PublishedBody != nil {
			r.Body = a.PublishedBody
			r.BlockCount = countBodyBlocks(a.PublishedBody)
		}
		r.Version = 0
		if a.PublishedVersion != nil {
			r.Version = *a.PublishedVersion
		}
	}
	return r
}

// courseToPublicCMS is the course equivalent of articleToPublicCMS.
func courseToPublicCMS(c *entity.Course) dto.CMSResponse {
	r := courseToCMS(c)
	if c.HasPendingDraft {
		r.Title = c.PublishedTitle
		if c.PublishedDescription != nil {
			r.Description = c.PublishedDescription
		}
		if c.PublishedBody != nil {
			r.Body = c.PublishedBody
			r.BlockCount = countBodyBlocks(c.PublishedBody)
		}
		r.Version = 0
		if c.PublishedVersion != nil {
			r.Version = *c.PublishedVersion
		}
	}
	return r
}

func (h *PublicHandler) trackView(c *gin.Context, contentID, contentType *string) {
	// Extract values before goroutine to avoid data race on gin context recycling.
	ip := c.ClientIP()
	ua := c.Request.UserAgent()
	ctx := c.Request.Context()
	go func() {
		h.analyticsService.TrackPageView(ctx, nil, contentID, contentType, ip, ua)
	}()
}

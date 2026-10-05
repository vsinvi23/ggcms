package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/application/importer"
	lpsvc "github.com/serenya/go-cms/internal/application/learningpath"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
	"github.com/serenya/go-cms/pkg/slugify"
)

type ImportHandler struct {
	cmsService      cmssvc.Service
	taskService     tasksvc.Service
	sectionService  sectionsvc.Service
	lessonService   lessonsvc.Service
	categoryService categorysvc.Service
	lpService       lpsvc.Service
	userService     usersvc.Service
	settingsService settingssvc.Service
}

func NewImportHandler(cmsService cmssvc.Service, taskService tasksvc.Service, sectionService sectionsvc.Service, lessonService lessonsvc.Service, extraServices ...interface{}) *ImportHandler {
	var catSvc categorysvc.Service
	var lpSvc lpsvc.Service
	var userSvc usersvc.Service
	var settingsSvc settingssvc.Service

	for _, s := range extraServices {
		if us, ok := s.(usersvc.Service); ok {
			userSvc = us
		}
		if ss, ok := s.(settingssvc.Service); ok {
			settingsSvc = ss
		}
		if cs, ok := s.(categorysvc.Service); ok {
			catSvc = cs
		}
		if ls, ok := s.(lpsvc.Service); ok {
			lpSvc = ls
		}
	}

	return &ImportHandler{
		cmsService:      cmsService,
		taskService:     taskService,
		sectionService:  sectionService,
		lessonService:   lessonService,
		categoryService: catSvc,
		lpService:       lpSvc,
		userService:     userSvc,
		settingsService: settingsSvc,
	}
}

// POST /api/import/preview
// Accepts multipart/form-data with field "files" (multiple). Returns parsed preview items.
func (h *ImportHandler) Preview(c *gin.Context) {
	// Parse up to 100MB for large ZIP archive uploads
	_ = c.Request.ParseMultipartForm(100 << 20)

	form, err := c.MultipartForm()
	if err != nil {
		response.BadRequest(c, fmt.Sprintf("invalid upload payload: %v (ensure multipart form with 'files' or 'file' field)", err))
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		files = form.File["file"]
	}
	if len(files) == 0 {
		response.BadRequest(c, "no files uploaded")
		return
	}

	var dbCategories []*entity.Category
	if h.categoryService != nil {
		if cats, _, err := h.categoryService.GetAll(c.Request.Context(), 0, 1000); err == nil {
			dbCategories = cats
		}
	}

	super := h.isSuperAdmin(c)
	var items []dto.ImportPreviewItem
	for _, fh := range files {
		f, openErr := fh.Open()
		if openErr != nil {
			items = append(items, dto.ImportPreviewItem{
				FileName: fh.Filename,
				Index:    len(items),
				Valid:    false,
				Error:    "Wrong format: unreadable file object",
			})
			continue
		}
		content, readErr := io.ReadAll(f)
		f.Close()
		if readErr != nil {
			items = append(items, dto.ImportPreviewItem{
				FileName: fh.Filename,
				Index:    len(items),
				Valid:    false,
				Error:    "Wrong format: could not read file payload",
			})
			continue
		}

		var parsed []importer.ParsedItem
		var zipImages map[string]*importer.ImageAsset
		if strings.HasSuffix(strings.ToLower(fh.Filename), ".zip") {
			// Images in zips and the lifted size limits are super-admin only; everyone else gets the
			// standard limits and documents only (image references are reported, not imported).
			zr := importer.ParseZIPWithOptions(fh.Filename, content, importer.ZipOptions{CollectImages: super, NoLimits: super})
			parsed, zipImages = zr.Items, zr.Images
		} else {
			parsed = importer.Parse(fh.Filename, content)
		}
		for _, p := range parsed {
			var categoryID *uint
			itemValid := p.Valid
			itemErr := p.Error

			if p.CategorySlug != "" && len(dbCategories) > 0 {
				slugLower := strings.ToLower(strings.TrimSpace(p.CategorySlug))
				slugClean := regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(slugLower, "")
				var matched *entity.Category
				for _, cat := range dbCategories {
					if cat.IsVirtual {
						continue
					}
					catSlugLower := strings.ToLower(cat.Slug)
					catNameLower := strings.ToLower(cat.Name)
					catSlugClean := regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(catSlugLower, "")
					catNameClean := regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(catNameLower, "")

					if catSlugLower == slugLower || catNameLower == slugLower ||
						(slugClean != "" && (catSlugClean == slugClean || catNameClean == slugClean)) {
						matched = cat
						break
					}
				}
				if matched != nil {
					categoryID = &matched.ID
				}
			}

			exists := false
			var existingID uint
			targetSlug := p.Slug
			if targetSlug == "" {
				targetSlug = slugify.Slug(p.Title)
			}

			if strings.EqualFold(p.Type, "LEARNING_PATH") && h.lpService != nil {
				if lp, err := h.lpService.GetByIDOrSlug(c.Request.Context(), targetSlug); err == nil && lp != nil {
					exists = true
					existingID = lp.ID
				}
			} else if h.cmsService != nil {
				cmsType := entity.CMSType(p.Type)
				if cmsType == entity.CMSTypeArticle || cmsType == entity.CMSTypeCourse {
					if res, err := h.cmsService.GetBySlug(c.Request.Context(), targetSlug, cmsType); err == nil && res != nil {
						exists = true
						if crs, ok := res.(*entity.Course); ok {
							existingID = crs.ID
						} else if art, ok := res.(*entity.Article); ok {
							existingID = art.ID
						}
					}
				}
			}

			body, sections, imgWarnings := p.Body, mapParsedSections(p.Sections), []string(nil)
			if super && len(zipImages) > 0 && len(p.ImageRefs) > 0 {
				body, sections, imgWarnings = h.storeAndRewriteImages(c.Request.Context(), p, zipImages)
			}
			warnings := append(append([]string(nil), p.Warnings...), imgWarnings...)

			items = append(items, dto.ImportPreviewItem{
				FileName:            p.FileName,
				Index:               len(items),
				Type:                p.Type,
				Title:               p.Title,
				Description:         p.Description,
				Body:                body,
				BodyFormat:          p.BodyFormat,
				CategorySlug:        p.CategorySlug,
				CategoryID:          categoryID,
				ArticleType:         p.ArticleType,
				CourseType:          p.CourseType,
				InteractiveMetadata: p.InteractiveMetadata,
				Kind:                p.Kind,
				Slug:                p.Slug,
				SequencedCourses:    p.SequencedCourses,
				Status:              p.Status,
				Tags:                p.Tags,
				Sections:            sections,
				Warnings:            warnings,
				Valid:               itemValid,
				Error:               itemErr,
				Exists:              exists,
				ExistingID:          existingID,
			})
		}
	}

	valid := 0
	for _, it := range items {
		if it.Valid {
			valid++
		}
	}

	response.OK(c, dto.ImportPreviewResponse{
		Items:   items,
		Total:   len(items),
		Valid:   valid,
		Invalid: len(items) - valid,
	})
}

// POST /api/import/confirm
// Creates all submitted items as DRAFT. Authenticated user becomes the author.
func (h *ImportHandler) Confirm(c *gin.Context) {
	var req dto.ImportConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if len(req.Items) == 0 {
		response.BadRequest(c, "no items to import")
		return
	}

	userID := middleware.GetUserID(c)
	isAdminUser := isSuperOrAdmin(c)
	results := make([]dto.ImportConfirmResult, 0, len(req.Items))

	var dbCategories []*entity.Category
	if h.categoryService != nil {
		if cats, _, err := h.categoryService.GetAll(c.Request.Context(), 0, 1000); err == nil {
			dbCategories = cats
		}
	}

	for _, item := range req.Items {
		if strings.EqualFold(item.Type, "LEARNING_PATH") {
			kind := item.Kind
			if kind == "" {
				kind = "LEARNING_PLAN"
			}
			if kind != "LEARNING_PLAN" && kind != "INTERVIEW_PREP" {
				results = append(results, dto.ImportConfirmResult{Title: item.Title, Success: false, Error: fmt.Sprintf("invalid learning path kind %q (expected LEARNING_PLAN or INTERVIEW_PREP)", kind)})
				continue
			}
			pathSlug := item.Slug
			if pathSlug == "" {
				pathSlug = slugify.Slug(item.Title)
			}

			var lp *entity.LearningPath
			var err error
			if h.lpService != nil {
				if item.Exists && item.ExistingID != 0 {
					if !item.Overwrite {
						// User chose to skip duplicate
						results = append(results, dto.ImportConfirmResult{
							Title:   item.Title,
							Success: true, // skipped successfully
							Error:   "Skipped duplicate",
						})
						continue
					}
					// Overwrite
					desc := item.Description
					title := item.Title
					_, err = h.lpService.Update(c.Request.Context(), item.ExistingID, lpsvc.UpdateRequest{
						Title:       &title,
						Description: &desc,
						Slug:        &pathSlug,
					})
					if err == nil {
						lp, _ = h.lpService.GetByIDOrSlug(c.Request.Context(), pathSlug)
					}
				} else {
					lp, err = h.lpService.Create(c.Request.Context(), lpsvc.CreateRequest{
						Kind:        kind,
						Title:       item.Title,
						Description: item.Description,
						Slug:        pathSlug,
						CreatedByID: userID,
					})
				}
			}

			if err != nil || lp == nil {
				errStr := "failed to create learning path"
				if err != nil {
					errStr = err.Error()
				}
				results = append(results, dto.ImportConfirmResult{
					Title:   item.Title,
					Success: false,
					Error:   errStr,
				})
				continue
			}

			// Link sequenced courses if provided
			if len(item.SequencedCourses) > 0 && h.cmsService != nil {
				var entries []lpsvc.CourseEntry
				for idx, courseRef := range item.SequencedCourses {
					var courseID uint
					if id, parseErr := strconv.ParseUint(courseRef, 10, 64); parseErr == nil {
						courseID = uint(id)
					} else if res, getErr := h.cmsService.GetBySlug(c.Request.Context(), courseRef, entity.CMSTypeCourse); getErr == nil && res != nil {
						if crs, ok := res.(*entity.Course); ok {
							courseID = crs.ID
						}
					}
					if courseID != 0 {
						entries = append(entries, lpsvc.CourseEntry{CourseID: courseID, SortOrder: idx + 1})
					}
				}
				if len(entries) > 0 {
					if setErr := h.lpService.SetCourses(c.Request.Context(), lp.ID, entries); setErr != nil {
						results = append(results, dto.ImportConfirmResult{Title: item.Title, ID: lp.ID, Success: false, Error: fmt.Sprintf("learning path saved but linking courses failed: %v", setErr)})
						continue
					}
				}
			}

			results = append(results, dto.ImportConfirmResult{
				Title:   item.Title,
				ID:      lp.ID,
				Success: true,
			})
			continue
		}

		var desc, body, artType, courseType, interactiveMeta *string
		if item.Description != "" {
			desc = &item.Description
		}
		if item.Body != "" {
			body = &item.Body
		}
		if item.ArticleType != "" {
			artType = &item.ArticleType
		}
		if item.CourseType != "" {
			courseType = &item.CourseType
		}
		if item.InteractiveMetadata != "" && item.InteractiveMetadata != "null" {
			interactiveMeta = &item.InteractiveMetadata
		}

		var categoryID *uint = item.CategoryID
		if item.CategorySlug != "" && len(dbCategories) > 0 {
			slugLower := strings.ToLower(strings.TrimSpace(item.CategorySlug))
			slugClean := regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(slugLower, "")
			var matched *entity.Category
			for _, cat := range dbCategories {
				if cat.IsVirtual {
					continue
				}
				catSlugLower := strings.ToLower(cat.Slug)
				catNameLower := strings.ToLower(cat.Name)
				catSlugClean := regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(catSlugLower, "")
				catNameClean := regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(catNameLower, "")

				if catSlugLower == slugLower || catNameLower == slugLower ||
					(slugClean != "" && (catSlugClean == slugClean || catNameClean == slugClean)) {
					matched = cat
					break
				}
			}
			if matched != nil {
				categoryID = &matched.ID
			}
		}

		cmsType := entity.CMSType(item.Type)
		var result any
		var err error

		if item.Exists && item.ExistingID != 0 {
			if !item.Overwrite {
				// User chose to discard/skip the duplicate
				results = append(results, dto.ImportConfirmResult{
					Title:   item.Title,
					Success: true, // skipped successfully
					Error:   "Skipped duplicate",
				})
				continue
			}

			// Overwrite
			result, err = h.cmsService.Update(c.Request.Context(), item.ExistingID, cmsType, cmssvc.UpdateRequest{
				Title:               &item.Title,
				Description:         desc,
				Body:                body,
				ArticleType:         artType,
				CourseType:          courseType,
				InteractiveMetadata: interactiveMeta,
				CategoryID:          categoryID,
			})
		} else {
			// Create new
			result, err = h.cmsService.Create(c.Request.Context(), cmssvc.CreateRequest{
				Type:                cmsType,
				Title:               item.Title,
				Description:         desc,
				Body:                body,
				ArticleType:         artType,
				CourseType:          courseType,
				InteractiveMetadata: interactiveMeta,
				CategoryID:          categoryID,
				CreatedByID:         userID,
				Slug:                importSlug(item),
			})
		}

		if err != nil {
			results = append(results, dto.ImportConfirmResult{
				Title:   item.Title,
				Success: false,
				Error:   err.Error(),
			})
			continue
		}

		taskType := entity.TaskTypeArticle
		if cmsType == entity.CMSTypeCourse {
			taskType = entity.TaskTypeCourse
		}
		var contentID uint
		if cmsType == entity.CMSTypeCourse {
			if course, ok := result.(*entity.Course); ok {
				contentID = course.ID
			}
		} else {
			if article, ok := result.(*entity.Article); ok {
				contentID = article.ID
			}
		}

		shouldPublish := isAdminUser && strings.EqualFold(strings.TrimSpace(item.Status), string(entity.CMSStatusPublished))

		if contentID != 0 {
			if shouldPublish {
				if pubErr := h.cmsService.Publish(c.Request.Context(), contentID, cmsType, &userID); pubErr != nil {
					log.Printf("[import] Confirm: failed to publish content id=%d: %v", contentID, pubErr)
				}
				if err := h.taskService.UpsertPublishedTask(c.Request.Context(), contentID, taskType, item.Title, userID); err != nil {
					log.Printf("[import] Confirm: failed to upsert published task for %s id=%d: %v", item.Type, contentID, err)
				}
			} else {
				if err := h.taskService.UpsertOwnerTask(c.Request.Context(), contentID, taskType, item.Title, userID, "draft"); err != nil {
					log.Printf("[import] Confirm: failed to upsert owner task for %s id=%d: %v", item.Type, contentID, err)
				}
			}
		}

		var structureWarning string
		if cmsType == entity.CMSTypeCourse && contentID != 0 && len(item.Sections) > 0 {
			// One transaction: on overwrite the old sections/lessons are replaced (not appended to), and a
			// failure leaves the previous structure intact instead of a half-built course.
			if err := h.sectionService.ReplaceCourseStructure(c.Request.Context(), contentID, toStructure(item.Sections)); err != nil {
				structureWarning = fmt.Sprintf("course saved but structure import failed: %v", err)
				log.Printf("[import] Confirm: %s (course id=%d)", structureWarning, contentID)
			}
		}

		auditAction := "article.created"
		if cmsType == entity.CMSTypeCourse {
			auditAction = "course.created"
		}
		if shouldPublish {
			auditAction = "article.published"
			if cmsType == entity.CMSTypeCourse {
				auditAction = "course.published"
			}
		}
		middleware.LogAudit(c, auditAction, item.Type, fmt.Sprint(contentID), item.Title, map[string]interface{}{"source": "bulk_import", "published_direct": shouldPublish})

		results = append(results, dto.ImportConfirmResult{
			Title:   item.Title,
			ID:      contentID,
			Success: structureWarning == "",
			Error:   structureWarning,
		})
	}

	created, failed := 0, 0
	for _, r := range results {
		if r.Success {
			created++
		} else {
			failed++
		}
	}

	response.OK(c, dto.ImportConfirmResponse{
		Created: created,
		Failed:  failed,
		Results: results,
	})
}

func mapParsedSections(sections []importer.ParsedSection) []dto.ImportSectionItem {
	if len(sections) == 0 {
		return nil
	}
	out := make([]dto.ImportSectionItem, len(sections))
	for i, sec := range sections {
		lessons := make([]dto.ImportLessonItem, len(sec.Lessons))
		for j, l := range sec.Lessons {
			lessons[j] = dto.ImportLessonItem{
				Title:    l.Title,
				Type:     l.Type,
				Duration: l.Duration,
				Order:    l.Order,
				Body:     l.Body,
			}
		}
		out[i] = dto.ImportSectionItem{Title: sec.Title, Order: sec.Order, Lessons: lessons}
	}
	return out
}

func isSuperOrAdmin(c *gin.Context) bool {
	if middleware.IsAdmin(c) {
		return true
	}
	roleVal, _ := c.Get("role")
	if r, ok := roleVal.(string); ok {
		rLower := strings.ToLower(r)
		return rLower == "admin" || rLower == "superadmin" || rLower == "super_admin" || rLower == "super-admin" || rLower == "masteradmin" || rLower == "master_admin"
	}
	return false
}

// importSlug returns the slug an imported item should be created with, or nil to let the
// repository derive a unique one from the title.
func importSlug(item dto.ImportConfirmItem) *string {
	s := slugify.Slug(strings.TrimSpace(item.Slug))
	if s == "" {
		return nil
	}
	return &s
}

func toStructure(sections []dto.ImportSectionItem) []sectionsvc.StructureSection {
	out := make([]sectionsvc.StructureSection, len(sections))
	for i, sec := range sections {
		lessons := make([]sectionsvc.StructureLesson, len(sec.Lessons))
		for j, l := range sec.Lessons {
			body := l.Body
			lessons[j] = sectionsvc.StructureLesson{
				Title:    l.Title,
				Type:     entity.LessonType(l.Type),
				Content:  &body,
				Duration: l.Duration,
				Order:    l.Order,
			}
		}
		out[i] = sectionsvc.StructureSection{Title: sec.Title, Order: sec.Order, Lessons: lessons}
	}
	return out
}

// masterAdminGroups are the group names that make a user a super admin. Plain "Admin" is a
// regular administrator and is deliberately not in this list.
var masterAdminGroups = []string{"superadmin", "super_admin", "super-admin", "masteradmin", "master_admin"}

// isSuperAdmin reports whether the caller belongs to a super-admin group. The JWT role is just
// "admin" for both admins and super admins, so group membership is looked up from the database.
func (h *ImportHandler) isSuperAdmin(c *gin.Context) bool {
	if !middleware.IsAdmin(c) || h.userService == nil {
		return false
	}
	groups, err := h.userService.GetGroups(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		return false
	}
	for _, g := range groups {
		name := strings.ToLower(strings.TrimSpace(g.Name))
		for _, m := range masterAdminGroups {
			if name == m {
				return true
			}
		}
	}
	return false
}

// storeAndRewriteImages saves each image a document references (from the uploaded zip) through
// the configured storage provider and rewrites the references to the stored URLs. Identical
// images are stored once. Missing images and storage failures become warnings, not errors.
func (h *ImportHandler) storeAndRewriteImages(ctx context.Context, p importer.ParsedItem, assets map[string]*importer.ImageAsset) (string, []dto.ImportSectionItem, []string) {
	sections := mapParsedSections(p.Sections)
	if h.settingsService == nil {
		return p.Body, sections, []string{"image storage is not configured; image references were left unchanged"}
	}
	provider, err := h.settingsService.GetStorageProvider(ctx)
	if err != nil {
		return p.Body, sections, []string{fmt.Sprintf("image storage unavailable (%v); image references were left unchanged", err)}
	}

	var warnings []string
	mapping := map[string]string{}
	stored := map[string]string{} // content hash -> URL
	for _, ref := range p.ImageRefs {
		resolved, ok := importer.ResolveImagePath(p.SourcePath, ref.Raw)
		if !ok {
			continue // already reported by the parser
		}
		asset, found := importer.LookupImage(assets, resolved)
		if !found {
			continue // already reported by the parser
		}
		sum := sha256.Sum256(asset.Data)
		key := hex.EncodeToString(sum[:])
		url, done := stored[key]
		if !done {
			_, publicURL, saveErr := provider.Save(bytes.NewReader(asset.Data), "import"+importer.ImageExt(asset.MIME), asset.MIME, int64(len(asset.Data)))
			if saveErr != nil {
				warnings = append(warnings, fmt.Sprintf("image %q could not be stored: %v", ref.Raw, saveErr))
				continue
			}
			url = publicURL
			stored[key] = url
		}
		mapping[ref.Raw] = url
	}

	body := importer.RewriteImageRefs(p.Body, mapping)
	for i := range sections {
		for j := range sections[i].Lessons {
			sections[i].Lessons[j].Body = importer.RewriteImageRefs(sections[i].Lessons[j].Body, mapping)
		}
	}
	return body, sections, warnings
}

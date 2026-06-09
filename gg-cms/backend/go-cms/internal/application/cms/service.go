package cms

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type AttachmentInput struct {
	Name     string
	URL      string
	MimeType string
	Size     int64
}

type CreateRequest struct {
	Type         entity.CMSType
	Title        string
	Description  *string
	Body         *string
	ArticleType  *string
	CourseType   *string
	CategoryID   *uint
	CreatedByID  uint
	ThumbnailURL *string
	Attachments  []AttachmentInput
}

type UpdateRequest struct {
	Title        *string
	Description  *string
	Body         *string
	ArticleType  *string
	CourseType   *string
	CategoryID   *uint
	ThumbnailURL *string
	Attachments  []AttachmentInput
	ActorID      uint // populated by handler; used for EDIT event recording
}

type Service interface {
	GetAll(ctx context.Context, cmsType entity.CMSType, filter repository.ArticleFilter, page, size int) (interface{}, int64, error)
	GetByID(ctx context.Context, id uint, cmsType entity.CMSType) (interface{}, error)
	GetByPublicID(ctx context.Context, publicID string, cmsType entity.CMSType) (interface{}, error)
	GetBySlug(ctx context.Context, slug string, cmsType entity.CMSType) (interface{}, error)
	Create(ctx context.Context, req CreateRequest) (interface{}, error)
	Update(ctx context.Context, id uint, cmsType entity.CMSType, req UpdateRequest) (interface{}, error)
	Delete(ctx context.Context, id uint, cmsType entity.CMSType) error
	Submit(ctx context.Context, id uint, cmsType entity.CMSType, reviewerID *uint) error
	Approve(ctx context.Context, id uint, cmsType entity.CMSType, approvedBy *uint, callerIsAdmin bool) error
	Publish(ctx context.Context, id uint, cmsType entity.CMSType, publishedBy *uint) error
	SendBack(ctx context.Context, id uint, cmsType entity.CMSType, comment string) error
	Reject(ctx context.Context, id uint, cmsType entity.CMSType, reviewerID uint, comment string, callerIsAdmin bool) error
	GetActivity(ctx context.Context, id uint, cmsType entity.CMSType) ([]*entity.WorkflowEvent, error)
	// ClaimReview assigns the calling user as the reviewer. Fails if another reviewer has already claimed it.
	ClaimReview(ctx context.Context, id uint, cmsType entity.CMSType, userID uint) error
	// AssignReviewer lets an admin set a specific reviewer without changing the CMS status.
	AssignReviewer(ctx context.Context, id uint, cmsType entity.CMSType, assignerID, targetUserID uint) error
	// ReassignReview releases the current reviewer assignment (sets reviewer_id to nil) and
	// records a handoff note, making the content available for another reviewer to claim.
	ReassignReview(ctx context.Context, id uint, cmsType entity.CMSType, note string, actorID uint) error
	// SaveReviewNote persists the reviewer's draft comment without changing the workflow status.
	SaveReviewNote(ctx context.Context, id uint, cmsType entity.CMSType, note string) error
	// GetReviewProgress returns how many approvals have been recorded and how many are required.
	GetReviewProgress(ctx context.Context, id uint, cmsType entity.CMSType) (approvalCount int, requiredApprovals int, err error)
}

type service struct {
	articleRepo         repository.ArticleRepository
	courseRepo          repository.CourseRepository
	sectionRepo         repository.SectionRepository
	groupRepo           repository.GroupRepository
	categoryRepo        repository.CategoryRepository
	workflowEventRepo   repository.WorkflowEventRepository
	userRepo            repository.UserRepository
	contentReviewRepo   repository.ContentReviewRepository
}

func NewService(articleRepo repository.ArticleRepository, courseRepo repository.CourseRepository, sectionRepo repository.SectionRepository, groupRepo repository.GroupRepository, categoryRepo repository.CategoryRepository, workflowEventRepo repository.WorkflowEventRepository, userRepo repository.UserRepository, contentReviewRepo repository.ContentReviewRepository) Service {
	return &service{
		articleRepo:       articleRepo,
		courseRepo:        courseRepo,
		sectionRepo:       sectionRepo,
		groupRepo:         groupRepo,
		categoryRepo:      categoryRepo,
		workflowEventRepo: workflowEventRepo,
		userRepo:          userRepo,
		contentReviewRepo: contentReviewRepo,
	}
}

// recordEvent saves a workflow audit event, ignoring errors so they never block the main operation.
// version is the content version at the time of the event (0 means unknown/not applicable).
// titleSnapshot is the content title at the time of the event.
func (s *service) recordEvent(ctx context.Context, entityType string, entityID uint, userID uint, fromStatus, toStatus, action string, comment *string, version int, titleSnapshot string) {
	if s.workflowEventRepo == nil {
		return
	}
	var versionPtr *int
	if version > 0 {
		v := version
		versionPtr = &v
	}
	ev := &entity.WorkflowEvent{
		EntityType:    entityType,
		EntityID:      entityID,
		UserID:        userID,
		FromStatus:    fromStatus,
		ToStatus:      toStatus,
		Action:        action,
		Comment:       comment,
		Version:       versionPtr,
		TitleSnapshot: titleSnapshot,
	}
	if s.userRepo != nil && userID > 0 {
		if user, err := s.userRepo.FindByID(ctx, userID); err == nil {
			ev.User.Name = user.Name
		}
	}
	_ = s.workflowEventRepo.Create(ctx, ev)
}

func (s *service) GetAll(ctx context.Context, cmsType entity.CMSType, filter repository.ArticleFilter, page, size int) (interface{}, int64, error) {
	switch cmsType {
	case entity.CMSTypeCourse:
		cf := repository.CourseFilter{
			Status:          filter.Status,
			CreatedBy:       filter.CreatedBy,
			ReviewerID:      filter.ReviewerID,
			CategoryID:      filter.CategoryID,
			CourseType:      filter.CourseType,
			Search:          filter.Search,
			PubliclyVisible: filter.PubliclyVisible,
		}
		return s.courseRepo.FindAll(ctx, cf, page, size)
	default:
		return s.articleRepo.FindAll(ctx, filter, page, size)
	}
}

func (s *service) GetByID(ctx context.Context, id uint, cmsType entity.CMSType) (interface{}, error) {
	if cmsType == entity.CMSTypeCourse {
		course, err := s.courseRepo.FindByID(ctx, id)
		if err != nil {
			return nil, err
		}
		s.ensureCourseBaseline(ctx, course)
		return course, nil
	}
	return s.articleRepo.FindByID(ctx, id)
}

func (s *service) GetByPublicID(ctx context.Context, publicID string, cmsType entity.CMSType) (interface{}, error) {
	if cmsType == entity.CMSTypeCourse {
		course, err := s.courseRepo.FindByPublicID(ctx, publicID)
		if err != nil {
			return nil, err
		}
		s.ensureCourseBaseline(ctx, course)
		return course, nil
	}
	return s.articleRepo.FindByPublicID(ctx, publicID)
}

// ensureCourseBaseline lazily saves reviewBaselineChapters for courses in REVIEW or APPROVED
// state that have no snapshot yet (e.g. submitted before this feature was deployed).
// The extra sectionRepo call only fires once per course — the nil check prevents re-running.
func (s *service) ensureCourseBaseline(ctx context.Context, course *entity.Course) {
	if course == nil || s.sectionRepo == nil || s.courseRepo == nil {
		return
	}
	inReviewCycle := course.Status == entity.CMSStatusReview || course.Status == entity.CMSStatusApproved
	noBaseline := course.ReviewBaselineChapters == nil && course.PublishedChaptersSnapshot == nil
	if !inReviewCycle || !noBaseline {
		return
	}
	secs, err := s.sectionRepo.FindByCourseID(ctx, course.ID)
	if err != nil {
		return
	}
	snap, err := sectionsToSnapshot(secs)
	if err != nil {
		return
	}
	if saveErr := s.courseRepo.SaveReviewBaselineChapters(ctx, course.ID, snap); saveErr == nil {
		course.ReviewBaselineChapters = &snap
	}
}

func (s *service) GetBySlug(ctx context.Context, slug string, cmsType entity.CMSType) (interface{}, error) {
	if cmsType == entity.CMSTypeCourse {
		return s.courseRepo.FindBySlug(ctx, slug)
	}
	return s.articleRepo.FindBySlug(ctx, slug)
}

func (s *service) Create(ctx context.Context, req CreateRequest) (interface{}, error) {
	attachments := toAttachmentEntities(req.Attachments, nil, nil)

	if req.Type == entity.CMSTypeCourse {
		courseType := entity.CourseTypeStandard
		if req.CourseType != nil && *req.CourseType != "" {
			courseType = entity.CourseType(*req.CourseType)
		}
		course := &entity.Course{
			Title:        req.Title,
			Description:  req.Description,
			Body:         req.Body,
			CourseType:   courseType,
			Status:       entity.CMSStatusDraft,
			CategoryID:   req.CategoryID,
			CreatedByID:  req.CreatedByID,
			ThumbnailURL: req.ThumbnailURL,
			Version:      1,
			Attachments:  attachments,
		}
		if err := s.courseRepo.Create(ctx, course); err != nil {
			return nil, fmt.Errorf("failed to create course: %w", err)
		}
		return course, nil
	}

	articleType := ""
	if req.ArticleType != nil {
		articleType = *req.ArticleType
	}
	article := &entity.Article{
		Title:        req.Title,
		Description:  req.Description,
		Body:         req.Body,
		ArticleType:  articleType,
		Status:       entity.CMSStatusDraft,
		CategoryID:   req.CategoryID,
		CreatedByID:  req.CreatedByID,
		ThumbnailURL: req.ThumbnailURL,
		Version:      1,
		Attachments:  attachments,
	}
	if err := s.articleRepo.Create(ctx, article); err != nil {
		return nil, fmt.Errorf("failed to create article: %w", err)
	}
	return article, nil
}

func (s *service) Update(ctx context.Context, id uint, cmsType entity.CMSType, req UpdateRequest) (interface{}, error) {
	if cmsType == entity.CMSTypeCourse {
		course, err := s.courseRepo.FindByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("course not found: %w", err)
		}
		fromStatus := string(course.Status)

		// If content is currently PUBLISHED, save a snapshot before overwriting.
		// The status is reset to DRAFT so the updated content goes through review.
		var courseEditComment *string
		if course.Status == entity.CMSStatusPublished {
			if snapErr := s.courseRepo.SaveSnapshot(ctx, id, course); snapErr != nil {
				return nil, fmt.Errorf("failed to save published snapshot: %w", snapErr)
			}
			// Sync in-memory entity so the subsequent Save() does not overwrite the snapshot with nil.
			v := course.Version
			course.HasPendingDraft = true
			course.PublishedVersion = &v
			course.PublishedTitle = course.Title
			course.PublishedDescription = course.Description
			course.PublishedBody = course.Body
			course.Status = entity.CMSStatusDraft
			var parts []string
			if req.Title != nil && *req.Title != course.Title {
				parts = append(parts, "title")
			}
			if req.Description != nil {
				parts = append(parts, "description")
			}
			if req.Body != nil {
				parts = append(parts, "body")
			}
			if req.CategoryID != nil {
				parts = append(parts, "category")
			}
			note := fmt.Sprintf("Published v%d snapshot preserved", v)
			if len(parts) > 0 {
				note += " — changed: " + strings.Join(parts, ", ")
			}
			courseEditComment = &note
		}

		if req.Title != nil {
			course.Title = *req.Title
		}
		// Only overwrite non-nil pointer fields so partial updates don't clear existing data.
		if req.Description != nil {
			course.Description = req.Description
		}
		if req.Body != nil {
			course.Body = req.Body
		}
		if req.CategoryID != nil {
			course.CategoryID = req.CategoryID
		}
		if req.ThumbnailURL != nil {
			course.ThumbnailURL = req.ThumbnailURL
		}
		if req.CourseType != nil && *req.CourseType != "" {
			course.CourseType = entity.CourseType(*req.CourseType)
		}
		course.Version++
		if len(req.Attachments) > 0 {
			course.Attachments = toAttachmentEntities(req.Attachments, nil, &id)
		}
		if err := s.courseRepo.Update(ctx, course); err != nil {
			return nil, fmt.Errorf("failed to update course: %w", err)
		}
		s.recordEvent(ctx, string(cmsType), id, req.ActorID, fromStatus, string(course.Status), "EDIT", courseEditComment, course.Version, course.Title)
		return course, nil
	}

	article, err := s.articleRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("article not found: %w", err)
	}
	fromStatus := string(article.Status)

	// If content is currently PUBLISHED, save a snapshot before overwriting.
	var editComment *string
	if article.Status == entity.CMSStatusPublished {
		if snapErr := s.articleRepo.SaveSnapshot(ctx, id, article); snapErr != nil {
			return nil, fmt.Errorf("failed to save published snapshot: %w", snapErr)
		}
		// Sync in-memory entity so the subsequent Save() does not overwrite the snapshot with nil.
		v := article.Version
		article.HasPendingDraft = true
		article.PublishedVersion = &v
		article.PublishedTitle = article.Title
		article.PublishedDescription = article.Description
		article.PublishedBody = article.Body
		article.Status = entity.CMSStatusDraft
		// Build audit note listing what changed in this edit (compared before applying req).
		var parts []string
		if req.Title != nil && *req.Title != article.Title {
			parts = append(parts, "title")
		}
		if req.Description != nil {
			parts = append(parts, "description")
		}
		if req.Body != nil {
			parts = append(parts, "body")
		}
		if req.CategoryID != nil {
			parts = append(parts, "category")
		}
		note := fmt.Sprintf("Published v%d snapshot preserved", v)
		if len(parts) > 0 {
			note += " — changed: " + strings.Join(parts, ", ")
		}
		editComment = &note
	}

	if req.Title != nil {
		article.Title = *req.Title
	}
	// Only overwrite non-nil pointer fields so partial updates don't clear existing data.
	if req.Description != nil {
		article.Description = req.Description
	}
	if req.Body != nil {
		article.Body = req.Body
	}
	if req.CategoryID != nil {
		article.CategoryID = req.CategoryID
	}
	if req.ThumbnailURL != nil {
		article.ThumbnailURL = req.ThumbnailURL
	}
	if req.ArticleType != nil {
		article.ArticleType = *req.ArticleType
	}
	article.Version++
	if len(req.Attachments) > 0 {
		article.Attachments = toAttachmentEntities(req.Attachments, &id, nil)
	}
	if err := s.articleRepo.Update(ctx, article); err != nil {
		return nil, fmt.Errorf("failed to update article: %w", err)
	}
	s.recordEvent(ctx, string(cmsType), id, req.ActorID, fromStatus, string(article.Status), "EDIT", editComment, article.Version, article.Title)
	return article, nil
}

func (s *service) Delete(ctx context.Context, id uint, cmsType entity.CMSType) error {
	if cmsType == entity.CMSTypeCourse {
		return s.courseRepo.Delete(ctx, id)
	}
	return s.articleRepo.Delete(ctx, id)
}

func (s *service) Submit(ctx context.Context, id uint, cmsType entity.CMSType, reviewerID *uint) error {
	// No auto-assignment: reviewer_id is left nil so the content appears in the "available
	// for review" queue visible to all members of the category's reviewer groups.

	// For courses on their first review cycle (no baseline yet), snapshot the current
	// chapters so reviewers and publishers can diff against what was originally submitted.
	if cmsType == entity.CMSTypeCourse && s.sectionRepo != nil && s.courseRepo != nil {
		if existing, fetchErr := s.courseRepo.FindByID(ctx, id); fetchErr == nil {
			if existing.ReviewBaselineChapters == nil && existing.PublishedChaptersSnapshot == nil {
				if secs, secErr := s.sectionRepo.FindByCourseID(ctx, id); secErr == nil {
					if snap, snapErr := sectionsToSnapshot(secs); snapErr == nil {
						_ = s.courseRepo.SaveReviewBaselineChapters(ctx, id, snap)
					}
				}
			}
		}
	}

	fromStatus, version, title := s.currentStatusAndVersion(ctx, id, cmsType)
	// Always clear any previous reviewer so the item enters the unassigned queue.
	if cmsType == entity.CMSTypeCourse {
		_ = s.courseRepo.SetReviewer(ctx, id, nil)
	} else {
		_ = s.articleRepo.SetReviewer(ctx, id, nil)
	}
	var err error
	if cmsType == entity.CMSTypeCourse {
		err = s.courseRepo.UpdateStatus(ctx, id, entity.CMSStatusReview, reviewerID, nil, nil)
	} else {
		err = s.articleRepo.UpdateStatus(ctx, id, entity.CMSStatusReview, reviewerID, nil, nil)
	}
	if err == nil {
		actorID := uint(0)
		if reviewerID != nil {
			actorID = *reviewerID
		}
		s.recordEvent(ctx, string(cmsType), id, actorID, fromStatus, "REVIEW", "SUBMIT", nil, version, title)
	}
	return err
}


// isUserReviewerForCategory returns true if the user belongs to at least one reviewer
// group linked to the given category.
func (s *service) isUserReviewerForCategory(ctx context.Context, userID uint, categoryID uint) bool {
	reviewerGroups, err := s.categoryRepo.FindReviewerGroups(ctx, categoryID)
	if err != nil || len(reviewerGroups) == 0 {
		return false
	}
	userGroups, err := s.groupRepo.FindByUserID(ctx, userID)
	if err != nil {
		return false
	}
	for _, rg := range reviewerGroups {
		for _, ug := range userGroups {
			if rg.ID == ug.ID {
				return true
			}
		}
	}
	return false
}

func (s *service) Approve(ctx context.Context, id uint, cmsType entity.CMSType, approvedBy *uint, callerIsAdmin bool) error {
	fromStatus, version, title := s.currentStatusAndVersion(ctx, id, cmsType)

	actorID := uint(0)
	if approvedBy != nil {
		actorID = *approvedBy
	}

	// Enforce reviewer group membership for non-admin callers.
	// Admins bypass this check entirely.
	if actorID > 0 && !callerIsAdmin {
		var categoryID *uint
		if cmsType == entity.CMSTypeCourse {
			if c, err := s.courseRepo.FindByID(ctx, id); err == nil {
				categoryID = c.CategoryID
			}
		} else {
			if a, err := s.articleRepo.FindByID(ctx, id); err == nil {
				categoryID = a.CategoryID
			}
		}
		if categoryID != nil && !s.isUserReviewerForCategory(ctx, actorID, *categoryID) {
			return fmt.Errorf("user is not a reviewer for this content's category")
		}
	}

	// Record this reviewer's individual approval.
	if s.contentReviewRepo != nil && actorID > 0 {
		_ = s.contentReviewRepo.Upsert(ctx, id, string(cmsType), actorID)
	}

	// Determine required approvals from the category.
	required := 1
	if s.contentReviewRepo != nil {
		var categoryID *uint
		if cmsType == entity.CMSTypeCourse {
			if c, err := s.courseRepo.FindByID(ctx, id); err == nil {
				categoryID = c.CategoryID
			}
		} else {
			if a, err := s.articleRepo.FindByID(ctx, id); err == nil {
				categoryID = a.CategoryID
			}
		}
		if categoryID != nil {
			if cat, err := s.categoryRepo.FindByID(ctx, *categoryID); err == nil && cat.RequiredApprovals > 1 {
				required = cat.RequiredApprovals
			}
		}
	}

	// Count how many unique reviewers have approved so far.
	count := 1
	if s.contentReviewRepo != nil {
		if n, err := s.contentReviewRepo.Count(ctx, id, string(cmsType)); err == nil {
			count = n
		}
	}

	if count < required {
		// Not enough approvals yet — clear reviewer so the next reviewer can claim.
		if cmsType == entity.CMSTypeCourse {
			_ = s.courseRepo.SetReviewer(ctx, id, nil)
		} else {
			_ = s.articleRepo.SetReviewer(ctx, id, nil)
		}
		s.recordEvent(ctx, string(cmsType), id, actorID, fromStatus, fromStatus, "PARTIAL_APPROVAL", nil, version, title)
		return nil
	}

	// All required approvals received — move to APPROVED and clear reviewer.
	var err error
	if cmsType == entity.CMSTypeCourse {
		err = s.courseRepo.UpdateStatus(ctx, id, entity.CMSStatusApproved, nil, nil, nil)
	} else {
		err = s.articleRepo.UpdateStatus(ctx, id, entity.CMSStatusApproved, nil, nil, nil)
	}
	if err != nil {
		return err
	}
	if cmsType == entity.CMSTypeCourse {
		_ = s.courseRepo.SetReviewer(ctx, id, nil)
	} else {
		_ = s.articleRepo.SetReviewer(ctx, id, nil)
	}
	// Clear approval records so future re-submissions start fresh.
	if s.contentReviewRepo != nil {
		_ = s.contentReviewRepo.DeleteByContent(ctx, id, string(cmsType))
	}
	s.recordEvent(ctx, string(cmsType), id, actorID, fromStatus, "APPROVED", "APPROVE", nil, version, title)
	return nil
}

func (s *service) GetReviewProgress(ctx context.Context, id uint, cmsType entity.CMSType) (approvalCount int, requiredApprovals int, err error) {
	requiredApprovals = 1
	var categoryID *uint
	if cmsType == entity.CMSTypeCourse {
		if c, e := s.courseRepo.FindByID(ctx, id); e == nil {
			categoryID = c.CategoryID
		}
	} else {
		if a, e := s.articleRepo.FindByID(ctx, id); e == nil {
			categoryID = a.CategoryID
		}
	}
	if categoryID != nil {
		if cat, e := s.categoryRepo.FindByID(ctx, *categoryID); e == nil {
			requiredApprovals = cat.RequiredApprovals
		}
	}
	if s.contentReviewRepo != nil {
		approvalCount, err = s.contentReviewRepo.Count(ctx, id, string(cmsType))
	}
	return
}

func (s *service) Publish(ctx context.Context, id uint, cmsType entity.CMSType, publishedBy *uint) error {
	fromStatus, version, title := s.currentStatusAndVersion(ctx, id, cmsType)
	// Check whether a pending draft snapshot exists — if so, clear it after publishing.
	hasPendingDraft := s.hasPendingDraft(ctx, id, cmsType)

	now := time.Now()
	var err error
	if cmsType == entity.CMSTypeCourse {
		err = s.courseRepo.UpdateStatus(ctx, id, entity.CMSStatusPublished, publishedBy, nil, &now)
	} else {
		err = s.articleRepo.UpdateStatus(ctx, id, entity.CMSStatusPublished, publishedBy, nil, &now)
	}
	if err == nil {
		// Clear the old snapshot now that the new revision is live.
		if hasPendingDraft {
			if cmsType == entity.CMSTypeCourse {
				_ = s.courseRepo.ClearSnapshot(ctx, id)
			} else {
				_ = s.articleRepo.ClearSnapshot(ctx, id)
			}
		}
		// Save chapter hierarchy snapshot for courses so the next reviewer can diff against it.
		if cmsType == entity.CMSTypeCourse && s.sectionRepo != nil {
			if secs, secErr := s.sectionRepo.FindByCourseID(ctx, id); secErr == nil {
				if snap, snapErr := sectionsToSnapshot(secs); snapErr == nil {
					_ = s.courseRepo.SaveChaptersSnapshot(ctx, id, snap)
				}
			}
		}
		actorID := uint(0)
		if publishedBy != nil {
			actorID = *publishedBy
		}
		s.recordEvent(ctx, string(cmsType), id, actorID, fromStatus, "PUBLISHED", "PUBLISH", nil, version, title)
	}
	return err
}

// hasPendingDraft returns whether the content currently has has_pending_draft=true.
func (s *service) hasPendingDraft(ctx context.Context, id uint, cmsType entity.CMSType) bool {
	if cmsType == entity.CMSTypeCourse {
		c, err := s.courseRepo.FindByID(ctx, id)
		return err == nil && c.HasPendingDraft
	}
	a, err := s.articleRepo.FindByID(ctx, id)
	return err == nil && a.HasPendingDraft
}

func (s *service) SendBack(ctx context.Context, id uint, cmsType entity.CMSType, comment string) error {
	fromStatus, version, title := s.currentStatusAndVersion(ctx, id, cmsType)

	// Snapshot the current content as the review baseline before sending back.
	// This lets the next reviewer see exactly what changed between the returned
	// version and the re-submitted revision.
	if cmsType == entity.CMSTypeCourse {
		if existing, err := s.courseRepo.FindByID(ctx, id); err == nil {
			_ = s.courseRepo.SaveReviewBaseline(ctx, id, existing.Title, existing.Description, existing.Body)
			// Also snapshot the chapter/lesson hierarchy so the next reviewer can diff structural changes.
			if s.sectionRepo != nil {
				if secs, secErr := s.sectionRepo.FindByCourseID(ctx, id); secErr == nil {
					if snap, snapErr := sectionsToSnapshot(secs); snapErr == nil {
						_ = s.courseRepo.SaveReviewBaselineChapters(ctx, id, snap)
					}
				}
			}
		}
	} else {
		if existing, err := s.articleRepo.FindByID(ctx, id); err == nil {
			_ = s.articleRepo.SaveReviewBaseline(ctx, id, existing.Title, existing.Description, existing.Body)
		}
	}

	var err error
	if cmsType == entity.CMSTypeCourse {
		err = s.courseRepo.UpdateStatus(ctx, id, entity.CMSStatusDraft, nil, &comment, nil)
	} else {
		err = s.articleRepo.UpdateStatus(ctx, id, entity.CMSStatusDraft, nil, &comment, nil)
	}
	if err == nil {
		s.recordEvent(ctx, string(cmsType), id, 0, fromStatus, "DRAFT", "SEND_BACK", &comment, version, title)
	}
	return err
}

func (s *service) Reject(ctx context.Context, id uint, cmsType entity.CMSType, reviewerID uint, comment string, callerIsAdmin bool) error {
	fromStatus, version, title := s.currentStatusAndVersion(ctx, id, cmsType)

	// Enforce reviewer group membership for non-admin callers.
	// Admins bypass this check entirely.
	if reviewerID > 0 && !callerIsAdmin {
		var categoryID *uint
		if cmsType == entity.CMSTypeCourse {
			if c, err := s.courseRepo.FindByID(ctx, id); err == nil {
				categoryID = c.CategoryID
			}
		} else {
			if a, err := s.articleRepo.FindByID(ctx, id); err == nil {
				categoryID = a.CategoryID
			}
		}
		if categoryID != nil && !s.isUserReviewerForCategory(ctx, reviewerID, *categoryID) {
			return fmt.Errorf("user is not a reviewer for this content's category")
		}
	}

	var err error
	if cmsType == entity.CMSTypeCourse {
		err = s.courseRepo.UpdateStatus(ctx, id, entity.CMSStatusRejected, &reviewerID, &comment, nil)
	} else {
		err = s.articleRepo.UpdateStatus(ctx, id, entity.CMSStatusRejected, &reviewerID, &comment, nil)
	}
	if err == nil {
		s.recordEvent(ctx, string(cmsType), id, reviewerID, fromStatus, "REJECTED", "REJECT", &comment, version, title)
	}
	return err
}

func (s *service) GetActivity(ctx context.Context, id uint, cmsType entity.CMSType) ([]*entity.WorkflowEvent, error) {
	if s.workflowEventRepo == nil {
		return nil, nil
	}
	return s.workflowEventRepo.FindByEntity(ctx, string(cmsType), id)
}

func (s *service) ClaimReview(ctx context.Context, id uint, cmsType entity.CMSType, userID uint) error {
	if cmsType == entity.CMSTypeCourse {
		c, err := s.courseRepo.FindByID(ctx, id)
		if err != nil {
			return fmt.Errorf("course not found: %w", err)
		}
		if c.Status != entity.CMSStatusReview && c.Status != entity.CMSStatusApproved {
			return fmt.Errorf("content is not in REVIEW or APPROVED status")
		}
		if c.ReviewerID != nil && *c.ReviewerID != userID {
			return fmt.Errorf("already claimed by another user")
		}
		if err := s.courseRepo.UpdateStatus(ctx, id, c.Status, &userID, nil, nil); err != nil {
			return err
		}
		action := "CLAIM_REVIEW"
		if c.Status == entity.CMSStatusApproved {
			action = "CLAIM_PUBLISHING"
		}
		s.recordEvent(ctx, string(cmsType), id, userID, string(c.Status), string(c.Status), action, nil, c.Version, c.Title)
		return nil
	}
	a, err := s.articleRepo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("article not found: %w", err)
	}
	if a.Status != entity.CMSStatusReview && a.Status != entity.CMSStatusApproved {
		return fmt.Errorf("content is not in REVIEW or APPROVED status")
	}
	if a.ReviewerID != nil && *a.ReviewerID != userID {
		return fmt.Errorf("already claimed by another user")
	}
	if err := s.articleRepo.UpdateStatus(ctx, id, a.Status, &userID, nil, nil); err != nil {
		return err
	}
	action := "CLAIM_REVIEW"
	if a.Status == entity.CMSStatusApproved {
		action = "CLAIM_PUBLISHING"
	}
	s.recordEvent(ctx, string(cmsType), id, userID, string(a.Status), string(a.Status), action, nil, a.Version, a.Title)
	return nil
}

// AssignReviewer lets an admin assign a specific user without changing CMS status.
// Works for both REVIEW (assign reviewer) and APPROVED (assign publisher).
func (s *service) AssignReviewer(ctx context.Context, id uint, cmsType entity.CMSType, assignerID, targetUserID uint) error {
	if cmsType == entity.CMSTypeCourse {
		c, err := s.courseRepo.FindByID(ctx, id)
		if err != nil {
			return fmt.Errorf("course not found: %w", err)
		}
		if c.Status != entity.CMSStatusReview && c.Status != entity.CMSStatusApproved {
			return fmt.Errorf("content is not in REVIEW or APPROVED status")
		}
		if err := s.courseRepo.UpdateStatus(ctx, id, c.Status, &targetUserID, nil, nil); err != nil {
			return err
		}
		action := "ASSIGN_REVIEWER"
		if c.Status == entity.CMSStatusApproved {
			action = "ASSIGN_PUBLISHER"
		}
		s.recordEvent(ctx, string(cmsType), id, assignerID, string(c.Status), string(c.Status), action, nil, c.Version, c.Title)
		return nil
	}
	a, err := s.articleRepo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("article not found: %w", err)
	}
	if a.Status != entity.CMSStatusReview && a.Status != entity.CMSStatusApproved {
		return fmt.Errorf("content is not in REVIEW or APPROVED status")
	}
	if err := s.articleRepo.UpdateStatus(ctx, id, a.Status, &targetUserID, nil, nil); err != nil {
		return err
	}
	action := "ASSIGN_REVIEWER"
	if a.Status == entity.CMSStatusApproved {
		action = "ASSIGN_PUBLISHER"
	}
	s.recordEvent(ctx, string(cmsType), id, assignerID, string(a.Status), string(a.Status), action, nil, a.Version, a.Title)
	return nil
}

func (s *service) ReassignReview(ctx context.Context, id uint, cmsType entity.CMSType, note string, actorID uint) error {
	fromStatus, version, title := s.currentStatusAndVersion(ctx, id, cmsType)
	if fromStatus != string(entity.CMSStatusReview) {
		return fmt.Errorf("content is not in REVIEW status")
	}
	var err error
	// Save the handoff note then clear the reviewer so others can claim.
	if cmsType == entity.CMSTypeCourse {
		if note != "" {
			if updateErr := s.courseRepo.UpdateStatus(ctx, id, entity.CMSStatusReview, nil, &note, nil); updateErr != nil {
				return updateErr
			}
		}
		err = s.courseRepo.SetReviewer(ctx, id, nil)
	} else {
		if note != "" {
			if updateErr := s.articleRepo.UpdateStatus(ctx, id, entity.CMSStatusReview, nil, &note, nil); updateErr != nil {
				return updateErr
			}
		}
		err = s.articleRepo.SetReviewer(ctx, id, nil)
	}
	if err == nil {
		s.recordEvent(ctx, string(cmsType), id, actorID, fromStatus, "REVIEW", "REASSIGN_REVIEW", &note, version, title)
	}
	return err
}

func (s *service) SaveReviewNote(ctx context.Context, id uint, cmsType entity.CMSType, note string) error {
	if cmsType == entity.CMSTypeCourse {
		return s.courseRepo.UpdateStatus(ctx, id, entity.CMSStatusReview, nil, &note, nil)
	}
	return s.articleRepo.UpdateStatus(ctx, id, entity.CMSStatusReview, nil, &note, nil)
}

// currentStatus fetches the current status of the entity before a transition, for audit logging.
// Returns empty string on error (non-fatal).
func (s *service) currentStatus(ctx context.Context, id uint, cmsType entity.CMSType) string {
	status, _, _ := s.currentStatusAndVersion(ctx, id, cmsType)
	return status
}

// currentStatusAndVersion fetches the current status, version, and title for audit logging.
// Returns zero values on error (non-fatal).
func (s *service) currentStatusAndVersion(ctx context.Context, id uint, cmsType entity.CMSType) (string, int, string) {
	if cmsType == entity.CMSTypeCourse {
		c, err := s.courseRepo.FindByID(ctx, id)
		if err != nil {
			return "", 0, ""
		}
		return string(c.Status), c.Version, c.Title
	}
	a, err := s.articleRepo.FindByID(ctx, id)
	if err != nil {
		return "", 0, ""
	}
	return string(a.Status), a.Version, a.Title
}

// ─── Chapter snapshot helpers ─────────────────────────────────────────────────

// lSnap is the compact lesson shape stored in the chapter snapshot JSON.
type lSnap struct {
	ID      uint   `json:"id"`
	Title   string `json:"title"`
	Type    string `json:"type"`
	Content string `json:"content"`
	Order   int    `json:"order"`
}

// sSnap is the compact section shape stored in the chapter snapshot JSON.
type sSnap struct {
	ID            uint    `json:"id"`
	Title         string  `json:"title"`
	Description   string  `json:"description"`
	Order         int     `json:"order"`
	Lessons       []lSnap `json:"lessons"`
	ChildSections []sSnap `json:"childSections"`
}

// sectionsToSnapshot serialises the section/lesson hierarchy to compact JSON.
// The resulting string is stored verbatim in the JSONB columns.
func sectionsToSnapshot(sections []*entity.Section) (string, error) {
	snaps := make([]sSnap, 0, len(sections))
	for _, s := range sections {
		snaps = append(snaps, buildSSnap(s))
	}
	b, err := json.Marshal(snaps)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func buildSSnap(s *entity.Section) sSnap {
	lessons := make([]lSnap, 0, len(s.Lessons))
	for _, l := range s.Lessons {
		content := ""
		if l.Content != nil {
			content = *l.Content
		}
		lessons = append(lessons, lSnap{
			ID:      l.ID,
			Title:   l.Title,
			Type:    string(l.Type),
			Content: content,
			Order:   l.Order,
		})
	}
	children := make([]sSnap, 0, len(s.ChildSections))
	for i := range s.ChildSections {
		children = append(children, buildSSnap(&s.ChildSections[i]))
	}
	desc := ""
	if s.Description != nil {
		desc = *s.Description
	}
	return sSnap{
		ID:            s.ID,
		Title:         s.Title,
		Description:   desc,
		Order:         s.Order,
		Lessons:       lessons,
		ChildSections: children,
	}
}

func toAttachmentEntities(inputs []AttachmentInput, articleID, courseID *uint) []entity.Attachment {
	atts := make([]entity.Attachment, len(inputs))
	for i, a := range inputs {
		atts[i] = entity.Attachment{
			ArticleID: articleID,
			CourseID:  courseID,
			Name:      a.Name,
			URL:       a.URL,
			MimeType:  a.MimeType,
			Size:      a.Size,
		}
	}
	return atts
}

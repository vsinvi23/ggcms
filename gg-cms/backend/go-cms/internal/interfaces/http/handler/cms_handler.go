package handler

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

type CMSHandler struct {
	service     cmssvc.Service
	taskService tasksvc.Service
}

func NewCMSHandler(svc cmssvc.Service, taskSvc tasksvc.Service) *CMSHandler {
	return &CMSHandler{service: svc, taskService: taskSvc}
}

// GET /api/cms?type=ARTICLE&page=0&size=10&status=DRAFT&search=keyword&categoryId=1&courseType=BYTE
func (h *CMSHandler) GetAll(c *gin.Context) {
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))
	p := pagination.FromQuery(c)

	filter := repository.ArticleFilter{}
	if s := c.Query("status"); s != "" {
		status := entity.CMSStatus(s)
		filter.Status = &status
	}
	if q := c.Query("search"); q != "" {
		filter.Search = &q
	}
	if cid := c.Query("categoryId"); cid != "" {
		var catID uint
		if _, err := fmt.Sscan(cid, &catID); err == nil {
			filter.CategoryID = &catID
		}
	}
	if ct := c.Query("courseType"); ct != "" && cmsType == entity.CMSTypeCourse {
		cType := entity.CourseType(ct)
		filter.CourseType = &cType
	}

	result, total, err := h.service.GetAll(c.Request.Context(), cmsType, filter, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	var items []dto.CMSResponse
	switch cmsType {
	case entity.CMSTypeCourse:
		courses, ok := result.([]*entity.Course)
		if ok {
			for _, c := range courses {
				items = append(items, courseToCMS(c))
			}
		}
	default:
		articles, ok := result.([]*entity.Article)
		if ok {
			for _, a := range articles {
				items = append(items, articleToCMS(a))
			}
		}
	}
	if items == nil {
		items = []dto.CMSResponse{}
	}

	// Enrich REVIEW items with approval progress in a single batch query.
	h.enrichApprovalProgress(c.Request.Context(), items, cmsType)

	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// GET /api/cms/:id?type=ARTICLE
// :id can be a numeric database ID or a UUID (publicId) for security.
func (h *CMSHandler) GetByID(c *gin.Context) {
	idStr := c.Param("id")
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	var result interface{}
	var err error

	// Try numeric ID first; if the param is a UUID, fall back to publicId lookup.
	if numID, parseErr := parseID(c, "id"); parseErr == nil {
		result, err = h.service.GetByID(c.Request.Context(), numID, cmsType)
	} else {
		result, err = h.service.GetBySlug(c.Request.Context(), idStr, cmsType)
	}

	if err != nil {
		// Only return 404 for genuine "record not found" errors.
		// DB/server errors (e.g. missing column from unapplied migration) return 500
		// so callers see the real problem instead of a misleading "not found".
		if strings.Contains(err.Error(), "not found") {
			response.NotFound(c, "not found")
		} else {
			response.InternalError(c, err.Error())
		}
		return
	}

	dto := toCMSResponse(result, cmsType)
	if dto.Status == "REVIEW" {
		if numID, parseErr := parseID(c, "id"); parseErr == nil {
			if count, required, err2 := h.service.GetReviewProgress(c.Request.Context(), numID, cmsType); err2 == nil {
				dto.ApprovalCount = &count
				dto.RequiredApprovals = &required
			}
		}
	}
	response.OK(c, dto)
}

// POST /api/cms
func (h *CMSHandler) Create(c *gin.Context) {
	var req dto.CreateCMSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	userID := middleware.GetUserID(c)
	atts := mapAttachmentInputs(req.Attachments)

	result, err := h.service.Create(c.Request.Context(), cmssvc.CreateRequest{
		Type:         entity.CMSType(req.Type),
		Title:        req.Title,
		Description:  req.Description,
		Body:         req.Body,
		ArticleType:  req.ArticleType,
		CourseType:   req.CourseType,
		CategoryID:   req.CategoryID,
		CreatedByID:  userID,
		ThumbnailURL: req.ThumbnailURL,
		Attachments:  atts,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// Create a draft task so the content appears immediately in My Tasks.
	taskType := entity.TaskTypeArticle
	if entity.CMSType(req.Type) == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}
	var contentID uint
	if entity.CMSType(req.Type) == entity.CMSTypeCourse {
		if course, ok := result.(*entity.Course); ok {
			contentID = course.ID
		}
	} else {
		if article, ok := result.(*entity.Article); ok {
			contentID = article.ID
		}
	}
	if contentID != 0 {
		if err := h.taskService.UpsertOwnerTask(c.Request.Context(), contentID, taskType, req.Title, userID, "draft"); err != nil {
			log.Printf("[cms] Create: failed to upsert owner task for %s id=%d: %v", req.Type, contentID, err)
		}
	}

	response.Created(c, toCMSResponse(result, entity.CMSType(req.Type)))
	auditAction := "article.created"
	if entity.CMSType(req.Type) == entity.CMSTypeCourse {
		auditAction = "course.created"
	}
	middleware.LogAudit(c, auditAction, req.Type, fmt.Sprint(contentID), req.Title, nil)
}

// PUT /api/cms/:id
func (h *CMSHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	// Non-admin users may only edit content they created.
	if !middleware.IsAdmin(c) {
		existing, fetchErr := h.service.GetByID(c.Request.Context(), id, cmsType)
		if fetchErr != nil {
			response.NotFound(c, "not found")
			return
		}
		_, ownerID := extractCMSTitleAndOwner(existing, cmsType)
		if ownerID != middleware.GetUserID(c) {
			response.Forbidden(c, "cannot edit content you do not own")
			return
		}
	}

	var req dto.UpdateCMSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	result, err := h.service.Update(c.Request.Context(), id, cmsType, cmssvc.UpdateRequest{
		Title:        req.Title,
		Description:  req.Description,
		Body:         req.Body,
		ArticleType:  req.ArticleType,
		CourseType:   req.CourseType,
		CategoryID:   req.CategoryID,
		ThumbnailURL: req.ThumbnailURL,
		Attachments:  mapAttachmentInputs(req.Attachments),
		ActorID:      middleware.GetUserID(c),
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, toCMSResponse(result, cmsType))
	auditActionU := "article.updated"
	if cmsType == entity.CMSTypeCourse {
		auditActionU = "course.updated"
	}
	middleware.LogAudit(c, auditActionU, string(cmsType), fmt.Sprint(id), "", nil)
}

// DELETE /api/cms/:id?type=ARTICLE
func (h *CMSHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	// Non-admin users may only delete content they created.
	if !middleware.IsAdmin(c) {
		existing, fetchErr := h.service.GetByID(c.Request.Context(), id, cmsType)
		if fetchErr != nil {
			response.NotFound(c, "not found")
			return
		}
		_, ownerID := extractCMSTitleAndOwner(existing, cmsType)
		if ownerID != middleware.GetUserID(c) {
			response.Forbidden(c, "cannot delete content you do not own")
			return
		}
	}

	if err := h.service.Delete(c.Request.Context(), id, cmsType); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "deleted"})
	auditActionD := "article.deleted"
	if cmsType == entity.CMSTypeCourse {
		auditActionD = "course.deleted"
	}
	middleware.LogAudit(c, auditActionD, string(cmsType), fmt.Sprint(id), "", nil)
}

// POST /api/cms/:id/submit?type=ARTICLE
func (h *CMSHandler) Submit(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	var req dto.SubmitPublishRequest
	c.ShouldBindJSON(&req)

	if err := h.service.Submit(c.Request.Context(), id, cmsType, req.UserID); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// Fetch the content so we have the title, owner, and assigned reviewer
	result, _ := h.service.GetByID(c.Request.Context(), id, cmsType)
	title, createdByID := extractCMSTitleAndOwner(result, cmsType)
	reviewerID := extractCMSReviewerID(result, cmsType)

	submitterID := middleware.GetUserID(c)
	if createdByID == 0 {
		createdByID = submitterID
	}
	taskType := entity.TaskTypeArticle
	if cmsType == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}

	// Update (or create) the owner task to in_review — updates the draft task created on Create.
	if err := h.taskService.UpsertOwnerTask(c.Request.Context(), id, taskType, title, createdByID, "in_review"); err != nil {
		log.Printf("[cms] Submit: failed to upsert owner task for %s id=%d: %v", cmsType, id, err)
	}

	// Task for the reviewer — upsert so re-submissions don't create duplicates
	if reviewerID != nil && *reviewerID != 0 && *reviewerID != createdByID {
		if err := h.taskService.UpsertReviewerTask(c.Request.Context(), id, taskType, title, *reviewerID); err != nil {
			log.Printf("[cms] Submit: failed to upsert reviewer task for %s id=%d reviewer=%d: %v", cmsType, id, *reviewerID, err)
		}
	}

	response.OK(c, gin.H{"message": "submitted for review"})
	auditActionS := "article.submitted"
	if cmsType == entity.CMSTypeCourse {
		auditActionS = "course.submitted"
	}
	middleware.LogAudit(c, auditActionS, string(cmsType), fmt.Sprint(id), title, nil)
}

func extractCMSTitleAndOwner(result interface{}, cmsType entity.CMSType) (string, uint) {
	if cmsType == entity.CMSTypeCourse {
		if c, ok := result.(*entity.Course); ok {
			return c.Title, c.CreatedByID
		}
	}
	if a, ok := result.(*entity.Article); ok {
		return a.Title, a.CreatedByID
	}
	return "Untitled", 0
}

func extractCMSReviewerID(result interface{}, cmsType entity.CMSType) *uint {
	if cmsType == entity.CMSTypeCourse {
		if c, ok := result.(*entity.Course); ok {
			return c.ReviewerID
		}
	}
	if a, ok := result.(*entity.Article); ok {
		return a.ReviewerID
	}
	return nil
}

// POST /api/cms/:id/approve?type=ARTICLE
func (h *CMSHandler) Approve(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	userID := middleware.GetUserID(c)
	if err := h.service.Approve(c.Request.Context(), id, cmsType, &userID, middleware.IsAdmin(c)); err != nil {
		response.Forbidden(c, err.Error())
		return
	}

	taskType := entity.TaskTypeArticle
	if cmsType == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}
	result, _ := h.service.GetByID(c.Request.Context(), id, cmsType)
	title, ownerID := extractCMSTitleAndOwner(result, cmsType)
	if ownerID == 0 {
		ownerID = userID
	}
	// Update ALL tasks for this content to "approved" (owner + all reviewers)
	if _, err := h.taskService.UpdateStatusByContentID(c.Request.Context(), id, taskType, "approved"); err != nil {
		log.Printf("[cms] Approve: failed to update task statuses for %s id=%d: %v", cmsType, id, err)
	}
	if err := h.taskService.UpsertOwnerTask(c.Request.Context(), id, taskType, title, ownerID, "approved"); err != nil {
		log.Printf("[cms] Approve: failed to upsert owner task for %s id=%d: %v", cmsType, id, err)
	}

	response.OK(c, gin.H{"message": "approved"})
	auditActionA := "article.approved"
	if cmsType == entity.CMSTypeCourse {
		auditActionA = "course.approved"
	}
	middleware.LogAudit(c, auditActionA, string(cmsType), fmt.Sprint(id), title, nil)
}

// POST /api/cms/:id/publish?type=ARTICLE
func (h *CMSHandler) Publish(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	userID := middleware.GetUserID(c)

	// Admins can always publish. Non-admins must be the reviewer assigned to this content.
	if !middleware.IsAdmin(c) {
		existing, fetchErr := h.service.GetByID(c.Request.Context(), id, cmsType)
		if fetchErr != nil {
			response.NotFound(c, "not found")
			return
		}
		assignedReviewerID := extractCMSReviewerID(existing, cmsType)
		if assignedReviewerID == nil || *assignedReviewerID != userID {
			response.Forbidden(c, "only the assigned reviewer or an admin may publish content")
			return
		}
	}

	if err := h.service.Publish(c.Request.Context(), id, cmsType, &userID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	// Upsert a task so the content always appears in the owner's task list as published
	taskType := entity.TaskTypeArticle
	if cmsType == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}
	result, _ := h.service.GetByID(c.Request.Context(), id, cmsType)
	title, ownerID := extractCMSTitleAndOwner(result, cmsType)
	if ownerID == 0 {
		ownerID = userID
	}
	_ = h.taskService.UpsertPublishedTask(c.Request.Context(), id, taskType, title, ownerID)

	response.OK(c, gin.H{"message": "published"})
	auditActionP := "article.published"
	if cmsType == entity.CMSTypeCourse {
		auditActionP = "course.published"
	}
	middleware.LogAudit(c, auditActionP, string(cmsType), fmt.Sprint(id), title, nil)
}

// POST /api/cms/:id/reject?type=ARTICLE
func (h *CMSHandler) Reject(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	// Use the authenticated user's ID — ignore any reviewerId supplied in the request body.
	actorID := middleware.GetUserID(c)

	var req dto.RejectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.service.Reject(c.Request.Context(), id, cmsType, actorID, req.Comment, middleware.IsAdmin(c)); err != nil {
		response.Forbidden(c, err.Error())
		return
	}

	// Update all tasks for this content to "rejected".
	taskType := entity.TaskTypeArticle
	if cmsType == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}
	if _, err := h.taskService.UpdateStatusByContentID(c.Request.Context(), id, taskType, "rejected"); err != nil {
		log.Printf("[cms] Reject: failed to update task statuses for %s id=%d: %v", cmsType, id, err)
	}

	response.OK(c, gin.H{"message": "rejected"})
	auditActionR := "article.rejected"
	if cmsType == entity.CMSTypeCourse {
		auditActionR = "course.rejected"
	}
	middleware.LogAudit(c, auditActionR, string(cmsType), fmt.Sprint(id), "", map[string]interface{}{"comment": req.Comment})
}

// POST /api/cms/:id/send-back?type=ARTICLE
func (h *CMSHandler) SendBack(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	// Only the assigned reviewer or an admin may send content back for revision.
	userID := middleware.GetUserID(c)
	if !middleware.IsAdmin(c) {
		existing, fetchErr := h.service.GetByID(c.Request.Context(), id, cmsType)
		if fetchErr != nil {
			response.NotFound(c, "not found")
			return
		}
		assignedReviewerID := extractCMSReviewerID(existing, cmsType)
		if assignedReviewerID == nil || *assignedReviewerID != userID {
			response.Forbidden(c, "only the assigned reviewer or an admin may send content back")
			return
		}
	}

	var req dto.SendBackRequest
	c.ShouldBindJSON(&req)

	if err := h.service.SendBack(c.Request.Context(), id, cmsType, req.Comment); err != nil {
		response.InternalError(c, err.Error())
		return
	}

	// Reset ALL tasks for this content back to "draft" so the owner sees it as needing work.
	taskType := entity.TaskTypeArticle
	if cmsType == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}
	if _, err := h.taskService.UpdateStatusByContentID(c.Request.Context(), id, taskType, "draft"); err != nil {
		log.Printf("[cms] SendBack: failed to update task statuses for %s id=%d: %v", cmsType, id, err)
	}

	// Return the full updated item so the frontend can update its cache directly
	// without needing a separate GET request (which could 404 if the DB is momentarily
	// unavailable or a migration hasn't been applied yet).
	if result, fetchErr := h.service.GetByID(c.Request.Context(), id, cmsType); fetchErr == nil {
		response.OK(c, toCMSResponse(result, cmsType))
	} else {
		response.OK(c, gin.H{"message": "sent back for revision"})
	}

	auditActionSB := "article.sent_back"
	if cmsType == entity.CMSTypeCourse {
		auditActionSB = "course.sent_back"
	}
	middleware.LogAudit(c, auditActionSB, string(cmsType), fmt.Sprint(id), "", map[string]interface{}{"comment": req.Comment})
}

// GET /api/cms/:id/activity?type=ARTICLE
func (h *CMSHandler) GetActivity(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	events, err := h.service.GetActivity(c.Request.Context(), id, cmsType)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}

	result := make([]dto.WorkflowEventResponse, len(events))
	for i, ev := range events {
		userName := ""
		if ev.User.Name != "" {
			userName = ev.User.Name
		}
		result[i] = dto.WorkflowEventResponse{
			ID:            ev.ID,
			EntityType:    ev.EntityType,
			EntityID:      ev.EntityID,
			UserID:        ev.UserID,
			UserName:      userName,
			FromStatus:    ev.FromStatus,
			ToStatus:      ev.ToStatus,
			Action:        ev.Action,
			Comment:       ev.Comment,
			Version:       ev.Version,
			TitleSnapshot: ev.TitleSnapshot,
			CreatedAt:     ev.CreatedAt.Format(time.RFC3339),
		}
	}
	response.OK(c, result)
}

// POST /api/cms/:id/claim-review?type=ARTICLE
// Assigns the calling user as reviewer. Fails if another reviewer already claimed it.
func (h *CMSHandler) ClaimReview(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))
	userID := middleware.GetUserID(c)
	if err := h.service.ClaimReview(c.Request.Context(), id, cmsType, userID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	// Create or update the reviewer task so it appears in their task list.
	taskType := entity.TaskTypeArticle
	if cmsType == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}
	result, _ := h.service.GetByID(c.Request.Context(), id, cmsType)
	title, _ := extractCMSTitleAndOwner(result, cmsType)
	if err := h.taskService.UpsertReviewerTask(c.Request.Context(), id, taskType, title, userID); err != nil {
		log.Printf("[cms] ClaimReview: failed to upsert reviewer task for %s id=%d: %v", cmsType, id, err)
	}
	response.OK(c, gin.H{"message": "review claimed"})
}

// POST /api/cms/:id/assign-reviewer?type=ARTICLE|COURSE
// Admin assigns a specific user as reviewer without changing the CMS status.
func (h *CMSHandler) AssignReviewer(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))
	var req dto.AssignReviewerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "userId required")
		return
	}
	assignerID := middleware.GetUserID(c)
	if err := h.service.AssignReviewer(c.Request.Context(), id, cmsType, assignerID, req.UserID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	// Create or update the reviewer task so it appears in their task list.
	taskType := entity.TaskTypeArticle
	if cmsType == entity.CMSTypeCourse {
		taskType = entity.TaskTypeCourse
	}
	result, _ := h.service.GetByID(c.Request.Context(), id, cmsType)
	title, _ := extractCMSTitleAndOwner(result, cmsType)
	if err := h.taskService.UpsertReviewerTask(c.Request.Context(), id, taskType, title, req.UserID); err != nil {
		log.Printf("[cms] AssignReviewer: failed to upsert reviewer task for %s id=%d: %v", cmsType, id, err)
	}
	response.OK(c, gin.H{"message": "reviewer assigned"})
}

// POST /api/cms/:id/reassign-review?type=ARTICLE
// Releases the current reviewer assignment (clears reviewer_id) with an optional handoff note.
func (h *CMSHandler) ReassignReview(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	var req dto.ReassignReviewRequest
	c.ShouldBindJSON(&req)

	actorID := middleware.GetUserID(c)
	if err := h.service.ReassignReview(c.Request.Context(), id, cmsType, req.Note, actorID); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "review reassigned"})
}

// POST /api/cms/:id/review-note?type=ARTICLE
// Saves the reviewer's draft note without changing the workflow status.
func (h *CMSHandler) SaveReviewNote(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid ID")
		return
	}
	cmsType := entity.CMSType(c.DefaultQuery("type", "ARTICLE"))

	// Only the assigned reviewer or an admin may write review notes.
	userID := middleware.GetUserID(c)
	if !middleware.IsAdmin(c) {
		existing, fetchErr := h.service.GetByID(c.Request.Context(), id, cmsType)
		if fetchErr != nil {
			response.NotFound(c, "not found")
			return
		}
		assignedReviewerID := extractCMSReviewerID(existing, cmsType)
		if assignedReviewerID == nil || *assignedReviewerID != userID {
			response.Forbidden(c, "only the assigned reviewer or an admin may write review notes")
			return
		}
	}

	var req dto.ReviewNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.service.SaveReviewNote(c.Request.Context(), id, cmsType, req.Note); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "review note saved"})
}

func toCMSResponse(result interface{}, cmsType entity.CMSType) dto.CMSResponse {
	if cmsType == entity.CMSTypeCourse {
		if course, ok := result.(*entity.Course); ok {
			return courseToCMS(course)
		}
	}
	if article, ok := result.(*entity.Article); ok {
		return articleToCMS(article)
	}
	return dto.CMSResponse{}
}

func articleToCMS(a *entity.Article) dto.CMSResponse {
	attachments := make([]dto.AttachmentResponse, len(a.Attachments))
	for i, att := range a.Attachments {
		attachments[i] = dto.AttachmentResponse{Name: att.Name, URL: att.URL, MimeType: att.MimeType, Size: att.Size}
	}
	var publishedAt *string
	if a.PublishedAt != nil {
		s := a.PublishedAt.Format(time.RFC3339)
		publishedAt = &s
	}
	var categoryName *string
	if a.Category != nil {
		categoryName = &a.Category.Name
	}
	var articleType *string
	if a.ArticleType != "" {
		at := a.ArticleType
		articleType = &at
	}
	blockCount := countBodyBlocks(a.Body)
	var reviewBaselineTitle *string
	if a.ReviewBaselineTitle != "" {
		reviewBaselineTitle = &a.ReviewBaselineTitle
	}
	var publishedTitle *string
	if a.PublishedTitle != "" {
		publishedTitle = &a.PublishedTitle
	}
	return dto.CMSResponse{
		ID:              a.ID,
		PublicID:        a.PublicID,
		Slug:            a.Slug,
		Type:            "ARTICLE",
		Title:           a.Title,
		Description:     a.Description,
		Body:            a.Body,
		ArticleType:     articleType,
		BlockCount:      blockCount,
		Status:          string(a.Status),
		CategoryID:      a.CategoryID,
		CategoryName:    categoryName,
		CreatedBy:       a.CreatedByID,
		CreatedByName:   a.CreatedBy.Name,
		ReviewerID:      a.ReviewerID,
		ReviewerName:    func() *string { if a.Reviewer != nil { n := a.Reviewer.Name; return &n }; return nil }(),
		ReviewerComment: a.ReviewerComment,
		ThumbnailURL:    a.ThumbnailURL,
		PublishedAt:     publishedAt,
		Version:         a.Version,
		HasPendingDraft:           a.HasPendingDraft,
		PublishedVersion:          a.PublishedVersion,
		PublishedTitle:            publishedTitle,
		PublishedDescription:      a.PublishedDescription,
		PublishedBody:             a.PublishedBody,
		ReviewBaselineTitle:       reviewBaselineTitle,
		ReviewBaselineDescription: a.ReviewBaselineDescription,
		ReviewBaselineBody:        a.ReviewBaselineBody,
		CreatedAt:       a.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       a.UpdatedAt.Format(time.RFC3339),
		Attachments:     attachments,
	}
}

func courseToCMS(c *entity.Course) dto.CMSResponse {
	attachments := make([]dto.AttachmentResponse, len(c.Attachments))
	for i, att := range c.Attachments {
		attachments[i] = dto.AttachmentResponse{Name: att.Name, URL: att.URL, MimeType: att.MimeType, Size: att.Size}
	}
	var publishedAt *string
	if c.PublishedAt != nil {
		s := c.PublishedAt.Format(time.RFC3339)
		publishedAt = &s
	}
	var categoryName *string
	if c.Category != nil {
		categoryName = &c.Category.Name
	}
	courseType := string(c.CourseType)
	if courseType == "" {
		courseType = "STANDARD"
	}
	blockCount := countBodyBlocks(c.Body)
	var reviewBaselineTitleC *string
	if c.ReviewBaselineTitle != "" {
		reviewBaselineTitleC = &c.ReviewBaselineTitle
	}
	var publishedTitleC *string
	if c.PublishedTitle != "" {
		publishedTitleC = &c.PublishedTitle
	}
	return dto.CMSResponse{
		ID:              c.ID,
		PublicID:        c.PublicID,
		Slug:            c.Slug,
		Type:            "COURSE",
		Title:           c.Title,
		Description:     c.Description,
		Body:            c.Body,
		CourseType:      &courseType,
		BlockCount:      blockCount,
		Status:          string(c.Status),
		CategoryID:      c.CategoryID,
		CategoryName:    categoryName,
		CreatedBy:       c.CreatedByID,
		CreatedByName:   c.CreatedBy.Name,
		ReviewerID:      c.ReviewerID,
		ReviewerName:    func() *string { if c.Reviewer != nil { n := c.Reviewer.Name; return &n }; return nil }(),
		ReviewerComment: c.ReviewerComment,
		ThumbnailURL:    c.ThumbnailURL,
		PublishedAt:     publishedAt,
		Version:         c.Version,
		HasPendingDraft:           c.HasPendingDraft,
		PublishedVersion:          c.PublishedVersion,
		PublishedTitle:            publishedTitleC,
		PublishedDescription:      c.PublishedDescription,
		PublishedBody:             c.PublishedBody,
		ReviewBaselineTitle:       reviewBaselineTitleC,
		ReviewBaselineDescription: c.ReviewBaselineDescription,
		ReviewBaselineBody:        c.ReviewBaselineBody,
		PublishedChaptersSnapshot: c.PublishedChaptersSnapshot,
		ReviewBaselineChapters:    c.ReviewBaselineChapters,
		CreatedAt:       c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       c.UpdatedAt.Format(time.RFC3339),
		Attachments:     attachments,
	}
}

// countBodyBlocks counts the number of top-level blocks in a JSON body string.
// The body is expected to be a JSON array of block objects.
func countBodyBlocks(body *string) int {
	if body == nil || *body == "" {
		return 0
	}
	// Fast path: count top-level array elements without full JSON parse.
	// Body is a JSON array, so count commas at depth 1 + 1.
	depth := 0
	count := 0
	inString := false
	escape := false
	for _, ch := range *body {
		if escape {
			escape = false
			continue
		}
		if inString {
			if ch == '\\' {
				escape = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		switch ch {
		case '"':
			inString = true
		case '[', '{':
			depth++
			if depth == 1 && ch == '{' {
				count++
			}
		case ']', '}':
			depth--
		}
	}
	return count
}

func mapAttachmentInputs(atts []dto.AttachmentResponse) []cmssvc.AttachmentInput {
	result := make([]cmssvc.AttachmentInput, len(atts))
	for i, a := range atts {
		result[i] = cmssvc.AttachmentInput{Name: a.Name, URL: a.URL, MimeType: a.MimeType, Size: a.Size}
	}
	return result
}

// enrichApprovalProgress sets ApprovalCount and RequiredApprovals on REVIEW-status items.
func (h *CMSHandler) enrichApprovalProgress(ctx context.Context, items []dto.CMSResponse, cmsType entity.CMSType) {
	for i := range items {
		if items[i].Status == "REVIEW" {
			if count, required, err := h.service.GetReviewProgress(ctx, items[i].ID, cmsType); err == nil {
				items[i].ApprovalCount = &count
				items[i].RequiredApprovals = &required
			}
		}
	}
}

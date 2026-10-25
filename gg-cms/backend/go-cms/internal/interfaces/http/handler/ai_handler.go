package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	aisvc "github.com/serenya/go-cms/internal/application/ai"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/logger"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
	"go.uber.org/zap"
)

const aiMaxBodyBytes = 64 << 10

type AIHandler struct {
	service aisvc.Service
}

func NewAIHandler(svc aisvc.Service) *AIHandler { return &AIHandler{service: svc} }

func aiFail(c *gin.Context, err error) {
	var e *aisvc.Error
	if errors.As(err, &e) {
		c.JSON(e.Status, gin.H{"success": false, "code": e.Code, "message": e.Message})
		return
	}
	logger.Error("ai request failed", zap.String("path", c.Request.URL.Path), zap.Error(err))
	c.JSON(http.StatusInternalServerError, gin.H{"success": false, "code": "AI_INTERNAL", "message": "internal server error"})
}

func aiBind(c *gin.Context, v any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, aiMaxBodyBytes)
	if err := c.ShouldBindJSON(v); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": aisvc.ErrInvalidInput.Code, "message": "invalid request body"})
		return false
	}
	return true
}

func aiActor(c *gin.Context) aisvc.Actor {
	return aisvc.Actor{UserID: middleware.GetUserID(c), Admin: middleware.IsAdmin(c)}
}

func aiParam(c *gin.Context, name string) (uint, bool) {
	n, err := strconv.ParseUint(c.Param(name), 10, 64)
	if err != nil || n == 0 {
		response.BadRequest(c, "invalid id")
		return 0, false
	}
	return uint(n), true
}

func aiID(id uint) string { return strconv.FormatUint(uint64(id), 10) }

func (h *AIHandler) Status(c *gin.Context) { response.OK(c, h.service.Status(c.Request.Context())) }

func (h *AIHandler) SuggestTags(c *gin.Context) {
	var req dto.AIContentRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.SuggestTags(c.Request.Context(), aiActor(c), req.ContentType, req.ContentID)
	if err != nil {
		aiFail(c, err)
		return
	}
	middleware.LogAudit(c, "ai.tags.suggested", req.ContentType, aiID(req.ContentID), "", map[string]interface{}{"source": out.Source})
	response.OK(c, out)
}

func (h *AIHandler) Summary(c *gin.Context) {
	var req dto.AIContentRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.Summarise(c.Request.Context(), aiActor(c), req.ContentType, req.ContentID)
	if err != nil {
		aiFail(c, err)
		return
	}
	middleware.LogAudit(c, "ai.summary.generated", req.ContentType, aiID(req.ContentID), "", map[string]interface{}{"draftId": out.DraftID})
	response.OK(c, out)
}

func (h *AIHandler) SEO(c *gin.Context) {
	var req dto.AIContentRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.SuggestSEO(c.Request.Context(), aiActor(c), req.ContentType, req.ContentID)
	if err != nil {
		aiFail(c, err)
		return
	}
	middleware.LogAudit(c, "ai.seo.generated", req.ContentType, aiID(req.ContentID), "", map[string]interface{}{"draftId": out.DraftID})
	response.OK(c, out)
}

func (h *AIHandler) QualityCheck(c *gin.Context) {
	var req dto.AIContentRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.QualityCheck(c.Request.Context(), aiActor(c), req.ContentType, req.ContentID)
	if err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, out)
}

func (h *AIHandler) GenerateQuiz(c *gin.Context) {
	var req dto.AIQuizRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.GenerateQuiz(c.Request.Context(), aiActor(c), req.ContentType, req.ContentID, req.Count, req.Difficulty)
	if err != nil {
		aiFail(c, err)
		return
	}
	middleware.LogAudit(c, "ai.quiz.generated", req.ContentType, aiID(req.ContentID), "", map[string]interface{}{"draftId": out.DraftID, "questions": len(out.Questions)})
	response.OK(c, out)
}

func (h *AIHandler) ListDrafts(c *gin.Context) {
	id, err := strconv.ParseUint(c.Query("contentId"), 10, 64)
	if err != nil || id == 0 {
		response.BadRequest(c, "contentId is required")
		return
	}
	out, lerr := h.service.ListDrafts(c.Request.Context(), aiActor(c), c.Query("contentType"), uint(id), c.Query("kind"))
	if lerr != nil {
		aiFail(c, lerr)
		return
	}
	response.OK(c, out)
}

func (h *AIHandler) resolveDraft(c *gin.Context, accept bool) {
	d, err := h.service.ResolveDraft(c.Request.Context(), aiActor(c), c.Param("id"), accept)
	if err != nil {
		aiFail(c, err)
		return
	}
	action := "ai.draft.rejected"
	if accept {
		action = "ai.draft.accepted"
	}
	middleware.LogAudit(c, action, d.ContentType, aiID(d.ContentID), "", map[string]interface{}{"draftId": d.ID, "kind": d.Kind})
	response.OK(c, d)
}

func (h *AIHandler) AcceptDraft(c *gin.Context) { h.resolveDraft(c, true) }
func (h *AIHandler) RejectDraft(c *gin.Context) { h.resolveDraft(c, false) }

func (h *AIHandler) Ask(c *gin.Context) {
	var req dto.AITutorAskRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.Ask(c.Request.Context(), aiActor(c), aisvc.AskInput{
		CourseID: req.CourseID, ContentID: req.ContentID, ContentType: req.ContentType, Question: req.Question, ConversationID: req.ConversationID,
	})
	if err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, out)
}

func (h *AIHandler) ListConversations(c *gin.Context) {
	out, err := h.service.ListConversations(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, out)
}

func (h *AIHandler) GetConversation(c *gin.Context) {
	out, err := h.service.GetConversation(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, out)
}

func (h *AIHandler) DeleteConversation(c *gin.Context) {
	if err := h.service.DeleteConversation(c.Request.Context(), middleware.GetUserID(c), c.Param("id")); err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, gin.H{"message": "conversation deleted"})
}

func (h *AIHandler) Feedback(c *gin.Context) {
	id, ok := aiParam(c, "id")
	if !ok {
		return
	}
	var req dto.AIFeedbackRequest
	if !aiBind(c, &req) {
		return
	}
	if err := h.service.Feedback(c.Request.Context(), middleware.GetUserID(c), id, req.Rating, req.Comment); err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, gin.H{"message": "feedback recorded"})
}

func (h *AIHandler) StudyPlan(c *gin.Context) {
	var req dto.AIStudyPlanRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.StudyPlan(c.Request.Context(), middleware.GetUserID(c), req.Goals, req.Level)
	if err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, out)
}

func (h *AIHandler) ModerationQueue(c *gin.Context) {
	p := pagination.FromQuery(c)
	items, total, err := h.service.ModerationQueue(c.Request.Context(), c.Query("status"), p.Page, p.Size)
	if err != nil {
		aiFail(c, err)
		return
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

func (h *AIHandler) resolveModeration(c *gin.Context, approve bool) {
	id, ok := aiParam(c, "id")
	if !ok {
		return
	}
	if err := h.service.ResolveModeration(c.Request.Context(), id, approve, middleware.GetUserID(c)); err != nil {
		aiFail(c, err)
		return
	}
	action := "ai.moderation.rejected"
	if approve {
		action = "ai.moderation.approved"
	}
	middleware.LogAudit(c, action, "ai_moderation_item", aiID(id), "", nil)
	response.OK(c, gin.H{"message": "resolved"})
}

func (h *AIHandler) ApproveModeration(c *gin.Context) { h.resolveModeration(c, true) }
func (h *AIHandler) RejectModeration(c *gin.Context)  { h.resolveModeration(c, false) }

func aiParseDay(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}
	}
	return t
}

func (h *AIHandler) Usage(c *gin.Context) {
	to := aiParseDay(c.Query("to"))
	if !to.IsZero() {
		to = to.AddDate(0, 0, 1)
	}
	out, err := h.service.Usage(c.Request.Context(), aiParseDay(c.Query("from")), to)
	if err != nil {
		aiFail(c, err)
		return
	}
	response.OK(c, out)
}

func (h *AIHandler) GetSettings(c *gin.Context) {
	response.OK(c, h.service.GetSettings(c.Request.Context()))
}

func (h *AIHandler) UpdateSettings(c *gin.Context) {
	var req dto.AISettingsRequest
	if !aiBind(c, &req) {
		return
	}
	out, err := h.service.UpdateSettings(c.Request.Context(), req.Settings)
	if err != nil {
		aiFail(c, err)
		return
	}
	middleware.LogAudit(c, "ai.settings.updated", "ai_settings", "", "", map[string]interface{}{"changes": req.Settings})
	response.OK(c, out)
}

func (h *AIHandler) Reindex(c *gin.Context) {
	n, err := h.service.Reindex(c.Request.Context())
	if err != nil {
		aiFail(c, err)
		return
	}
	middleware.LogAudit(c, "ai.reindex", "ai_index", "", "", map[string]interface{}{"updated": n})
	response.OK(c, gin.H{"updated": n})
}

package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	assessmentsvc "github.com/serenya/go-cms/internal/application/assessment"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

const maxSubmitAnswers = 500

type AssessmentHandler struct {
	service assessmentsvc.Service
}

func NewAssessmentHandler(svc assessmentsvc.Service) *AssessmentHandler {
	return &AssessmentHandler{service: svc}
}

func respondAssessmentError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, assessmentsvc.ErrAssessmentNotFound), errors.Is(err, assessmentsvc.ErrAttemptNotFound), errors.Is(err, assessmentsvc.ErrCourseNotFound):
		response.NotFound(c, err.Error())
	case errors.Is(err, assessmentsvc.ErrInvalidAnswers), errors.Is(err, assessmentsvc.ErrInvalidRequirement):
		response.BadRequest(c, err.Error())
	case errors.Is(err, assessmentsvc.ErrAlreadySubmitted), errors.Is(err, assessmentsvc.ErrMaxAttempts):
		response.Conflict(c, err.Error())
	case errors.Is(err, assessmentsvc.ErrInvalidAssessment):
		response.InternalError(c, "assessment is not available")
	default:
		response.InternalError(c, err.Error())
	}
}

// GET /api/assessments/:id
func (h *AssessmentHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil || id == 0 {
		response.BadRequest(c, "invalid assessment ID")
		return
	}
	def, err := h.service.GetDefinition(c.Request.Context(), id)
	if err != nil {
		respondAssessmentError(c, err)
		return
	}
	response.OK(c, mapDefinition(def))
}

// POST /api/assessments/:id/attempts
func (h *AssessmentHandler) Start(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil || id == 0 {
		response.BadRequest(c, "invalid assessment ID")
		return
	}
	res, err := h.service.Start(c.Request.Context(), middleware.GetUserID(c), id)
	if err != nil {
		respondAssessmentError(c, err)
		return
	}
	response.Created(c, dto.StartAttemptResponse{Attempt: mapAttempt(res.Attempt), Assessment: mapDefinition(res.Definition)})
}

// POST /api/assessments/:id/attempts/:attemptId/submit
func (h *AssessmentHandler) Submit(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil || id == 0 {
		response.BadRequest(c, "invalid assessment ID")
		return
	}
	attemptID, err := parseID(c, "attemptId")
	if err != nil || attemptID == 0 {
		response.BadRequest(c, "invalid attempt ID")
		return
	}
	var req dto.SubmitAttemptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if len(req.Answers) > maxSubmitAnswers {
		response.BadRequest(c, "too many answers")
		return
	}
	answers := make([]assessmentsvc.Answer, len(req.Answers))
	for i, a := range req.Answers {
		if len(a.Selected) > 20 {
			response.BadRequest(c, "too many selections")
			return
		}
		answers[i] = assessmentsvc.Answer{QuestionID: a.QuestionID, Selected: a.Selected}
	}
	res, err := h.service.Submit(c.Request.Context(), middleware.GetUserID(c), id, attemptID, answers)
	if err != nil {
		respondAssessmentError(c, err)
		return
	}
	out := dto.SubmitAttemptResponse{Attempt: mapAttempt(res.Attempt), Results: make([]dto.QuestionResultResponse, len(res.Results))}
	for i, r := range res.Results {
		out.Results[i] = dto.QuestionResultResponse{QuestionID: r.QuestionID, Correct: r.Correct, CorrectIndexes: r.CorrectIndexes, Explanation: r.Explanation}
	}
	response.OK(c, out)
}

// GET /api/assessments/:id/attempts/me
func (h *AssessmentHandler) History(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil || id == 0 {
		response.BadRequest(c, "invalid assessment ID")
		return
	}
	hist, err := h.service.History(c.Request.Context(), middleware.GetUserID(c), id)
	if err != nil {
		respondAssessmentError(c, err)
		return
	}
	out := dto.AttemptHistoryResponse{
		AssessmentID: hist.AssessmentID, PassMark: hist.PassMark, AttemptsUsed: hist.AttemptsUsed,
		BestScore: hist.BestScore, Passed: hist.Passed, Attempts: make([]dto.AttemptResponse, len(hist.Attempts)),
	}
	for i, a := range hist.Attempts {
		out.Attempts[i] = mapAttempt(a)
	}
	response.OK(c, out)
}

// PUT /api/courses/:id/completion-requirement (admin)
func (h *AssessmentHandler) SetCourseRequirement(c *gin.Context) {
	courseID, err := parseID(c, "id")
	if err != nil || courseID == 0 {
		response.BadRequest(c, "invalid course ID")
		return
	}
	var req dto.CourseRequirementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if err := h.service.SetCourseRequirement(c.Request.Context(), courseID, req.AssessmentID, req.Required); err != nil {
		respondAssessmentError(c, err)
		return
	}
	meta := map[string]interface{}{"required": req.Required}
	if req.AssessmentID != nil {
		meta["assessmentId"] = *req.AssessmentID
	}
	middleware.LogAudit(c, "course.completion_requirement.update", "COURSE", strconv.FormatUint(uint64(courseID), 10), "", meta)
	response.OK(c, gin.H{"courseId": courseID, "assessmentId": req.AssessmentID, "required": req.Required})
}

func mapDefinition(d *assessmentsvc.Definition) dto.AssessmentDefinitionResponse {
	out := dto.AssessmentDefinitionResponse{
		AssessmentID: d.AssessmentID, Title: d.Title, PassMark: d.PassMark, QuestionCount: d.QuestionCount,
		MaxAttempts: d.MaxAttempts, Questions: make([]dto.AssessmentQuestionResponse, len(d.Questions)),
	}
	for i, q := range d.Questions {
		out.Questions[i] = dto.AssessmentQuestionResponse{ID: q.ID, Text: q.Text, Options: q.Options, Multiple: q.Multiple}
	}
	return out
}

func mapAttempt(a *entity.AssessmentAttempt) dto.AttemptResponse {
	out := dto.AttemptResponse{
		ID: a.ID, AssessmentID: a.AssessmentID, Status: a.Status, Score: a.Score, CorrectCount: a.CorrectCount,
		TotalQuestions: a.TotalQuestions, PassMark: a.PassMark, Passed: a.Passed,
		StartedAt: a.StartedAt.Format(time.RFC3339), DurationSeconds: a.DurationSeconds,
	}
	if a.SubmittedAt != nil {
		s := a.SubmittedAt.Format(time.RFC3339)
		out.SubmittedAt = &s
	}
	return out
}

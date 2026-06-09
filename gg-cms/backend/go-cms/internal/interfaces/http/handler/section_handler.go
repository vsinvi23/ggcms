package handler

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type SectionHandler struct {
	service sectionsvc.Service
}

func NewSectionHandler(svc sectionsvc.Service) *SectionHandler {
	return &SectionHandler{service: svc}
}

// GET /api/sections?filters[course][id][$eq]=courseId
func (h *SectionHandler) GetAll(c *gin.Context) {
	courseIDStr := c.Query("filters[course][id][$eq]")
	if courseIDStr == "" {
		response.BadRequest(c, "filters[course][id][$eq] is required")
		return
	}
	courseID64, err := strconv.ParseUint(courseIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid course ID")
		return
	}
	sections, err := h.service.GetByCourseID(c.Request.Context(), uint(courseID64))
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	result := make([]dto.SectionResponse, len(sections))
	for i, s := range sections {
		result[i] = mapSectionToDTO(s)
	}
	response.OK(c, result)
}

// POST /api/sections
func (h *SectionHandler) Create(c *gin.Context) {
	var req dto.CreateSectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	var courseID, parentID *uint
	if req.Data.Course != nil {
		courseID = &req.Data.Course.ID
	}
	if req.Data.ParentSection != nil {
		parentID = &req.Data.ParentSection.ID
	}
	sec, err := h.service.Create(c.Request.Context(), sectionsvc.CreateRequest{
		Title:           req.Data.Title,
		Order:           req.Data.Order,
		CourseID:        courseID,
		ParentSectionID: parentID,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapSectionToDTO(sec))
	middleware.LogAudit(c, "section.created", "section", fmt.Sprint(sec.ID), sec.Title, nil)
}

// PUT /api/sections/:id
func (h *SectionHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid section ID")
		return
	}
	var req dto.UpdateSectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	title := req.Data.Title
	sec, err := h.service.Update(c.Request.Context(), id, sectionsvc.UpdateRequest{
		Title:       &title,
		Description: req.Data.Description,
		Order:       req.Data.Order,
	})
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapSectionToDTO(sec))
	middleware.LogAudit(c, "section.updated", "section", fmt.Sprint(sec.ID), sec.Title, nil)
}

// DELETE /api/sections/:id
func (h *SectionHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid section ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "section deleted"})
	middleware.LogAudit(c, "section.deleted", "section", fmt.Sprint(id), "", nil)
}

func mapSectionToDTO(s *entity.Section) dto.SectionResponse {
	lessons := make([]dto.LessonResponse, len(s.Lessons))
	for i, l := range s.Lessons {
		lessons[i] = mapLessonToDTO(&l)
	}
	children := make([]dto.SectionResponse, len(s.ChildSections))
	for i, cs := range s.ChildSections {
		children[i] = mapSectionToDTO(&cs)
	}
	return dto.SectionResponse{
		ID:              s.ID,
		Title:           s.Title,
		Description:     s.Description,
		Order:           s.Order,
		CourseID:        s.CourseID,
		ParentSectionID: s.ParentSectionID,
		ChildSections:   children,
		Lessons:         lessons,
	}
}

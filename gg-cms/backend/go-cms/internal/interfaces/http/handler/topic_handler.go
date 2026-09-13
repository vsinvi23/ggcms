package handler

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/application/topic"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type TopicHandler struct {
	service topic.Service
}

func NewTopicHandler(svc topic.Service) *TopicHandler {
	return &TopicHandler{service: svc}
}

func toTopicResponse(t *entity.Topic) dto.TopicResponse {
	return dto.TopicResponse{
		ID:          t.ID,
		Name:        t.Name,
		Slug:        t.Slug,
		EntityType:  t.EntityType,
		Description: t.Description,
	}
}

// GET /api/topics
func (h *TopicHandler) GetAll(c *gin.Context) {
	topics, err := h.service.GetAll(c.Request.Context())
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.TopicResponse, len(topics))
	for i, t := range topics {
		items[i] = toTopicResponse(t)
	}
	response.OK(c, items)
}

// GET /api/topics/:id
func (h *TopicHandler) GetByID(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid topic ID")
		return
	}
	t, err := h.service.GetByID(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "topic not found")
		return
	}
	response.OK(c, toTopicResponse(t))
}

// POST /api/topics
func (h *TopicHandler) Create(c *gin.Context) {
	var req dto.CreateTopicRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	t, err := h.service.Create(c.Request.Context(), req.Name, req.EntityType, req.Description)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, toTopicResponse(t))
	middleware.LogAudit(c, "topic.created", "topic", fmt.Sprint(t.ID), t.Name, nil)
}

// PUT /api/topics/:id
func (h *TopicHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid topic ID")
		return
	}
	var req dto.UpdateTopicRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	t, err := h.service.Update(c.Request.Context(), id, req.Name, req.EntityType, req.Description)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, toTopicResponse(t))
	middleware.LogAudit(c, "topic.updated", "topic", fmt.Sprint(t.ID), t.Name, nil)
}

// DELETE /api/topics/:id
func (h *TopicHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid topic ID")
		return
	}
	if err := h.service.Delete(c.Request.Context(), id); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "topic deleted"})
	middleware.LogAudit(c, "topic.deleted", "topic", fmt.Sprint(id), "", nil)
}

// GET /api/topics/:id/relationships
func (h *TopicHandler) GetRelationships(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid topic ID")
		return
	}
	rels, err := h.service.GetRelationships(c.Request.Context(), id)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.TopicRelationshipResponse, len(rels))
	for i, r := range rels {
		items[i] = dto.TopicRelationshipResponse{
			ID:               r.ID,
			SourceTopicID:    r.SourceTopicID,
			TargetTopicID:    r.TargetTopicID,
			RelationshipType: r.RelationshipType,
		}
	}
	response.OK(c, items)
}

// PUT /api/topics/:id/relationships  body: {"relationships": [{"targetTopicId":1,"relationshipType":"related"}]}
func (h *TopicHandler) SetRelationships(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid topic ID")
		return
	}
	var req dto.SetTopicRelationshipsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	rels := make([]entity.TopicRelationship, len(req.Relationships))
	for i, r := range req.Relationships {
		rels[i] = entity.TopicRelationship{
			SourceTopicID:    id,
			TargetTopicID:    r.TargetTopicID,
			RelationshipType: r.RelationshipType,
		}
	}
	if err := h.service.SetRelationships(c.Request.Context(), id, rels); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "relationships updated"})
	middleware.LogAudit(c, "topic.relationships_updated", "topic", fmt.Sprint(id), "", map[string]interface{}{"relationships": req.Relationships})
}

// GET /api/cms/:id/topics?contentType=ARTICLE|COURSE
func (h *TopicHandler) GetContentTopics(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid content ID")
		return
	}
	contentType := c.Query("contentType")
	if contentType == "" {
		response.BadRequest(c, "contentType query parameter is required")
		return
	}
	topics, err := h.service.GetContentTopics(c.Request.Context(), id, contentType)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.TopicResponse, len(topics))
	for i, t := range topics {
		items[i] = toTopicResponse(t)
	}
	response.OK(c, items)
}

// PUT /api/cms/:id/topics  body: {"contentType": "ARTICLE", "topicIds": [1,2,3]}
func (h *TopicHandler) SetContentTopics(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.BadRequest(c, "invalid content ID")
		return
	}
	var req dto.SetContentTopicsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.service.SetContentTopics(c.Request.Context(), id, req.ContentType, req.TopicIDs); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "content topics updated"})
	middleware.LogAudit(c, "topic.content_topics_updated", req.ContentType, fmt.Sprint(id), "", map[string]interface{}{"topicIds": req.TopicIDs})
}

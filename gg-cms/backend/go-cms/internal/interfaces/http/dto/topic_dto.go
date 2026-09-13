package dto

type TopicResponse struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	EntityType  string `json:"entityType"`
	Description string `json:"description"`
}

type CreateTopicRequest struct {
	Name        string `json:"name" binding:"required"`
	EntityType  string `json:"entityType"`
	Description string `json:"description"`
}

type UpdateTopicRequest struct {
	Name        string `json:"name" binding:"required"`
	EntityType  string `json:"entityType"`
	Description string `json:"description"`
}

type TopicRelationshipResponse struct {
	ID               uint   `json:"id"`
	SourceTopicID    uint   `json:"sourceTopicId"`
	TargetTopicID    uint   `json:"targetTopicId"`
	RelationshipType string `json:"relationshipType"`
}

type TopicRelationshipInput struct {
	TargetTopicID    uint   `json:"targetTopicId" binding:"required"`
	RelationshipType string `json:"relationshipType" binding:"required"`
}

type SetTopicRelationshipsRequest struct {
	Relationships []TopicRelationshipInput `json:"relationships"`
}

type SetContentTopicsRequest struct {
	ContentType string `json:"contentType" binding:"required"`
	TopicIDs    []uint `json:"topicIds"`
}

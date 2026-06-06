package dto

type AttachmentResponse struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

type CMSResponse struct {
	ID              uint                 `json:"id"`
	PublicID        string               `json:"publicId"`
	Slug            string               `json:"slug"`
	Type            string               `json:"type"`
	Title           string               `json:"title"`
	Description     *string              `json:"description,omitempty"`
	Body            *string              `json:"body,omitempty"`
	ArticleType     *string              `json:"articleType,omitempty"`
	CourseType      *string              `json:"courseType,omitempty"`
	BlockCount      int                  `json:"blockCount"`
	Status          string               `json:"status"`
	CategoryID      *uint                `json:"categoryId,omitempty"`
	CreatedBy       uint                 `json:"createdBy"`
	CreatedByName   string               `json:"createdByName"`
	ReviewerID      *uint                `json:"reviewerId,omitempty"`
	ReviewerName    *string              `json:"reviewerName,omitempty"`
	ReviewerComment *string              `json:"reviewerComment,omitempty"`
	CategoryName    *string              `json:"categoryName,omitempty"`
	ThumbnailURL    *string              `json:"thumbnailUrl,omitempty"`
	PublishedAt     *string              `json:"publishedAt,omitempty"`
	Version         int                  `json:"version"`
	// Versioning fields — populated when a published revision is being re-edited.
	HasPendingDraft       bool    `json:"hasPendingDraft"`
	PublishedVersion      *int    `json:"publishedVersion,omitempty"`
	// Published snapshot — holds the last-published state while the new draft is in review.
	PublishedTitle        *string `json:"publishedTitle,omitempty"`
	PublishedDescription  *string `json:"publishedDescription,omitempty"`
	PublishedBody         *string `json:"publishedBody,omitempty"`
	// Review baseline — snapshot of content at the time a reviewer sent it back.
	// The next reviewer compares this against the current body to see what changed.
	ReviewBaselineTitle       *string `json:"reviewBaselineTitle,omitempty"`
	ReviewBaselineDescription *string `json:"reviewBaselineDescription,omitempty"`
	ReviewBaselineBody        *string `json:"reviewBaselineBody,omitempty"`
	// Chapter snapshots (courses only) — JSON encoding of the section/lesson hierarchy.
	PublishedChaptersSnapshot *string `json:"publishedChaptersSnapshot,omitempty"`
	ReviewBaselineChapters    *string `json:"reviewBaselineChapters,omitempty"`
	// Multi-review progress — only populated when status is REVIEW.
	ApprovalCount     *int `json:"approvalCount,omitempty"`
	RequiredApprovals *int `json:"requiredApprovals,omitempty"`
	CreatedAt       string               `json:"createdAt"`
	UpdatedAt       string               `json:"updatedAt"`
	Attachments     []AttachmentResponse `json:"attachments"`
}

type CreateCMSRequest struct {
	Type         string               `json:"type" binding:"required"`
	Title        string               `json:"title" binding:"required"`
	Description  *string              `json:"description,omitempty"`
	Body         *string              `json:"body,omitempty"`
	ArticleType  *string              `json:"articleType,omitempty"`
	CourseType   *string              `json:"courseType,omitempty"`
	CategoryID   *uint                `json:"categoryId,omitempty"`
	ThumbnailURL *string              `json:"thumbnailUrl,omitempty"`
	Attachments  []AttachmentResponse `json:"attachments,omitempty"`
}

type UpdateCMSRequest struct {
	Title        *string              `json:"title,omitempty"`
	Description  *string              `json:"description,omitempty"`
	Body         *string              `json:"body,omitempty"`
	ArticleType  *string              `json:"articleType,omitempty"`
	CourseType   *string              `json:"courseType,omitempty"`
	CategoryID   *uint                `json:"categoryId,omitempty"`
	ThumbnailURL *string              `json:"thumbnailUrl,omitempty"`
	Attachments  []AttachmentResponse `json:"attachments,omitempty"`
}

type SubmitPublishRequest struct {
	UserID *uint `json:"userId,omitempty"`
}

type AssignReviewerRequest struct {
	UserID uint `json:"userId" binding:"required"`
}

type SendBackRequest struct {
	Comment string `json:"comment"`
}

type RejectRequest struct {
	ReviewerID uint   `json:"reviewerId,omitempty"`
	Comment    string `json:"comment" binding:"required"`
}

type ReassignReviewRequest struct {
	Note string `json:"note"`
}

type ReviewNoteRequest struct {
	Note string `json:"note" binding:"required"`
}

type WorkflowEventResponse struct {
	ID            uint    `json:"id"`
	EntityType    string  `json:"entityType"`
	EntityID      uint    `json:"entityId"`
	UserID        uint    `json:"userId"`
	UserName      string  `json:"userName"`
	FromStatus    string  `json:"fromStatus"`
	ToStatus      string  `json:"toStatus"`
	Action        string  `json:"action"`
	Comment       *string `json:"comment,omitempty"`
	Version       *int    `json:"version,omitempty"`
	TitleSnapshot string  `json:"titleSnapshot,omitempty"`
	CreatedAt     string  `json:"createdAt"`
}

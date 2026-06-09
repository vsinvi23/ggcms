package dto

type TaskResponse struct {
	ID              uint   `json:"id"`
	ContentID       *uint  `json:"contentId,omitempty"`
	Type            string `json:"type"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	OwnershipType   string `json:"ownershipType"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	// CMS live data (populated from articles/courses table — always up-to-date)
	CMSVersion          int    `json:"version"`
	CMSStatus           string `json:"liveStatus"` // live CMS status; always reflects actual workflow state
	CMSHasPendingDraft  bool   `json:"hasPendingDraft"`
	CMSPublishedVersion *int   `json:"publishedVersion,omitempty"`
}

type CreateTaskRequest struct {
	Data struct {
		Type          string `json:"type" binding:"required"`
		Title         string `json:"title" binding:"required"`
		Status        string `json:"status"`
		OwnershipType string `json:"ownershipType" binding:"required"`
	} `json:"data" binding:"required"`
}

type UpdateTaskRequest struct {
	Data struct {
		Title  *string `json:"title,omitempty"`
		Status *string `json:"status,omitempty"`
	} `json:"data"`
}

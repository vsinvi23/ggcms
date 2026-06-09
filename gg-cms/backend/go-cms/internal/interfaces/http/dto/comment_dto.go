package dto

type CommentAuthor struct {
	ID    uint   `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type CommentResponse struct {
	ID          string            `json:"id"`
	Content     string            `json:"content"`
	ContentType string            `json:"contentType"`
	ContentID   string            `json:"contentId"`
	Author      *CommentAuthor    `json:"author,omitempty"`
	ParentID    *string           `json:"parentId,omitempty"`
	Replies     []CommentResponse `json:"replies,omitempty"`
	CreatedAt   string            `json:"createdAt"`
}

type CreateCommentRequest struct {
	Data struct {
		Content     string  `json:"content" binding:"required"`
		ContentType string  `json:"contentType" binding:"required"`
		ContentID   string  `json:"contentId" binding:"required"`
		ParentID    *string `json:"parentId,omitempty"`
	} `json:"data" binding:"required"`
}

package dto

type NotificationResponse struct {
	ID        uint    `json:"id"`
	Title     string  `json:"title"`
	Message   string  `json:"message"`
	Read      bool    `json:"read"`
	Link      *string `json:"link,omitempty"`
	CreatedAt string  `json:"createdAt"`
}

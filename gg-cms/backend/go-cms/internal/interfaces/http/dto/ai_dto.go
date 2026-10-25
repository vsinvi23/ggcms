package dto

type AIContentRequest struct {
	ContentType string `json:"contentType" binding:"required"`
	ContentID   uint   `json:"contentId" binding:"required"`
}

type AIQuizRequest struct {
	ContentType string `json:"contentType" binding:"required"`
	ContentID   uint   `json:"contentId" binding:"required"`
	Count       int    `json:"count"`
	Difficulty  string `json:"difficulty"`
}

type AITutorAskRequest struct {
	CourseID       uint   `json:"courseId"`
	ContentID      uint   `json:"contentId"`
	ContentType    string `json:"contentType"`
	Question       string `json:"question" binding:"required"`
	ConversationID string `json:"conversationId"`
}

type AIFeedbackRequest struct {
	Rating  int    `json:"rating" binding:"required"`
	Comment string `json:"comment"`
}

type AIStudyPlanRequest struct {
	Goals string `json:"goals" binding:"required"`
	Level string `json:"level" binding:"required"`
}

type AISettingsRequest struct {
	Settings map[string]string `json:"settings" binding:"required"`
}

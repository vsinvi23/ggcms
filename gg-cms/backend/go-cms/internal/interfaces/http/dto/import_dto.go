package dto

type ImportPreviewItem struct {
	FileName     string   `json:"fileName"`
	Index        int      `json:"index"`
	Type         string   `json:"type"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Body         string   `json:"body"`
	CategorySlug string   `json:"categorySlug"`
	CategoryID   *uint    `json:"categoryId,omitempty"`
	ArticleType  string   `json:"articleType"`
	CourseType   string   `json:"courseType"`
	Tags         []string `json:"tags"`
	Valid         bool     `json:"valid"`
	Error         string   `json:"error,omitempty"`
}

type ImportPreviewResponse struct {
	Items   []ImportPreviewItem `json:"items"`
	Total   int                 `json:"total"`
	Valid   int                 `json:"valid"`
	Invalid int                 `json:"invalid"`
}

type ImportConfirmItem struct {
	Type        string `json:"type"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Body        string `json:"body"`
	CategoryID  *uint  `json:"categoryId,omitempty"`
	ArticleType string `json:"articleType"`
	CourseType  string `json:"courseType"`
}

type ImportConfirmRequest struct {
	Items []ImportConfirmItem `json:"items" binding:"required"`
}

type ImportConfirmResult struct {
	Title   string `json:"title"`
	ID      uint   `json:"id,omitempty"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type ImportConfirmResponse struct {
	Created int                   `json:"created"`
	Failed  int                   `json:"failed"`
	Results []ImportConfirmResult `json:"results"`
}

package dto

type ImportLessonItem struct {
	Title    string `json:"title"`
	Type     string `json:"type"`
	Duration int    `json:"duration"`
	Order    int    `json:"order"`
	Body     string `json:"body"`
}

type ImportSectionItem struct {
	Title   string             `json:"title"`
	Order   int                `json:"order"`
	Lessons []ImportLessonItem `json:"lessons"`
}

type ImportPreviewItem struct {
	FileName     string              `json:"fileName"`
	Index        int                 `json:"index"`
	Type         string              `json:"type"`
	Title        string              `json:"title"`
	Description  string              `json:"description"`
	Body         string              `json:"body"`
	BodyFormat   string              `json:"bodyFormat"`
	CategorySlug string              `json:"categorySlug"`
	CategoryID   *uint               `json:"categoryId,omitempty"`
	ArticleType  string              `json:"articleType"`
	CourseType   string              `json:"courseType"`
	Tags         []string            `json:"tags"`
	Sections     []ImportSectionItem `json:"sections,omitempty"`
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
	Type        string              `json:"type"`
	Title       string              `json:"title"`
	Description string              `json:"description"`
	Body        string              `json:"body"`
	CategoryID  *uint               `json:"categoryId,omitempty"`
	ArticleType string              `json:"articleType"`
	CourseType  string              `json:"courseType"`
	Sections    []ImportSectionItem `json:"sections,omitempty"`
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

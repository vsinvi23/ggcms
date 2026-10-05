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
	FileName         string              `json:"fileName"`
	Index            int                 `json:"index"`
	Type             string              `json:"type"`
	Title            string              `json:"title"`
	Description      string              `json:"description"`
	Body             string              `json:"body"`
	BodyFormat       string              `json:"bodyFormat"`
	CategorySlug     string              `json:"categorySlug"`
	CategoryID       *uint               `json:"categoryId,omitempty"`
	ArticleType      string              `json:"articleType"`
	CourseType       string              `json:"courseType"`
	InteractiveMetadata string           `json:"interactiveMetadata,omitempty"`
	Kind             string              `json:"kind,omitempty"`
	Slug             string              `json:"slug,omitempty"`
	SequencedCourses []string            `json:"sequencedCourses,omitempty"`
	Status           string              `json:"status,omitempty"`
	Tags             []string            `json:"tags"`
	// Warnings are non-fatal issues found while parsing (e.g. an image path that does not resolve).
	Warnings []string `json:"warnings,omitempty"`
	Sections         []ImportSectionItem `json:"sections,omitempty"`
	Valid            bool                `json:"valid"`
	Error            string              `json:"error,omitempty"`
	Exists           bool                `json:"exists"`
	ExistingID       uint                `json:"existingId,omitempty"`
}

type ImportPreviewResponse struct {
	Items   []ImportPreviewItem `json:"items"`
	Total   int                 `json:"total"`
	Valid   int                 `json:"valid"`
	Invalid int                 `json:"invalid"`
}

type ImportConfirmItem struct {
	Type             string              `json:"type"`
	Title            string              `json:"title"`
	Description      string              `json:"description"`
	Body             string              `json:"body"`
	CategoryID       *uint               `json:"categoryId,omitempty"`
	CategorySlug     string              `json:"categorySlug,omitempty"`
	ArticleType      string              `json:"articleType"`
	CourseType       string              `json:"courseType"`
	InteractiveMetadata string           `json:"interactiveMetadata,omitempty"`
	Kind             string              `json:"kind,omitempty"`
	Slug             string              `json:"slug,omitempty"`
	SequencedCourses []string            `json:"sequencedCourses,omitempty"`
	Status           string              `json:"status,omitempty"`
	Sections         []ImportSectionItem `json:"sections,omitempty"`
	Exists           bool                `json:"exists"`
	ExistingID       uint                `json:"existingId,omitempty"`
	Overwrite        bool                `json:"overwrite"`
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

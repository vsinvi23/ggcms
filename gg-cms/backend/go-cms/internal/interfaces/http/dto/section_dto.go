package dto

type SectionResponse struct {
	ID              uint              `json:"id"`
	Title           string            `json:"title"`
	Description     *string           `json:"description,omitempty"`
	Order           int               `json:"order"`
	CourseID        *uint             `json:"courseId,omitempty"`
	ParentSectionID *uint             `json:"parentSectionId,omitempty"`
	ChildSections   []SectionResponse `json:"childSections,omitempty"`
	Lessons         []LessonResponse  `json:"lessons,omitempty"`
}

type LessonResponse struct {
	ID        uint    `json:"id"`
	Title     string  `json:"title"`
	Type      string  `json:"type"`
	Content   *string `json:"content,omitempty"`
	Duration  int     `json:"duration"`
	Order     int     `json:"order"`
	SectionID *uint   `json:"sectionId,omitempty"`
}

type CreateSectionRequest struct {
	Data struct {
		Title         string  `json:"title" binding:"required"`
		Order         int     `json:"order"`
		Course        *IDRef  `json:"course,omitempty"`
		ParentSection *IDRef  `json:"parentSection,omitempty"`
	} `json:"data" binding:"required"`
}

type UpdateSectionRequest struct {
	Data struct {
		Title       string  `json:"title"`
		Description *string `json:"description,omitempty"`
		Order       *int    `json:"order,omitempty"`
	} `json:"data"`
}

type CreateLessonRequest struct {
	Data struct {
		Title    string  `json:"title" binding:"required"`
		Type     string  `json:"type"`
		Content  *string `json:"content,omitempty"`
		Duration int     `json:"duration"`
		Order    int     `json:"order"`
		Section  *IDRef  `json:"section,omitempty"`
	} `json:"data" binding:"required"`
}

type UpdateLessonRequest struct {
	Data struct {
		Title    *string `json:"title,omitempty"`
		Type     *string `json:"type,omitempty"`
		Content  *string `json:"content,omitempty"`
		Duration *int    `json:"duration,omitempty"`
		Order    *int    `json:"order,omitempty"`
	} `json:"data"`
}

package dto

type DomainResponse struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Description  string `json:"description,omitempty"`
	Icon         string `json:"icon,omitempty"`
	ArticleCount int64  `json:"articleCount"`
	CourseCount  int64  `json:"courseCount"`
}

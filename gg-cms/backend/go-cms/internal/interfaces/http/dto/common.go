package dto

// IDRef is used in Strapi-style nested object references e.g. {data: {course: {id: 1}}}
type IDRef struct {
	ID uint `json:"id"`
}

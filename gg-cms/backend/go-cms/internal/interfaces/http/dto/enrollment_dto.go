package dto

type CourseRef struct {
	ID    uint   `json:"id"`
	Title string `json:"title,omitempty"`
}

type EnrollmentResponse struct {
	ID               uint       `json:"id"`
	Status           string     `json:"status"`
	Progress         float64    `json:"progress"`
	EnrolledAt       *string    `json:"enrolledAt,omitempty"`
	LastAccessedAt   *string    `json:"lastAccessedAt,omitempty"`
	CompletedAt      *string    `json:"completedAt,omitempty"`
	Course           *CourseRef `json:"course,omitempty"`
	CompletedLessons []IDRef    `json:"completedLessons,omitempty"`
}

// Course field can be int (course ID) or {id: N} object
type CreateEnrollmentRequest struct {
	Data struct {
		Course     interface{} `json:"course"` // int or {id: N}
		EnrolledAt *string     `json:"enrolledAt,omitempty"`
	} `json:"data" binding:"required"`
}

type UpdateEnrollmentRequest struct {
	Data struct {
		Progress         *float64 `json:"progress,omitempty"`
		Status           *string  `json:"status,omitempty"`
		CompletedLessons []IDRef  `json:"completedLessons,omitempty"`
	} `json:"data" binding:"required"`
}

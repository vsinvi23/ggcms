package dto

type ResumeResponse struct {
	EnrollmentID       uint            `json:"enrollmentId"`
	CourseID           uint            `json:"courseId"`
	Status             string          `json:"status"`
	Progress           float64         `json:"progress"`
	TotalLessons       int             `json:"totalLessons"`
	CompletedCount     int             `json:"completedCount"`
	CompletedLessonIDs []uint          `json:"completedLessonIds"`
	LastLessonID       *uint           `json:"lastLessonId"`
	NextLesson         *ResumeLesson   `json:"nextLesson"`
	AwaitingAssessment bool            `json:"awaitingAssessment"`
	AssessmentID       *uint           `json:"assessmentId,omitempty"`
}

type ResumeLesson struct {
	ID        uint   `json:"id"`
	Title     string `json:"title"`
	Type      string `json:"type"`
	SectionID *uint  `json:"sectionId,omitempty"`
}

type SyncLocalItem struct {
	CourseID           uint   `json:"courseId" binding:"required"`
	CompletedLessonIDs []uint `json:"completedLessonIds"`
}

type SyncLocalRequest struct {
	Items []SyncLocalItem `json:"items" binding:"required"`
}

type SyncLocalResult struct {
	CourseID uint    `json:"courseId"`
	Accepted int     `json:"accepted"`
	Rejected int     `json:"rejected"`
	Progress float64 `json:"progress"`
	Status   string  `json:"status,omitempty"`
	Error    string  `json:"error,omitempty"`
}

type PathCourseProgressResponse struct {
	CourseID    uint    `json:"courseId"`
	Title       string  `json:"title"`
	SortOrder   int     `json:"sortOrder"`
	Enrolled    bool    `json:"enrolled"`
	Status      string  `json:"status"`
	Progress    float64 `json:"progress"`
	CompletedAt *string `json:"completedAt,omitempty"`
}

type PathProgressResponse struct {
	PathID           uint                         `json:"pathId"`
	Title            string                       `json:"title"`
	TotalCourses     int                          `json:"totalCourses"`
	CompletedCourses int                          `json:"completedCourses"`
	Progress         float64                      `json:"progress"`
	NextCourseID     *uint                        `json:"nextCourseId"`
	Courses          []PathCourseProgressResponse `json:"courses"`
}

type AssessmentQuestionResponse struct {
	ID       string   `json:"id"`
	Text     string   `json:"text"`
	Options  []string `json:"options"`
	Multiple bool     `json:"multiple"`
}

type AssessmentDefinitionResponse struct {
	AssessmentID  uint                         `json:"assessmentId"`
	Title         string                       `json:"title"`
	PassMark      float64                      `json:"passMark"`
	QuestionCount int                          `json:"questionCount"`
	MaxAttempts   int                          `json:"maxAttempts"`
	Questions     []AssessmentQuestionResponse `json:"questions"`
}

type AttemptResponse struct {
	ID              uint     `json:"id"`
	AssessmentID    uint     `json:"assessmentId"`
	Status          string   `json:"status"`
	Score           *float64 `json:"score"`
	CorrectCount    int      `json:"correctCount"`
	TotalQuestions  int      `json:"totalQuestions"`
	PassMark        float64  `json:"passMark"`
	Passed          bool     `json:"passed"`
	StartedAt       string   `json:"startedAt"`
	SubmittedAt     *string  `json:"submittedAt"`
	DurationSeconds int      `json:"durationSeconds"`
}

type StartAttemptResponse struct {
	Attempt    AttemptResponse              `json:"attempt"`
	Assessment AssessmentDefinitionResponse `json:"assessment"`
}

type SubmitAnswer struct {
	QuestionID string `json:"questionId" binding:"required"`
	Selected   []int  `json:"selected"`
}

type SubmitAttemptRequest struct {
	Answers []SubmitAnswer `json:"answers"`
}

type QuestionResultResponse struct {
	QuestionID     string `json:"questionId"`
	Correct        bool   `json:"correct"`
	CorrectIndexes []int  `json:"correctIndexes,omitempty"`
	Explanation    string `json:"explanation,omitempty"`
}

type SubmitAttemptResponse struct {
	Attempt AttemptResponse          `json:"attempt"`
	Results []QuestionResultResponse `json:"results"`
}

type AttemptHistoryResponse struct {
	AssessmentID uint              `json:"assessmentId"`
	PassMark     float64           `json:"passMark"`
	AttemptsUsed int               `json:"attemptsUsed"`
	BestScore    *float64          `json:"bestScore"`
	Passed       bool              `json:"passed"`
	Attempts     []AttemptResponse `json:"attempts"`
}

type CourseRequirementRequest struct {
	AssessmentID *uint `json:"assessmentId"`
	Required     bool  `json:"required"`
}

type CertificateResponse struct {
	Code        string   `json:"code"`
	CourseID    uint     `json:"courseId"`
	CourseTitle string   `json:"courseTitle"`
	Recipient   string   `json:"recipientName"`
	Score       *float64 `json:"score"`
	IssuedAt    string   `json:"issuedAt"`
	Revoked     bool     `json:"revoked"`
	VerifyURL   string   `json:"verifyUrl"`
	PDFURL      string   `json:"pdfUrl"`
	LinkedInURL string   `json:"linkedInUrl"`
}

type PublicCertificateResponse struct {
	Valid         bool    `json:"valid"`
	RecipientName string  `json:"recipientName,omitempty"`
	CourseTitle   string  `json:"courseTitle,omitempty"`
	IssuedAt      *string `json:"issuedAt,omitempty"`
	Issuer        string  `json:"issuer,omitempty"`
}

type RevokeCertificateRequest struct {
	Reason string `json:"reason" binding:"required,max=500"`
}

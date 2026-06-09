package repository

import (
	"context"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
)

// --- Query Filters ---

type ArticleFilter struct {
	Status            *entity.CMSStatus
	CreatedBy         *uint
	ReviewerID        *uint
	CategoryID        *uint
	CourseType        *entity.CourseType // only used when routing to CourseFilter
	Search            *string
	PubliclyVisible   bool // when true, returns published items AND items with has_pending_draft=true (ignores Status)
	// When set, returns REVIEW items with reviewer_id IS NULL whose category is linked
	// to a reviewer group that contains the given user. Overrides Status/PubliclyVisible.
	AvailableForUserID *uint
}

type CourseFilter struct {
	Status            *entity.CMSStatus
	CreatedBy         *uint
	ReviewerID        *uint
	CategoryID        *uint
	CourseType        *entity.CourseType
	Search            *string
	PubliclyVisible   bool // same semantics as ArticleFilter.PubliclyVisible
	// When set, returns REVIEW items with reviewer_id IS NULL whose category is linked
	// to a reviewer group that contains the given user. Overrides Status/PubliclyVisible.
	AvailableForUserID *uint
}

type TaskFilter struct {
	UserID        *uint
	Type          *entity.TaskType
	Status        *string
	OwnershipType *entity.TaskOwnershipType
}

// --- PostgreSQL Repository Interfaces ---

type UserRepository interface {
	Create(ctx context.Context, user *entity.User) error
	Update(ctx context.Context, user *entity.User) error
	Delete(ctx context.Context, id uint) error
	UpdateLastLogin(ctx context.Context, id uint, t time.Time) error
	SetStatus(ctx context.Context, id uint, status entity.UserStatus) error
	FindByID(ctx context.Context, id uint) (*entity.User, error)
	FindByEmail(ctx context.Context, email string) (*entity.User, error)
	FindAll(ctx context.Context, page, size int) ([]*entity.User, int64, error)
	FindByGoogleID(ctx context.Context, googleID string) (*entity.User, error)
	FindByGitHubID(ctx context.Context, githubID string) (*entity.User, error)
	UpdateOAuthID(ctx context.Context, userID uint, provider, providerID string) error
}

type GroupRepository interface {
	Create(ctx context.Context, group *entity.Group) error
	Update(ctx context.Context, group *entity.Group) error
	Delete(ctx context.Context, id uint) error
	AddMember(ctx context.Context, groupID, userID uint) error
	RemoveMember(ctx context.Context, groupID, userID uint) error
	FindByID(ctx context.Context, id uint) (*entity.Group, error)
	FindByName(ctx context.Context, name string) (*entity.Group, error)
	FindAll(ctx context.Context, page, size int) ([]*entity.Group, int64, error)
	FindMembers(ctx context.Context, groupID uint) ([]*entity.User, error)
	FindByUserID(ctx context.Context, userID uint) ([]entity.Group, error)
}

type CategoryRepository interface {
	Create(ctx context.Context, category *entity.Category) error
	Update(ctx context.Context, category *entity.Category) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.Category, error)
	FindBySlug(ctx context.Context, slug string) (*entity.Category, error)
	// FindAll returns paginated non-virtual categories.
	FindAll(ctx context.Context, page, size int) ([]*entity.Category, int64, error)
	// FindTree returns the category tree. When includeVirtual is false,
	// virtual roots (e.g. "geek") are stripped and their children surfaced as roots.
	FindTree(ctx context.Context, includeVirtual bool) ([]*entity.Category, error)
	ExistsByNameAndParent(ctx context.Context, name string, parentID *uint, excludeID *uint) (bool, error)
	// FindVirtualRoot returns the single virtual root category (the "geek" node).
	FindVirtualRoot(ctx context.Context) (*entity.Category, error)
	// FindByReviewerGroupID returns all non-virtual categories linked to the given group.
	FindByReviewerGroupID(ctx context.Context, groupID uint) ([]*entity.Category, error)
	// FindReviewerGroups returns all groups linked to the given category for review routing.
	FindReviewerGroups(ctx context.Context, categoryID uint) ([]entity.Group, error)
	// AddReviewerGroup links a group to a category (idempotent).
	AddReviewerGroup(ctx context.Context, categoryID, groupID uint) error
	// RemoveReviewerGroup removes a group from the category's reviewer pool.
	RemoveReviewerGroup(ctx context.Context, categoryID, groupID uint) error
}

type ArticleRepository interface {
	Create(ctx context.Context, article *entity.Article) error
	Update(ctx context.Context, article *entity.Article) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.Article, error)
	FindByPublicID(ctx context.Context, publicID string) (*entity.Article, error)
	FindBySlug(ctx context.Context, slug string) (*entity.Article, error)
	FindAll(ctx context.Context, filter ArticleFilter, page, size int) ([]*entity.Article, int64, error)
	FindPublished(ctx context.Context, page, size int) ([]*entity.Article, int64, error)
	FindPublishedByCategorySlug(ctx context.Context, slug string, page, size int) ([]*entity.Article, int64, error)
	UpdateStatus(ctx context.Context, id uint, status entity.CMSStatus, reviewerID *uint, comment *string, publishedAt *time.Time) error
	// SaveSnapshot stores the current published state before overwriting with a new draft.
	SaveSnapshot(ctx context.Context, id uint, a *entity.Article) error
	// ClearSnapshot removes the snapshot once the new revision is published.
	ClearSnapshot(ctx context.Context, id uint) error
	// SaveReviewBaseline snapshots the current content when a reviewer sends it back,
	// so the next reviewer can diff what changed in the re-submission.
	SaveReviewBaseline(ctx context.Context, id uint, title string, description *string, body *string) error
	// SetReviewer explicitly sets (or clears, when nil) the reviewer_id without changing status.
	SetReviewer(ctx context.Context, id uint, reviewerID *uint) error
}

type CourseRepository interface {
	Create(ctx context.Context, course *entity.Course) error
	Update(ctx context.Context, course *entity.Course) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.Course, error)
	FindByPublicID(ctx context.Context, publicID string) (*entity.Course, error)
	FindBySlug(ctx context.Context, slug string) (*entity.Course, error)
	FindAll(ctx context.Context, filter CourseFilter, page, size int) ([]*entity.Course, int64, error)
	FindPublished(ctx context.Context, page, size int) ([]*entity.Course, int64, error)
	FindPublishedByCategorySlug(ctx context.Context, slug string, page, size int) ([]*entity.Course, int64, error)
	UpdateStatus(ctx context.Context, id uint, status entity.CMSStatus, reviewerID *uint, comment *string, publishedAt *time.Time) error
	// SaveSnapshot stores the current published state before overwriting with a new draft.
	SaveSnapshot(ctx context.Context, id uint, c *entity.Course) error
	// ClearSnapshot removes the snapshot once the new revision is published.
	ClearSnapshot(ctx context.Context, id uint) error
	// SaveReviewBaseline snapshots the current content when a reviewer sends it back,
	// so the next reviewer can diff what changed in the re-submission.
	SaveReviewBaseline(ctx context.Context, id uint, title string, description *string, body *string) error
	// SaveChaptersSnapshot stores the chapter/lesson hierarchy JSON at publish time.
	SaveChaptersSnapshot(ctx context.Context, id uint, chaptersJSON string) error
	// SaveReviewBaselineChapters stores the chapter/lesson hierarchy JSON when a reviewer sends content back.
	SaveReviewBaselineChapters(ctx context.Context, id uint, chaptersJSON string) error
	// SetReviewer explicitly sets (or clears, when nil) the reviewer_id without changing status.
	SetReviewer(ctx context.Context, id uint, reviewerID *uint) error
}

type SectionRepository interface {
	Create(ctx context.Context, section *entity.Section) error
	Update(ctx context.Context, section *entity.Section) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.Section, error)
	FindByCourseID(ctx context.Context, courseID uint) ([]*entity.Section, error)
}

type LessonRepository interface {
	Create(ctx context.Context, lesson *entity.Lesson) error
	Update(ctx context.Context, lesson *entity.Lesson) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.Lesson, error)
	FindBySectionID(ctx context.Context, sectionID uint) ([]*entity.Lesson, error)
}

type EnrollmentRepository interface {
	Create(ctx context.Context, enrollment *entity.Enrollment) error
	Update(ctx context.Context, enrollment *entity.Enrollment) error
	FindByID(ctx context.Context, id uint) (*entity.Enrollment, error)
	FindByUserAndCourse(ctx context.Context, userID, courseID uint) (*entity.Enrollment, error)
	FindByUserID(ctx context.Context, userID uint) ([]*entity.Enrollment, error)
	AddCompletedLesson(ctx context.Context, enrollmentID, lessonID uint) error
}

type TaskRepository interface {
	Create(ctx context.Context, task *entity.Task) error
	Update(ctx context.Context, task *entity.Task) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.Task, error)
	FindAll(ctx context.Context, filter TaskFilter, page, size int) ([]*entity.Task, int64, error)
	UpdateStatusByContentID(ctx context.Context, contentID uint, taskType entity.TaskType, status string) (int64, error)
	FindByContentID(ctx context.Context, contentID uint, taskType entity.TaskType) (*entity.Task, error)
	// FindByOwner looks up the owned task for a specific user+content combination.
	FindByOwner(ctx context.Context, contentID uint, taskType entity.TaskType, userID uint) (*entity.Task, error)
	// FindByReviewer looks up the reviewing task for a specific user+content combination.
	FindByReviewer(ctx context.Context, contentID uint, taskType entity.TaskType, userID uint) (*entity.Task, error)
}

type ContentTypeRepository interface {
	Create(ctx context.Context, ct *entity.ContentType) error
	Update(ctx context.Context, ct *entity.ContentType) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.ContentType, error)
	FindByKind(ctx context.Context, kind string) ([]*entity.ContentType, error)
}

type LearningPathRepository interface {
	Create(ctx context.Context, lp *entity.LearningPath) error
	Update(ctx context.Context, lp *entity.LearningPath) error
	Delete(ctx context.Context, id uint) error
	FindByID(ctx context.Context, id uint) (*entity.LearningPath, error)
	FindAll(ctx context.Context, kind string) ([]*entity.LearningPath, error)
	SetCourses(ctx context.Context, pathID uint, courses []entity.LearningPathCourse) error
}

type NotificationRepository interface {
	Create(ctx context.Context, notification *entity.Notification) error
	FindByUserID(ctx context.Context, userID uint, page, size int) ([]*entity.Notification, int64, error)
	MarkAsRead(ctx context.Context, id uint) error
	MarkAllAsRead(ctx context.Context, userID uint) error
}

type WorkflowEventRepository interface {
	Create(ctx context.Context, event *entity.WorkflowEvent) error
	FindByEntity(ctx context.Context, entityType string, entityID uint) ([]*entity.WorkflowEvent, error)
}

type TagRepository interface {
	Create(ctx context.Context, tag *entity.Tag) error
	FindAll(ctx context.Context) ([]*entity.Tag, error)
	FindByID(ctx context.Context, id uint) (*entity.Tag, error)
	FindByName(ctx context.Context, name string) (*entity.Tag, error)
	Delete(ctx context.Context, id uint) error
	SetCategoryTags(ctx context.Context, categoryID uint, tagIDs []uint) error
	GetCategoryTags(ctx context.Context, categoryID uint) ([]*entity.Tag, error)
}

// --- MongoDB Repository Interfaces ---

type CommentRepository interface {
	Create(ctx context.Context, comment *entity.ReviewComment) error
	Delete(ctx context.Context, id string) error
	FindByContentTypeAndID(ctx context.Context, contentType, contentID string) ([]*entity.ReviewComment, error)
	FindByID(ctx context.Context, id string) (*entity.ReviewComment, error)
	// AddReply embeds a reply inside the parent document and returns the created reply (with ID assigned).
	AddReply(ctx context.Context, parentID string, reply entity.ReviewComment) (*entity.ReviewComment, error)
	FindReplies(ctx context.Context, parentID string, skip, limit int) ([]*entity.ReviewComment, int64, error)
}

type AnalyticsRepository interface {
	TrackEvent(ctx context.Context, event *entity.AnalyticsEvent) error
	GetContentViews(ctx context.Context, contentID, contentType string) (int64, error)
	GetDashboardStats(ctx context.Context) (map[string]interface{}, error)
}

type MediaRepository interface {
	Save(ctx context.Context, filename, mimeType string, size int64) (string, error)
}

// ContentReviewRepository tracks individual reviewer approvals for multi-review workflows.
type ContentReviewRepository interface {
	// Upsert records an approval; safe to call multiple times by the same reviewer.
	Upsert(ctx context.Context, contentID uint, contentType string, reviewerID uint) error
	// Count returns the number of distinct reviewers who have approved the given content.
	Count(ctx context.Context, contentID uint, contentType string) (int, error)
	// CountBatch returns approval counts for multiple content IDs in a single query.
	CountBatch(ctx context.Context, contentType string, contentIDs []uint) (map[uint]int, error)
	// DeleteByContent removes all approval records for the given content (e.g. on rejection).
	DeleteByContent(ctx context.Context, contentID uint, contentType string) error
}

// --- Engagement Repository Interfaces ---

// ReactionRepository manages per-user reactions (like/dislike) in MongoDB.
// One document per (user_id, content_type, content_id).
type ReactionRepository interface {
	Upsert(ctx context.Context, r *entity.Reaction) error
	Delete(ctx context.Context, userID uint, contentType string, contentID uint) error
	FindByUser(ctx context.Context, userID uint, contentType string, contentID uint) (*entity.Reaction, error)
	CountBySentiment(ctx context.Context, contentType string, contentID uint) (likes, dislikes int64, err error)
}

// NoteRepository manages user notes in MongoDB.
// One note per (user_id, content_type, content_id).
type NoteRepository interface {
	Upsert(ctx context.Context, n *entity.Note) error
	FindByUser(ctx context.Context, userID uint, contentType string, contentID uint) (*entity.Note, error)
	ListByUser(ctx context.Context, userID uint, page, size int) ([]*entity.Note, int64, error)
	Delete(ctx context.Context, id string, userID uint) error
}

// FavouriteRepository manages user favourites in MongoDB.
type FavouriteRepository interface {
	Toggle(ctx context.Context, f *entity.Favourite) (added bool, err error)
	IsFavourited(ctx context.Context, userID uint, contentType string, contentID uint) (bool, error)
	ListByUser(ctx context.Context, userID uint, page, size int) ([]*entity.Favourite, int64, error)
}

// AuditLogRepository persists system-wide audit events in MongoDB.
type AuditLogRepository interface {
	// Create inserts a new audit log entry. Failures should be logged but never block the caller.
	Create(ctx context.Context, log *entity.AuditLog) error
	// List returns audit logs matching the filter, newest-first, paginated.
	List(ctx context.Context, filter AuditLogFilter, page, size int) ([]*entity.AuditLog, int64, error)
}

// AuditLogFilter defines optional search criteria for querying audit logs.
type AuditLogFilter struct {
	Action     string     // exact action match, e.g. "user.created"
	TargetType string     // e.g. "user"
	ActorID    *uint      // filter by who performed the action
	From       *time.Time // createdAt >= From
	To         *time.Time // createdAt <= To
}

// HighlightRepository manages user text highlights in MongoDB.
type HighlightRepository interface {
	Create(ctx context.Context, h *entity.Highlight) error
	ListByUser(ctx context.Context, userID uint, contentType string, contentID uint) ([]*entity.Highlight, error)
	// ListAllByUser returns all highlights for a user across all content, newest-first, paginated.
	ListAllByUser(ctx context.Context, userID uint, page, size int) ([]*entity.Highlight, int64, error)
	// Update allows changing the note and/or color of an existing highlight.
	Update(ctx context.Context, id string, userID uint, note string, color string) error
	Delete(ctx context.Context, id string, userID uint) error
}

// UserProfileRepository manages per-user learning profiles in PostgreSQL.
// A user may have multiple named profiles; exactly one has IsDefault=true.
type UserProfileRepository interface {
	// Upsert creates or updates the default profile for a user (ON CONFLICT user_id+is_default).
	Upsert(ctx context.Context, profile *entity.UserProfile) error
	// Create inserts a new named profile row (not the default upsert path).
	Create(ctx context.Context, profile *entity.UserProfile) error
	// FindDefaultByUserID returns the active/default profile, or nil if none exists.
	FindDefaultByUserID(ctx context.Context, userID uint) (*entity.UserProfile, error)
	// FindAllByUserID returns all profiles for a user, default first.
	FindAllByUserID(ctx context.Context, userID uint) ([]*entity.UserProfile, error)
	// FindByID returns a single profile by primary key.
	FindByID(ctx context.Context, id uint) (*entity.UserProfile, error)
	// SetDefault atomically makes profileID the active profile for userID.
	SetDefault(ctx context.Context, userID, profileID uint) error
}

// AppSettingsRepository persists key-value application settings.
type AppSettingsRepository interface {
	GetAll(ctx context.Context) (map[string]string, error)
	Set(ctx context.Context, key, value string) error
	SetMany(ctx context.Context, settings map[string]string) error
}

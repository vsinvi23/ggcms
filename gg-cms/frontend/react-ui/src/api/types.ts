// API Types based on CMS API Documentation

// ============================================
// GENERIC API RESPONSE WRAPPER
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
}

// ============================================
// PAGED RESPONSE
// ============================================

export interface PagedResponse<T> {
  items: T[];
  total?: number;
  totalElements?: number;
  currentPage: number;
  pageSize: number;
}

// ============================================
// AUTH TYPES
// ============================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  username?: string; // Optional username for Strapi
  mobileNo?: string;
}

export interface AuthResponse {
  userId?: number;
  email?: string;
  token: string;
  user?: any; // Full user object from Strapi
  message?: string;
}

// ============================================
// USER TYPES
// ============================================

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'DEACTIVATED';

export interface UserDto {
  id: number;
  email: string;
  name: string;
  mobileNo?: string;
  status: string;
  lastLogin: string | null;
  createdAt: string;
  groups: string[];
  groupIds?: number[];
}

// Legacy UserResponse for UI compatibility
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  lastLogin: string | null;
  createdAt: string;
  mobileNo?: string;
  groups?: string[];
}

export type UserPagedResponse = PagedResponse<UserDto>;

// ============================================
// GROUP TYPES
// ============================================

export interface ResourcePerms {
  view?: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
  review?: boolean;
  approve?: boolean;
  publish?: boolean;
}

export interface ManagePerms {
  view?: boolean;
  manage?: boolean;
}

export interface ViewPerms {
  view?: boolean;
}

export interface GroupPermissions {
  articles?: ResourcePerms;
  courses?: ResourcePerms;
  users?: ResourcePerms;
  groups?: ManagePerms;
  categories?: ResourcePerms;
  analytics?: ViewPerms;
  settings?: ManagePerms;
}

export interface GroupCreateDto {
  name: string;
  role?: string;
  permissions?: GroupPermissions;
}

export interface GroupUserDto {
  id: number;
  name: string;
  email: string;
}

export interface GroupResponseDto {
  id: number;
  name: string;
  role?: string;
  permissions?: GroupPermissions;
  users: GroupUserDto[] | null;
}

export type GroupPagedResponse = PagedResponse<GroupResponseDto>;

// ============================================
// CATEGORY TYPES
// ============================================

export interface CategoryCreateDto {
  name: string;
  parentId?: number | null;
  requiredApprovals?: number;
}

export interface CategoryResponseDto {
  id: number;
  name: string;
  parentId: number | null;
  isVirtual?: boolean;
  slug?: string;
  description?: string;
  requiredApprovals?: number;
  children?: CategoryResponseDto[];
}

export type CategoryListResponse = CategoryResponseDto[];

export interface ReviewerOption {
  id: number;
  name: string;
}

export interface CategoryReviewerGroup {
  id: number;
  name: string;
  role: string;
}

// ============================================
// CMS TYPES (per API documentation)
// ============================================

export type CmsType = 'ARTICLE' | 'VIDEO' | 'COURSE';

// Status values: DRAFT | REVIEW | APPROVED | PUBLISHED | REJECTED
export type CmsStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';

export interface CmsCreateDto {
  type: CmsType;
  categoryId: number;
  createdBy?: number;
  title?: string;
  description?: string;
  body?: string;
  articleType?: string | null;
  courseType?: string | null;
}

export interface CmsUpdateDto {
  type?: CmsType;
  categoryId?: number;
  title?: string;
  description?: string;
  body?: string;
  articleType?: string | null;
  courseType?: string | null;
  thumbnailUrl?: string | null;
}

export interface AttachmentDto {
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface CmsResponseDto {
  id: number;
  publicId?: string;
  slug?: string;
  type: CmsType;
  articleType?: string | null;
  courseType?: string | null;
  blockCount?: number;
  categoryId: number;
  createdBy: number;
  createdByName?: string;
  reviewerId: number | null;
  reviewerName: string | null;
  reviewerComment: string | null;
  status: CmsStatus;
  title: string | null;
  description: string | null;
  body?: string | null;
  categoryName?: string | null;
  // Body content (HTML)
  bodyLocation: string | null;
  bodyName: string | null;
  bodyType: string | null;
  bodySize: number | null;
  bodyUrl?: string | null;
  // Main content/attachment file
  contentLocation: string | null;
  contentName: string | null;
  contentType: string | null;
  contentSize: number | null;
  contentUrl?: string | null;
  // Thumbnail
  thumbnailLocation: string | null;
  thumbnailName: string | null;
  thumbnailType: string | null;
  thumbnailSize: number | null;
  thumbnailUrl?: string | null;
  // Attachments array
  attachments: AttachmentDto[] | null;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  version?: number;
  updatedBy?: number;
  // Versioning — set when a published item is being re-edited
  hasPendingDraft?: boolean;
  publishedVersion?: number | null;
  // Published snapshot — the last-live state held while a new draft is in review
  publishedTitle?: string | null;
  publishedDescription?: string | null;
  publishedBody?: string | null;
  // Review baseline — snapshot taken when reviewer sent content back; used to diff what changed
  reviewBaselineTitle?: string | null;
  reviewBaselineDescription?: string | null;
  reviewBaselineBody?: string | null;
  // Chapter snapshots (courses only) — JSON encoding of section/lesson hierarchy
  publishedChaptersSnapshot?: string | null;
  reviewBaselineChapters?: string | null;
  // Multi-review progress — populated for REVIEW-status items
  approvalCount?: number | null;
  requiredApprovals?: number | null;
}

export interface MediaUploadResponse {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export type CmsPagedResponse = PagedResponse<CmsResponseDto>;

export interface CmsSubmitRequest {
  userId?: number;
}

export interface CmsApproveRequest {
  userId?: number;
}

export interface CmsPublishRequest {
  userId?: number;
}

export interface CmsSendBackRequest {
  reviewerId?: number;
  comment: string;
}

// ============================================
// API ERROR TYPE
// ============================================

export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

// ─── Task ────────────────────────────────────────────────────────────────────
export type TaskType = 'course' | 'article';
export type TaskOwnershipType = 'owned' | 'reviewing' | 'contributed';

export interface TaskDto {
  id: number;
  contentId?: number;
  type: TaskType;
  title: string;
  status: string;
  ownershipType: TaskOwnershipType;
  user?: { id: number; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  // CMS live data — populated from articles/courses table (always up-to-date)
  version?: number;
  liveStatus?: string;  // live CMS status, e.g. "REVIEW", "APPROVED", "PUBLISHED"
  hasPendingDraft?: boolean;
  publishedVersion?: number | null;
}

export interface TaskCreateDto {
  type: TaskType;
  title: string;
  status?: string;
  ownershipType?: TaskOwnershipType;
}

export type TaskPagedResponse = PagedResponse<TaskDto>;

// ─── Review Comment ──────────────────────────────────────────────────────────
export type ReviewCommentContentType = 'course' | 'article' | 'lesson';

export interface ReviewCommentDto {
  // id is a MongoDB ObjectID hex string from our backend
  id: string;
  content: string;
  contentType: ReviewCommentContentType;
  contentId: string;
  author?: { id: number; name: string; email: string };
  parent?: { id: string } | null;
  replies?: ReviewCommentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCommentCreateDto {
  content: string;
  contentType: ReviewCommentContentType;
  contentId: string;
  // parentId is a MongoDB ObjectID hex string (or null for top-level comments)
  parentId?: string | null;
}

// ─── Notification ────────────────────────────────────────────────────────────
export interface NotificationDto {
  id: number;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
  createdAt: string;
}

export type NotificationPagedResponse = PagedResponse<NotificationDto>;

// ─── Section ─────────────────────────────────────────────────────────────────
export interface SectionDto {
  id: number;
  title: string;
  description?: string | null;
  order: number;
  course?: { id: number } | null;
  parentSection?: { id: number } | null;
  childSections?: SectionDto[];
  lessons?: LessonDto[];
}

export interface SectionCreateDto {
  title: string;
  order: number;
  courseId: number;
  parentSectionId?: number | null;
}

// ─── Lesson ──────────────────────────────────────────────────────────────────
export type LessonType = 'video' | 'text' | 'quiz' | 'assignment';

export interface LessonDto {
  id: number;
  title: string;
  type: LessonType;
  content?: string | null;
  duration: number;
  order: number;
  section?: { id: number } | null;
}

export interface LessonCreateDto {
  title: string;
  type?: LessonType;
  content?: string;
  duration?: number;
  order: number;
  sectionId: number;
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export interface TagDto {
  id: number;
  name: string;
}

// ─── Engagement ───────────────────────────────────────────────────────────────

export interface ReactionSummary {
  likes: number;
  dislikes: number;
  userVote: 'like' | 'dislike' | '';
}

export interface NoteDto {
  id: string;
  contentType: string;
  contentId: number;
  body: string;
  updatedAt: string;
}

export interface FavouriteDto {
  isFavourited: boolean;
}

export interface FavouriteItemDto {
  id: string;
  contentType: string;
  contentId: number;
  createdAt: string;
}

export interface HighlightDto {
  id: string;
  contentType: string;
  contentId: number;
  contentTitle?: string;
  contentSlug?: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
}

// ─── Enrollment ──────────────────────────────────────────────────────────────
export type EnrollmentStatus = 'active' | 'completed' | 'dropped';

export interface EnrollmentDto {
  id: number;
  status: EnrollmentStatus;
  progress: number;
  enrolledAt: string | null;
  lastAccessedAt: string | null;
  completedAt: string | null;
  course?: { id: number; title: string } | null;
  completedLessons?: { id: number }[];
}

export interface EnrollmentCreateDto {
  courseId: number;
}

export interface EnrollmentProgressDto {
  completedLessonId?: number;
  progress?: number;
  status?: EnrollmentStatus;
}

// ============================================
// PERSONALIZATION TYPES
// ============================================

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type RoleType = 'learner' | 'developer' | 'architect' | 'manager' | 'researcher' | 'executive';

export interface UserProfileDto {
  id: number;
  userId: number;
  name: string;
  isDefault: boolean;
  experienceLevel: ExperienceLevel;
  roleType: RoleType;
  learningGoals: string | null;
  onboardingCompleted: boolean;
  interestedTagIds: number[];
  preferredCategoryIds: number[];
}

export interface UpsertProfileRequest {
  name?: string;
  experienceLevel: ExperienceLevel;
  roleType: RoleType;
  learningGoals?: string | null;
  onboardingCompleted: boolean;
  interestedTagIds: number[];
  preferredCategoryIds: number[];
}

export interface CreateProfileRequest {
  name: string;
  experienceLevel: ExperienceLevel;
  roleType: RoleType;
  learningGoals?: string | null;
  interestedTagIds: number[];
  preferredCategoryIds: number[];
}

export interface RecommendedItem {
  id: number;
  publicId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  categoryId: number | null;
  contentType: 'article' | 'course';
  score: number;
}

// ─── Workflow Activity ────────────────────────────────────────────────────────
export interface WorkflowEventResponse {
  id: number;
  entityType: string;
  entityId: number;
  userId: number;
  userName: string;
  fromStatus: string;
  toStatus: string;
  action: string;
  comment?: string | null;
  version?: number | null;
  titleSnapshot?: string;
  createdAt: string;
}

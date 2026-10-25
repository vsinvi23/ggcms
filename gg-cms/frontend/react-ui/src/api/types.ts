// API Types based on CMS API Documentation

import type { ContentFormat } from '@/types/content';

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
  user?: Record<string, unknown>; // Full user object from Strapi
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
  assessments?: ResourcePerms;
  all?: boolean;
  analytics?: ViewPerms;
  settings?: ManagePerms;
  publicQuickEdit?: { enabled?: boolean };
}

export interface ContentRevisionDto {
  id: number;
  parentContentId: number;
  contentType: string;
  versionNumber: number;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'REJECTED';
  requestedBy: number;
  requestedByName?: string;
  title: string;
  description?: string;
  body?: string;
  categoryName?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
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
  roles?: string[];
  description?: string;
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
  domainId?: number | null;
  isVirtual?: boolean;
  slug?: string;
  description?: string;
  requiredApprovals?: number;
  articleCount?: number;
  courseCount?: number;
  contentCount?: number;
  children?: CategoryResponseDto[];
}

export interface DomainDto {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articleCount: number;
  courseCount: number;
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
  interactiveMetadata?: string | null;
  contentFormat?: ContentFormat | null;
  topicIds?: number[];
}

export interface CmsUpdateDto {
  type?: CmsType;
  categoryId?: number;
  title?: string;
  description?: string;
  body?: string;
  articleType?: string | null;
  courseType?: string | null;
  interactiveMetadata?: string | null;
  contentFormat?: ContentFormat | null;
  thumbnailUrl?: string | null;
  topicIds?: number[];
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
  interactiveMetadata?: string | null;
  contentFormat?: ContentFormat | null;
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
  durationMinutes?: number | null;
  sectionsCount?: number | null;
  lessonsCount?: number | null;
  tags?: string[] | null;
  level?: string | null;
  excerpt?: string | null;
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
  moderationStatus?: string;
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
export type NotificationType =
  | 'review_decision' | 'review_assigned' | 'content_published' | 'comment_reply'
  | 'comment_mention' | 'enrollment' | 'course_completed' | 'welcome' | 'general';

export interface NotificationDto {
  id: number;
  type: NotificationType;
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
  summary?: string | null;
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
  completedLessons?: { id: number }[];
  lastLessonId?: number;
  status?: 'active' | 'dropped';
}

export interface EnrollmentResumeDto {
  enrollmentId: number;
  courseId: number;
  status: EnrollmentStatus;
  progress: number;
  totalLessons: number;
  completedCount: number;
  completedLessonIds: number[];
  lastLessonId: number | null;
  nextLesson: { id: number; title: string; type: string; sectionId: number } | null;
  awaitingAssessment: boolean;
  assessmentId: number | null;
}

export interface SyncLocalItem {
  courseId: number;
  completedLessonIds: number[];
}

export interface SyncLocalResult {
  courseId: number;
  accepted: number;
  rejected: number;
  progress: number;
  status: string;
  error?: string;
}

export interface PathProgressCourseDto {
  courseId: number;
  title: string;
  sortOrder: number;
  enrolled: boolean;
  status: 'completed' | 'active' | 'not_started';
  progress: number;
  completedAt?: string | null;
}

export interface PathProgressDto {
  pathId: number;
  title: string;
  totalCourses: number;
  completedCourses: number;
  progress: number;
  nextCourseId: number | null;
  courses: PathProgressCourseDto[];
}

export interface AssessmentQuestionDto {
  id: string;
  text: string;
  options: string[];
  multiple: boolean;
}

export interface AssessmentDefinitionDto {
  assessmentId: number;
  title: string;
  passMark: number;
  questionCount: number;
  maxAttempts: number;
  questions: AssessmentQuestionDto[];
}

export interface AssessmentAttemptDto {
  id: number;
  assessmentId: number;
  status: string;
  score: number | null;
  correctCount: number | null;
  totalQuestions: number;
  passMark: number;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
}

export interface AssessmentStartDto {
  attempt: AssessmentAttemptDto;
  assessment: AssessmentDefinitionDto;
}

export interface AssessmentAnswerDto {
  questionId: string;
  selected: number[];
}

export interface AssessmentQuestionResultDto {
  questionId: string;
  correct: boolean;
  correctIndexes?: number[];
  explanation?: string;
}

export interface AssessmentSubmitDto {
  attempt: AssessmentAttemptDto;
  results: AssessmentQuestionResultDto[];
}

export interface AssessmentHistoryDto {
  assessmentId: number;
  passMark: number;
  attemptsUsed: number;
  bestScore: number | null;
  passed: boolean;
  attempts: AssessmentAttemptDto[];
}

export interface CertificateDto {
  code: string;
  courseId: number;
  courseTitle: string;
  recipientName: string;
  score: number | null;
  issuedAt: string;
  revoked: boolean;
  verifyUrl: string;
  pdfUrl: string;
  linkedInUrl: string;
}

export interface CertificateVerificationDto {
  valid: boolean;
  recipientName?: string;
  courseTitle?: string;
  issuedAt?: string;
  issuer?: string;
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
  recId?: string;
  slug?: string;
  categoryName?: string;
  reasonCode?: RecReasonCode;
  reason?: string;
  position?: number;
}

export type RecReasonCode =
  | 'NEXT_STEP' | 'TOPIC_AFFINITY' | 'CATEGORY_PREFERENCE' | 'TAG_INTEREST' | 'TRENDING' | 'NEW'
  | 'NEXT_IN_PATH' | 'CONTINUE_COURSE' | 'PREREQUISITE' | 'RELATED_TOPIC' | 'SAME_CATEGORY';

export interface ContinueItem {
  kind: 'path_next' | 'in_progress';
  reasonCode: 'NEXT_IN_PATH' | 'CONTINUE_COURSE';
  reason: string;
  courseId: number;
  courseSlug: string;
  courseTitle: string;
  progress: number;
  pathId?: number;
  pathSlug?: string;
  pathTitle?: string;
  pathCompleted?: number;
  pathTotal?: number;
  recId: string;
}

export interface PersonalizationFeed {
  recId: string;
  coldStart: boolean;
  partial?: boolean;
  generatedAt: string;
  continue?: ContinueItem;
  items: RecommendedItem[];
}

// ─── Public search ────────────────────────────────────────────────────────────

export type SearchType = 'all' | 'article' | 'course';
export type SearchLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface SearchParams {
  q?: string;
  type?: SearchType;
  category?: string;
  topic?: string;
  level?: SearchLevel;
  page?: number;
  size?: number;
}

export interface SearchHit {
  type: 'article' | 'course';
  id: number;
  publicId: string;
  slug: string;
  path: string;
  title: string;
  titleHtml: string;
  description?: string;
  snippetHtml?: string;
  thumbnailUrl?: string;
  category?: { id: number; name: string; slug: string };
  level?: string;
  subtype?: string;
  publishedAt?: string;
  matchedLesson?: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  page: number;
  size: number;
  totalPages: number;
  hits: SearchHit[];
}

export interface SuggestResponse {
  query: string;
  titles: { type: 'article' | 'course'; id: number; title: string; path: string }[];
  topics: { id: number; name: string; slug: string }[];
  categories: { id: number; name: string; slug: string }[];
  queries: string[];
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

// ============================================
// DOMAIN & TOPIC TYPES
// ============================================

export interface DomainDto {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TopicDto {
  id: number;
  name: string;
  slug: string;
  entity_type: string;
  description?: string;
  status: string;
  merged_into_topic_id?: number;
  parent_topic_id?: number;
  created_at: string;
  updated_at: string;
}

export interface TopicAliasDto {
  id: number;
  topic_id: number;
  alias: string;
  normalized_alias?: string;
  status: string;
}

export interface TopicRelationshipDto {
  id?: number;
  source_topic_id: number;
  target_topic_id: number;
  relationship_type: string;
  weight: number;
  confidence: number;
  source_type: string;
  source_reference?: string;
  status: string;
}

export interface ContentTopicDto {
  content_id: number;
  content_type: string;
  topic_id: number;
  role: string;
  weight: number;
}

export interface TopicResolutionDto {
  status: 'MATCH' | 'SUGGESTION' | 'NEW';
  matched_topic?: TopicDto;
  suggested_topics?: TopicDto[];
  confidence: number;
  raw_input: string;
}

export interface RecommendationScoreDto {
  content_id: number;
  content_type: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  score: number;
  reason_code: string;
  reason: string;
}

export interface RecommendationResponseDto {
  content_id: number;
  recommendations: RecommendationScoreDto[];
}


export interface TopContentDto {
  contentId: string;
  contentType: string;
  views: number;
  title?: string;
  slug?: string;
}

export interface AnalyticsDashboardDto {
  pageViews30d: number;
  topContent: TopContentDto[];
}

// ─── AI layer ────────────────────────────────────────────────────────────────
export type AiContentType = 'article' | 'course';
export type AiDifficulty = 'easy' | 'medium' | 'hard';
export type AiLevel = 'beginner' | 'intermediate' | 'advanced';
export type AiDraftKind = 'summary' | 'seo' | 'quiz';
export type AiDraftStatus = 'draft' | 'accepted' | 'rejected';

export interface AiStatus {
  enabled: boolean;
  configured: boolean;
  features: { editorial: boolean; moderation: boolean; tutor: boolean; quiz: boolean; studyPlan: boolean };
}

export interface AiTagSuggestion { id: number; name: string; score: number; reason?: string }
export interface AiTagSuggestions {
  topics: AiTagSuggestion[];
  categories: AiTagSuggestion[];
  tags: AiTagSuggestion[];
  source: 'llm' | 'heuristic';
  note?: string;
}
export interface AiSummaryDraft { draftId: string; tldr: string; takeaways: string[]; status: AiDraftStatus }
export interface AiSeoDraft { draftId: string; metaTitle: string; metaDescription: string; keywords: string[]; lengthAdjusted: boolean }
export interface AiQualityIssue {
  severity: 'info' | 'warn' | 'error';
  category: 'structure' | 'readability' | 'broken_link' | 'missing_section' | 'unsupported_claim';
  message: string;
  location?: string;
}
export interface AiQualityReport { score: number; issues: AiQualityIssue[]; stats?: Record<string, number>; aiUsed: boolean; note?: string }
export interface AiQuizQuestion { type: 'mcq'; question: string; options: string[]; correctIndex: number; explanation: string; anchor?: string }
export interface AiQuizDraft { draftId: string; difficulty: AiDifficulty; questions: AiQuizQuestion[]; status: AiDraftStatus }
export interface AiDraft {
  id: string;
  kind: AiDraftKind;
  payload: Record<string, unknown>;
  status: AiDraftStatus;
  createdAt: string;
}

export interface AiCitation {
  id: string | number;
  title: string;
  heading?: string;
  anchor?: string;
  url: string;
  contentType: AiContentType;
  contentId: number;
}
export interface TutorAnswer {
  conversationId: string;
  messageId: number;
  answer: string;
  grounded: boolean;
  citations: AiCitation[];
}
export interface TutorConversation { id: string; title?: string; contentType?: AiContentType; contentId?: number; createdAt?: string; updatedAt?: string }
export interface TutorMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citations?: AiCitation[];
  grounded?: boolean;
  rating?: number | null;
  createdAt?: string;
}
export interface TutorAskRequest {
  contentType: AiContentType;
  contentId: number;
  question: string;
  conversationId?: string;
}
export interface StudyPlanItem { type: 'course' | 'path'; id: number; title: string; reason: string; order: number }
export interface StudyPlan { summary: string; items: StudyPlanItem[]; note?: string }

export interface AiSettingsView {
  enabled: boolean; editorialEnabled: boolean; moderationEnabled: boolean; tutorEnabled: boolean; quizEnabled: boolean; studyPlanEnabled: boolean;
  moderationFailClosed: boolean; modelDefault: string; modelCheap: string;
  userPerMinute: number; globalPerMinute: number; userDailyTutor: number; userDailyOther: number;
  monthlyBudgetUsd: number; perRequestBudgetUsd: number;
  keyConfigured: boolean; provider: string;
}
export type AiSettingsUpdate = Record<string, string>;
export interface AiUsageRow { key: string; calls: number; inputTokens: number; outputTokens: number; costMicroUsd: number; avgLatencyMs: number; errors: number }
export interface AiUsageReport { total: AiUsageRow; byTask: AiUsageRow[]; byUser: AiUsageRow[]; byDay: AiUsageRow[] }
export type AiModerationStatus = 'pending_review' | 'approved' | 'rejected';
export interface AiModerationItem {
  id: number;
  commentId: string;
  contentType: string;
  contentId: number | string;
  authorId: number;
  excerpt: string;
  reasons: string[];
  source: 'heuristic' | 'llm' | 'fail_open' | 'fail_closed';
  status: AiModerationStatus;
  createdAt: string;
}

// ─── Analytics reports ───────────────────────────────────────────────────────
export interface DateRange {
  from: string;
  to: string;
}

export interface AnalyticsTimelinePoint {
  day: string;
  activeUsers: number;
  visitors: number;
  pageViews: number;
  newUsers: number;
  enrollments: number;
  completions: number;
}

export interface AnalyticsOverviewDto {
  from: string;
  to: string;
  dau: number;
  wau: number;
  mau: number;
  totals: {
    pageViews: number;
    reads: number;
    searches: number;
    newUsers: number;
    enrollments: number;
    completions: number;
  };
  timeline: AnalyticsTimelinePoint[];
}

export interface AnalyticsContentRow {
  contentType: string;
  contentId: string | number;
  title: string;
  slug: string;
  views: number;
  uniqueVisitors: number;
  uniqueReaders: number;
  avgReadSeconds: number;
  completionRate: number;
  enrollments: number;
  completions: number;
  trendPct: number;
}

export interface AnalyticsStaleRow {
  contentType: string;
  contentId: string | number;
  title: string;
  slug: string;
  views: number;
  updatedAt: string;
}

export interface AnalyticsContentDto {
  top: AnalyticsContentRow[];
  trending: AnalyticsContentRow[];
  stale: AnalyticsStaleRow[];
}

export interface AnalyticsSearchRow {
  queryHash: string;
  queryText?: string;
  count: number;
  zeroResultCount: number;
  avgResults: number;
}

export interface AnalyticsSearchDto {
  totalSearches: number;
  zeroResultRate: number;
  top: AnalyticsSearchRow[];
  zeroResults: AnalyticsSearchRow[];
}

export interface AnalyticsFunnelDto {
  steps: { step: 'visit' | 'signup' | 'enroll' | 'complete'; count: number; conversionFromPrevious: number }[];
  note?: string;
}

export interface AnalyticsCohortsDto {
  weeks: number;
  cohorts: { cohortWeek: string; size: number; retention: number[] }[];
}

export interface AnalyticsRecommendationsDto {
  rows: { recId: string; impressions: number; clicks: number; completions: number; ctr: number; completionRate: number }[];
  total?: number;
  note?: string;
}

export type EngagementLevel = 'high' | 'medium' | 'low' | 'dormant';
export type ChurnRisk = 'new' | 'low' | 'medium' | 'high';

export interface UserEngagementRow {
  userId: number;
  name: string;
  email: string;
  score: number;
  level: EngagementLevel;
  churnRisk: ChurnRisk;
  atRisk: boolean;
  lastActiveAt: string | null;
  activeDays30d: number;
  reads30d: number;
  lessonsCompleted30d: number;
}

export interface UserEngagementPage {
  items: UserEngagementRow[];
  total: number;
  currentPage: number;
  pageSize: number;
}

// ─── Privacy, consent and preferences ────────────────────────────────────────
export interface PrivacyRetentionDto {
  consentPolicyVersion: string;
  analyticsRawEventsDays: number;
  analyticsRollupDays: number;
  readNotificationsDays: number;
  sentEmailLogDays: number;
  accountDeletion: string;
}

export interface ConsentRecord {
  policyVersion: string;
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  createdAt?: string;
}

export interface ConsentState {
  current: ConsentRecord | null;
  currentPolicyVersion: string;
  needsReconsent: boolean;
  history: ConsentRecord[];
}

export interface ConsentInput {
  policyVersion: string;
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
}

export interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
}

export type PreferenceNotificationType = Exclude<NotificationType, 'general'>;
export type DigestFrequency = 'off' | 'daily' | 'weekly';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface UserPreferences {
  notifications: Record<PreferenceNotificationType, ChannelPrefs>;
  digestFrequency: DigestFrequency;
  emailUnsubscribed: boolean;
  privacy: { profilePublic: boolean; showActivity: boolean };
  appearance: { theme: ThemePreference; language: string };
  profile: { bio: string; location: string; jobTitle: string };
}

export interface UserPreferencesUpdate {
  notifications?: Partial<Record<PreferenceNotificationType, Partial<ChannelPrefs>>>;
  digestFrequency?: DigestFrequency;
  emailUnsubscribed?: boolean;
  privacy?: Partial<UserPreferences['privacy']>;
  appearance?: Partial<UserPreferences['appearance']>;
}

export interface SelfProfile {
  id: number;
  email: string;
  name: string;
  mobileNo: string;
  avatarUrl: string;
  bio: string;
  location: string;
  jobTitle: string;
}

export type SelfProfileUpdate = Partial<Omit<SelfProfile, 'id' | 'email'>>;

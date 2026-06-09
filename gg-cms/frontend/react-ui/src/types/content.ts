// ===============================
// CONTENT MANAGEMENT TYPES
// ===============================

export type WorkflowStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'published' | 'rejected';

export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId: string | null;
  children: Category[];
  userGroups: UserGroup[];
  settings: CategorySettings;
  createdAt: string;
  updatedAt: string;
}

export interface CategorySettings {
  defaultReviewerGroupId: string | null;
  allowedContentTypes: ('course' | 'article')[];
  autoApproval: boolean;
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  members: GroupMember[];
  permissions: Permission[];
}

export interface GroupMember {
  id: string;
  userId: string;
  userName: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  addedAt: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

// ===============================
// COURSE MANAGEMENT TYPES
// ===============================

export interface Course {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryPath: string[];
  thumbnail?: string;
  instructor: string;
  duration: number; // in minutes
  status: WorkflowStatus;
  sections: CourseSection[];
  tags: string[];
  language: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface CourseSection {
  id: string;
  title: string;
  order: number;
  subsections: CourseSubsection[];
}

export interface CourseSubsection {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  title: string;
  order: number;
  content: string;
  duration: number;
  mediaUrl?: string;
  attachments: Attachment[];
  tags: string[];
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt?: string;
}

// ===============================
// CONTENT BLOCK TYPES
// ===============================

export type ContentBlockType = 
  | 'paragraph' 
  | 'heading1' 
  | 'heading2' 
  | 'heading3' 
  | 'code' 
  | 'quote' 
  | 'image' 
  | 'list' 
  | 'ordered-list'
  | 'divider';

export interface CodeBlockData {
  language: string;
  code: string;
  filename?: string;
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  content: string;
  codeData?: CodeBlockData;
  imageUrl?: string;
  imageAlt?: string;
  listItems?: string[];
}

// ===============================
// ARTICLE MANAGEMENT TYPES
// ===============================

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  contentBlocks?: ContentBlock[];
  excerpt: string;
  categoryId?: string;
  categoryPath: string[];
  author: string;
  status: WorkflowStatus;
  seo: SeoSettings;
  featuredImage?: string;
  attachments: Attachment[];
  tags: string[];
  scheduledPublishDate?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface SeoSettings {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  canonicalUrl?: string;
  ogImage?: string;
}

// ===============================
// REVIEW & WORKFLOW TYPES
// ===============================

export interface ReviewComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  replies: ReviewComment[];
}

export interface VersionHistory {
  id: string;
  version: number;
  changedBy: string;
  changedAt: string;
  changes: string;
  status: WorkflowStatus;
}

export interface WorkflowAction {
  action: 'submit' | 'approve' | 'reject' | 'request_changes' | 'publish' | 'unpublish';
  label: string;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
}

// ===============================
// TREE NODE GENERIC TYPE
// ===============================

export interface TreeNode<T = unknown> {
  id: string;
  label: string;
  children: TreeNode<T>[];
  data?: T;
  isExpanded?: boolean;
  isSelected?: boolean;
}

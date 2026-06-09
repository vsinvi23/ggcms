# Unified Database Schema Documentation

This document provides the complete single-database schema for the CMS solution. This consolidated approach simplifies deployment and maintenance while supporting all UI functionalities.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SINGLE DATABASE (Stateless JWT Auth)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │ AUTHENTICATION   │  │ AUTHORIZATION    │  │ CONTENT          │           │
│  │ ─────────────    │  │ ─────────────    │  │ ─────────────    │           │
│  │ • users          │  │ • roles          │  │ • categories     │           │
│  │ • password_reset │  │ • permissions    │  │ • articles       │           │
│  │                  │  │ • role_perms     │  │ • courses        │           │
│  └──────────────────┘  │ • user_roles     │  │ • lessons        │           │
│                        │ • groups         │  └──────────────────┘           │
│  NOTE: Stateless JWT   │ • user_groups    │                                  │
│  No session storage    │ • group_roles    │                                  │
│                        └──────────────────┘                                  │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │ ENGAGEMENT       │  │ WORKFLOW         │  │ SYSTEM           │           │
│  │ ─────────────    │  │ ─────────────    │  │ ─────────────    │           │
│  │ • comments       │  │ • workflows      │  │ • media          │           │
│  │ • reactions      │  │ • workflow_inst  │  │ • notifications  │           │
│  │ • bookmarks      │  │ • tasks          │  │ • audit_logs     │           │
│  │ • shares         │  │ • task_notes     │  │ • settings       │           │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## JWT Authentication Configuration

This schema uses **stateless JWT authentication**:

- **Access Token Expiry**: 15-30 minutes (recommended)
- **No Refresh Tokens**: Users re-authenticate when token expires
- **Token Storage**: Client-side only (localStorage)
- **Password Reset**: Uses short-lived tokens (15 minutes) stored in `password_reset_tokens` table

## Entity Relationship Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   users     │────<│ user_groups │>────│     groups      │
└─────────────┘     └─────────────┘     └─────────────────┘
       │                                        │
       │            ┌─────────────┐             │
       └───────────<│ user_roles  │             │
                    └─────────────┘             │
                           │                    │
                    ┌──────┴──────┐      ┌──────┴──────┐
                    │    roles    │──────│ group_roles │
                    └─────────────┘      └─────────────┘
                           │
                    ┌──────┴──────┐
                    │role_perms   │
                    └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ permissions │
                    └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  articles   │────<│article_tags │>────│      tags       │
└─────────────┘     └─────────────┘     └─────────────────┘
       │
       ├────────────┬────────────┬────────────┐
       │            │            │            │
┌──────┴──────┐ ┌───┴───┐ ┌──────┴────┐ ┌─────┴─────┐
│content_blks │ │  seo  │ │ versions  │ │ comments  │
└─────────────┘ └───────┘ └───────────┘ └───────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   courses   │────<│  sections   │────<│     lessons     │
└─────────────┘     └─────────────┘     └─────────────────┘
       │                                        │
       │            ┌─────────────┐             │
       └───────────<│ enrollments │             │
                    └─────────────┘             │
                           │            ┌───────┴───────┐
                           │            │lesson_progress│
                           └────────────┴───────────────┘
```

---

## SQL Schema

### 1. Enums and Custom Types

```sql
-- User status enum
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'DEACTIVATED');

-- Content status enum
CREATE TYPE content_status AS ENUM ('draft', 'pending_review', 'approved', 'published', 'archived', 'rejected');

-- Visibility enum
CREATE TYPE visibility_type AS ENUM ('public', 'private', 'restricted');

-- Task priority enum
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Task status enum
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- Lesson content type enum
CREATE TYPE lesson_content_type AS ENUM ('video', 'text', 'quiz', 'assignment');

-- Difficulty level enum
CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');

-- Comment status enum
CREATE TYPE comment_status AS ENUM ('pending', 'approved', 'rejected', 'spam');

-- Reaction type enum
CREATE TYPE reaction_type AS ENUM ('like', 'love', 'helpful', 'insightful');

-- Content block type enum
CREATE TYPE block_type AS ENUM ('paragraph', 'heading', 'code', 'image', 'quote', 'list', 'divider', 'callout', 'video', 'embed');
```

---

### 2. Users & Authentication

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    phone VARCHAR(20),
    job_title VARCHAR(100),
    department VARCHAR(100),
    bio TEXT,
    status user_status DEFAULT 'PENDING',
    email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created ON users(created_at);

-- NOTE: No user_sessions table - using stateless JWT authentication
-- Access tokens are validated by signature only, no server-side storage

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_token ON password_reset_tokens(token_hash);
```

---

### 3. Roles & Permissions (RBAC)

```sql
-- Permissions table
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    view_access BOOLEAN DEFAULT FALSE,
    create_access BOOLEAN DEFAULT FALSE,
    edit_access BOOLEAN DEFAULT FALSE,
    delete_access BOOLEAN DEFAULT FALSE,
    publish_access BOOLEAN DEFAULT FALSE,
    manage_access BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(module, name)
);

CREATE INDEX idx_permissions_module ON permissions(module);

-- Roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Role-Permission junction table
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- User-Role junction table
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
```

---

### 4. Groups

```sql
-- Groups table
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_groups_parent ON groups(parent_id);
CREATE INDEX idx_groups_name ON groups(name);

-- User-Group junction table
CREATE TABLE user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, group_id)
);

CREATE INDEX idx_user_groups_user ON user_groups(user_id);
CREATE INDEX idx_user_groups_group ON user_groups(group_id);

-- Group-Role junction table (roles assigned to groups)
CREATE TABLE group_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, role_id)
);

CREATE INDEX idx_group_roles_group ON group_roles(group_id);
CREATE INDEX idx_group_roles_role ON group_roles(role_id);
```

---

### 5. Categories

```sql
-- Categories table (hierarchical)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    meta_title VARCHAR(200),
    meta_description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_active ON categories(is_active);

-- Category-Group access control
CREATE TABLE category_group_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category_id, group_id)
);

CREATE INDEX idx_category_group_access ON category_group_access(category_id, group_id);
```

---

### 6. Tags

```sql
-- Tags table
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tags_slug ON tags(slug);
```

---

### 7. Articles

```sql
-- Articles table
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    excerpt TEXT,
    featured_image TEXT,
    status content_status DEFAULT 'draft',
    visibility visibility_type DEFAULT 'public',
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES users(id),
    published_at TIMESTAMP WITH TIME ZONE,
    scheduled_publish_at TIMESTAMP WITH TIME ZONE,
    view_count INTEGER DEFAULT 0,
    reading_time_minutes INTEGER,
    is_featured BOOLEAN DEFAULT FALSE,
    allow_comments BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_author ON articles(author_id);
CREATE INDEX idx_articles_category ON articles(category_id);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_featured ON articles(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_articles_status_published ON articles(status, published_at DESC) WHERE status = 'published';

-- Article content blocks (for rich content)
CREATE TABLE article_content_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    block_type block_type NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_article_blocks_article ON article_content_blocks(article_id);
CREATE INDEX idx_article_blocks_order ON article_content_blocks(article_id, sort_order);

-- Article SEO settings
CREATE TABLE article_seo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID UNIQUE NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    meta_title VARCHAR(200),
    meta_description TEXT,
    keywords TEXT[],
    canonical_url TEXT,
    og_title VARCHAR(200),
    og_description TEXT,
    og_image TEXT,
    twitter_card VARCHAR(20),
    no_index BOOLEAN DEFAULT FALSE,
    no_follow BOOLEAN DEFAULT FALSE,
    structured_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Article-Tag junction table
CREATE TABLE article_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(article_id, tag_id)
);

CREATE INDEX idx_article_tags_article ON article_tags(article_id);
CREATE INDEX idx_article_tags_tag ON article_tags(tag_id);

-- Article versions for history
CREATE TABLE article_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    content_snapshot JSONB NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    change_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_article_versions_article ON article_versions(article_id);
CREATE INDEX idx_article_versions_number ON article_versions(article_id, version_number DESC);
```

---

### 8. Courses & Learning

```sql
-- Courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(300) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    thumbnail_url TEXT,
    preview_video_url TEXT,
    status content_status DEFAULT 'draft',
    difficulty difficulty_level DEFAULT 'beginner',
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    instructor_id UUID REFERENCES users(id),
    estimated_duration_minutes INTEGER,
    is_featured BOOLEAN DEFAULT FALSE,
    is_free BOOLEAN DEFAULT TRUE,
    price DECIMAL(10, 2) DEFAULT 0,
    prerequisites JSONB DEFAULT '[]',
    learning_objectives JSONB DEFAULT '[]',
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_category ON courses(category_id);
CREATE INDEX idx_courses_instructor ON courses(instructor_id);
CREATE INDEX idx_courses_slug ON courses(slug);
CREATE INDEX idx_courses_featured ON courses(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_courses_status_published ON courses(status, published_at DESC) WHERE status = 'published';

-- Course sections
CREATE TABLE course_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_course_sections_course ON course_sections(course_id);
CREATE INDEX idx_course_sections_order ON course_sections(course_id, sort_order);

-- Lessons
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    content_type lesson_content_type NOT NULL,
    content JSONB,
    video_url TEXT,
    duration_minutes INTEGER,
    sort_order INTEGER NOT NULL,
    is_preview BOOLEAN DEFAULT FALSE,
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lessons_section ON lessons(section_id);
CREATE INDEX idx_lessons_order ON lessons(section_id, sort_order);

-- Course enrollments
CREATE TABLE course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    progress_percentage INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    certificate_issued BOOLEAN DEFAULT FALSE,
    certificate_url TEXT,
    UNIQUE(user_id, course_id)
);

CREATE INDEX idx_enrollments_user ON course_enrollments(user_id);
CREATE INDEX idx_enrollments_course ON course_enrollments(course_id);
CREATE INDEX idx_enrollments_completed ON course_enrollments(completed_at) WHERE completed_at IS NOT NULL;

-- Lesson progress tracking
CREATE TABLE lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_seconds INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
);

CREATE INDEX idx_lesson_progress_user ON lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_lesson ON lesson_progress(lesson_id);

-- Course-Tag junction table
CREATE TABLE course_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(course_id, tag_id)
);

CREATE INDEX idx_course_tags_course ON course_tags(course_id);
CREATE INDEX idx_course_tags_tag ON course_tags(tag_id);
```

---

### 9. Comments (Unified for Articles, Courses, Lessons)

```sql
-- Comments table (polymorphic)
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    -- Polymorphic relation
    commentable_type VARCHAR(20) NOT NULL CHECK (commentable_type IN ('article', 'course', 'lesson')),
    commentable_id UUID NOT NULL,
    status comment_status DEFAULT 'pending',
    is_pinned BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_commentable ON comments(commentable_type, commentable_id);
CREATE INDEX idx_comments_status ON comments(status);
CREATE INDEX idx_comments_pinned ON comments(is_pinned) WHERE is_pinned = TRUE;
```

---

### 10. Reactions & Engagement

```sql
-- Reactions table (polymorphic - for comments, articles, courses)
CREATE TABLE reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type reaction_type NOT NULL,
    -- Polymorphic relation
    reactable_type VARCHAR(20) NOT NULL CHECK (reactable_type IN ('article', 'course', 'lesson', 'comment')),
    reactable_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, reactable_type, reactable_id)
);

CREATE INDEX idx_reactions_user ON reactions(user_id);
CREATE INDEX idx_reactions_reactable ON reactions(reactable_type, reactable_id);
CREATE INDEX idx_reactions_type ON reactions(reaction_type);

-- Bookmarks table
CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bookmarkable_type VARCHAR(20) NOT NULL CHECK (bookmarkable_type IN ('article', 'course', 'lesson')),
    bookmarkable_id UUID NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, bookmarkable_type, bookmarkable_id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_bookmarkable ON bookmarks(bookmarkable_type, bookmarkable_id);

-- Shares tracking
CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    shareable_type VARCHAR(20) NOT NULL CHECK (shareable_type IN ('article', 'course')),
    shareable_id UUID NOT NULL,
    platform VARCHAR(30) NOT NULL CHECK (platform IN ('twitter', 'facebook', 'linkedin', 'email', 'copy_link', 'other')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shares_shareable ON shares(shareable_type, shareable_id);
CREATE INDEX idx_shares_platform ON shares(platform);

-- Content view history (for analytics and recommendations)
CREATE TABLE content_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('article', 'course', 'lesson')),
    content_id UUID NOT NULL,
    session_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_content_views_content ON content_views(content_type, content_id);
CREATE INDEX idx_content_views_user ON content_views(user_id);
CREATE INDEX idx_content_views_created ON content_views(created_at);
```

---

### 11. Workflow & Tasks

```sql
-- Workflow definitions
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('article', 'course')),
    steps JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_workflows_content_type ON workflows(content_type);
CREATE INDEX idx_workflows_active ON workflows(is_active);

-- Workflow instances (for tracking content through workflow)
CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    content_type VARCHAR(20) NOT NULL,
    content_id UUID NOT NULL,
    current_step VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    assigned_to UUID REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_workflow_instances_workflow ON workflow_instances(workflow_id);
CREATE INDEX idx_workflow_instances_content ON workflow_instances(content_type, content_id);
CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX idx_workflow_instances_assigned ON workflow_instances(assigned_to);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    task_type VARCHAR(30) NOT NULL CHECK (task_type IN ('review', 'edit', 'approve', 'publish', 'custom')),
    priority task_priority DEFAULT 'medium',
    status task_status DEFAULT 'pending',
    -- Related content (optional)
    content_type VARCHAR(20),
    content_id UUID,
    -- Assignment
    assigned_to UUID REFERENCES users(id),
    assigned_by UUID REFERENCES users(id),
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_assigned_by ON tasks(assigned_by);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_content ON tasks(content_type, content_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_user_status ON tasks(assigned_to, status) WHERE status != 'completed';

-- Task notes/comments
CREATE TABLE task_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_task_notes_task ON task_notes(task_id);
```

---

### 12. Notifications

```sql
-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Notification preferences
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    task_assigned BOOLEAN DEFAULT TRUE,
    task_completed BOOLEAN DEFAULT TRUE,
    content_approved BOOLEAN DEFAULT TRUE,
    content_rejected BOOLEAN DEFAULT TRUE,
    comment_reply BOOLEAN DEFAULT TRUE,
    new_enrollment BOOLEAN DEFAULT TRUE,
    system_updates BOOLEAN DEFAULT TRUE,
    marketing BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 13. Media & Attachments

```sql
-- Media library
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    alt_text VARCHAR(255),
    caption TEXT,
    folder VARCHAR(255),
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX idx_media_folder ON media(folder);
CREATE INDEX idx_media_mime_type ON media(mime_type);
CREATE INDEX idx_media_created ON media(created_at DESC);

-- Attachments (polymorphic)
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    attachable_type VARCHAR(30) NOT NULL,
    attachable_id UUID NOT NULL,
    purpose VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_attachments_media ON attachments(media_id);
CREATE INDEX idx_attachments_attachable ON attachments(attachable_type, attachable_id);
```

---

### 14. Audit & Analytics

```sql
-- Audit log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Search queries (for analytics)
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    results_count INTEGER,
    filters JSONB,
    clicked_result_id UUID,
    clicked_result_type VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_search_queries_created ON search_queries(created_at DESC);
CREATE INDEX idx_search_queries_user ON search_queries(user_id);

-- Daily analytics aggregation (for performance)
CREATE TABLE analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    content_type VARCHAR(20) NOT NULL,
    content_id UUID NOT NULL,
    views INTEGER DEFAULT 0,
    unique_views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    avg_time_seconds INTEGER DEFAULT 0,
    UNIQUE(date, content_type, content_id)
);

CREATE INDEX idx_analytics_daily_date ON analytics_daily(date DESC);
CREATE INDEX idx_analytics_daily_content ON analytics_daily(content_type, content_id);
```

---

### 15. Settings & Configuration

```sql
-- System settings
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    category VARCHAR(50),
    description TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_system_settings_category ON system_settings(category);

-- User settings/preferences
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'system',
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    sidebar_collapsed BOOLEAN DEFAULT FALSE,
    email_digest_frequency VARCHAR(20) DEFAULT 'daily',
    settings_json JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## Functions & Triggers

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_article_seo_updated_at BEFORE UPDATE ON article_seo
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_article_blocks_updated_at BEFORE UPDATE ON article_content_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_sections_updated_at BEFORE UPDATE ON course_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_progress_updated_at BEFORE UPDATE ON lesson_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_prefs_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate article reading time
CREATE OR REPLACE FUNCTION calculate_reading_time(p_article_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total_words INTEGER;
    reading_time INTEGER;
BEGIN
    SELECT COALESCE(SUM(
        CASE WHEN block_type IN ('paragraph', 'heading', 'quote', 'callout')
        THEN array_length(regexp_split_to_array(content, '\s+'), 1)
        ELSE 0 END
    ), 0) INTO total_words
    FROM article_content_blocks WHERE article_id = p_article_id;
    
    reading_time := GREATEST(1, CEIL(total_words / 200.0));
    RETURN reading_time;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update reading time
CREATE OR REPLACE FUNCTION update_article_reading_time()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE articles
    SET reading_time_minutes = calculate_reading_time(NEW.article_id)
    WHERE id = NEW.article_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reading_time
AFTER INSERT OR UPDATE OR DELETE ON article_content_blocks
FOR EACH ROW EXECUTE FUNCTION update_article_reading_time();

-- Function to update course progress
CREATE OR REPLACE FUNCTION update_course_progress()
RETURNS TRIGGER AS $$
DECLARE
    total_lessons INTEGER;
    completed_lessons INTEGER;
    course_id_var UUID;
    progress INTEGER;
BEGIN
    -- Get the course_id for this lesson
    SELECT cs.course_id INTO course_id_var
    FROM lessons l
    JOIN course_sections cs ON l.section_id = cs.id
    WHERE l.id = NEW.lesson_id;
    
    -- Count total and completed lessons
    SELECT COUNT(*) INTO total_lessons
    FROM lessons l
    JOIN course_sections cs ON l.section_id = cs.id
    WHERE cs.course_id = course_id_var;
    
    SELECT COUNT(*) INTO completed_lessons
    FROM lesson_progress lp
    JOIN lessons l ON lp.lesson_id = l.id
    JOIN course_sections cs ON l.section_id = cs.id
    WHERE cs.course_id = course_id_var
    AND lp.user_id = NEW.user_id
    AND lp.status = 'completed';
    
    IF total_lessons > 0 THEN
        progress := FLOOR((completed_lessons::FLOAT / total_lessons) * 100);
    ELSE
        progress := 0;
    END IF;
    
    UPDATE course_enrollments
    SET progress_percentage = progress,
        last_accessed_at = NOW(),
        completed_at = CASE WHEN progress = 100 THEN NOW() ELSE completed_at END
    WHERE user_id = NEW.user_id AND course_id = course_id_var;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enrollment_progress
AFTER INSERT OR UPDATE ON lesson_progress
FOR EACH ROW EXECUTE FUNCTION update_course_progress();

-- Security definer function for role checking (RLS-safe)
CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role_name VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
        AND r.name = p_role_name
    )
$$;

-- Function to check permission
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_module VARCHAR, p_action VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = p_user_id
        AND p.module = p_module
        AND (
            (p_action = 'view' AND p.view_access = TRUE) OR
            (p_action = 'create' AND p.create_access = TRUE) OR
            (p_action = 'edit' AND p.edit_access = TRUE) OR
            (p_action = 'delete' AND p.delete_access = TRUE) OR
            (p_action = 'publish' AND p.publish_access = TRUE) OR
            (p_action = 'manage' AND p.manage_access = TRUE)
        )
    )
$$;
```

---

## Views for Common Queries

```sql
-- User with roles view
CREATE VIEW user_with_roles AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.first_name || ' ' || u.last_name AS full_name,
    u.avatar_url,
    u.status,
    u.last_login,
    u.created_at,
    u.updated_at,
    COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS role_names,
    COALESCE(array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS group_names
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
LEFT JOIN user_groups ug ON u.id = ug.user_id
LEFT JOIN groups g ON ug.group_id = g.id
GROUP BY u.id;

-- Article summary view
CREATE VIEW article_summary AS
SELECT 
    a.id,
    a.title,
    a.slug,
    a.excerpt,
    a.featured_image,
    a.status,
    a.visibility,
    a.published_at,
    a.view_count,
    a.reading_time_minutes,
    a.is_featured,
    a.allow_comments,
    a.created_at,
    a.updated_at,
    a.author_id,
    u.first_name || ' ' || u.last_name AS author_name,
    u.avatar_url AS author_avatar,
    a.category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
    (SELECT COUNT(*) FROM comments WHERE commentable_type = 'article' AND commentable_id = a.id AND status = 'approved') AS comment_count,
    (SELECT COUNT(*) FROM reactions WHERE reactable_type = 'article' AND reactable_id = a.id) AS reaction_count
FROM articles a
JOIN users u ON a.author_id = u.id
LEFT JOIN categories c ON a.category_id = c.id
LEFT JOIN article_tags at ON a.id = at.article_id
LEFT JOIN tags t ON at.tag_id = t.id
GROUP BY a.id, u.first_name, u.last_name, u.avatar_url, c.name, c.slug;

-- Course summary view
CREATE VIEW course_summary AS
SELECT 
    c.id,
    c.title,
    c.slug,
    c.description,
    c.short_description,
    c.thumbnail_url,
    c.status,
    c.difficulty,
    c.estimated_duration_minutes,
    c.is_featured,
    c.is_free,
    c.price,
    c.published_at,
    c.created_at,
    c.updated_at,
    c.instructor_id,
    u.first_name || ' ' || u.last_name AS instructor_name,
    u.avatar_url AS instructor_avatar,
    c.category_id,
    cat.name AS category_name,
    cat.slug AS category_slug,
    COUNT(DISTINCT cs.id) AS section_count,
    COUNT(DISTINCT l.id) AS lesson_count,
    (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS enrollment_count,
    (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND completed_at IS NOT NULL) AS completion_count
FROM courses c
LEFT JOIN users u ON c.instructor_id = u.id
LEFT JOIN categories cat ON c.category_id = cat.id
LEFT JOIN course_sections cs ON c.id = cs.course_id
LEFT JOIN lessons l ON cs.id = l.section_id
GROUP BY c.id, u.first_name, u.last_name, u.avatar_url, cat.name, cat.slug;

-- Task dashboard view
CREATE VIEW task_dashboard AS
SELECT 
    t.id,
    t.title,
    t.description,
    t.task_type,
    t.priority,
    t.status,
    t.content_type,
    t.content_id,
    t.due_date,
    t.created_at,
    t.updated_at,
    t.completed_at,
    t.assigned_to,
    assigned_user.first_name || ' ' || assigned_user.last_name AS assigned_to_name,
    assigned_user.avatar_url AS assigned_to_avatar,
    t.assigned_by,
    assigner.first_name || ' ' || assigner.last_name AS assigned_by_name,
    (SELECT COUNT(*) FROM task_notes WHERE task_id = t.id) AS note_count,
    CASE 
        WHEN t.due_date IS NULL THEN 'no_due_date'
        WHEN t.due_date < NOW() AND t.status NOT IN ('completed', 'cancelled') THEN 'overdue'
        WHEN t.due_date < NOW() + INTERVAL '24 hours' THEN 'due_soon'
        ELSE 'on_track'
    END AS due_status
FROM tasks t
LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
LEFT JOIN users assigner ON t.assigned_by = assigner.id;
```

---

## Full-Text Search Indexes

```sql
-- Full-text search indexes for articles
CREATE INDEX idx_articles_fulltext ON articles 
USING gin(to_tsvector('english', title || ' ' || COALESCE(excerpt, '')));

-- Full-text search indexes for courses
CREATE INDEX idx_courses_fulltext ON courses 
USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Full-text search indexes for lessons
CREATE INDEX idx_lessons_fulltext ON lessons 
USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Full-text search for tags
CREATE INDEX idx_tags_fulltext ON tags 
USING gin(to_tsvector('english', name));
```

---

## Default Data Seeding

```sql
-- Insert default roles
INSERT INTO roles (name, description, is_system) VALUES
    ('Admin', 'Full system access with all permissions', TRUE),
    ('Editor', 'Can create and edit content', TRUE),
    ('Moderator', 'Can review and moderate content', TRUE),
    ('Viewer', 'Read-only access to published content', TRUE);

-- Insert default permissions
INSERT INTO permissions (module, name, description, view_access, create_access, edit_access, delete_access, publish_access, manage_access) VALUES
    ('users', 'User Management', 'Manage users and their accounts', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
    ('roles', 'Role Management', 'Manage roles and permissions', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
    ('articles', 'Article Management', 'Manage articles and content', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('courses', 'Course Management', 'Manage courses and lessons', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('categories', 'Category Management', 'Manage content categories', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
    ('comments', 'Comment Moderation', 'Moderate user comments', TRUE, FALSE, TRUE, TRUE, FALSE, TRUE),
    ('media', 'Media Library', 'Manage uploaded files', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
    ('analytics', 'Analytics Dashboard', 'View analytics and reports', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('settings', 'System Settings', 'Configure system settings', TRUE, FALSE, TRUE, FALSE, FALSE, TRUE),
    ('workflow', 'Workflow Management', 'Manage content workflows', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
    ('tasks', 'Task Management', 'Manage and assign tasks', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE);

-- Assign all permissions to Admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'Admin';

-- Assign content permissions to Editor role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'Editor' AND p.module IN ('articles', 'courses', 'media', 'categories', 'tasks');

-- Assign moderation permissions to Moderator role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'Moderator' AND p.module IN ('comments', 'articles', 'courses', 'tasks');

-- Assign view-only permissions to Viewer role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'Viewer' AND p.view_access = TRUE AND p.module IN ('articles', 'courses', 'categories');

-- Insert default system settings
INSERT INTO system_settings (key, value, category, description) VALUES
    ('site_name', '"CMS Platform"', 'general', 'The name of the site'),
    ('site_description', '"A modern content management system"', 'general', 'Site description for SEO'),
    ('default_language', '"en"', 'localization', 'Default language code'),
    ('supported_languages', '["en", "es", "fr", "de"]', 'localization', 'List of supported languages'),
    ('items_per_page', '20', 'pagination', 'Default items per page'),
    ('max_upload_size_mb', '50', 'media', 'Maximum file upload size in MB'),
    ('allowed_file_types', '["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "application/pdf"]', 'media', 'Allowed MIME types for uploads'),
    ('comment_moderation', 'true', 'comments', 'Require moderation for comments'),
    ('allow_guest_comments', 'false', 'comments', 'Allow non-authenticated users to comment'),
    ('email_from', '"noreply@example.com"', 'email', 'Default sender email address'),
    ('smtp_configured', 'false', 'email', 'Whether SMTP is configured');
```

---

## Table Summary

| Table | Description | Related UI Features |
|-------|-------------|---------------------|
| `users` | User accounts | User Management, Profile |
| `user_sessions` | Active sessions | Login/Logout, Security |
| `password_reset_tokens` | Password reset | Forgot Password |
| `roles` | Role definitions | Roles Page |
| `permissions` | Permission definitions | Permissions Tab |
| `role_permissions` | Role-permission mapping | Role Permission Assignment |
| `user_roles` | User-role mapping | User Roles |
| `groups` | User groups | Groups Tab |
| `user_groups` | User-group mapping | Group Members |
| `group_roles` | Group-role mapping | Group Roles |
| `categories` | Content categories | Content Management |
| `category_group_access` | Category permissions | Category Access Control |
| `tags` | Content tags | Article/Course Tags |
| `articles` | Articles | Article Management |
| `article_content_blocks` | Rich content | Article Editor |
| `article_seo` | SEO settings | SEO Panel |
| `article_tags` | Article-tag junction | Tags |
| `article_versions` | Version history | Version History |
| `courses` | Courses | Course Management |
| `course_sections` | Course sections | Course Editor |
| `lessons` | Lessons | Lesson Editor |
| `course_enrollments` | Enrollments | Course Enrollment |
| `lesson_progress` | Progress tracking | Learning Progress |
| `course_tags` | Course-tag junction | Tags |
| `comments` | Comments | Comments Section |
| `reactions` | Likes/reactions | Like/Reaction buttons |
| `bookmarks` | User bookmarks | Save/Bookmark |
| `shares` | Share tracking | Share buttons |
| `content_views` | View analytics | Analytics |
| `workflows` | Workflow definitions | Workflow Management |
| `workflow_instances` | Active workflows | Content Workflow |
| `tasks` | Tasks | My Tasks |
| `task_notes` | Task comments | Task Details |
| `notifications` | User notifications | Notification Bell |
| `notification_preferences` | Notification settings | User Settings |
| `media` | Media files | Media Library |
| `attachments` | File attachments | Attachments |
| `audit_logs` | Audit trail | Admin Audit |
| `search_queries` | Search analytics | Search Analytics |
| `analytics_daily` | Daily metrics | Analytics Dashboard |
| `system_settings` | System config | Settings Page |
| `user_settings` | User preferences | User Settings |

---

## Notes

1. **UUIDs**: All primary keys use UUID for better distribution and security
2. **Timestamps**: All tables include `created_at`, many include `updated_at`
3. **Enums**: Using PostgreSQL enums for type safety
4. **Polymorphic Relations**: Used for comments, reactions, bookmarks (content type + id pattern)
5. **Full-text Search**: PostgreSQL's built-in full-text search is configured
6. **JSONB**: Used for flexible metadata storage (content blocks, settings, prerequisites)
7. **RLS Support**: Security definer functions provided for role-based access control
8. **Indexes**: Comprehensive indexing for common query patterns
9. **Views**: Pre-built views for common dashboard queries
10. **Triggers**: Automatic timestamps and calculated fields

This schema supports the entire CMS functionality including user management, RBAC, content creation, courses, comments, engagement, workflows, and analytics in a single unified database.

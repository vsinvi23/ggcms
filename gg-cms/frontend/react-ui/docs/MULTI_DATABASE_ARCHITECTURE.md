# Multi-Database Architecture for CMS Solution

## Overview

This document outlines a multi-database architecture designed for high performance, scalability, and data isolation. The architecture separates concerns into three distinct database domains:

1. **Read Database (Public DB)** - Optimized for low-latency content delivery
2. **Write Database (Editorial DB)** - Content creation and editorial workflow
3. **Engagement Database (Social DB)** - Comments, likes, shares, and user interactions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT APPLICATIONS                             │
│                    (Web, Mobile, API Consumers)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │  READ SERVICE │ │ WRITE SERVICE │ │ENGAGE SERVICE │
            │   (Public)    │ │  (Editorial)  │ │   (Social)    │
            └───────────────┘ └───────────────┘ └───────────────┘
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │   READ DB     │ │   WRITE DB    │ │ ENGAGEMENT DB │
            │  (Replica)    │ │   (Primary)   │ │   (Isolated)  │
            └───────────────┘ └───────────────┘ └───────────────┘
                    ▲                 │
                    │    ┌────────────┘
                    │    │ PUBLISH EVENT
                    │    ▼
            ┌───────────────────────────┐
            │     SYNC SERVICE          │
            │  (Content Replication)    │
            └───────────────────────────┘
```

---

## Database 1: Read Database (Public DB)

### Purpose
- Serves all public-facing content requests
- Optimized for high-throughput, low-latency reads
- Contains only published, approved content
- Can be replicated across regions for global performance

### Access Pattern
- **Read Access**: All users (public, authenticated)
- **Write Access**: Sync Service only (automated)

### Tables

#### `published_articles`
```sql
CREATE TABLE published_articles (
    id UUID PRIMARY KEY,
    slug VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    excerpt TEXT,
    featured_image_url TEXT,
    
    -- Denormalized content for fast reads
    content_html TEXT NOT NULL,
    content_json JSONB,
    
    -- Denormalized metadata
    author_id UUID NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    author_avatar_url TEXT,
    
    -- Category (denormalized)
    category_id UUID,
    category_name VARCHAR(255),
    category_slug VARCHAR(255),
    
    -- SEO (embedded for single query)
    meta_title VARCHAR(160),
    meta_description VARCHAR(320),
    meta_keywords TEXT[],
    canonical_url TEXT,
    og_image_url TEXT,
    
    -- Timestamps
    published_at TIMESTAMPTZ NOT NULL,
    original_created_at TIMESTAMPTZ NOT NULL,
    last_modified_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Counters (updated periodically from Engagement DB)
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    
    -- Search optimization
    search_vector TSVECTOR,
    
    -- Versioning
    content_version INTEGER NOT NULL,
    source_article_id UUID NOT NULL -- Reference to Write DB
);

-- Indexes for fast reads
CREATE INDEX idx_published_articles_slug ON published_articles(slug);
CREATE INDEX idx_published_articles_published_at ON published_articles(published_at DESC);
CREATE INDEX idx_published_articles_category ON published_articles(category_id);
CREATE INDEX idx_published_articles_author ON published_articles(author_id);
CREATE INDEX idx_published_articles_search ON published_articles USING GIN(search_vector);
CREATE INDEX idx_published_articles_popular ON published_articles(view_count DESC, published_at DESC);
```

#### `published_courses`
```sql
CREATE TABLE published_courses (
    id UUID PRIMARY KEY,
    slug VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    
    -- Denormalized instructor info
    instructor_id UUID NOT NULL,
    instructor_name VARCHAR(255) NOT NULL,
    instructor_avatar_url TEXT,
    instructor_bio TEXT,
    
    -- Category
    category_id UUID,
    category_name VARCHAR(255),
    
    -- Course metadata
    difficulty_level VARCHAR(50),
    estimated_duration_minutes INTEGER,
    lesson_count INTEGER DEFAULT 0,
    
    -- Pricing
    is_free BOOLEAN DEFAULT true,
    price_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Timestamps
    published_at TIMESTAMPTZ NOT NULL,
    last_modified_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Engagement counters
    enrollment_count INTEGER DEFAULT 0,
    completion_count INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2),
    rating_count INTEGER DEFAULT 0,
    
    -- Structure (denormalized JSON for fast loading)
    curriculum_json JSONB NOT NULL,
    
    -- Versioning
    content_version INTEGER NOT NULL,
    source_course_id UUID NOT NULL
);

CREATE INDEX idx_published_courses_slug ON published_courses(slug);
CREATE INDEX idx_published_courses_category ON published_courses(category_id);
CREATE INDEX idx_published_courses_popular ON published_courses(enrollment_count DESC);
```

#### `published_lessons`
```sql
CREATE TABLE published_lessons (
    id UUID PRIMARY KEY,
    course_id UUID REFERENCES published_courses(id) ON DELETE CASCADE,
    section_id UUID,
    
    slug VARCHAR(500) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Content
    content_type VARCHAR(50) NOT NULL, -- 'video', 'text', 'quiz', 'interactive'
    content_html TEXT,
    content_json JSONB,
    video_url TEXT,
    video_duration_seconds INTEGER,
    
    -- Ordering
    section_order INTEGER NOT NULL,
    lesson_order INTEGER NOT NULL,
    
    -- Access control
    is_preview BOOLEAN DEFAULT false, -- Free preview lesson
    
    -- Timestamps
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Versioning
    content_version INTEGER NOT NULL,
    source_lesson_id UUID NOT NULL,
    
    UNIQUE(course_id, slug)
);

CREATE INDEX idx_published_lessons_course ON published_lessons(course_id, section_order, lesson_order);
```

#### `published_categories`
```sql
CREATE TABLE published_categories (
    id UUID PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    color VARCHAR(50),
    
    parent_id UUID REFERENCES published_categories(id),
    path LTREE, -- For hierarchical queries
    depth INTEGER DEFAULT 0,
    
    -- Counts
    article_count INTEGER DEFAULT 0,
    course_count INTEGER DEFAULT 0,
    
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_published_categories_path ON published_categories USING GIST(path);
CREATE INDEX idx_published_categories_parent ON published_categories(parent_id);
```

#### `published_media`
```sql
CREATE TABLE published_media (
    id UUID PRIMARY KEY,
    url TEXT NOT NULL,
    cdn_url TEXT, -- CDN-optimized URL
    
    file_type VARCHAR(50) NOT NULL,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    
    -- Image dimensions
    width INTEGER,
    height INTEGER,
    
    -- Variants for responsive images
    variants JSONB, -- {"thumbnail": "url", "medium": "url", "large": "url"}
    
    alt_text TEXT,
    caption TEXT,
    
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `public_user_profiles`
```sql
-- Minimal public profile data for display purposes
CREATE TABLE public_user_profiles (
    id UUID PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    
    -- Public stats
    article_count INTEGER DEFAULT 0,
    course_count INTEGER DEFAULT 0,
    follower_count INTEGER DEFAULT 0,
    
    is_verified BOOLEAN DEFAULT false,
    
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Database 2: Write Database (Editorial DB)

### Purpose
- Content creation, editing, and editorial workflow
- Role-based access control for content teams
- Maintains full version history
- Source of truth for all content

### Access Pattern
- **Read Access**: Authenticated users with editorial roles
- **Write Access**: Role-based (Authors, Editors, Admins)

### Tables

#### Authentication & Authorization

```sql
-- User roles enum
CREATE TYPE user_role AS ENUM (
    'super_admin',
    'admin', 
    'editor_chief',
    'editor',
    'author',
    'contributor',
    'reviewer'
);

-- Users table (synced from Auth provider)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Role assignments
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role user_role NOT NULL,
    
    -- Scope-based roles (optional)
    category_id UUID, -- Role applies to specific category
    
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(user_id, role, category_id)
);

-- Permission definitions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(100), -- 'article', 'course', 'user', 'system'
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role-Permission mapping
CREATE TABLE role_permissions (
    role user_role NOT NULL,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    
    PRIMARY KEY (role, permission_id)
);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = _user_id 
        AND role = _role
        AND (expires_at IS NULL OR expires_at > NOW())
    )
$$;

-- Check if user has permission
CREATE OR REPLACE FUNCTION has_permission(_user_id UUID, _permission_code VARCHAR)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role = rp.role
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = _user_id 
        AND p.code = _permission_code
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
$$;
```

#### Content Tables

```sql
-- Article status workflow
CREATE TYPE article_status AS ENUM (
    'draft',
    'pending_review',
    'in_review',
    'changes_requested',
    'approved',
    'scheduled',
    'published',
    'unpublished',
    'archived'
);

-- Articles (main content table)
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic info
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE,
    excerpt TEXT,
    featured_image_id UUID,
    
    -- Ownership
    author_id UUID REFERENCES users(id) NOT NULL,
    
    -- Classification
    category_id UUID,
    tags TEXT[],
    
    -- Workflow status
    status article_status DEFAULT 'draft',
    
    -- Assignment
    assigned_editor_id UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    
    -- Publishing
    published_at TIMESTAMPTZ,
    scheduled_publish_at TIMESTAMPTZ,
    unpublished_at TIMESTAMPTZ,
    
    -- Version tracking
    current_version INTEGER DEFAULT 1,
    
    -- Lock for concurrent editing
    locked_by UUID REFERENCES users(id),
    locked_at TIMESTAMPTZ
);

-- Article content blocks (structured content)
CREATE TABLE article_content_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    
    block_type VARCHAR(50) NOT NULL, -- 'paragraph', 'heading', 'image', 'code', 'quote', 'list'
    content JSONB NOT NULL,
    
    order_index INTEGER NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Article versions (full history)
CREATE TABLE article_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    
    -- Snapshot of content
    title VARCHAR(500) NOT NULL,
    excerpt TEXT,
    content_blocks JSONB NOT NULL,
    
    -- Version metadata
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    change_summary TEXT,
    
    -- Comparison
    diff_from_previous JSONB,
    
    UNIQUE(article_id, version_number)
);

-- Article SEO settings
CREATE TABLE article_seo (
    article_id UUID PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
    
    meta_title VARCHAR(160),
    meta_description VARCHAR(320),
    meta_keywords TEXT[],
    
    canonical_url TEXT,
    og_title VARCHAR(160),
    og_description VARCHAR(320),
    og_image_id UUID,
    
    no_index BOOLEAN DEFAULT false,
    no_follow BOOLEAN DEFAULT false,
    
    structured_data JSONB,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Editorial workflow tracking
CREATE TABLE article_workflow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    
    from_status article_status,
    to_status article_status NOT NULL,
    
    changed_by UUID REFERENCES users(id) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    
    comment TEXT,
    metadata JSONB
);
```

#### Course Content Tables

```sql
CREATE TYPE course_status AS ENUM (
    'draft',
    'pending_review',
    'in_review', 
    'approved',
    'published',
    'unpublished',
    'archived'
);

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE,
    description TEXT,
    thumbnail_id UUID,
    
    instructor_id UUID REFERENCES users(id) NOT NULL,
    
    category_id UUID,
    tags TEXT[],
    
    difficulty_level VARCHAR(50),
    estimated_duration_minutes INTEGER,
    
    is_free BOOLEAN DEFAULT true,
    price_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'USD',
    
    status course_status DEFAULT 'draft',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    
    current_version INTEGER DEFAULT 1
);

CREATE TABLE course_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    order_index INTEGER NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    section_id UUID REFERENCES course_sections(id) ON DELETE CASCADE,
    
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500),
    description TEXT,
    
    content_type VARCHAR(50) NOT NULL,
    content_blocks JSONB,
    video_id UUID,
    
    order_index INTEGER NOT NULL,
    is_preview BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(course_id, slug)
);
```

#### Categories & Media

```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    
    parent_id UUID REFERENCES categories(id),
    path LTREE,
    depth INTEGER DEFAULT 0,
    
    icon VARCHAR(100),
    color VARCHAR(50),
    
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    original_filename VARCHAR(500) NOT NULL,
    storage_path TEXT NOT NULL,
    url TEXT NOT NULL,
    
    file_type VARCHAR(50) NOT NULL,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER,
    
    alt_text TEXT,
    caption TEXT,
    
    uploaded_by UUID REFERENCES users(id) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Processing status
    processing_status VARCHAR(50) DEFAULT 'pending',
    variants JSONB,
    
    -- Organization
    folder_path TEXT,
    tags TEXT[]
);
```

#### Review & Tasks

```sql
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    content_type VARCHAR(50) NOT NULL, -- 'article', 'course', 'lesson'
    content_id UUID NOT NULL,
    
    reviewer_id UUID REFERENCES users(id) NOT NULL,
    
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'changes_requested'
    
    overall_comment TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    
    -- Inline comment location
    block_id UUID,
    selection_start INTEGER,
    selection_end INTEGER,
    
    comment TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE editorial_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    task_type VARCHAR(50), -- 'review', 'edit', 'publish', 'other'
    
    content_type VARCHAR(50),
    content_id UUID,
    
    assigned_to UUID REFERENCES users(id),
    assigned_by UUID REFERENCES users(id),
    
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'pending',
    
    due_date TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

#### Audit Logging

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID REFERENCES users(id),
    
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    
    old_values JSONB,
    new_values JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

---

## Database 3: Engagement Database (Social DB)

### Purpose
- Handles all user engagement data
- Isolated from content for independent scaling
- High-write throughput for likes, views, comments
- Can use specialized storage (time-series, graph DB)

### Access Pattern
- **Read Access**: All authenticated users (own data), Public (aggregated)
- **Write Access**: Authenticated users for their own engagement

### Tables

#### Comments & Replies

```sql
CREATE TYPE comment_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'spam',
    'deleted'
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What is being commented on
    content_type VARCHAR(50) NOT NULL, -- 'article', 'course', 'lesson'
    content_id UUID NOT NULL,
    
    -- Comment author
    user_id UUID NOT NULL,
    
    -- For replies (threaded comments)
    parent_id UUID REFERENCES comments(id),
    root_id UUID REFERENCES comments(id), -- Top-level comment in thread
    thread_depth INTEGER DEFAULT 0,
    
    -- Content
    body TEXT NOT NULL,
    body_html TEXT, -- Rendered HTML
    
    -- Moderation
    status comment_status DEFAULT 'approved',
    moderated_by UUID,
    moderated_at TIMESTAMPTZ,
    moderation_reason TEXT,
    
    -- Engagement counts (denormalized)
    like_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    
    -- Flags
    is_edited BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    is_author_reply BOOLEAN DEFAULT false, -- Content author replied
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Indexes for fast retrieval
CREATE INDEX idx_comments_content ON comments(content_type, content_id, created_at DESC);
CREATE INDEX idx_comments_user ON comments(user_id, created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_root ON comments(root_id) WHERE root_id IS NOT NULL;
CREATE INDEX idx_comments_status ON comments(status) WHERE status != 'approved';
```

#### Likes & Reactions

```sql
CREATE TYPE reaction_type AS ENUM (
    'like',
    'love',
    'insightful',
    'helpful',
    'celebrate'
);

CREATE TABLE reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What is being reacted to
    target_type VARCHAR(50) NOT NULL, -- 'article', 'course', 'comment'
    target_id UUID NOT NULL,
    
    user_id UUID NOT NULL,
    reaction reaction_type NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One reaction per user per target
    UNIQUE(target_type, target_id, user_id)
);

CREATE INDEX idx_reactions_target ON reactions(target_type, target_id);
CREATE INDEX idx_reactions_user ON reactions(user_id);
```

#### Shares & Bookmarks

```sql
CREATE TYPE share_platform AS ENUM (
    'internal',
    'twitter',
    'facebook',
    'linkedin',
    'email',
    'copy_link',
    'other'
);

CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    content_type VARCHAR(50) NOT NULL,
    content_id UUID NOT NULL,
    
    user_id UUID, -- NULL for anonymous shares
    
    platform share_platform NOT NULL,
    
    -- Tracking
    referrer_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shares_content ON shares(content_type, content_id);
CREATE INDEX idx_shares_user ON shares(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    content_type VARCHAR(50) NOT NULL,
    content_id UUID NOT NULL,
    
    user_id UUID NOT NULL,
    
    -- Organization
    collection_id UUID, -- User-created collections
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(content_type, content_id, user_id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id, created_at DESC);
CREATE INDEX idx_bookmarks_collection ON bookmarks(collection_id) WHERE collection_id IS NOT NULL;

CREATE TABLE bookmark_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### User Follows & Subscriptions

```sql
CREATE TABLE follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    follower_id UUID NOT NULL,
    
    -- What is being followed
    target_type VARCHAR(50) NOT NULL, -- 'user', 'category', 'tag'
    target_id UUID NOT NULL,
    
    -- Notification preferences
    notify_new_content BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(follower_id, target_type, target_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_target ON follows(target_type, target_id);
```

#### Content Views & Analytics

```sql
CREATE TABLE content_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    content_type VARCHAR(50) NOT NULL,
    content_id UUID NOT NULL,
    
    user_id UUID, -- NULL for anonymous
    session_id UUID,
    
    -- View details
    view_duration_seconds INTEGER,
    scroll_depth_percent INTEGER,
    
    -- Source tracking
    referrer_url TEXT,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    -- Device info
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    country_code VARCHAR(2),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioned by date for efficient querying
CREATE INDEX idx_content_views_content ON content_views(content_type, content_id, created_at DESC);
CREATE INDEX idx_content_views_user ON content_views(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_content_views_date ON content_views(created_at DESC);

-- Aggregated view counts (updated periodically)
CREATE TABLE content_view_stats (
    content_type VARCHAR(50) NOT NULL,
    content_id UUID NOT NULL,
    
    date DATE NOT NULL,
    
    view_count INTEGER DEFAULT 0,
    unique_viewer_count INTEGER DEFAULT 0,
    avg_duration_seconds INTEGER,
    avg_scroll_depth INTEGER,
    
    PRIMARY KEY (content_type, content_id, date)
);
```

#### Course Progress

```sql
CREATE TABLE course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    course_id UUID NOT NULL,
    user_id UUID NOT NULL,
    
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Progress
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    progress_percent INTEGER DEFAULT 0,
    
    -- Last activity
    last_lesson_id UUID,
    last_accessed_at TIMESTAMPTZ,
    
    -- Certificate
    certificate_issued_at TIMESTAMPTZ,
    certificate_id UUID,
    
    UNIQUE(course_id, user_id)
);

CREATE INDEX idx_enrollments_user ON course_enrollments(user_id);
CREATE INDEX idx_enrollments_course ON course_enrollments(course_id);

CREATE TABLE lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    enrollment_id UUID REFERENCES course_enrollments(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL,
    
    -- Progress
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Video progress
    video_position_seconds INTEGER DEFAULT 0,
    video_completed BOOLEAN DEFAULT false,
    
    -- Quiz/Assessment
    quiz_score INTEGER,
    quiz_attempts INTEGER DEFAULT 0,
    
    -- Time spent
    total_time_seconds INTEGER DEFAULT 0,
    
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(enrollment_id, lesson_id)
);
```

#### Course Reviews & Ratings

```sql
CREATE TABLE course_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    course_id UUID NOT NULL,
    user_id UUID NOT NULL,
    enrollment_id UUID,
    
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    body TEXT,
    
    -- Breakdown ratings
    content_quality_rating INTEGER,
    instructor_rating INTEGER,
    value_rating INTEGER,
    
    is_verified_purchase BOOLEAN DEFAULT false,
    
    -- Moderation
    status VARCHAR(50) DEFAULT 'pending',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(course_id, user_id)
);

CREATE INDEX idx_course_reviews_course ON course_reviews(course_id, created_at DESC);
```

#### Notifications

```sql
CREATE TYPE notification_type AS ENUM (
    'comment_reply',
    'comment_like',
    'new_follower',
    'content_published',
    'course_update',
    'mention',
    'system'
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL,
    
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    
    -- Related content
    reference_type VARCHAR(50),
    reference_id UUID,
    
    -- Actor (who triggered the notification)
    actor_id UUID,
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    
    -- Delivery
    email_sent BOOLEAN DEFAULT false,
    push_sent BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;
```

---

## Synchronization Service

### Content Publishing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WRITE DATABASE                                │
│                                                                      │
│  1. Author creates/edits article (status: draft)                    │
│  2. Author submits for review (status: pending_review)              │
│  3. Editor reviews (status: in_review → approved/changes_requested) │
│  4. Admin publishes (status: published)                             │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ PUBLISH EVENT TRIGGERED                                      │    │
│  │ - Article marked as 'published'                              │    │
│  │ - Event emitted to message queue                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SYNC SERVICE                                    │
│                                                                      │
│  1. Receives publish event                                          │
│  2. Fetches complete article data from Write DB                     │
│  3. Denormalizes content (author info, category, SEO)               │
│  4. Generates search vectors                                        │
│  5. Processes media (CDN URLs, variants)                            │
│  6. Writes to Read DB (upsert with version check)                   │
│  7. Invalidates CDN cache                                           │
│  8. Emits 'content_published' event                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        READ DATABASE                                 │
│                                                                      │
│  - Receives denormalized, optimized content                         │
│  - Ready for fast public queries                                    │
│  - CDN-ready URLs                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Engagement Counter Sync

```sql
-- Run periodically (every 5-15 minutes) to sync counters
-- from Engagement DB to Read DB

-- Sync article engagement counts
UPDATE read_db.published_articles pa
SET 
    view_count = COALESCE(vs.total_views, 0),
    like_count = COALESCE(r.like_count, 0),
    comment_count = COALESCE(c.comment_count, 0),
    share_count = COALESCE(s.share_count, 0)
FROM (
    SELECT content_id, SUM(view_count) as total_views
    FROM engagement_db.content_view_stats
    WHERE content_type = 'article'
    GROUP BY content_id
) vs
LEFT JOIN (
    SELECT target_id, COUNT(*) as like_count
    FROM engagement_db.reactions
    WHERE target_type = 'article'
    GROUP BY target_id
) r ON r.target_id = pa.source_article_id
LEFT JOIN (
    SELECT content_id, COUNT(*) as comment_count
    FROM engagement_db.comments
    WHERE content_type = 'article' AND status = 'approved'
    GROUP BY content_id
) c ON c.content_id = pa.source_article_id
LEFT JOIN (
    SELECT content_id, COUNT(*) as share_count
    FROM engagement_db.shares
    WHERE content_type = 'article'
    GROUP BY content_id
) s ON s.content_id = pa.source_article_id
WHERE pa.source_article_id = vs.content_id;
```

---

## API Service Architecture

### Service Definitions

```yaml
services:
  # PUBLIC READ API
  content-read-service:
    database: read_db
    access: public
    endpoints:
      - GET /articles
      - GET /articles/:slug
      - GET /courses
      - GET /courses/:slug
      - GET /courses/:slug/lessons
      - GET /categories
      - GET /search
    caching: aggressive (CDN + Redis)
    
  # EDITORIAL WRITE API
  content-write-service:
    database: write_db
    access: authenticated + role-based
    endpoints:
      # Articles
      - POST /articles
      - PUT /articles/:id
      - DELETE /articles/:id
      - POST /articles/:id/submit
      - POST /articles/:id/publish
      # Courses
      - POST /courses
      - PUT /courses/:id
      - POST /courses/:id/sections
      - POST /courses/:id/lessons
      # Media
      - POST /media/upload
      - DELETE /media/:id
    required_roles:
      write: [author, editor, admin]
      publish: [editor, admin]
      delete: [admin]
      
  # ENGAGEMENT API
  engagement-service:
    database: engagement_db
    access: mixed (read: public, write: authenticated)
    endpoints:
      # Comments
      - GET /content/:type/:id/comments
      - POST /content/:type/:id/comments
      - PUT /comments/:id
      - DELETE /comments/:id
      # Reactions
      - POST /content/:type/:id/reactions
      - DELETE /content/:type/:id/reactions
      # Bookmarks
      - GET /bookmarks
      - POST /bookmarks
      - DELETE /bookmarks/:id
      # Progress
      - GET /courses/:id/progress
      - POST /lessons/:id/progress
    rate_limiting: strict
    
  # SYNC SERVICE (Internal)
  sync-service:
    databases: [write_db, read_db, engagement_db]
    access: internal only
    triggers:
      - on: article.published
        action: sync_to_read_db
      - on: course.published
        action: sync_to_read_db
      - schedule: "*/15 * * * *"
        action: sync_engagement_counts
```

### Role-Based Access Matrix

| Role | Read DB | Write DB (Own) | Write DB (All) | Publish | Engagement DB |
|------|---------|----------------|----------------|---------|---------------|
| Public | ✅ Read | ❌ | ❌ | ❌ | ✅ Read (aggregated) |
| User | ✅ Read | ❌ | ❌ | ❌ | ✅ Read/Write (own) |
| Contributor | ✅ Read | ✅ Draft only | ❌ | ❌ | ✅ Read/Write (own) |
| Author | ✅ Read | ✅ Full | ❌ | ❌ | ✅ Read/Write (own) |
| Editor | ✅ Read | ✅ Full | ✅ Review/Edit | ✅ | ✅ Moderate |
| Admin | ✅ Read | ✅ Full | ✅ Full | ✅ | ✅ Full |

---

## Deployment Recommendations

### Option 1: Single Cloud Provider (Recommended for Start)

```
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE / AWS RDS                          │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  read_db    │  │  write_db   │  │ engage_db   │             │
│  │  (replica)  │  │  (primary)  │  │ (separate)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  All PostgreSQL databases in same cluster                       │
│  Logical separation via schemas or separate databases           │
└─────────────────────────────────────────────────────────────────┘
```

### Option 2: Multi-Database with Specialized Storage

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   PostgreSQL     │  │   PostgreSQL     │  │   PostgreSQL +   │
│   (Read DB)      │  │   (Write DB)     │  │   Redis/Timescale│
│                  │  │                  │  │   (Engage DB)    │
│  - Read replicas │  │  - Single master │  │                  │
│  - CDN caching   │  │  - Strict access │  │  - High write    │
│  - Global        │  │  - Audit logging │  │  - Time-series   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Option 3: Full Separation (Enterprise Scale)

```
Region 1 (US)                    Region 2 (EU)
┌─────────────────┐              ┌─────────────────┐
│ Read DB Replica │              │ Read DB Replica │
│ Engage DB       │              │ Engage DB       │
│ CDN Edge        │              │ CDN Edge        │
└─────────────────┘              └─────────────────┘
         │                                │
         └────────────┬───────────────────┘
                      │
              ┌───────────────┐
              │  Write DB     │
              │  (Primary)    │
              │  Single Region│
              └───────────────┘
```

---

## Data Migration Strategy

### Phase 1: Schema Setup
1. Create all three databases with schemas
2. Set up replication for Read DB
3. Configure connection pooling

### Phase 2: Initial Data Load
1. Migrate users and roles to Write DB
2. Migrate existing content to Write DB
3. Publish all live content to Read DB
4. Migrate engagement data to Engagement DB

### Phase 3: Application Cutover
1. Deploy new API services
2. Update application to use new endpoints
3. Enable sync service
4. Monitor and optimize

---

## Monitoring & Alerting

### Key Metrics per Database

**Read DB:**
- Query latency (p50, p95, p99)
- Cache hit ratio
- Replication lag

**Write DB:**
- Write throughput
- Lock contention
- Version conflicts
- Audit log volume

**Engagement DB:**
- Write throughput
- Comment moderation queue size
- View event processing lag

### Health Checks

```yaml
healthchecks:
  read_db:
    - query: "SELECT 1"
    - replication_lag: < 1s
    
  write_db:
    - query: "SELECT 1"
    - active_locks: < 10
    
  engagement_db:
    - query: "SELECT 1"
    - queue_depth: < 1000
    
  sync_service:
    - last_sync_success: < 5min
    - pending_publishes: < 10
```

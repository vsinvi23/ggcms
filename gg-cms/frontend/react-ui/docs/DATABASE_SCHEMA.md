# Database Schema Documentation

This document provides the complete database schema for the CMS solution. You can use this with any PostgreSQL-compatible database.

## Entity Relationship Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   users     │────<│ user_groups │>────│     groups      │
└─────────────┘     └─────────────┘     └─────────────────┘
       │                                        │
       │            ┌─────────────┐             │
       └───────────<│ user_roles  │>────────────┤
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
```

## SQL Schema

### 1. Users & Authentication

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
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'DEACTIVATED')),
    email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions for token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_info JSONB,
    ip_address INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Roles & Permissions

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
    UNIQUE(module, name)
);

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

### 3. Groups

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

### 4. Categories

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
```

### 5. Articles

```sql
-- Articles table
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    excerpt TEXT,
    featured_image TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'archived', 'rejected')),
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'restricted')),
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
CREATE INDEX idx_articles_published ON articles(published_at);
CREATE INDEX idx_articles_slug ON articles(slug);

-- Article content blocks (for rich content)
CREATE TABLE article_content_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    block_type VARCHAR(30) NOT NULL CHECK (block_type IN ('paragraph', 'heading', 'code', 'image', 'quote', 'list', 'divider', 'callout', 'video', 'embed')),
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Article tags
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE article_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
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
```

### 6. Courses & Learning

```sql
-- Courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(300) UNIQUE NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    instructor_id UUID REFERENCES users(id),
    estimated_duration_minutes INTEGER,
    is_featured BOOLEAN DEFAULT FALSE,
    price DECIMAL(10, 2) DEFAULT 0,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_category ON courses(category_id);
CREATE INDEX idx_courses_instructor ON courses(instructor_id);

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

-- Lessons
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'text', 'quiz', 'assignment')),
    content JSONB,
    video_url TEXT,
    duration_minutes INTEGER,
    sort_order INTEGER NOT NULL,
    is_preview BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lessons_section ON lessons(section_id);

-- Course enrollments
CREATE TABLE course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    progress_percentage INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, course_id)
);

CREATE INDEX idx_enrollments_user ON course_enrollments(user_id);
CREATE INDEX idx_enrollments_course ON course_enrollments(course_id);

-- Lesson progress tracking
CREATE TABLE lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_seconds INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
);

CREATE INDEX idx_lesson_progress_user ON lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_lesson ON lesson_progress(lesson_id);
```

### 7. Comments & Reviews

```sql
-- Comments table (polymorphic for articles and courses)
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    -- Polymorphic relation
    commentable_type VARCHAR(20) NOT NULL CHECK (commentable_type IN ('article', 'course', 'lesson')),
    commentable_id UUID NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'spam')),
    is_pinned BOOLEAN DEFAULT FALSE,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_commentable ON comments(commentable_type, commentable_id);

-- Comment likes
CREATE TABLE comment_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);
```

### 8. Workflow & Tasks

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

CREATE INDEX idx_workflow_instances_content ON workflow_instances(content_type, content_id);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    task_type VARCHAR(30) NOT NULL CHECK (task_type IN ('review', 'edit', 'approve', 'publish', 'custom')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    -- Related content
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
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_content ON tasks(content_type, content_id);

-- Task comments/notes
CREATE TABLE task_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_task_notes_task ON task_notes(task_id);
```

### 9. Notifications

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- Notification preferences
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    task_assigned BOOLEAN DEFAULT TRUE,
    content_approved BOOLEAN DEFAULT TRUE,
    content_rejected BOOLEAN DEFAULT TRUE,
    comment_reply BOOLEAN DEFAULT TRUE,
    system_updates BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 10. Media & Attachments

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
    uploaded_by UUID NOT NULL REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX idx_media_folder ON media(folder);
CREATE INDEX idx_media_mime_type ON media(mime_type);

-- Attachments (polymorphic)
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    attachable_type VARCHAR(30) NOT NULL,
    attachable_id UUID NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_attachments_attachable ON attachments(attachable_type, attachable_id);
```

### 11. Analytics & Audit

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
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Page views / Analytics
CREATE TABLE page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(20) NOT NULL,
    content_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,
    country_code VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_page_views_content ON page_views(content_type, content_id);
CREATE INDEX idx_page_views_created ON page_views(created_at);

-- Search queries (for analytics)
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    results_count INTEGER,
    clicked_result_id UUID,
    clicked_result_type VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_search_queries_created ON search_queries(created_at);
```

### 12. Settings & Configuration

```sql
-- System settings
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User settings
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'system',
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    settings_json JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

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
    ('workflow', 'Workflow Management', 'Manage content workflows', TRUE, TRUE, TRUE, TRUE, FALSE, TRUE);

-- Assign all permissions to Admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'Admin';

-- Assign content permissions to Editor role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'Editor' AND p.module IN ('articles', 'courses', 'media', 'categories');

-- Assign moderation permissions to Moderator role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'Moderator' AND p.module IN ('comments', 'articles', 'courses');
```

## Functions & Triggers

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate article reading time
CREATE OR REPLACE FUNCTION calculate_reading_time(article_id UUID)
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
    FROM article_content_blocks WHERE article_content_blocks.article_id = calculate_reading_time.article_id;
    
    reading_time := GREATEST(1, CEIL(total_words / 200.0));
    RETURN reading_time;
END;
$$ LANGUAGE plpgsql;

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
    
    progress := FLOOR((completed_lessons::FLOAT / total_lessons) * 100);
    
    UPDATE course_enrollments
    SET progress_percentage = progress,
        last_accessed_at = NOW(),
        completed_at = CASE WHEN progress = 100 THEN NOW() ELSE NULL END
    WHERE user_id = NEW.user_id AND course_id = course_id_var;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enrollment_progress
AFTER INSERT OR UPDATE ON lesson_progress
FOR EACH ROW EXECUTE FUNCTION update_course_progress();
```

## Views for Common Queries

```sql
-- User with roles view
CREATE VIEW user_with_roles AS
SELECT 
    u.*,
    array_agg(DISTINCT r.name) as role_names,
    array_agg(DISTINCT g.name) as group_names
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
LEFT JOIN user_groups ug ON u.id = ug.user_id
LEFT JOIN groups g ON ug.group_id = g.id
GROUP BY u.id;

-- Article summary view
CREATE VIEW article_summary AS
SELECT 
    a.*,
    u.first_name || ' ' || u.last_name as author_name,
    u.avatar_url as author_avatar,
    c.name as category_name,
    c.slug as category_slug,
    array_agg(DISTINCT t.name) as tags
FROM articles a
JOIN users u ON a.author_id = u.id
LEFT JOIN categories c ON a.category_id = c.id
LEFT JOIN article_tags at ON a.id = at.article_id
LEFT JOIN tags t ON at.tag_id = t.id
GROUP BY a.id, u.first_name, u.last_name, u.avatar_url, c.name, c.slug;

-- Course with progress view (for enrolled users)
CREATE VIEW course_with_enrollment AS
SELECT 
    c.*,
    u.first_name || ' ' || u.last_name as instructor_name,
    cat.name as category_name,
    COUNT(DISTINCT cs.id) as section_count,
    COUNT(DISTINCT l.id) as lesson_count
FROM courses c
LEFT JOIN users u ON c.instructor_id = u.id
LEFT JOIN categories cat ON c.category_id = cat.id
LEFT JOIN course_sections cs ON c.id = cs.course_id
LEFT JOIN lessons l ON cs.id = l.section_id
GROUP BY c.id, u.first_name, u.last_name, cat.name;
```

## Index Optimization

```sql
-- Full-text search indexes
CREATE INDEX idx_articles_fulltext ON articles USING gin(to_tsvector('english', title || ' ' || COALESCE(excerpt, '')));
CREATE INDEX idx_courses_fulltext ON courses USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Composite indexes for common queries
CREATE INDEX idx_articles_status_published ON articles(status, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_courses_status_published ON courses(status, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_tasks_user_status ON tasks(assigned_to, status) WHERE status != 'completed';
```

## Notes

1. **UUIDs**: All primary keys use UUID for better distribution and security
2. **Timestamps**: All tables include `created_at`, many include `updated_at`
3. **Soft deletes**: Consider adding `deleted_at` columns if soft deletes are needed
4. **JSONB**: Used for flexible metadata storage (content blocks, settings)
5. **Polymorphic relations**: Used for comments and attachments
6. **Full-text search**: PostgreSQL's built-in full-text search is configured
7. **Audit logging**: Comprehensive audit trail for compliance

This schema supports the entire CMS functionality including user management, RBAC, content creation, courses, comments, workflows, and analytics.

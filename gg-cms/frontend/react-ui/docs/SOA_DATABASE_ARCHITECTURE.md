# SOA Database Architecture Guide

This document provides service-oriented segregation of the database schema, table usage descriptions, and recommendations for microservices-based deployment.

## Service Domain Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY / BFF                                  │
└─────────────────────────────────────────────────────────────────────────────┘
          │           │           │           │           │           │
          ▼           ▼           ▼           ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │  Auth   │ │  User   │ │ Content │ │ Course  │ │Workflow │ │Analytics│
    │ Service │ │ Service │ │ Service │ │ Service │ │ Service │ │ Service │
    └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
         │           │           │           │           │           │
         ▼           ▼           ▼           ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ Auth DB │ │ User DB │ │Content  │ │Course DB│ │Workflow │ │Analytics│
    │         │ │         │ │   DB    │ │         │ │   DB    │ │   DB    │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## Service 1: Authentication Service (Auth DB)

**Purpose**: Handles user authentication, session management, and password operations.

**Base URL**: `/api/v1/auth`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `users` (partial) | Core identity - email, password_hash, status, email_verified | Login, signup, password validation |
| `user_sessions` | Active JWT/session tokens per device | Token validation, logout, session management |
| `password_reset_tokens` | Temporary tokens for password recovery | Generate reset link, validate token, expire used tokens |

### API Endpoints

```yaml
POST   /auth/login              # Authenticate user, return JWT
POST   /auth/signup             # Create new account
POST   /auth/logout             # Invalidate session token
POST   /auth/refresh            # Refresh expired JWT
POST   /auth/forgot-password    # Send reset email
POST   /auth/reset-password     # Reset with valid token
GET    /auth/verify-email/:token # Email verification
GET    /auth/me                 # Get current authenticated user
```

### Table Details

#### `users` (Auth subset)
```sql
-- Only auth-relevant columns replicated/owned by Auth Service
id, email, password_hash, status, email_verified, last_login, created_at
```
**Usage**: 
- Primary identity store for authentication
- Password hash stored using bcrypt/argon2
- `status` determines if user can authenticate (ACTIVE only)
- `email_verified` for email confirmation flow

#### `user_sessions`
```sql
id, user_id, token_hash, device_info, ip_address, expires_at, created_at
```
**Usage**:
- Track active sessions across devices
- Enable "logout from all devices" functionality
- Store hashed refresh tokens (never plain text)
- `device_info` stores user agent, device type for security alerts

#### `password_reset_tokens`
```sql
id, user_id, token_hash, expires_at, used_at, created_at
```
**Usage**:
- One-time use tokens (mark `used_at` after consumption)
- Short expiry (15-30 minutes recommended)
- Hash tokens before storage for security

---

## Service 2: User Management Service (User DB)

**Purpose**: Manages user profiles, roles, permissions, and groups.

**Base URL**: `/api/v1/users`, `/api/v1/roles`, `/api/v1/groups`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `users` (profile) | User profile data - name, avatar, bio, job info | CRUD user profiles |
| `roles` | Role definitions (Admin, Editor, etc.) | Define system/custom roles |
| `permissions` | Granular permission definitions by module | Define access capabilities |
| `role_permissions` | Maps which permissions each role has | Assign permissions to roles |
| `user_roles` | Maps users to their assigned roles | Assign roles to users |
| `groups` | User groups/teams (hierarchical) | Organize users into teams |
| `user_groups` | Maps users to groups | Add/remove group members |
| `group_roles` | Roles inherited by group membership | Bulk role assignment via groups |
| `notification_preferences` | User notification settings | Configure alert preferences |
| `user_settings` | User preferences (theme, language, etc.) | Store UI preferences |

### API Endpoints

```yaml
# User Management
GET    /users                   # List users (paginated, filterable)
GET    /users/:id               # Get user profile
POST   /users                   # Create user (admin)
PUT    /users/:id               # Update user profile
DELETE /users/:id               # Deactivate/delete user
GET    /users/:id/roles         # Get user's roles
PUT    /users/:id/roles         # Assign roles to user
GET    /users/:id/permissions   # Get effective permissions

# Role Management
GET    /roles                   # List all roles
GET    /roles/:id               # Get role with permissions
POST   /roles                   # Create custom role
PUT    /roles/:id               # Update role
DELETE /roles/:id               # Delete role (non-system only)
GET    /roles/:id/permissions   # Get role's permissions
PUT    /roles/:id/permissions   # Assign permissions to role
GET    /roles/:id/members       # List users with this role

# Permission Management
GET    /permissions             # List all permissions
GET    /permissions/modules     # List permission modules
POST   /permissions             # Create permission (rare)

# Group Management
GET    /groups                  # List all groups
GET    /groups/:id              # Get group details
POST   /groups                  # Create group
PUT    /groups/:id              # Update group
DELETE /groups/:id              # Delete group
GET    /groups/:id/members      # List group members
PUT    /groups/:id/members      # Add/remove members
GET    /groups/:id/roles        # Get group roles
PUT    /groups/:id/roles        # Assign roles to group

# User Settings
GET    /users/:id/settings      # Get user settings
PUT    /users/:id/settings      # Update settings
GET    /users/:id/notifications/preferences
PUT    /users/:id/notifications/preferences
```

### Table Details

#### `users` (Profile subset)
```sql
id, first_name, last_name, avatar_url, phone, job_title, department, bio, created_at, updated_at
```
**Usage**:
- Extended profile information beyond auth
- Sync `id` with Auth Service via events
- Public-facing profile data

#### `roles`
```sql
id, name, description, is_system, created_at, updated_at
```
**Usage**:
- `is_system = true` for built-in roles (Admin, Editor, Moderator, Viewer)
- System roles cannot be deleted
- Custom roles for organization-specific needs

#### `permissions`
```sql
id, module, name, description, view_access, create_access, edit_access, delete_access, publish_access, manage_access
```
**Usage**:
- Module-based permissions (articles, courses, users, etc.)
- Boolean flags for CRUD + publish + manage operations
- Enables fine-grained access control

#### `role_permissions`
```sql
id, role_id, permission_id, created_at
```
**Usage**:
- Many-to-many relationship
- Defines what each role can do
- Query to check authorization

#### `user_roles`
```sql
id, user_id, role_id, assigned_by, created_at
```
**Usage**:
- Users can have multiple roles
- `assigned_by` for audit trail
- Primary role assignment mechanism

#### `groups`
```sql
id, name, description, parent_id, created_by, created_at, updated_at
```
**Usage**:
- Hierarchical teams/departments
- `parent_id` enables nested groups
- Useful for org structure representation

#### `user_groups`
```sql
id, user_id, group_id, joined_at
```
**Usage**:
- Group membership tracking
- Users can belong to multiple groups

#### `group_roles`
```sql
id, group_id, role_id, created_at
```
**Usage**:
- Bulk role assignment via group membership
- User inherits roles from all their groups
- Simplifies permission management at scale

---

## Service 3: Content Management Service (Content DB)

**Purpose**: Manages articles, categories, tags, and content versioning.

**Base URL**: `/api/v1/articles`, `/api/v1/categories`, `/api/v1/tags`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `categories` | Hierarchical content taxonomy | Organize content, navigation |
| `category_group_access` | Category-level access control | Restrict category visibility |
| `articles` | Article metadata and status | CRUD articles |
| `article_content_blocks` | Rich content blocks (paragraph, code, etc.) | Build article body |
| `article_seo` | SEO metadata per article | Optimize for search engines |
| `tags` | Content tags/keywords | Cross-cutting content labels |
| `article_tags` | Article-tag relationships | Tag articles |
| `article_versions` | Version history for articles | Track changes, rollback |

### API Endpoints

```yaml
# Category Management
GET    /categories              # List categories (tree structure)
GET    /categories/:id          # Get category details
POST   /categories              # Create category
PUT    /categories/:id          # Update category
DELETE /categories/:id          # Delete category
PUT    /categories/:id/access   # Set group access rules

# Article Management
GET    /articles                # List articles (paginated, filterable)
GET    /articles/:id            # Get full article with blocks
GET    /articles/slug/:slug     # Get by slug (public)
POST   /articles                # Create article
PUT    /articles/:id            # Update article
DELETE /articles/:id            # Delete/archive article
PUT    /articles/:id/status     # Change article status
POST   /articles/:id/publish    # Publish article
POST   /articles/:id/schedule   # Schedule publication

# Content Blocks
GET    /articles/:id/blocks     # Get content blocks
PUT    /articles/:id/blocks     # Update all blocks
POST   /articles/:id/blocks     # Add block
PUT    /articles/:id/blocks/:blockId
DELETE /articles/:id/blocks/:blockId

# SEO
GET    /articles/:id/seo        # Get SEO settings
PUT    /articles/:id/seo        # Update SEO settings

# Tags
GET    /tags                    # List all tags
POST   /tags                    # Create tag
DELETE /tags/:id                # Delete tag
GET    /articles/:id/tags       # Get article tags
PUT    /articles/:id/tags       # Set article tags

# Versions
GET    /articles/:id/versions   # List version history
GET    /articles/:id/versions/:version # Get specific version
POST   /articles/:id/restore/:version  # Restore to version
```

### Table Details

#### `categories`
```sql
id, name, slug, description, icon, color, parent_id, sort_order, is_active, meta_title, meta_description, created_by, created_at, updated_at
```
**Usage**:
- Hierarchical content organization
- `slug` for URL-friendly paths
- `parent_id` for nested categories
- `sort_order` for display ordering
- SEO fields for category pages

#### `category_group_access`
```sql
id, category_id, group_id, can_view, can_edit, created_at
```
**Usage**:
- Restrict category access by user group
- `can_view` for read access
- `can_edit` for content creation within category

#### `articles`
```sql
id, title, slug, excerpt, featured_image, status, visibility, category_id, author_id, published_at, scheduled_publish_at, view_count, reading_time_minutes, is_featured, allow_comments, version, created_at, updated_at
```
**Usage**:
- Core article metadata
- `status`: draft → pending_review → approved → published → archived
- `visibility`: public, private, restricted
- `scheduled_publish_at` for future publishing
- `version` increments on each save

#### `article_content_blocks`
```sql
id, article_id, block_type, content, metadata, sort_order, created_at, updated_at
```
**Usage**:
- Flexible rich content storage
- `block_type`: paragraph, heading, code, image, quote, list, divider, callout, video, embed
- `metadata` (JSONB): block-specific data (language for code, level for heading, etc.)
- `sort_order` determines display sequence

**Block Type Metadata Examples**:
```json
// Code block
{"language": "javascript", "filename": "example.js", "lineNumbers": true}

// Heading block
{"level": 2}

// Image block
{"src": "url", "alt": "description", "caption": "text", "width": 800}

// List block
{"ordered": true, "items": ["item1", "item2"]}

// Callout block
{"type": "info", "icon": "lightbulb"}
```

#### `article_seo`
```sql
id, article_id, meta_title, meta_description, keywords, canonical_url, og_title, og_description, og_image, twitter_card, no_index, no_follow, created_at, updated_at
```
**Usage**:
- Search engine optimization metadata
- Open Graph tags for social sharing
- `no_index/no_follow` for search engine directives

#### `tags`
```sql
id, name, slug, created_at
```
**Usage**:
- Cross-cutting content labels
- Unlike categories, tags are flat (non-hierarchical)
- Used for filtering and related content

#### `article_tags`
```sql
id, article_id, tag_id
```
**Usage**:
- Many-to-many article-tag relationship
- Articles can have multiple tags

#### `article_versions`
```sql
id, article_id, version_number, title, content_snapshot, changed_by, change_summary, created_at
```
**Usage**:
- Complete snapshot of article state
- `content_snapshot` (JSONB): all blocks at that version
- Enable rollback to previous versions
- Track who made changes

---

## Service 4: Course/Learning Service (Course DB)

**Purpose**: Manages courses, sections, lessons, enrollments, and progress tracking.

**Base URL**: `/api/v1/courses`, `/api/v1/enrollments`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `courses` | Course metadata | CRUD courses |
| `course_sections` | Course chapters/modules | Organize lessons |
| `lessons` | Individual learning units | Store lesson content |
| `course_enrollments` | User course registrations | Track who's enrolled |
| `lesson_progress` | Per-lesson completion tracking | Track learning progress |

### API Endpoints

```yaml
# Course Management
GET    /courses                 # List courses (paginated)
GET    /courses/:id             # Get course with structure
GET    /courses/slug/:slug      # Get by slug (public)
POST   /courses                 # Create course
PUT    /courses/:id             # Update course
DELETE /courses/:id             # Archive course
PUT    /courses/:id/status      # Change status
POST   /courses/:id/publish     # Publish course

# Course Structure
GET    /courses/:id/sections    # Get all sections
POST   /courses/:id/sections    # Add section
PUT    /courses/:id/sections/:sectionId
DELETE /courses/:id/sections/:sectionId
PUT    /courses/:id/sections/reorder

# Lessons
GET    /sections/:id/lessons    # Get section lessons
POST   /sections/:id/lessons    # Add lesson
PUT    /lessons/:id             # Update lesson
DELETE /lessons/:id             # Delete lesson
GET    /lessons/:id             # Get lesson content

# Enrollments
GET    /enrollments             # List user's enrollments
POST   /courses/:id/enroll      # Enroll in course
DELETE /courses/:id/enroll      # Unenroll
GET    /courses/:id/enrollment  # Get enrollment status

# Progress
GET    /courses/:id/progress    # Get course progress
PUT    /lessons/:id/progress    # Update lesson progress
POST   /lessons/:id/complete    # Mark lesson complete
GET    /courses/:id/certificate # Generate completion certificate
```

### Table Details

#### `courses`
```sql
id, title, slug, description, thumbnail_url, status, difficulty_level, category_id, instructor_id, estimated_duration_minutes, is_featured, price, published_at, created_at, updated_at
```
**Usage**:
- Core course information
- `status`: draft, published, archived
- `difficulty_level`: beginner, intermediate, advanced
- `instructor_id` links to user (cross-service reference)

#### `course_sections`
```sql
id, course_id, title, description, sort_order, created_at, updated_at
```
**Usage**:
- Chapters or modules within a course
- `sort_order` for sequence
- Group related lessons together

#### `lessons`
```sql
id, section_id, title, description, content_type, content, video_url, duration_minutes, sort_order, is_preview, created_at, updated_at
```
**Usage**:
- Individual learning units
- `content_type`: video, text, quiz, assignment
- `content` (JSONB): structured lesson data
- `is_preview`: free preview without enrollment

**Lesson Content Examples**:
```json
// Video lesson
{"video_url": "...", "transcript": "...", "resources": [...]}

// Text lesson
{"blocks": [...], "reading_time": 5}

// Quiz lesson
{"questions": [{"question": "...", "options": [...], "correct": 1}]}

// Assignment
{"instructions": "...", "rubric": [...], "due_date": "..."}
```

#### `course_enrollments`
```sql
id, user_id, course_id, enrolled_at, completed_at, progress_percentage, last_accessed_at
```
**Usage**:
- Track enrolled students
- `progress_percentage`: 0-100 auto-calculated
- `completed_at`: set when progress = 100%

#### `lesson_progress`
```sql
id, user_id, lesson_id, status, progress_seconds, completed_at, created_at, updated_at
```
**Usage**:
- Per-lesson progress tracking
- `status`: not_started, in_progress, completed
- `progress_seconds`: video watch position
- Triggers update course progress on change

---

## Service 5: Collaboration Service (Workflow DB)

**Purpose**: Manages workflows, tasks, comments, and reviews.

**Base URL**: `/api/v1/workflows`, `/api/v1/tasks`, `/api/v1/comments`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `workflows` | Workflow definitions | Define approval processes |
| `workflow_instances` | Active workflow executions | Track content through workflow |
| `tasks` | Actionable work items | Assign and track tasks |
| `task_notes` | Task comments/updates | Collaborate on tasks |
| `comments` | Content comments | User discussions |
| `comment_likes` | Comment reactions | Social engagement |

### API Endpoints

```yaml
# Workflow Definitions
GET    /workflows               # List workflows
GET    /workflows/:id           # Get workflow details
POST   /workflows               # Create workflow
PUT    /workflows/:id           # Update workflow
DELETE /workflows/:id           # Delete workflow

# Workflow Instances
GET    /workflow-instances      # List active instances
GET    /workflow-instances/:id  # Get instance status
POST   /workflow-instances      # Start workflow for content
PUT    /workflow-instances/:id/advance  # Move to next step
PUT    /workflow-instances/:id/reject   # Reject/return

# Tasks
GET    /tasks                   # List tasks (filterable)
GET    /tasks/my                # Get current user's tasks
GET    /tasks/:id               # Get task details
POST   /tasks                   # Create task
PUT    /tasks/:id               # Update task
PUT    /tasks/:id/status        # Change task status
PUT    /tasks/:id/assign        # Assign to user
DELETE /tasks/:id               # Delete task
GET    /tasks/:id/notes         # Get task notes
POST   /tasks/:id/notes         # Add note to task

# Comments
GET    /comments                # List comments (by content)
GET    /comments/:id            # Get comment thread
POST   /comments                # Create comment
PUT    /comments/:id            # Edit comment
DELETE /comments/:id            # Delete comment
POST   /comments/:id/like       # Like comment
DELETE /comments/:id/like       # Unlike comment
PUT    /comments/:id/status     # Moderate comment
```

### Table Details

#### `workflows`
```sql
id, name, description, content_type, steps, is_active, created_at, updated_at
```
**Usage**:
- Define multi-step approval processes
- `content_type`: article, course
- `steps` (JSONB): array of step definitions

**Steps Example**:
```json
{
  "steps": [
    {"id": "draft", "name": "Draft", "next": ["review"]},
    {"id": "review", "name": "Editorial Review", "assignee_role": "Editor", "next": ["approved", "rejected"]},
    {"id": "approved", "name": "Approved", "next": ["published"]},
    {"id": "rejected", "name": "Rejected", "next": ["draft"]},
    {"id": "published", "name": "Published", "final": true}
  ]
}
```

#### `workflow_instances`
```sql
id, workflow_id, content_type, content_id, current_step, status, assigned_to, started_at, completed_at
```
**Usage**:
- Track content through workflow
- `current_step` matches step ID from workflow definition
- Auto-create tasks on step transitions

#### `tasks`
```sql
id, title, description, task_type, priority, status, content_type, content_id, assigned_to, assigned_by, due_date, completed_at, created_at, updated_at
```
**Usage**:
- Actionable work items
- `task_type`: review, edit, approve, publish, custom
- `priority`: low, medium, high, urgent
- `status`: pending, in_progress, completed, cancelled

#### `task_notes`
```sql
id, task_id, author_id, content, created_at
```
**Usage**:
- Discussion thread on tasks
- Track decisions and feedback
- Audit trail for task progress

#### `comments`
```sql
id, content, author_id, parent_id, commentable_type, commentable_id, status, is_pinned, likes_count, created_at, updated_at
```
**Usage**:
- Polymorphic comments on articles/courses/lessons
- `parent_id` for nested replies
- `status`: pending, approved, rejected, spam
- `is_pinned` for featured comments

#### `comment_likes`
```sql
id, comment_id, user_id, created_at
```
**Usage**:
- Track user engagement
- Prevent duplicate likes (unique constraint)
- Update `likes_count` via trigger

---

## Service 6: Media Service (Media DB)

**Purpose**: Manages file uploads, media library, and attachments.

**Base URL**: `/api/v1/media`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `media` | Uploaded files metadata | Store file info |
| `attachments` | Link media to content | Associate files with content |

### API Endpoints

```yaml
GET    /media                   # List media (paginated)
GET    /media/:id               # Get media details
POST   /media/upload            # Upload file
PUT    /media/:id               # Update metadata
DELETE /media/:id               # Delete file
GET    /media/folders           # List folders
POST   /media/folders           # Create folder
GET    /media/search            # Search media

# Attachments
GET    /attachments             # List by content
POST   /attachments             # Attach media to content
DELETE /attachments/:id         # Remove attachment
```

### Table Details

#### `media`
```sql
id, filename, original_filename, mime_type, file_size, url, thumbnail_url, alt_text, caption, folder, uploaded_by, metadata, created_at
```
**Usage**:
- Central media library
- `filename`: generated unique name
- `original_filename`: user's file name
- `thumbnail_url`: auto-generated for images
- `metadata` (JSONB): dimensions, duration, etc.
- `folder`: virtual folder organization

#### `attachments`
```sql
id, media_id, attachable_type, attachable_id, sort_order, created_at
```
**Usage**:
- Polymorphic media linking
- `attachable_type`: article, course, lesson, etc.
- Multiple attachments per content item

---

## Service 7: Notification Service (Notification DB)

**Purpose**: Manages user notifications and delivery.

**Base URL**: `/api/v1/notifications`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `notifications` | User notification records | Store and deliver notifications |

### API Endpoints

```yaml
GET    /notifications           # List user's notifications
GET    /notifications/unread    # Get unread count
PUT    /notifications/:id/read  # Mark as read
PUT    /notifications/read-all  # Mark all as read
DELETE /notifications/:id       # Delete notification
POST   /notifications           # Create notification (internal)
POST   /notifications/broadcast # Send to multiple users
```

### Table Details

#### `notifications`
```sql
id, user_id, type, title, message, data, is_read, read_at, created_at
```
**Usage**:
- User notification inbox
- `type`: task_assigned, content_approved, comment_reply, system, etc.
- `data` (JSONB): context-specific payload for deep linking
- Real-time delivery via WebSocket subscription

**Notification Data Examples**:
```json
// Task assigned
{"task_id": "...", "task_title": "Review article", "content_type": "article", "content_id": "..."}

// Comment reply
{"comment_id": "...", "article_id": "...", "article_title": "..."}

// Content published
{"content_type": "article", "content_id": "...", "content_title": "..."}
```

---

## Service 8: Analytics Service (Analytics DB)

**Purpose**: Tracks usage, page views, and generates reports.

**Base URL**: `/api/v1/analytics`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `audit_logs` | Security/compliance audit trail | Record all actions |
| `page_views` | Content view tracking | Track engagement |
| `search_queries` | Search analytics | Understand user intent |

### API Endpoints

```yaml
# Dashboards
GET    /analytics/dashboard     # Overview metrics
GET    /analytics/content       # Content performance
GET    /analytics/users         # User engagement
GET    /analytics/courses       # Learning metrics

# Detailed Reports
GET    /analytics/articles/:id  # Article analytics
GET    /analytics/courses/:id   # Course analytics
GET    /analytics/users/:id     # User activity

# Audit Logs (Admin)
GET    /analytics/audit-logs    # List audit entries
GET    /analytics/audit-logs/export

# Search Analytics
GET    /analytics/search/popular # Popular queries
GET    /analytics/search/zero-results # Failed searches
```

### Table Details

#### `audit_logs`
```sql
id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at
```
**Usage**:
- Compliance and security audit trail
- `action`: create, update, delete, login, etc.
- `old_values/new_values` (JSONB): change tracking
- Immutable records (never update/delete)

#### `page_views`
```sql
id, content_type, content_id, user_id, session_id, ip_address, user_agent, referrer, country_code, created_at
```
**Usage**:
- Track content engagement
- Anonymous tracking via `session_id` for non-logged users
- Geo-location from IP for demographics
- Aggregate for trending content

#### `search_queries`
```sql
id, query, user_id, results_count, clicked_result_id, clicked_result_type, created_at
```
**Usage**:
- Understand what users search for
- Identify content gaps (zero results)
- Track search-to-click conversion
- Improve search relevance

---

## Service 9: Settings Service (Settings DB)

**Purpose**: Manages system and user settings/configuration.

**Base URL**: `/api/v1/settings`

### Tables

| Table | Purpose | Key Operations |
|-------|---------|----------------|
| `system_settings` | Global application config | App-wide settings |
| `user_settings` | Per-user preferences | User customization |

### API Endpoints

```yaml
# System Settings (Admin)
GET    /settings/system         # Get all settings
GET    /settings/system/:key    # Get specific setting
PUT    /settings/system/:key    # Update setting
POST   /settings/system         # Create setting

# User Settings
GET    /settings/user           # Get current user settings
PUT    /settings/user           # Update user settings
```

### Table Details

#### `system_settings`
```sql
id, key, value, description, updated_by, created_at, updated_at
```
**Usage**:
- Application-wide configuration
- `value` (JSONB): flexible storage
- Examples: site_name, default_language, feature_flags

#### `user_settings`
```sql
id, user_id, theme, language, timezone, date_format, settings_json, created_at, updated_at
```
**Usage**:
- Per-user preferences
- `theme`: light, dark, system
- `settings_json`: extensible custom preferences

---

## Cross-Service Communication

### Event-Driven Architecture

Services communicate via events for loose coupling:

```
┌─────────────┐    Events    ┌─────────────┐
│  Service A  │──────────────│ Event Bus   │
└─────────────┘              │  (Kafka/    │
                             │  RabbitMQ)  │
┌─────────────┐              └──────┬──────┘
│  Service B  │◄─────────────────────┘
└─────────────┘
```

### Key Events

| Event | Producer | Consumers |
|-------|----------|-----------|
| `user.created` | Auth | User, Notification |
| `user.updated` | User | Content, Course |
| `user.deleted` | Auth | All services |
| `role.assigned` | User | Content, Course |
| `article.published` | Content | Notification, Analytics |
| `article.updated` | Content | Analytics |
| `course.enrolled` | Course | Notification, Analytics |
| `lesson.completed` | Course | Notification, Analytics |
| `task.assigned` | Workflow | Notification |
| `comment.created` | Collaboration | Notification |

### Synchronous Communication

For real-time data needs, services expose internal APIs:

```yaml
# User Service (for other services to validate users)
GET /internal/users/:id
GET /internal/users/:id/permissions

# Content Service (for workflow to get content)
GET /internal/articles/:id

# Course Service (for analytics)
GET /internal/courses/:id/stats
```

---

## Database Deployment Recommendations

### Option 1: Shared Database (Monolith/Small Scale)

All tables in one PostgreSQL database with schema separation:

```sql
CREATE SCHEMA auth;
CREATE SCHEMA users;
CREATE SCHEMA content;
CREATE SCHEMA courses;
CREATE SCHEMA workflow;
CREATE SCHEMA media;
CREATE SCHEMA notifications;
CREATE SCHEMA analytics;
CREATE SCHEMA settings;
```

**Pros**: Simple, transactions across schemas, lower cost
**Cons**: Single point of failure, scaling limitations

### Option 2: Database per Service (Full SOA)

Each service owns its database:

| Service | Database | Recommended Engine |
|---------|----------|-------------------|
| Auth | auth_db | PostgreSQL |
| User | user_db | PostgreSQL |
| Content | content_db | PostgreSQL |
| Course | course_db | PostgreSQL |
| Workflow | workflow_db | PostgreSQL |
| Media | media_db | PostgreSQL + S3 |
| Notification | notification_db | PostgreSQL + Redis |
| Analytics | analytics_db | ClickHouse/TimescaleDB |
| Settings | settings_db | PostgreSQL/Redis |

**Pros**: Independent scaling, fault isolation, technology flexibility
**Cons**: Complex transactions, data consistency challenges

### Option 3: Hybrid Approach (Recommended)

Group related services:

| Cluster | Services | Tables |
|---------|----------|--------|
| **Core DB** | Auth, User | users, sessions, roles, permissions, groups |
| **Content DB** | Content, Media | articles, categories, media, attachments |
| **Learning DB** | Course | courses, sections, lessons, enrollments |
| **Collaboration DB** | Workflow, Notification | tasks, comments, workflows, notifications |
| **Analytics DB** | Analytics | audit_logs, page_views, search_queries (time-series optimized) |

---

## Security Considerations

### Database-Level Security

```sql
-- Create service-specific database users
CREATE USER auth_service WITH PASSWORD '...';
CREATE USER content_service WITH PASSWORD '...';

-- Grant minimal required permissions
GRANT SELECT, INSERT, UPDATE ON auth.users TO auth_service;
GRANT SELECT ON auth.users TO content_service; -- Read-only for other services

-- Row-Level Security for multi-tenant
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON articles
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### API-Level Security

- All inter-service calls use service accounts with JWT
- Rate limiting per service
- Request signing for sensitive operations
- Encryption in transit (TLS) and at rest

---

## Data Migration Strategy

When splitting from monolith to microservices:

1. **Phase 1**: Create schemas, keep shared database
2. **Phase 2**: Route new writes to service-specific tables
3. **Phase 3**: Migrate historical data
4. **Phase 4**: Split into separate databases
5. **Phase 5**: Remove cross-schema foreign keys, use events

---

This architecture supports scaling from a single database to fully distributed microservices as your application grows.

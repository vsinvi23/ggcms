# Go CMS Backend — Architecture & Design Reference

> **Audience:** Developers joining the project. This document covers the full architectural picture from 10,000 ft down to individual component interactions.

---

## Table of Contents

1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [Clean Architecture Layers](#2-clean-architecture-layers)
3. [Request Lifecycle](#3-request-lifecycle)
4. [Database Architecture](#4-database-architecture)
5. [Authentication & Authorization Flow](#5-authentication--authorization-flow)
6. [Content (CMS) Workflow](#6-content-cms-workflow)
7. [API Surface Map](#7-api-surface-map)
8. [Engagement System](#8-engagement-system)
9. [Service Dependency Graph](#9-service-dependency-graph)
10. [Directory Reference](#10-directory-reference)
11. [Data Flow: Article Publication](#11-data-flow-article-publication)
12. [Startup Sequence](#12-startup-sequence)

---

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                    │
│                                                                             │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│   │  React / Vite    │    │  Mobile Apps     │    │  3rd-Party       │     │
│   │  Frontend        │    │  (Future)        │    │  Integrations    │     │
│   │  :5173           │    │                  │    │                  │     │
│   └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘     │
│            │                       │                        │               │
└────────────┼───────────────────────┼────────────────────────┼───────────────┘
             │  REST / GraphQL        │                        │
             ▼                       ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY TIER                                 │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Go CMS API Server (Gin)                          │   │
│   │                      :8080  /api                                    │   │
│   │                                                                     │   │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │   │
│   │   │  Middleware  │  │  REST Router │  │  GraphQL     │            │   │
│   │   │  - Logger    │  │  20 handlers │  │  Endpoint    │            │   │
│   │   │  - CORS      │  │  ~80 routes  │  │  /graphql    │            │   │
│   │   │  - Auth JWT  │  │              │  │              │            │   │
│   │   │  - Recovery  │  │              │  │              │            │   │
│   │   │  - Audit     │  │              │  │              │            │   │
│   │   └──────────────┘  └──────────────┘  └──────────────┘            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Static File Server                             │   │
│   │                  /uploads/* → ./uploads/                            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA TIER                                         │
│                                                                             │
│   ┌──────────────────────────────┐    ┌──────────────────────────────┐     │
│   │     PostgreSQL 16             │    │     MongoDB 7                 │     │
│   │    (Relational / Structured)  │    │   (Document / High-write)    │     │
│   │                               │    │                               │     │
│   │  Write DB  ←── GORM ORM ──►  │    │  Collections:                │     │
│   │  Read DB   (read/write split) │    │  - audit_logs                │     │
│   │                               │    │  - review_comments           │     │
│   │  Tables: users, articles,     │    │  - analytics_events          │     │
│   │  courses, sections, lessons,  │    │  - reactions                 │     │
│   │  enrollments, groups,         │    │  - notes                     │     │
│   │  categories, tags,            │    │  - favourites                │     │
│   │  notifications, tasks,        │    │  - highlights                │     │
│   │  workflow_events, ...         │    │  - workflow_events           │     │
│   └──────────────────────────────┘    └──────────────────────────────┘     │
│                                                                             │
│   ┌──────────────────────────────┐                                          │
│   │     Local File Storage        │                                          │
│   │     ./uploads/                │                                          │
│   │   (S3-ready for production)   │                                          │
│   └──────────────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────────────┘

External OAuth Providers:
  ┌─────────────────┐     ┌─────────────────┐
  │  Google OAuth2  │     │  GitHub OAuth2  │
  │  (User Sign-In) │     │  (User Sign-In) │
  └─────────────────┘     └─────────────────┘
```

---

## 2. Clean Architecture Layers

The codebase follows **Clean Architecture** (Hexagonal / Ports & Adapters). Dependencies flow inward — outer layers depend on inner layers, never the reverse.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   INTERFACE LAYER  (internal/interfaces/)                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  HTTP Handlers (20)  │  GraphQL Resolver  │  DTOs (request/response) │  │
│   │  Middleware (5)      │  Router             │                          │  │
│   └───────────────────────────────┬──────────────────────────────────────┘  │
│                                   │ calls                                   │
│   APPLICATION LAYER  (internal/application/)                                │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  AuthService      │  CMSService       │  UserService                 │  │
│   │  OAuthService     │  CategoryService  │  GroupService                │  │
│   │  SectionService   │  LessonService    │  EnrollmentService           │  │
│   │  TaskService      │  NotificationSvc  │  CommentService              │  │
│   │  AnalyticsService │  TagService       │  ReactionService             │  │
│   │  NoteService      │  FavouriteService │  HighlightService            │  │
│   │  ContentTypeSvc   │  LearningPathSvc  │  AuditService                │  │
│   └───────────────────────────────┬──────────────────────────────────────┘  │
│                                   │ calls (via interfaces)                  │
│   DOMAIN LAYER  (internal/domain/)                                          │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  Entities (20 pure structs)  │  Repository Interfaces               │  │
│   │  User, Article, Course,      │  IUserRepo, IArticleRepo,            │  │
│   │  Section, Lesson, Group,     │  ICourseRepo, IGroupRepo, ...        │  │
│   │  Enrollment, Task, ...       │  (Go interfaces only, no DB code)    │  │
│   └───────────────────────────────┬──────────────────────────────────────┘  │
│                                   │ implemented by                          │
│   INFRASTRUCTURE LAYER  (infrastructure/persistence/)                       │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  PostgreSQL Repos (13)        │  MongoDB Repos (8)                   │  │
│   │  UserRepo, ArticleRepo,       │  AuditLogRepo, CommentRepo,          │  │
│   │  CourseRepo, SectionRepo,     │  AnalyticsRepo, ReactionRepo,        │  │
│   │  LessonRepo, GroupRepo,       │  NoteRepo, FavouriteRepo,            │  │
│   │  EnrollmentRepo, TaskRepo,    │  HighlightRepo                       │  │
│   │  NotificationRepo,            │                                      │  │
│   │  WorkflowEventRepo, ...       │                                      │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   SHARED PACKAGES  (pkg/)                                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  config  │  database  │  jwt  │  logger  │  password  │  pagination  │  │
│   │  response │ slugify   │                                               │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Rule:** Domain entities and repository interfaces have **zero** external dependencies. PostgreSQL and MongoDB are implementation details — swap them without touching business logic.

---

## 3. Request Lifecycle

Every HTTP request passes through this pipeline:

```
Client Request
      │
      ▼
┌─────────────────────────────────────────────────────┐
│               Gin HTTP Router                        │
│              (internal/interfaces/http/router.go)    │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐  ← Applied to ALL routes
│  Global Middleware Chain                             │
│                                                     │
│  1. Logger()     → log method, path, latency        │
│  2. CORS()       → set CORS headers                 │
│  3. Recovery()   → catch panics → 500               │
│  4. AuditCtx()   → attach audit service to context  │
└──────────┬──────────────────────────────────────────┘
           │
           ├──── Public Route? ──────────────────────────────────────────────────►
           │                                                                      │
           │     Protected Route?                                                 │
           ▼                                                                      │
┌─────────────────────────────────────────────────────┐                          │
│  Auth Middleware                                    │                          │
│                                                     │                          │
│  1. Extract "Authorization: Bearer <token>"         │                          │
│  2. Validate JWT signature & expiry                 │                          │
│  3. Set context: userID, email, role                │                          │
│  4. 401 if missing/invalid                          │                          │
└──────────┬──────────────────────────────────────────┘                          │
           │                                                                      │
           ├──── Admin-Only Route?                                                │
           ▼                                                                      │
┌─────────────────────────────────────────────────────┐                          │
│  AdminOnly Middleware                               │                          │
│                                                     │                          │
│  1. Check role == "admin" from context              │                          │
│  2. 403 if not admin                                │                          │
└──────────┬──────────────────────────────────────────┘                          │
           │                                                                      │
           ▼◄────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  HTTP Handler                                       │
│  (internal/interfaces/http/handler/*.go)            │
│                                                     │
│  1. Bind & validate request DTO                     │
│  2. Extract userID/role from context                │
│  3. Call Application Service method                 │
│  4. Format response (pkg/response helpers)          │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Application Service                               │
│  (internal/application/*.go)                        │
│                                                     │
│  1. Business logic & validation                     │
│  2. Orchestrate one or more repositories            │
│  3. Emit audit log events                           │
│  4. Return domain entity or error                   │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Repository (Postgres or MongoDB)                   │
│  (infrastructure/persistence/*)                     │
│                                                     │
│  1. Execute SQL / MongoDB query                     │
│  2. Map DB result → domain entity                   │
│  3. Return entity or error                          │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
     Database (PostgreSQL / MongoDB)
           │
           ▼ (response travels back up the stack)
     JSON Response → Client
```

---

## 4. Database Architecture

### PostgreSQL — Relational Schema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        IDENTITY & ACCESS                                        │
│                                                                                 │
│  ┌──────────────────┐          ┌──────────────────┐                            │
│  │      users       │          │      groups      │                            │
│  │──────────────────│          │──────────────────│                            │
│  │ id (PK)          │◄────────►│ id (PK)          │  many-to-many              │
│  │ email (unique)   │  user_   │ name (unique)    │  via user_groups           │
│  │ password_hash    │  groups  │ role             │  junction table            │
│  │ name             │  (join)  │ permissions (J)  │                            │
│  │ mobile_no        │          │                  │  J = JSONB                 │
│  │ status           │          └──────────────────┘                            │
│  │ google_id        │                                                           │
│  │ github_id        │                                                           │
│  │ last_login       │                                                           │
│  └──────────────────┘                                                           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TAXONOMY                                              │
│                                                                                 │
│  ┌───────────────────────────────┐     ┌──────────────────┐                    │
│  │          categories           │     │       tags        │                    │
│  │───────────────────────────────│     │──────────────────│                    │
│  │ id (PK)                       │◄───►│ id (PK)          │  many-to-many      │
│  │ name                          │  cat│ name (unique,    │  via category_tags │
│  │ slug (unique)                 │ _tag│   lowercase)     │                    │
│  │ parent_id (self-ref FK) ──┐   │  s  │                  │                    │
│  └───────────────────────────┘   │     └──────────────────┘                    │
│                 ▲                │                                              │
│                 └────────────────┘  (hierarchical categories)                  │
│                                                                                 │
│  ┌──────────────────────────────┐                                               │
│  │        content_types         │  (configurable content type labels)           │
│  │──────────────────────────────│                                               │
│  │ id, kind, value, label,      │                                               │
│  │ description, sort_order      │                                               │
│  └──────────────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CMS CONTENT                                           │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────┐                  │
│  │                        articles                          │                  │
│  │──────────────────────────────────────────────────────────│                  │
│  │ id, public_id (UUID), slug, title, description           │                  │
│  │ body (JSONB blocks), article_type, status                │                  │
│  │ category_id (FK) ─────────────────────► categories       │                  │
│  │ created_by_id (FK) ────────────────────► users           │                  │
│  │ reviewer_id (FK) ──────────────────────► users           │                  │
│  │ reviewer_comment, thumbnail_url                          │                  │
│  │ published_at, version                                    │                  │
│  │ has_pending_draft (bool)                                 │                  │
│  │ published_version, published_title,                      │  ← Snapshot      │
│  │ published_description, published_body                    │    fields        │
│  └──────────────────────────────────────────────────────────┘                  │
│                   │ has many                                                    │
│                   ▼                                                             │
│  ┌───────────────────────┐                                                      │
│  │      attachments      │  (shared by articles and courses)                   │
│  │───────────────────────│                                                      │
│  │ id, article_id,       │                                                      │
│  │ course_id, name, url, │                                                      │
│  │ mime_type, size       │                                                      │
│  └───────────────────────┘                                                      │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────┐                  │
│  │                        courses                           │                  │
│  │──────────────────────────────────────────────────────────│                  │
│  │ id, public_id (UUID), slug, title, description           │                  │
│  │ body (JSONB), course_type (STANDARD|BYTE|LEARNING_PLAN   │                  │
│  │              |CAPSULE), status                           │                  │
│  │ category_id, created_by_id, reviewer_id                  │                  │
│  │ reviewer_comment, thumbnail_url, published_at, version   │                  │
│  │ has_pending_draft, published_version, published_title,   │                  │
│  │ published_description, published_body                    │                  │
│  └──────────────────────────────────────────────────────────┘                  │
│                   │ has many                                                    │
│                   ▼                                                             │
│  ┌─────────────────────────────────────┐                                        │
│  │             sections                │  (course curriculum structure)         │
│  │─────────────────────────────────────│                                        │
│  │ id, title, description, order       │                                        │
│  │ course_id (FK) → courses            │                                        │
│  │ parent_section_id (self-ref FK) ─┐  │                                        │
│  └────────────────────────────┬─────┘  │                                        │
│                   ▲           │        │                                        │
│                   └───────────┘   has many                                     │
│                                        ▼                                       │
│  ┌─────────────────────────────────────┐                                        │
│  │              lessons                │                                        │
│  │─────────────────────────────────────│                                        │
│  │ id, title, type (video|text|quiz    │                                        │
│  │   |assignment), content, duration   │                                        │
│  │ order, published, section_id (FK)   │                                        │
│  └─────────────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                     LEARNING & PROGRESS                                         │
│                                                                                 │
│  ┌─────────────────────────────────────┐                                        │
│  │           enrollments               │                                        │
│  │─────────────────────────────────────│                                        │
│  │ id, user_id (FK), course_id (FK)    │  (unique pair)                        │
│  │ status (active|completed|dropped)   │                                        │
│  │ progress (0-100), enrolled_at       │                                        │
│  │ last_accessed_at, completed_at      │                                        │
│  │ completed_lessons (M2M FK lessons)  │                                        │
│  └─────────────────────────────────────┘                                        │
│                                                                                 │
│  ┌─────────────────────────────────────┐    ┌──────────────────────────────┐   │
│  │           learning_paths            │    │   learning_path_courses      │   │
│  │─────────────────────────────────────│    │──────────────────────────────│   │
│  │ id, kind, title, description        │───►│ learning_path_id, course_id  │   │
│  │ created_by_id (FK)                  │    │ sort_order                   │   │
│  └─────────────────────────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                     PERSONAL TOOLS & NOTIFICATIONS                              │
│                                                                                 │
│  ┌─────────────────────────────────────┐    ┌──────────────────────────────┐   │
│  │              tasks                  │    │       notifications          │   │
│  │─────────────────────────────────────│    │──────────────────────────────│   │
│  │ id, type (article|course)           │    │ id, user_id, title, message  │   │
│  │ title, status, ownership_type       │    │ read (bool), link            │   │
│  │ (owned|reviewing|contributed)       │    │                              │   │
│  │ user_id (FK), content_id            │    │                              │   │
│  └─────────────────────────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                          AUDIT TRAIL (PostgreSQL)                               │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        workflow_events                                   │   │
│  │──────────────────────────────────────────────────────────────────────────│   │
│  │ id, entity_type (ARTICLE|COURSE), entity_id                              │   │
│  │ user_id (FK) → users, from_status, to_status                             │   │
│  │ action (SUBMIT|APPROVE|REJECT|PUBLISH|SEND_BACK|EDIT)                    │   │
│  │ comment, version, title_snapshot, created_at                             │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### MongoDB — Document Collections

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          MONGODB COLLECTIONS                                    │
│                   (high-write, schema-flexible data)                            │
│                                                                                 │
│  audit_logs                     review_comments                                 │
│  ─────────────────────          ─────────────────────────────                   │
│  _id                            _id                                             │
│  action ("user.created")        content (text)                                  │
│  actor_id, actor_email          content_type (article|course|lesson)            │
│  target_type, target_id         content_id (string)                             │
│  target_name                    author_id, author_name, author_email            │
│  meta (flexible map)            parent_id (for threaded replies)                │
│  ip, created_at                 replies [ {same shape} ]                        │
│                                 created_at, updated_at                          │
│                                                                                 │
│  analytics_events               reactions                                       │
│  ─────────────────────          ─────────────────────────────                   │
│  _id                            _id                                             │
│  event_type                     user_id, content_type, content_id              │
│  (page_view|article_read|       value (like|dislike)                            │
│   course_enrolled|              Unique: (user_id, content_type, content_id)     │
│   lesson_completed)             created_at, updated_at                          │
│  user_id, content_id                                                            │
│  content_type                   notes                                           │
│  metadata (flexible map)        ─────────────────────────────                   │
│  ip_address, user_agent         _id                                             │
│  created_at                     user_id, content_type, content_id              │
│                                 body (free text)                                │
│  favourites                     Unique: (user_id, content_type, content_id)     │
│  ─────────────────────          created_at, updated_at                          │
│  _id                                                                            │
│  user_id, content_type          highlights                                      │
│  content_id (uint)              ─────────────────────────────                   │
│  Unique: (user, type, id)       _id                                             │
│  created_at                     user_id, content_type, content_id              │
│                                 content_title, content_slug                     │
│                                 text (highlighted text)                         │
│                                 start_offset, end_offset                        │
│                                 color (yellow|green|blue)                       │
│                                 note (optional annotation)                      │
│                                 created_at, updated_at                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Why two databases?**
| Concern | PostgreSQL | MongoDB |
|---|---|---|
| Users, Groups, Roles | ✓ ACID needed | |
| Articles, Courses, Versioning | ✓ FK integrity | |
| Enrollments, Progress | ✓ Transactional | |
| Notifications, Tasks | ✓ | |
| Audit Logs | | ✓ High-volume append |
| Review Comments + Replies | | ✓ Nested doc model |
| Analytics Events | | ✓ Schemaless metadata |
| Reactions / Notes / Highlights | | ✓ User-generated, flexible |

---

## 5. Authentication & Authorization Flow

### Login Flow (Email/Password)

```
Client                     Auth Handler               AuthService          UserRepo (PG)
  │                              │                         │                    │
  │  POST /auth/local            │                         │                    │
  │  {email, password}           │                         │                    │
  │─────────────────────────────►│                         │                    │
  │                              │  Login(email, pass)     │                    │
  │                              │────────────────────────►│                    │
  │                              │                         │  FindByEmail()     │
  │                              │                         │───────────────────►│
  │                              │                         │◄───────────────────│
  │                              │                         │  bcrypt.Compare()  │
  │                              │                         │  (constant time)   │
  │                              │                         │                    │
  │                              │                         │  jwt.Generate(     │
  │                              │                         │    userID, email,  │
  │                              │                         │    role)           │
  │                              │◄────────────────────────│                    │
  │◄─────────────────────────────│                         │                    │
  │  {token, user}               │                         │                    │
```

### OAuth2 Flow (Google / GitHub)

```
Client            API Server              OAuth Provider           OAuthService
  │                   │                        │                        │
  │ GET /auth/google  │                        │                        │
  │──────────────────►│ Build auth URL +       │                        │
  │                   │ HMAC state token       │                        │
  │◄──────────────────│ 302 Redirect           │                        │
  │                   │────────────────────────►                        │
  │ (user consents)   │                        │                        │
  │                   │◄────────────────────── │ code + state           │
  │ GET /auth/google/ │                        │                        │
  │ callback?code=... │                        │                        │
  │──────────────────►│ Verify HMAC state      │                        │
  │                   │ Exchange code for      │                        │
  │                   │ access_token           │                        │
  │                   │────────────────────────►                        │
  │                   │◄────────────────────── │ access_token           │
  │                   │ Fetch user profile     │                        │
  │                   │────────────────────────►                        │
  │                   │◄────────────────────── │ {id, email, name}      │
  │                   │                        │  FindOrCreate(profile) │
  │                   │────────────────────────────────────────────────►│
  │                   │◄────────────────────────────────────────────────│
  │                   │ Issue JWT              │                        │
  │◄──────────────────│ 302 → frontend?token=  │                        │
```

### JWT Validation (every protected request)

```
Request: Authorization: Bearer eyJ...

Auth Middleware:
  1. Split "Bearer " prefix
  2. jwt.Parse(token, secretKey, HS256)
  3. Validate: signature ✓, exp > now ✓, iss match ✓
  4. gin.Context.Set("userID", claims.UserID)
  5. gin.Context.Set("email", claims.Email)
  6. gin.Context.Set("role", claims.Role)   ← "admin" or "user"
```

### Authorization Model

```
┌──────────────────────────────────────────────────────────────┐
│                     Permission Matrix                         │
│                                                              │
│  Group Role → Preset Permissions (stored as JSONB)          │
│                                                              │
│  admin     → all: view+create+edit+delete+review+approve+    │
│                   publish on all resources                   │
│                                                              │
│  moderator → view+create+edit+review on content             │
│              NO delete, NO approve/publish                   │
│                                                              │
│  editor    → view+create+edit on content                    │
│              NO review, NO approve, NO publish              │
│                                                              │
│  viewer    → view only on all resources                     │
│                                                              │
│  Resources: articles, courses, users, groups,               │
│             categories, analytics, settings                  │
└──────────────────────────────────────────────────────────────┘

Role propagation:
  User ──── belongs to ────► Group ("Admin" group)
                                    │
                                    └─► role="admin" → AdminOnly routes unlocked
                                        (all other groups → role="user")
```

---

## 6. Content (CMS) Workflow

### Article / Course Lifecycle

```
                    ┌──────────────────────────────────────────────────────┐
                    │                 STATUS STATE MACHINE                 │
                    └──────────────────────────────────────────────────────┘

   Create                Submit            Approve           Publish
     │                     │                  │                  │
     ▼                     ▼                  ▼                  ▼
 ┌───────┐  submit    ┌──────────┐ approve ┌──────────┐ publish ┌───────────┐
 │ DRAFT │───────────►│  REVIEW  │────────►│ APPROVED │────────►│ PUBLISHED │
 └───────┘            └──────────┘         └──────────┘         └───────────┘
     ▲                  │      │                                      │
     │                  │      │ reject                               │ edit
     │    send_back     │      ▼                                      │
     │◄─────────────────┘  ┌──────────┐                              ▼
     │                     │ REJECTED │              ┌──────────────────────────┐
     │◄────────────────────┘          │              │  PUBLISHED + has_pending │
     │   (reviewer_comment attached)  │              │  _draft = true           │
     │                                │              │                          │
     │                                │              │  Content remains live    │
     │                                │              │  while new version is    │
     └────────────────────────────────┘              │  in DRAFT/REVIEW cycle   │
                                                     └──────────────────────────┘
```

### Workflow Actions per Actor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Action          │ Allowed By      │ From Status     │ To Status            │
│─────────────────────────────────────────────────────────────────────────────│
│  Create          │ Any authed user │ —               │ DRAFT                │
│  Edit            │ Author          │ DRAFT/REJECTED  │ DRAFT (version++)    │
│  Submit          │ Author          │ DRAFT           │ REVIEW               │
│  Approve         │ Admin/Moderator │ REVIEW          │ APPROVED             │
│  Reject          │ Admin/Moderator │ REVIEW          │ REJECTED +comment    │
│  Send Back       │ Admin/Moderator │ REVIEW          │ DRAFT +comment       │
│  Publish         │ Admin           │ APPROVED        │ PUBLISHED            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Content Versioning (Snapshot Pattern)

```
Article Row (example during revision of published content):

  id: 42
  title: "New Draft Title"          ← current working copy
  body: { ...updated blocks... }    ← current working copy
  status: REVIEW
  version: 3                        ← increments on each edit
  has_pending_draft: true           ← signals a draft is in flight

  published_version: 2              ┐
  published_title: "Live Title"     │ ← Snapshot of last published state
  published_body: { ...v2... }      │   served to public readers
  published_at: 2024-03-01          ┘

Public API (/public/articles/:id) reads from published_* snapshot fields
Admin API (/cms/:id) reads current draft fields
```

### WorkflowEvent Record (per transition)

```
Every status transition writes a row:
{
  entity_type: "ARTICLE",
  entity_id: 42,
  user_id: 7,                    ← who performed the action
  from_status: "REVIEW",
  to_status: "APPROVED",
  action: "APPROVE",
  comment: "LGTM",
  version: 3,
  title_snapshot: "New Draft Title",
  created_at: "2024-03-15T10:00:00Z"
}

GET /cms/:id/activity → returns full history ordered by created_at
```

---

## 7. API Surface Map

```
/api
├── [PUBLIC — no auth required]
│   ├── POST   /auth/local                    Login (email + password)
│   ├── POST   /auth/local/register           Self-register
│   ├── GET    /auth/google                   Google OAuth start
│   ├── GET    /auth/google/callback          Google OAuth callback
│   ├── GET    /auth/github                   GitHub OAuth start
│   ├── GET    /auth/github/callback          GitHub OAuth callback
│   │
│   ├── GET    /public/articles               List published articles
│   ├── GET    /public/articles/:id           Get article (slug/UUID/id)
│   ├── GET    /public/articles/category/:s   Articles by category slug
│   ├── GET    /public/courses                List published courses
│   ├── GET    /public/courses/:id            Get course (slug/UUID/id)
│   ├── GET    /public/courses/category/:s    Courses by category slug
│   ├── GET    /public/cms                    Unified content list (type filter)
│   ├── GET    /public/cms/:id                Unified content detail
│   │
│   ├── GET    /tags                          List all tags
│   ├── GET    /sections                      List sections
│   ├── GET    /categories                    List categories
│   ├── GET    /categories/:id               Get category
│   ├── GET    /learning-paths               List learning paths
│   ├── GET    /learning-paths/:id           Get learning path
│   ├── GET    /review-comments              List comments
│   ├── GET    /review-comments/:id/replies  Get replies
│   │
│   └── POST   /graphql                       GraphQL content queries
│
├── [PROTECTED — Bearer JWT required]
│   │
│   ├── GET    /users/me                     Current user profile
│   │
│   ├── /users                               User CRUD
│   ├── /user-groups                         Group CRUD + members
│   │
│   ├── /categories (write)                  Category CRUD + tags
│   ├── /tags (write)                        Tag create/delete
│   ├── /content-types (write)              Content type CRUD
│   ├── /learning-paths (write)              Learning path CRUD + courses
│   │
│   ├── /cms                                 CMS articles+courses
│   │   ├── GET    /cms                       List (filter: type/status/category)
│   │   ├── GET    /cms/:id                   Get content
│   │   ├── POST   /cms                       Create article or course
│   │   ├── PUT    /cms/:id                   Update (draft/pending)
│   │   ├── DELETE /cms/:id                   Delete
│   │   ├── POST   /cms/:id/submit            → REVIEW
│   │   ├── POST   /cms/:id/approve           → APPROVED
│   │   ├── POST   /cms/:id/publish           → PUBLISHED
│   │   ├── POST   /cms/:id/reject            → REJECTED + comment
│   │   ├── POST   /cms/:id/send-back         → DRAFT + comment
│   │   └── GET    /cms/:id/activity          Workflow history
│   │
│   ├── /sections                             Section CRUD (course curriculum)
│   ├── /lessons                              Lesson CRUD
│   ├── /enrollments                          Enrollment + progress
│   │
│   ├── /tasks                               Personal task CRUD
│   ├── /notifications                        Notification list + read state
│   ├── /review-comments (write)              Add / delete comments
│   │
│   ├── POST   /upload                        File upload (multipart)
│   │
│   └── /engagement/:contentType/:contentId   Per-content engagement
│       ├── /react                            Like/dislike reaction
│       ├── /reactions                        List reactions
│       ├── /note                             Personal note (one per user+content)
│       ├── /favourite                        Toggle bookmark
│       ├── /highlights                       Text highlight CRUD
│       ├── /notes (global)                   All user's notes
│       ├── /favourites (global)              All user's favorites
│       └── /highlights (global)             All user's highlights
│
└── [ADMIN ONLY — Bearer JWT + Admin role]
    ├── GET    /analytics/dashboard            Dashboard statistics
    └── GET    /audit                          Audit log (filter: action/targetType)
```

---

## 8. Engagement System

Users can interact with any article or course through four engagement channels:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        ENGAGEMENT SYSTEM                                 │
│                   (MongoDB — per user, per content)                      │
│                                                                          │
│  Content (Article or Course)                                             │
│       │                                                                  │
│       ├──► Reactions                                                     │
│       │    One per user. value: "like" | "dislike"                      │
│       │    Toggle: POST to react, DELETE to remove                      │
│       │                                                                  │
│       ├──► Notes                                                         │
│       │    One per user per content. Free-form text body               │
│       │    PUT creates or replaces. GET retrieves.                       │
│       │                                                                  │
│       ├──► Favourites                                                    │
│       │    One per user per content. POST toggles (add if not,          │
│       │    remove if exists)                                             │
│       │                                                                  │
│       └──► Highlights                                                   │
│            Many per user per content.                                   │
│            Stores: text, start_offset, end_offset, color, note          │
│            Colors: yellow | green | blue                                │
│            Use case: highlight passages in long-form content            │
│                                                                          │
│  Global endpoints aggregate across all content for a user:              │
│    GET /engagement/notes       → all notes by current user              │
│    GET /engagement/favourites  → all bookmarks by current user          │
│    GET /engagement/highlights  → all highlights by current user         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Service Dependency Graph

```
HTTP Handler
    │
    ▼
Application Service → Repository Interface → Infrastructure (PG/Mongo)

AuthService ──────────────────────► UserRepository (PG)
                                    JWTManager

OAuthService ─────────────────────► UserRepository (PG)
                                    JWTManager
                                    Google/GitHub OAuth2 clients

UserService ──────────────────────► UserRepository (PG)
                                    GroupRepository (PG)

GroupService ─────────────────────► GroupRepository (PG)
                                    UserRepository (PG)

CMSService ───────────────────────► ArticleRepository (PG)
                                    CourseRepository (PG)
                                    CategoryRepository (PG)
                                    WorkflowEventRepository (PG)
                                    NotificationService
                                    AuditService

CategoryService ──────────────────► CategoryRepository (PG)
                                    TagRepository (PG)

SectionService ───────────────────► SectionRepository (PG)
LessonService ────────────────────► LessonRepository (PG)

EnrollmentService ────────────────► EnrollmentRepository (PG)
                                    CourseRepository (PG)

TaskService ──────────────────────► TaskRepository (PG)
NotificationService ──────────────► NotificationRepository (PG)

CommentService ───────────────────► CommentRepository (Mongo)
AnalyticsService ─────────────────► AnalyticsRepository (Mongo)
AuditService ─────────────────────► AuditLogRepository (Mongo)

TagService ───────────────────────► TagRepository (PG)
ReactionService ──────────────────► ReactionRepository (Mongo)
NoteService ──────────────────────► NoteRepository (Mongo)
FavouriteService ─────────────────► FavouriteRepository (Mongo)
HighlightService ─────────────────► HighlightRepository (Mongo)

ContentTypeService ───────────────► ContentTypeRepository (PG)
LearningPathService ──────────────► LearningPathRepository (PG)
                                    CourseRepository (PG)
```

---

## 10. Directory Reference

```
backend/go-cms/
│
├── cmd/server/main.go                  ← App entry: wire everything up, start server
│
├── go.mod / go.sum                     ← Module: github.com/serenya/go-cms
│
├── Dockerfile                          ← Multi-stage: build Go binary → Alpine image
├── docker-compose.yml                  ← Dev env: Postgres 16 + MongoDB 7 + pgAdmin
├── .env.example                        ← All env vars with descriptions
│
├── migrations/postgres/                ← SQL files (001_initial.sql … 016_*.sql)
│                                          Applied in order on startup via embed
│
├── internal/
│   │
│   ├── domain/
│   │   ├── entity/                     ← Pure Go structs, no DB tags
│   │   │   ├── user.go                 │  User, Group, UserGroup
│   │   │   ├── article.go              │  Article, Attachment
│   │   │   ├── course.go               │  Course, Section, Lesson
│   │   │   ├── enrollment.go           │  Enrollment, CompletedLesson
│   │   │   ├── task.go                 │  Task
│   │   │   ├── notification.go         │  Notification
│   │   │   ├── category.go             │  Category, Tag
│   │   │   ├── workflow_event.go       │  WorkflowEvent
│   │   │   ├── audit_log.go            │  AuditLog (Mongo)
│   │   │   ├── comment.go              │  ReviewComment (Mongo)
│   │   │   ├── analytics.go            │  AnalyticsEvent (Mongo)
│   │   │   ├── reaction.go             │  Reaction (Mongo)
│   │   │   ├── note.go                 │  Note (Mongo)
│   │   │   ├── favourite.go            │  Favourite (Mongo)
│   │   │   ├── highlight.go            │  Highlight (Mongo)
│   │   │   ├── learning_path.go        │  LearningPath, LearningPathCourse
│   │   │   └── content_type.go         │  ContentType
│   │   │
│   │   └── repository/
│   │       └── interfaces.go           ← All IXxxRepository interfaces (Go interfaces)
│   │
│   ├── application/                    ← Business logic, one file per service
│   │   ├── auth_service.go
│   │   ├── oauth_service.go
│   │   ├── user_service.go
│   │   ├── group_service.go
│   │   ├── cms_service.go              ← Largest service: articles+courses+workflow
│   │   ├── category_service.go
│   │   ├── section_service.go
│   │   ├── lesson_service.go
│   │   ├── enrollment_service.go
│   │   ├── task_service.go
│   │   ├── notification_service.go
│   │   ├── comment_service.go
│   │   ├── analytics_service.go
│   │   ├── audit_service.go
│   │   ├── tag_service.go
│   │   ├── reaction_service.go
│   │   ├── note_service.go
│   │   ├── favourite_service.go
│   │   ├── highlight_service.go
│   │   ├── content_type_service.go
│   │   └── learning_path_service.go
│   │
│   ├── bootstrap/
│   │   └── admin.go                    ← Seed admin user + admin group on startup
│   │
│   └── interfaces/
│       ├── http/
│       │   ├── router.go               ← All route definitions (source of truth for API)
│       │   ├── handler/                ← HTTP handlers (one file per domain)
│       │   │   ├── auth_handler.go
│       │   │   ├── user_handler.go
│       │   │   ├── group_handler.go
│       │   │   ├── cms_handler.go
│       │   │   ├── category_handler.go
│       │   │   ├── section_handler.go
│       │   │   ├── lesson_handler.go
│       │   │   ├── enrollment_handler.go
│       │   │   ├── task_handler.go
│       │   │   ├── notification_handler.go
│       │   │   ├── comment_handler.go
│       │   │   ├── upload_handler.go
│       │   │   ├── analytics_handler.go
│       │   │   ├── audit_handler.go
│       │   │   ├── tag_handler.go
│       │   │   ├── engagement_handler.go
│       │   │   ├── content_type_handler.go
│       │   │   └── learning_path_handler.go
│       │   ├── middleware/
│       │   │   ├── logger.go           ← HTTP logging (zap)
│       │   │   ├── cors.go             ← CORS policy
│       │   │   ├── auth.go             ← JWT extraction + context set
│       │   │   └── audit.go            ← Audit service on context
│       │   └── dto/                    ← Request/response JSON shapes
│       │
│       └── graphql/
│           └── resolver.go             ← GraphQL schema + resolvers (CMS + Category)
│
├── infrastructure/persistence/
│   ├── postgres/                       ← GORM-based repositories
│   │   ├── user_repo.go
│   │   ├── group_repo.go
│   │   ├── article_repo.go
│   │   ├── course_repo.go
│   │   ├── section_repo.go
│   │   ├── lesson_repo.go
│   │   ├── enrollment_repo.go
│   │   ├── task_repo.go
│   │   ├── notification_repo.go
│   │   ├── category_repo.go
│   │   ├── tag_repo.go
│   │   ├── workflow_event_repo.go
│   │   └── content_type_repo.go
│   └── mongodb/                        ← mongo-driver repositories
│       ├── audit_log_repo.go
│       ├── comment_repo.go
│       ├── analytics_repo.go
│       ├── reaction_repo.go
│       ├── note_repo.go
│       ├── favourite_repo.go
│       ├── highlight_repo.go
│       └── learning_path_repo.go
│
└── pkg/
    ├── config/config.go                ← Typed env var loading
    ├── database/
    │   ├── postgres.go                 ← Connect PG (write + read DBs)
    │   └── mongodb.go                  ← Connect Mongo
    ├── jwt/manager.go                  ← Generate + Parse JWT
    ├── logger/logger.go                ← Zap logger (console + file)
    ├── password/hash.go                ← bcrypt Hash + Compare
    ├── pagination/pagination.go        ← page/size from query params
    ├── response/response.go            ← Standardized JSON responses
    └── slugify/slugify.go              ← Title → URL slug
```

---

## 11. Data Flow: Article Publication

End-to-end trace of a content creator publishing an article:

```
Step 1 — Author creates draft
  POST /api/cms
  { "contentType": "ARTICLE", "title": "...", "body": [...] }
  │
  ├── CMSHandler.Create()
  ├── CMSService.CreateContent()
  ├── slugify title → unique slug
  ├── ArticleRepo.Create() → INSERT articles (status=DRAFT, version=1)
  └── AuditService.Log("article.created")

Step 2 — Author submits for review
  POST /api/cms/42/submit
  │
  ├── CMSHandler.Submit()
  ├── CMSService.Submit()
  ├── ArticleRepo.UpdateStatus(42, DRAFT → REVIEW)
  ├── WorkflowEventRepo.Create({ action:SUBMIT, from:DRAFT, to:REVIEW })
  └── NotificationService.Notify(moderators, "Article submitted for review")

Step 3 — Moderator approves
  POST /api/cms/42/approve
  │
  ├── CMSHandler.Approve()
  ├── CMSService.Approve()
  ├── ArticleRepo.UpdateStatus(42, REVIEW → APPROVED)
  ├── WorkflowEventRepo.Create({ action:APPROVE, from:REVIEW, to:APPROVED })
  └── NotificationService.Notify(author, "Article approved")

Step 4 — Admin publishes
  POST /api/cms/42/publish
  │
  ├── CMSHandler.Publish()
  ├── CMSService.Publish()
  ├── ArticleRepo.Update(42, {
  │     status: PUBLISHED,
  │     published_at: now(),
  │     published_version: 2,
  │     published_title: current_title,   ← snapshot
  │     published_body: current_body,     ← snapshot
  │   })
  ├── WorkflowEventRepo.Create({ action:PUBLISH })
  └── AuditService.Log("article.published")

Step 5 — Reader views article
  GET /api/public/articles/my-article-slug
  │
  ├── PublicArticleHandler.Get()
  ├── ArticleRepo.FindBySlug("my-article-slug")
  └── Returns: published_title, published_body, published_at
              (NOT the draft working copy)
```

---

## 12. Startup Sequence

```
main() in cmd/server/main.go
  │
  ├── 1. godotenv.Load(".env")
  │
  ├── 2. config.Load()              ← typed struct from env vars
  │
  ├── 3. logger.Init(cfg)           ← Zap (console + file output)
  │
  ├── 4. database.ConnectPostgres(writeURL, readURL)
  │       └── GORM connection pool (write + optional read replica)
  │
  ├── 5. database.RunMigrations()   ← embed migrations/*.sql, run in order
  │
  ├── 6. bootstrap.SeedAdmin(db)    ← Ensure Admin group + admin user exist
  │
  ├── 7. database.ConnectMongoDB(uri)
  │       └── Create indexes on all collections
  │
  ├── 8. jwt.NewManager(secret, expiry)
  │
  ├── 9. Instantiate Repositories
  │       ├── 13 PostgreSQL repos (read+write DB connections)
  │       └── 8 MongoDB repos
  │
  ├── 10. Instantiate Services (21)
  │        └── Inject repositories + jwt + logger into each service
  │
  ├── 11. router.Setup(services)
  │        ├── Global middleware: Logger, CORS, Recovery, AuditCtx
  │        ├── Static: /uploads/ → ./uploads/
  │        ├── Public routes (no auth)
  │        ├── Protected routes (Auth middleware)
  │        ├── Admin routes (Auth + AdminOnly middleware)
  │        └── GraphQL endpoint
  │
  └── 12. http.Server{Addr: ":8080"}.ListenAndServe()
           └── Graceful shutdown on SIGINT/SIGTERM
                ├── ctx with 5s timeout
                └── server.Shutdown(ctx)
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Framework** | Gin | Low overhead, mature middleware ecosystem |
| **ORM** | GORM | Idiomatic Go, migration-friendly, clean queries |
| **Arch Pattern** | Clean Architecture | Services/handlers stay testable; swap DB without touching logic |
| **Auth** | JWT (stateless) | No session store needed; scales horizontally |
| **OAuth state** | HMAC signature | No DB/Redis needed for CSRF protection |
| **Dual DB** | PG + MongoDB | Relational integrity for core data; MongoDB for flexible, high-write data |
| **Read/Write Split** | PG read replica | Offload read traffic; write-heavy ops stay on primary |
| **Content versioning** | Snapshot fields | Published content stays live while draft is in review |
| **Migrations** | Embedded SQL | Runs on startup; no external migration tool needed |
| **Logging** | Zap structured | High-performance, JSON in prod, colored in dev |
| **File storage** | Local + URL base | Works in dev; swap `UPLOAD_BASE_URL` for CDN in prod |

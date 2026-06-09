# 🎯 Strapi Implementation Guide for GFG + Udemy Backend

**Complete Setup for Educational Platform (Articles + Courses)**

---

## 📋 Table of Contents
1. [Quick Start](#quick-start)
2. [Content Type Modeling](#content-type-modeling)
3. [Workflow Configuration](#workflow-configuration)
4. [RBAC Setup](#rbac-setup)
5. [SSO Integration](#sso-integration)
6. [Media Handling](#media-handling)
7. [API Customization](#api-customization)
8. [Deployment](#deployment)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (18.17.0 or higher)
- PostgreSQL 12+ or MySQL 8+
- npm or yarn

### Installation (5 minutes)

```bash
# Create new Strapi project
npx create-strapi-app@latest gfg-udemy-backend --typescript

# Select options:
# - Database: PostgreSQL
# - Install dependencies: Yes
# - Start server: Yes

cd gfg-udemy-backend

# Start development server
npm run develop
```

**Access:**
- Admin Panel: http://localhost:1337/admin
- API: http://localhost:1337/api
- GraphQL: http://localhost:1337/graphql

---

## 🗂️ Content Type Modeling

### Step 1: Create Collections

In Strapi Admin Panel → Content-type Builder

#### 1. **Article** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| title | String | Required, max 255 |
| slug | String | Required, unique, lowercase |
| excerpt | Text | Max 500 chars |
| content | Rich Text | Required, editor: markdown or WYSIWYG |
| featured_image | Media | Single media, required |
| category | Relation | Relation to Category (many-to-one) |
| tags | Relation | Relation to Tag (many-to-many) |
| author | Relation | Relation to User (many-to-one) |
| status | Enumeration | draft, review, published (default: draft) |
| seo_title | String | Max 60 |
| seo_description | String | Max 160 |
| view_count | Integer | Default: 0 |
| likes | Integer | Default: 0 |
| created_at | DateTime | Auto |
| published_at | DateTime | Can be scheduled |
| updated_at | DateTime | Auto |

**Collection Configuration:**

```
Advanced Settings:
├── Display name: Article
├── API ID: article
├── Singular name: article
├── Plural name: articles
├── Description: Individual articles/blogs
├── Draft & Publish: Enable
└── Create: Articles
```

**Database Table:**
```sql
-- Automatically created by Strapi
articles
├── id (primary key)
├── title
├── slug
├── excerpt
├── content
├── featured_image_id (FK)
├── category_id (FK)
├── author_id (FK)
├── status (enum)
├── seo_title
├── seo_description
├── view_count
├── likes
├── created_at
├── published_at
├── updated_at
└── created_by_id, updated_by_id (Strapi system fields)

Junction table: articles_tags
├── article_id
└── tag_id
```

---

#### 2. **Course** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| title | String | Required, max 255 |
| slug | String | Required, unique |
| description | Text | Required |
| category | Relation | Relation to Category |
| tags | Relation | Relation to Tag (many-to-many) |
| instructor | Relation | Relation to User |
| sections | Relation | Relation to CourseSection (one-to-many) |
| difficulty | Enumeration | beginner, intermediate, advanced |
| duration | Integer | Total minutes |
| thumbnail | Media | Single media |
| status | Enumeration | draft, review, published |
| price | Decimal | Price in USD (0 = free) |
| discount_percent | Integer | 0-100 |
| is_published | Boolean | Auto-updated from status |
| enrolled_count | Integer | Default: 0 |
| rating | Float | 0-5 |
| review_count | Integer | Default: 0 |
| seo_title | String | Max 60 |
| seo_description | String | Max 160 |
| prerequisites | Text | What students need to know |
| learning_outcomes | JSON | Array of learning objectives |
| created_at | DateTime | Auto |
| published_at | DateTime | Can be scheduled |
| updated_at | DateTime | Auto |

**Advanced Settings:**
```
├── Draft & Publish: Enable
├── Comment: Enable (for course reviews)
└── Sort: By published_at DESC
```

---

#### 3. **CourseSection** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| title | String | Required |
| description | Text | Optional |
| order | Integer | Required, unique per course |
| course | Relation | Relation to Course (many-to-one) |
| lessons | Relation | Relation to Lesson (one-to-many) |
| duration | Integer | Auto-calculated |
| lesson_count | Integer | Auto-calculated |

---

#### 4. **Lesson** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| title | String | Required |
| description | Text | Optional |
| content | Rich Text | Lesson description/notes |
| section | Relation | Relation to CourseSection |
| order | Integer | Required, unique per section |
| video_url | String | YouTube/Vimeo URL or AWS S3 |
| video_duration | Integer | In seconds |
| video_thumbnail | Media | Auto-generated from video |
| attachments | Relation | Relation to Attachment (many-to-many) |
| quiz_questions | JSON | Array of quiz questions |
| is_preview | Boolean | Can viewer preview without enrollment? |
| is_completed | Boolean | (User-specific, handled in separate table) |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

---

#### 5. **Category** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| name | String | Required, unique |
| slug | String | Required, unique |
| description | Text | Optional |
| icon | Media | Single media |
| parent | Relation | Self-relation (many-to-one) |
| children | Relation | Self-relation (one-to-many) |
| is_featured | Boolean | Show on homepage? |
| order | Integer | Sort order |
| article_count | Integer | Auto-count |
| course_count | Integer | Auto-count |

---

#### 6. **Tag** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| name | String | Required, unique, max 50 |
| slug | String | Required, unique |
| color | String | Hex color for UI |
| description | Text | Optional |

---

#### 7. **Bookmark** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| user | Relation | Relation to User |
| article | Relation | Relation to Article (optional) |
| course | Relation | Relation to Course (optional) |
| saved_at | DateTime | Auto |
| note | Text | User's personal note |

---

#### 8. **CourseEnrollment** (Collection Type)

**Fields:**

| Field | Type | Settings |
|-------|------|----------|
| user | Relation | Relation to User |
| course | Relation | Relation to Course |
| progress_percent | Integer | 0-100 |
| completed_lessons | Relation | Relation to Lesson (many-to-many) |
| enrolled_at | DateTime | Auto |
| completed_at | DateTime | When course finished |
| certificate_url | String | URL to certificate |
| rating | Integer | 1-5 (course rating by student) |
| review | Text | Course review text |

---

### Step 2: Extend User Collection

In Strapi Admin → Settings → Users & Permissions Plugin → Roles

**Extend user-permission collection with fields:**

```json
{
  "bio": "Text field",
  "avatar": "Media (single file)",
  "user_type": "Enumeration: student, instructor, editor, admin, reviewer",
  "verified": "Boolean field (email verified)",
  "social_links": "JSON field",
  "topics_of_expertise": "Relation to Tag (many-to-many)",
  "subscribed_to": "Relation to self (many-to-many)",
  "instructor_rating": "Float (1-5)",
  "article_count": "Integer",
  "course_count": "Integer",
  "verified_badge": "Boolean",
  "bio_image_url": "String"
}
```

**Raw SQL (if using direct DB management):**

```sql
ALTER TABLE up_users ADD COLUMN bio TEXT;
ALTER TABLE up_users ADD COLUMN avatar_id BIGINT;
ALTER TABLE up_users ADD COLUMN user_type VARCHAR(50) DEFAULT 'student';
ALTER TABLE up_users ADD COLUMN verified BOOLEAN DEFAULT FALSE;
ALTER TABLE up_users ADD COLUMN social_links JSONB;
ALTER TABLE up_users ADD COLUMN instructor_rating FLOAT DEFAULT 0;
ALTER TABLE up_users ADD COLUMN verified_badge BOOLEAN DEFAULT FALSE;
```

---

## 🔄 Workflow Configuration

### Step 1: Enable Draft & Publish

All content types → Advanced Settings → Enable "Draft & Publish"

### Step 2: Configure Workflow States

Create workflow with states:

```
DRAFT (writing)
  ↓
REVIEW (pending approval)
  ↓
PUBLISHED (live)
  ↓ (optional)
ARCHIVED (hidden)
```

### Step 3: Setup Notifications (Plugins)

Install Strapi Notifiers plugin:

```bash
npm install strapi-plugin-email
```

**Configure email notifications:**

```javascript
// config/plugins.js
module.exports = {
  email: {
    provider: 'sendgrid', // or mailgun, aws-ses
    providerOptions: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
    settings: {
      defaultFrom: 'noreply@platform.com',
      defaultReplyTo: 'support@platform.com',
    },
  },
};
```

**Email Triggers:**

```
Article/Course submitted for review:
  → Email to reviewers: "New article needs review: [Title]"

Article/Course approved:
  → Email to author: "Your article was approved! Published at: [URL]"

Article/Course rejected:
  → Email to author: "Your article needs changes: [Feedback]"

User subscribed to author:
  → Email when author posts: "New article from [Author]: [Title]"
```

---

## 👥 RBAC Setup

### Step 1: Create Roles

Strapi Admin → Settings → Users & Permissions → Roles

**Default Roles to Create:**

#### 1. **Admin**
- Permissions: All (100%)

#### 2. **Editor**
- Article: Create, Read, Update (own), Delete (own), Publish
- Course: Create, Read, Update (own), Delete (own), Publish
- Category: Read only
- Tag: Read only
- User: Read own profile, Update own profile

#### 3. **Reviewer/Approver**
- Article: Read, Update status (review → draft or published)
- Course: Read, Update status
- Cannot create or delete

#### 4. **Instructor**
- Course: Create, Read, Update (own), Delete (own)
- CourseSection: Create, Read, Update (own), Delete (own)
- Lesson: Create, Read, Update (own), Delete (own)
- Article: Read only
- Cannot publish (editor must approve)

#### 5. **Author**
- Article: Create, Read, Update (own), Delete (own)
- Course: Read only
- User: Read own, Update own profile
- Cannot publish (editor must approve)

#### 6. **Student**
- Article: Read (published only)
- Course: Read (published only)
- Bookmark: Create, Read (own), Delete (own)
- CourseEnrollment: Create (own), Read (own)
- Comments: Create (own), Read

#### 7. **Authenticated User**
- Default for logged-in users

---

### Step 2: Configure Permissions per Role

**For Editor Role:**

```
Content-Type: Article
├── Find (all) ✅
├── Find one (all) ✅
├── Create ✅
├── Update
│   ├── Own: ✅
│   └── Others: ❌
├── Delete
│   ├── Own: ✅
│   └── Others: ❌
└── Publish: ✅

Content-Type: Course
├── (Same as Article)
```

---

## 🔐 SSO Integration

### Step 1: Install Auth Plugins

```bash
npm install strapi-plugin-users-permissions
npm install @strapi/plugin-cloud
```

### Step 2: Google OAuth Setup

**1. Get Google Credentials:**
- Go to https://console.cloud.google.com
- Create OAuth 2.0 credentials (Web application)
- Set redirect URI: `http://localhost:1337/api/auth/google/callback`
- Copy Client ID and Client Secret

**2. Configure in Strapi:**

```javascript
// config/server.js
module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
  },
});

// config/plugins.js
module.exports = ({ env }) => ({
  'users-permissions': {
    enabled: true,
    config: {
      providers: {
        google: {
          enabled: true,
          client_id: env('GOOGLE_CLIENT_ID'),
          client_secret: env('GOOGLE_CLIENT_SECRET'),
          callback: '/api/auth/google/callback',
          scope: ['profile', 'email'],
        },
        github: {
          enabled: true,
          client_id: env('GITHUB_CLIENT_ID'),
          client_secret: env('GITHUB_CLIENT_SECRET'),
          callback: '/api/auth/github/callback',
          scope: ['user:email'],
        },
      },
      jwt: {
        expiresIn: '7d',
      },
    },
  },
});
```

**3. Environment Variables (.env):**

```bash
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
JWT_SECRET=your_jwt_secret_key_here
```

**4. Frontend Integration:**

```javascript
// React/Vue component
const loginWithGoogle = () => {
  window.location.href = 'http://localhost:1337/api/auth/google';
};

// After redirect back from Google:
// Strapi will return JWT token in response
// Store in localStorage
localStorage.setItem('jwt', token);
```

---

## 📁 Media Handling

### Step 1: Configure Upload Provider

**Option A: Local Storage (Development)**

```javascript
// config/plugins.js (default, already configured)
```

**Option B: AWS S3 (Production)**

```bash
npm install strapi-provider-upload-aws-s3
```

```javascript
// config/plugins.js
module.exports = ({ env }) => ({
  upload: {
    config: {
      provider: 'aws-s3',
      providerOptions: {
        s3Options: {
          credentials: {
            accessKeyId: env('AWS_ACCESS_KEY_ID'),
            secretAccessKey: env('AWS_ACCESS_KEY_SECRET'),
          },
          region: env('AWS_REGION', 'us-east-1'),
          params: {
            Bucket: env('AWS_BUCKET'),
          },
        },
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },
});
```

**.env:**
```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_ACCESS_KEY_SECRET=your_secret_key
AWS_REGION=us-east-1
AWS_BUCKET=your-bucket-name
```

**Option C: Cloudinary (Easiest for Images)**

```bash
npm install strapi-provider-upload-cloudinary
```

```javascript
// config/plugins.js
module.exports = ({ env }) => ({
  upload: {
    config: {
      provider: 'cloudinary',
      providerOptions: {
        cloud_name: env('CLOUDINARY_NAME'),
        api_key: env('CLOUDINARY_KEY'),
        api_secret: env('CLOUDINARY_SECRET'),
      },
      actionOptions: {
        upload: {},
        delete: {},
      },
    },
  },
});
```

---

### Step 2: Video Handling

**For video URLs (YouTube, Vimeo):**
- Store URL in `video_url` field
- Use player in frontend (YouTube embed, Vimeo player)

**For uploaded videos (AWS S3 + processing):**

```bash
npm install strapi-plugin-mux-video
```

Or integrate with Mux API:

```javascript
// api/lesson/controllers/lesson.js
module.exports = {
  async createLesson(ctx) {
    const { video_file } = ctx.request.files;
    
    // Upload to Mux for transcoding
    const muxClient = new Mux();
    const upload = await muxClient.video.uploads.create({
      cors_origin: 'https://yoursite.com',
    });
    
    // Return upload URL to frontend for direct upload
    ctx.body = { upload_url: upload.url };
  },
};
```

---

## 🔌 API Customization

### Step 1: Create Custom Endpoints

```bash
# Generate controller
strapi generate api article article
```

**api/article/controllers/article.js:**

```javascript
'use strict';

/**
 * A set of functions called "actions" for `article`
 */

module.exports = {
  // Find articles with filters
  async find(ctx) {
    const { category, tag, search, status } = ctx.query;
    
    let query = { filters: {} };
    
    if (category) {
      query.filters.category = { slug: category };
    }
    
    if (tag) {
      query.filters.tags = { slug: tag };
    }
    
    if (status) {
      query.filters.status = status;
    } else {
      query.filters.status = 'published'; // Default: only published
    }
    
    if (search) {
      query.filters.$or = [
        { title: { $containsi: search } },
        { excerpt: { $containsi: search } },
      ];
    }
    
    query.sort = ['published_at:desc'];
    query.populate = ['category', 'tags', 'author', 'featured_image'];
    
    const articles = await strapi.entityService.findMany(
      'api::article.article',
      query
    );
    
    ctx.body = articles;
  },

  // Find featured articles
  async featured(ctx) {
    const articles = await strapi.entityService.findMany(
      'api::article.article',
      {
        filters: { status: 'published' },
        sort: ['likes:desc'],
        limit: 6,
        populate: ['category', 'featured_image'],
      }
    );
    
    ctx.body = articles;
  },

  // Increment view count
  async incrementViews(ctx) {
    const { id } = ctx.params;
    
    const article = await strapi.entityService.findOne(
      'api::article.article',
      id
    );
    
    await strapi.entityService.update(
      'api::article.article',
      id,
      { data: { view_count: (article.view_count || 0) + 1 } }
    );
    
    ctx.body = { success: true };
  },

  // Like/unlike article
  async toggleLike(ctx) {
    const { id } = ctx.params;
    const userId = ctx.state.user.id;
    
    // You'd need a Likes collection type for this
    // Or store in a JSON field
    
    ctx.body = { success: true };
  },
};
```

**api/article/routes/article.js:**

```javascript
'use strict';

/**
 * article router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/articles/featured',
      handler: 'article.featured',
      config: {
        auth: false, // Public access
        policies: [],
      },
    },
    {
      method: 'PUT',
      path: '/articles/:id/views',
      handler: 'article.incrementViews',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/articles/:id/like',
      handler: 'article.toggleLike',
      config: {
        auth: true, // Requires login
      },
    },
    // Default CRUD routes
    ...createCoreRouter('api::article.article'),
  ],
};
```

---

### Step 2: GraphQL Integration

**Enable GraphQL:**

```bash
npm install @strapi/plugin-graphql
```

**Test GraphQL queries:**

```graphql
# Get published articles with category and tags
{
  articles(filters: { status: { eq: "published" } }) {
    data {
      id
      attributes {
        title
        slug
        excerpt
        category {
          data {
            attributes { name slug }
          }
        }
        tags(limit: 5) {
          data {
            attributes { name slug }
          }
        }
      }
    }
  }
}

# Search articles
{
  articles(filters: { 
    title: { containsi: "javascript" }
  }) {
    data {
      attributes { title slug }
    }
  }
}

# Get courses with sections and lessons
{
  courses(filters: { status: { eq: "published" } }) {
    data {
      attributes {
        title
        description
        sections {
          data {
            attributes {
              title
              lessons(limit: 10) {
                data {
                  attributes { title order video_duration }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 🚀 Deployment

### Option 1: Heroku (Easiest)

```bash
# Install Heroku CLI
brew install heroku

# Login
heroku login

# Create Strapi project on Heroku
npm install -g @strapi/cli
strapi new gfg-udemy-backend --quickstart
npm run build

# Deploy to Heroku
git push heroku main
```

### Option 2: Docker + Kubernetes

**Dockerfile:**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 1337
CMD ["npm", "start"]
```

**docker-compose.yml:**

```yaml
version: '3'
services:
  strapi:
    build: .
    ports:
      - "1337:1337"
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/strapi
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
    depends_on:
      - db
  
  db:
    image: postgres:14
    environment:
      POSTGRES_DB: strapi
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## 📊 API Endpoints Summary

### Public Endpoints (No Auth)
```
GET    /api/articles?status=published
GET    /api/articles/:id
GET    /api/articles/featured
GET    /api/courses?status=published
GET    /api/courses/:id
GET    /api/categories
GET    /api/tags
GET    /api/articles/search?q=javascript
```

### Authenticated Endpoints
```
POST   /api/articles              (Create article)
PUT    /api/articles/:id          (Update own article)
DELETE /api/articles/:id          (Delete own article)
POST   /api/bookmarks             (Save article/course)
GET    /api/bookmarks             (Get saved items)
DELETE /api/bookmarks/:id
POST   /api/articles/:id/like     (Like article)
```

### Admin Endpoints
```
PUT    /api/articles/:id/publish  (Publish article)
PUT    /api/articles/:id/reject   (Reject article)
GET    /api/users                 (Manage users)
POST   /api/categories            (Create category)
```

---

## ✅ Implementation Checklist

- [ ] Install Strapi
- [ ] Create Content Types (Article, Course, Category, Tag, etc.)
- [ ] Configure Draft & Publish
- [ ] Setup email notifications
- [ ] Create user roles (Editor, Author, Student, etc.)
- [ ] Configure RBAC permissions
- [ ] Setup Google OAuth
- [ ] Configure S3/Cloudinary for media
- [ ] Create custom API endpoints
- [ ] Setup search (Elasticsearch or basic filter)
- [ ] Test all workflows
- [ ] Deploy to production
- [ ] Setup CDN (Cloudflare)
- [ ] Configure backups
- [ ] Monitor performance

---

## 🎯 Timeline

```
Week 1:
├── Day 1-2: Setup Strapi, create content types
├── Day 3-4: Configure workflows, RBAC, notifications
└── Day 5: Setup SSO (Google/GitHub)

Week 2:
├── Day 1-2: Media setup (S3/Cloudinary)
├── Day 3: Custom API endpoints, GraphQL
├── Day 4: Frontend development
└── Day 5: Testing & deployment

Week 3-4: Frontend development & refinement
```

---

**Ready to build the best educational platform!** 🚀

For questions: Strapi Docs: https://docs.strapi.io

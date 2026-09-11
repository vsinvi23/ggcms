# GeekGully UI/UX Product Specification
## Modern Learning Platform Experience

**Product:** GeekGully  
**Scope:** Web Portal / Reader / Learning Experience / Taxonomy Discovery  
**Status:** Proposed UI/UX implementation specification  
**Date:** 2026-09-09

---

# 1. Design Objective

GeekGully should evolve from a conventional content/CMS presentation into a clean, modern technical learning platform.

The new experience should be:

- Simple
- Easy on the eyes
- Content-focused
- Highly readable
- Familiar to developers
- Fast to scan
- Consistent across pages
- Discoverable without being overwhelming
- Personalized where useful
- Ready for future AI-native capabilities

The redesign should **not** make the site visually crowded.

The design should avoid:

- Excessive cards
- Excessive gradients
- Large decorative illustrations
- Dense dashboards
- Excessive colors
- Heavy shadows
- Too many navigation levels
- Too many CTAs
- Excessive badges
- Unnecessary animations

---

# 2. Brand Preservation — HARD REQUIREMENT

The following existing GeekGully brand elements MUST remain unchanged:

## 2.1 Logo

Keep the existing GeekGully logo exactly as currently used.

Do not:

- redesign the logo
- change the logo colors
- replace the logo with an icon
- introduce an alternate logo
- change its proportions

The logo should be reused from the existing application asset/component.

## 2.2 Existing Color Theme

The existing GeekGully color theme is authoritative.

Do NOT introduce a new color palette.

The UI implementation must reuse the existing:

- primary color
- secondary color
- text colors
- background colors
- border colors
- success/warning/error colors
- button colors
- link colors

If these are already defined as CSS variables/design tokens, use those tokens.

Example implementation principle:

```text
Existing Design Tokens
        |
        v
New Components
        |
        v
New Pages
```

NOT:

```text
New UI
   |
   +--> new colors
   +--> new branding
   +--> new logo
```

The prototype imagery is a layout/UX reference only.

It is NOT permission to change GeekGully's existing brand colors.

---

# 3. Overall Design Philosophy

The visual hierarchy should be:

```text
CONTENT
  ↓
STRUCTURE
  ↓
DISCOVERY
  ↓
PERSONALIZATION
  ↓
DECORATION
```

Decoration should never compete with content.

A user should immediately understand:

1. Where am I?
2. What can I learn?
3. What should I do next?
4. What content is relevant to me?

---

# 4. Global Application Structure

Recommended primary navigation:

```text
GeekGully

Home
Explore
Learn
Topics
Courses
Learning Paths

                    Search
                    Notifications
                    Profile
```

Desktop:

```text
┌───────────────────────────────────────────────────────────────┐
│ GeekGully | Home | Explore | Learn | Topics | Courses | Paths │
│                                      Search   Bell   Profile  │
└───────────────────────────────────────────────────────────────┘
```

The navigation should remain consistent across all reader-facing pages.

---

# 5. Navigation Semantics

Each navigation item has a distinct responsibility.

## Home

Personalized discovery.

```text
Continue Learning
Recommended for You
Explore by Domain
Popular Topics
New & Updated
Learning Paths
```

## Explore

Navigation taxonomy.

```text
Domain
  ↓
Category
  ↓
Content
```

## Learn

Content-oriented discovery.

```text
Articles
Courses
Tutorials
Cheat Sheets
FAQs
Other supported content types
```

## Topics

Knowledge-oriented discovery.

```text
Topic
  ↓
Related Topics
  ↓
Related Content
  ↓
Learning Paths
```

## Courses

Course discovery and course learning.

## Learning Paths

Goal-oriented learning journeys.

---

# 6. Icon System

Use one consistent icon library throughout the application.

Recommended:

**Lucide Icons** or the existing icon library already used by GeekGully.

Do not mix multiple icon families.

Icons should generally be:

- Outline style
- Simple
- Consistent stroke width
- Accessible
- Recognizable
- Used sparingly

Recommended semantic icon mapping:

| Purpose | Suggested Icon |
|---|---|
| Home | House |
| Explore | Compass |
| Learn | BookOpen |
| Topics | Network / Tags |
| Courses | GraduationCap |
| Learning Paths | Route / Milestone |
| Search | Search |
| Profile | CircleUser |
| Notifications | Bell |
| Bookmark | Bookmark |
| Share | Share2 |
| Article | FileText |
| Course | BookOpen |
| Video | PlayCircle |
| Domain | Layers |
| Category | Folder |
| Topic | Hash / Network |
| Prerequisite | ArrowUp / GitBranch |
| Related | Link2 |
| Completed | CircleCheck |
| Progress | Activity / ChartNoAxesColumn |
| Clock | Clock |
| Difficulty | Gauge |
| Certificate | Award |
| Security | Shield |
| Cloud | Cloud |
| Software | Code2 |
| Data | Database |
| AI | Brain |
| External link | ExternalLink |
| Back | ArrowLeft |
| Forward | ArrowRight |
| Expand | ChevronDown |
| Collapse | ChevronUp |

The exact icon names can be mapped to the existing icon package.

---

# 7. Icon Rules

Icons should communicate meaning, not decorate every element.

GOOD:

```text
🔍 Search
🔖 Bookmark
▶ Continue
✓ Completed
```

Avoid:

```text
Every card has 3–5 decorative icons
```

Use icon + text for important actions.

Icon-only controls require accessible tooltips/ARIA labels.

---

# 8. Home Page

The homepage is the most important redesign.

It should feel like:

> "This is where I come to learn technology."

Not:

> "This is a list of blog posts."

---

## 8.1 Hero

Keep the hero compact.

Recommended structure:

```text
Build Better.
Learn Deeper.

Practical, in-depth learning for modern developers.

Software Engineering · Cloud · Cybersecurity · Data · AI

┌──────────────────────────────────────────────────────┐
│ 🔍  What do you want to learn today?                 │
│                                             Search → │
└──────────────────────────────────────────────────────┘

Go   Kubernetes   OAuth 2.0   Google Cloud   AI Agents
```

The search input should eventually search:

- Articles
- Courses
- Topics
- Learning Paths

---

# 9. Domain Discovery

Immediately below the hero:

```text
Explore by Domain

┌──────────────────┐
│ Code Icon        │
│ Software         │
│ Engineering      │
│                  │
│ 120+ articles →  │
└──────────────────┘

┌──────────────────┐
│ Cloud Icon       │
│ Cloud &          │
│ Infrastructure   │
│                  │
│ 90+ articles →   │
└──────────────────┘
```

Initial domains:

```text
Software Engineering
Cloud & Infrastructure
Cybersecurity
Data
AI & Machine Learning
```

These come from the system taxonomy.

---

# 10. Continue Learning

Only display prominently for authenticated users.

```text
Continue Learning                          See all →

┌─────────────────────────────────────────────┐
│ Building REST APIs with Go                  │
│                                             │
│ ███████████████████░░░░ 60%                 │
│ 8 min remaining                              │
│                                             │
│ [ Continue ]                       🔖        │
└─────────────────────────────────────────────┘
```

Keep this section compact.

Do not show ten items.

Recommended:

```text
3–4 items desktop
1–2 items mobile
```

---

# 11. Recommended for You

```text
Recommended for You                         See all →

Based on your interests in Go, Cloud and Security

┌──────────────┐
│ Image        │
│              │
│ OAuth 2.0    │
│ with Go      │
│              │
│ Security Go  │
│ 12 min read  │
└──────────────┘
```

Recommendation explanations should be lightweight.

Examples:

```text
Because you read OAuth 2.0
```

```text
Builds on Go
```

```text
Related to Kubernetes
```

Do not expose internal scoring signals.

The backend recommendation contract already supports public `reason_code`, `reason`, and `score`; only the human-friendly reason should be shown to readers.

---

# 12. Popular Topics

Topics should be presented as compact pills/cards.

```text
Popular Topics

[ Go ] [ Kubernetes ] [ OAuth 2.0 ]
[ Docker ] [ Google Cloud ]
[ PostgreSQL ] [ AI Agents ]
```

Avoid large topic cards.

Topics are semantic knowledge entities, not navigation categories.

---

# 13. New & Updated

```text
New & Updated                              See all →

Latest
────────────────────────────────────────────
Building Secure APIs with Go          12 min
Understanding OIDC                    10 min
Kubernetes Networking                  15 min
Introduction to AI Agents               8 min
```

This section should be highly scannable.

---

# 14. Learning Paths

Use a small number of visually strong cards.

```text
Learning Paths

Become a Backend Engineer
12 modules · 40+ hours

Go · APIs · Databases · Security

[ Start Path → ]
```

Examples:

```text
Backend Engineer
Cloud Engineer
Security Engineer
AI Engineer
```

Learning paths should remain separate from categories and topics.

---

# 15. Explore Page

Purpose:

> Help users navigate the GeekGully knowledge/content universe.

Layout:

```text
Explore

Discover content by domain and category

┌──────────────┐
│ Browse       │
│              │
│ All Domains  │
│ Software     │
│ Cloud        │
│ Security     │
│ Data         │
│ AI           │
│              │
│ Content Type │
│ □ Articles   │
│ □ Courses    │
│ □ Paths      │
└──────────────┘

┌───────────────────────────────────────────────┐
│ Cybersecurity                                 │
│                                               │
│ Identity & Access     28 articles             │
│ PKI & Cryptography    18 articles             │
│ AppSec & Threats      16 articles             │
│ Network Security      12 articles             │
└───────────────────────────────────────────────┘
```

Desktop:

```text
Sidebar filters + content area
```

Mobile:

```text
Filter button
       ↓
Filter drawer
```

---

# 16. Domain Page

Example:

```text
Cybersecurity

Security, identity and risk management.

Identity & Access
PKI & Cryptography
AppSec & Threats
Network Security
Security Operations
```

Then:

```text
Popular content
Latest
Courses
Learning Paths
Topics
```

---

# 17. Category Page

Example:

```text
Cybersecurity
  /
Identity & Access

Identity & Access

Learn authentication, authorization,
identity protocols and secure access.

Articles
Courses
Learning Paths
Topics
```

Content can be filtered by:

```text
Difficulty
Content type
Topic
Updated date
```

---

# 18. Article Page

The article page should prioritize reading.

Recommended layout:

```text
Breadcrumb

Cybersecurity / Identity & Access

# Implementing OAuth 2.0 with Go
# and Google Cloud

Practical guide to building secure OAuth 2.0
authentication with Go and Google Cloud.

Author · Date · Reading time · Difficulty

[OAuth 2.0] [Go] [Google Cloud] [OIDC]

──────────────────────────────────────────────

             Article content

──────────────────────────────────────────────

Related Content
```

---

# 19. Article Layout

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header                                                       │
├──────────────────────────────────────────────────────────────┤
│ Breadcrumb                                                   │
│                                                              │
│ Article Title                       On this page             │
│ Description                        1. Introduction            │
│ Metadata                             2. OAuth 2.0             │
│ Topics                               3. Implementation         │
│                                                              │
│ ┌──────────────────────────────┐                              │
│ │                              │                              │
│ │        Hero / Article        │                              │
│ │          Image              │                              │
│ │                              │                              │
│ └──────────────────────────────┘                              │
│                                                              │
│ Article content                                               │
│                                                              │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

The right rail should remain narrow.

On mobile:

```text
Title
Metadata
Topics
Article
Related Content
```

The table of contents becomes collapsible.

---

# 20. Article Typography

Reading experience is critical.

Use:

- comfortable line length
- generous paragraph spacing
- clear heading hierarchy
- readable code blocks
- syntax highlighting
- sufficient contrast
- responsive images
- blockquotes
- tables that scroll horizontally on mobile

Do not make article text too wide.

Target approximately:

```text
650–800px
```

for the main reading column, subject to the existing design system.

---

# 21. Topic Page

This page represents the knowledge graph.

Example:

```text
OAuth 2.0

An authorization framework for secure
access to resources.

42 Articles
8 Courses
3 Learning Paths

Overview | Articles | Courses | Learning Paths
```

Then:

```text
Prerequisites

HTTP Fundamentals
Authentication Basics
Web Security Concepts
```

And:

```text
Related Topics

OpenID Connect
JWT
API Security
PKI & Cryptography
```

And:

```text
Popular Articles on OAuth 2.0
```

---

# 22. Topic Visual Language

Topics should look different from categories.

Category:

```text
Cybersecurity
  Identity & Access
```

Topic:

```text
[ OAuth 2.0 ]
[ OIDC ]
[ JWT ]
```

This reinforces the conceptual distinction without explaining the database architecture to the user.

---

# 23. Learning Path Page

Example:

```text
Become a Secure Backend Developer

Learn to build secure backend services
using Go, OAuth 2.0, Kubernetes and cloud.

12 modules · 6 hours · Intermediate

[ Start Learning Path ]

Overview | Curriculum | Related Paths
```

Curriculum:

```text
01  Go Fundamentals              ✓
02  HTTP & REST APIs             ✓
03  Authentication               ●
04  OAuth 2.0                    ○
05  OIDC                         ○
06  Secure API Design            ○
07  Kubernetes                   ○
08  Cloud Deployment             ○
```

Use:

- checkmark for completed
- active/progress indicator for current
- neutral state for upcoming

Avoid excessive color.

---

# 24. My Learning

Authenticated users should have:

```text
My Learning

Overview
Bookmarks
History
Achievements
Settings
```

Top metrics:

```text
3 In Progress
12 Completed
8 Bookmarks
2 Learning Paths
```

Then:

```text
Continue Learning

Building REST APIs with Go        60%
Kubernetes for Developers         25%
Introduction to OAuth 2.0         80%
```

Then:

```text
Recommended for You
```

---

# 25. Search

Search should eventually become a unified knowledge search.

Search across:

```text
Articles
Courses
Topics
Learning Paths
```

Results should clearly identify type:

```text
OAuth 2.0
Topic

Implementing OAuth 2.0 with Go
Article

OAuth 2.0 Fundamentals
Course

Secure Backend Developer
Learning Path
```

Filters:

```text
Content Type
Domain
Category
Topic
Difficulty
```

---

# 26. Empty States

Empty states should be useful, not technical.

Bad:

```text
No records found.
```

Good:

```text
Nothing here yet.

Try another topic or explore a different domain.

[ Explore Domains ]
```

---

# 27. Loading States

Use skeleton loaders.

Avoid full-screen spinners except for operations that genuinely block the page.

Example:

```text
┌──────────────────────────────┐
│ █████████████████████        │
│ ███████████                  │
│ ███████████████████          │
└──────────────────────────────┘
```

---

# 28. Error States

Example:

```text
We couldn't load your recommendations.

Please try again.

[ Retry ]
```

Do not expose backend/database errors.

---

# 29. Responsive Design

The design must be desktop-first but fully responsive.

Breakpoints should follow the existing project's conventions.

### Desktop

```text
Full navigation
Sidebar filters
Multi-column cards
Article right rail
```

### Tablet

```text
Reduced navigation
2-column content
Collapsible filters
```

### Mobile

```text
Compact header
Search
Single-column content
Horizontal scrolling topic pills
Filter drawer
Collapsible article TOC
```

---

# 30. Card Design

Cards should be lightweight.

Recommended:

```text
Border
Small radius
Minimal shadow
Consistent padding
Clear hierarchy
```

Avoid:

```text
Huge shadows
Gradient backgrounds
Large illustrations
Multiple badges
Nested cards
```

Cards should primarily organize content, not decorate it.

---

# 31. Content Card

Standard content card:

```text
┌─────────────────────────────────────┐
│ Thumbnail / icon                    │
│                                     │
│ Article title                       │
│ Short description                   │
│                                     │
│ [Topic] [Topic]                     │
│                                     │
│ 12 min · Intermediate        🔖     │
└─────────────────────────────────────┘
```

Use the same component across:

- Home
- Category pages
- Topic pages
- Search
- Recommendations

---

# 32. Recommendation Card

Recommendation card may additionally display:

```text
Why this?

Because you read OAuth 2.0
```

or:

```text
Builds on OAuth 2.0
```

Keep the explanation subtle.

---

# 33. Accessibility

All pages must target WCAG-friendly implementation.

Requirements:

- keyboard navigation
- visible focus states
- semantic HTML
- ARIA labels for icon-only controls
- sufficient contrast
- alt text
- accessible forms
- accessible dialogs/drawers
- no information conveyed by color alone

---

# 34. Animation

Use animation sparingly.

Allowed:

- subtle hover
- dropdown transitions
- drawer transitions
- progress updates
- skeleton transitions

Avoid:

- animated backgrounds
- excessive card movement
- large parallax effects
- distracting hero animation

The site should feel fast.

---

# 35. Design System Components

Create reusable components instead of page-specific implementations.

Recommended component set:

```text
AppHeader
AppFooter
SearchBox
Breadcrumb
DomainCard
CategoryCard
TopicChip
TopicCard
ContentCard
CourseCard
LearningPathCard
ProgressBar
RecommendationCard
SectionHeader
FilterPanel
FilterDrawer
Tabs
Badge
Avatar
BookmarkButton
ShareButton
TableOfContents
ArticleRenderer
CodeBlock
RelatedContent
EmptyState
ErrorState
SkeletonCard
Pagination
```

---

# 36. Component Rules

Components should accept data rather than hardcode content.

Example:

```text
<ContentCard
    title
    description
    contentType
    topics
    readingTime
    difficulty
    image
/>
```

The component must not know whether the content came from:

- article API
- recommendation API
- topic API
- search API

This allows reuse across the portal.

---

# 37. Existing Brand Tokens

Before implementing new components, the frontend agent must inspect:

```text
Existing CSS
Theme variables
Tailwind/theme configuration
Typography
Buttons
Cards
Inputs
Navigation
Logo components
Existing spacing
Existing breakpoints
```

The new design must extend the existing design system rather than introduce an independent one.

---

# 38. Existing UI Reuse

Reuse existing components where they already provide the correct behavior.

Refactor only when necessary.

Avoid:

```text
New Button
New Button2
New Card
New Card2
New Header
New Header2
```

Instead:

```text
Existing Design System
        ↓
Extend
        ↓
New Experience
```

---

# 39. Taxonomy UI Integration

The UI should directly consume the canonical taxonomy model.

Navigation:

```text
Domain
  ↓
Category
```

Content classification:

```text
Primary Category
Secondary Categories
Topics
```

Topic discovery:

```text
Topic
  ↓
Relationships
  ↓
Content
```

The UI must never use category IDs as topic relationships.

This preserves the architecture decision that navigation taxonomy and knowledge graph are independent.

---

# 40. Admin UI

The public portal should remain simple.

The Admin UI can be more information-dense.

Recommended:

```text
Admin
├── Dashboard
├── Content
├── Taxonomy
│   ├── Domains
│   ├── Categories
│   ├── Topics
│   ├── Aliases
│   └── Relationships
├── Users
├── Reviews
└── Settings
```

---

# 41. Content Editor

Classification section:

```text
Classification

Primary Category
[ Cybersecurity > Identity & Access ]

Secondary Categories
[ Software Engineering > Backend & APIs ]

Topics
[ OAuth 2.0 ] [ Go ] [ GCP ] [ OIDC ]

+ Add Topic
```

Topic selection must use canonical autocomplete.

Example:

```text
OAuth

OAuth 2.0
OAuth 1.0
OpenID Connect
```

If the entered term is ambiguous, the UI should ask the editor to select the canonical topic rather than silently creating a new topic.

---

# 42. System vs Custom Taxonomy

Admin users should see:

```text
Cybersecurity
SYSTEM DEFAULT

Identity & Access
SYSTEM DEFAULT

My Security Category
CUSTOM
```

System-default records should have a subtle indicator, not a large badge.

---

# 43. Mobile Navigation

Mobile should use a compact header:

```text
☰  GeekGully                         🔍
```

Navigation drawer:

```text
Home
Explore
Learn
Topics
Courses
Learning Paths

────────────

My Learning
Bookmarks
History

────────────

Profile
Settings
```

Do not put every category into the main mobile menu.

---

# 44. Footer

Keep the footer simple.

Suggested:

```text
GeekGully

Learn smarter. Grow faster.

Explore
Learn
Topics
Courses
Learning Paths

About
Privacy
Terms
Contact

© GeekGully
```

Do not create a massive multi-column footer.

---

# 45. Performance

The redesign should not significantly increase page weight.

Requirements:

- lazy-load non-critical images
- responsive images
- avoid unnecessary JavaScript
- reuse cached content
- skeleton loading
- paginate large result sets
- defer non-critical sections
- cache anonymous recommendation/candidate results where supported

Recommendation caching follows the backend architecture already defined.

---

# 46. SEO

Public pages should have:

- meaningful page titles
- canonical URLs
- semantic headings
- metadata
- Open Graph metadata
- structured data where appropriate
- crawlable topic/category URLs

Suggested URL model:

```text
/explore
/explore/cybersecurity
/explore/cybersecurity/identity-access

/topics/oauth-2
/topics/openid-connect

/articles/implementing-oauth-2-with-go

/courses/oauth-2-fundamentals

/learning-paths/secure-backend-developer
```

Do not expose database IDs in public URLs when stable slugs are available.

---

# 47. URL and Navigation Semantics

The URL hierarchy should mirror the user mental model.

Navigation:

```text
/explore/cybersecurity/identity-access
```

Knowledge:

```text
/topics/oauth-2
```

Content:

```text
/articles/...
```

Learning:

```text
/learning-paths/...
```

These should remain separate.

---

# 48. Recommended First Implementation

Do not implement every screen simultaneously.

## Sprint 1

Implement:

```text
Global Header
Home
Explore
Domain/Category
Article
```

These establish the core experience.

## Sprint 2

Implement:

```text
Topics
Search
Recommendations
```

## Sprint 3

Implement:

```text
Learning Paths
My Learning
Course experience
```

## Sprint 4

Implement:

```text
Admin Taxonomy
Content classification
Topic management
```

---

# 49. Frontend Agent Instructions

The frontend implementation agent must:

1. Inspect the current GeekGully frontend before modifying anything.
2. Identify existing theme/color/logo tokens.
3. Preserve them exactly.
4. Reuse existing components where possible.
5. Build reusable components for new UX.
6. Implement responsive layouts.
7. Implement accessibility.
8. Avoid visual clutter.
9. Keep typography highly readable.
10. Avoid introducing a second design system.
11. Use the canonical taxonomy APIs.
12. Use the canonical topic APIs.
13. Use recommendation APIs rather than implementing recommendation logic in React.
14. Keep loading/error/empty states consistent.
15. Write component and page tests.

---

# 50. Visual Acceptance Criteria

The UI should pass this subjective test:

### First impression

Within 3 seconds the user understands:

```text
This is a technical learning platform.
```

### Home

Within 5 seconds the user can find:

```text
What to learn
Where to browse
What to continue
What is recommended
```

### Article

Within 3 seconds the user understands:

```text
Title
Difficulty
Reading time
Category
Topics
```

### Topic

Within 5 seconds the user understands:

```text
What this topic is
What to learn
What relates to it
```

### Learning Path

Within 5 seconds the user understands:

```text
What skill this develops
How long it takes
What the steps are
Where they currently are
```

---

# 51. Visual Quality Gate

Reject implementation if it results in:

- crowded cards
- excessive badges
- inconsistent icon styles
- excessive colors
- oversized hero sections
- poor article readability
- too many competing CTAs
- inconsistent spacing
- excessive borders
- excessive shadows
- unnecessary animations
- duplicated navigation
- inconsistent component behavior

The goal is:

```text
Simple
   +
Readable
   +
Useful
   +
Discoverable
   +
Personal
```

not:

```text
More UI
   +
More cards
   +
More colors
   +
More features
```

---

# 52. Final Target Experience

The final reader experience should conceptually be:

```text
                         GeekGully

             What do you want to learn?
                   [ Search ]

                         ↓

               Continue Learning

                         ↓

                Recommended for You

                         ↓

                  Explore by Domain

             ┌──────┬──────┬──────┬──────┐
             │Code  │Cloud │Cyber │Data  │
             └──────┴──────┴──────┴──────┘

                         ↓

                   Popular Topics

                         ↓

                   Learning Paths

                         ↓

                     New & Updated
```

The user should feel that GeekGully understands:

```text
What I am interested in
What I have already learned
What I should learn next
What concepts are related
Where the content belongs
```

while the UI remains visually simple.

---

# 53. Architecture Alignment

The UI must preserve these conceptual boundaries:

```text
Navigation
    Domain
       ↓
    Category


Knowledge
    Topic
       ↓
    Relationship


Learning
    Learning Path
       ↓
    Progress


Personalization
    User Context
       ↓
    Recommendation
```

The UI combines these experiences for the user, but the backend models remain independent.

This is critical to preserving the long-term AI-native architecture.

---

# 54. Definition of Done

The UI redesign is complete when:

- Existing GeekGully logo is unchanged.
- Existing GeekGully color theme is unchanged.
- Existing brand identity remains intact.
- Home page has a clean learning-oriented layout.
- Explore uses domain/category navigation.
- Topics are separate from categories.
- Article experience is optimized for reading.
- Recommendations are integrated.
- Search supports multiple content types.
- Learning paths are represented.
- My Learning is represented.
- Admin taxonomy UI exists.
- Content editor supports category/topic classification.
- Responsive behavior is implemented.
- Accessibility is implemented.
- Existing backend APIs are reused where appropriate.
- No recommendation logic is embedded in frontend code.
- No duplicate taxonomy model is created.
- Component tests exist.
- Page-level tests exist.
- Existing functionality remains backward compatible.

---

# 55. Core Design Principle

**Do not redesign GeekGully's identity. Redesign how the existing identity is used to create a better learning experience.**

The desired result is:

```text
Existing GeekGully Brand
          +
Clean Information Architecture
          +
Readable Content Experience
          +
Knowledge-driven Discovery
          +
Personalized Recommendations
          +
Learning Progress
          =
Modern GeekGully Learning Platform
```
# GG-CMS Bulk Import Guide

This guide details how to bulk import Articles and Courses into GG-CMS using **Markdown (`.md`)**, **JSON (`.json`)**, and **CSV (`.csv`)** formats.

---

## 1. Overview & Quick Start

GG-CMS provides a built-in Bulk Import tool that allows editors and content managers to create multiple articles and structured courses as `DRAFT` items in one operation.

### How to Access the Bulk Import Interface
1. Log in to the GG-CMS Admin / Content Dashboard.
2. Click **Bulk Import** in the sidebar navigation (or go directly to the `/import` route).
3. Choose your preferred input method:
   - **Upload files**: Drag and drop one or more `.md`, `.json`, or `.csv` files.
   - **Paste content**: Paste raw Markdown, JSON, or CSV directly into the interactive text editor.
4. Review the parsed content in the **Preview Table**.
5. Select the items you wish to import and click **Import Selected**.

---

## 2. Markdown (`.md`) Specification

Markdown is the recommended format for importing both articles and structured courses.

### Article Markdown Format

For standard articles, include YAML frontmatter followed by the article content body.

#### Frontmatter Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `title` | String | No* | Article title (*falls back to `# Heading 1` or filename if omitted). |
| `type` | String | **Yes** | Set to `ARTICLE`. |
| `category` / `categorySlug` | String | No | Target category slug (e.g. `backend`, `frontend`). |
| `description` | String | No | Short summary or meta description. |
| `articleType` | String | No | Article type variant (`standard`, `tutorial`, `deep_dive`, `guide`). |
| `tags` | Array | No | Array of tags, e.g. `[go, api, backend]`. |

#### Example Article (`article-example.md`)
```markdown
---
title: "Building Microservices with Go"
type: ARTICLE
category: backend
description: "A complete guide to designing lightweight microservices in Go."
articleType: tutorial
tags: [go, microservices, backend]
---

# Building Microservices with Go

In this tutorial, we will explore how to build scalable microservices using Go and standard libraries.

## Prerequisites
- Go 1.22+ installed
- Basic understanding of REST APIs

## Step 1: Project Setup
Create a new directory and initialize a module...
```

---

### Course Markdown Format

To import a multi-section, multi-lesson Course, set `type: COURSE` in the frontmatter and use specific section/lesson heading conventions.

#### Course Heading Syntax Rules
- **Course Overview**: Any text written before the first `## Section:` heading becomes the main course overview/description body.
- **Section Heading**: Must start with `## Section: <Section Title>`.
- **Lesson Heading**: Must start with `### Lesson: <Lesson Title>`.
- **Lesson Body**: Any content directly beneath a `### Lesson:` heading until the next heading becomes that lesson's content.

#### Example Course (`course-example.md`)
```markdown
---
title: "Complete Go & Cloud Architecture"
type: COURSE
category: backend
description: "Learn Go language fundamentals, concurency, and cloud deployment."
courseType: STANDARD
tags: [go, cloud, backend]
---

Welcome to the Complete Go & Cloud Architecture course. This overview introduces the learning path and prerequisites.

## Section: Getting Started

### Lesson: Introduction to Go
In this lesson, we cover the history, design philosophy, and core syntax of the Go language.

### Lesson: Workspace & Tooling Setup
Learn how to configure your Go development environment, environment variables, and VS Code.

## Section: Concurrency Patterns

### Lesson: Goroutines and Channels
Goroutines enable lightweight concurrent execution in Go. Here is how channels facilitate safe communication...

### Lesson: Worker Pool Pattern
Implement an efficient worker pool pattern to handle heavy background workloads.
```

---

## 3. JSON (`.json`) Specification

JSON supports single content objects or arrays of items for programmatic ingestion.

### Article JSON Example (`articles.json`)
```json
[
  {
    "type": "ARTICLE",
    "title": "Understanding Event-Driven Architecture",
    "categorySlug": "architecture",
    "description": "An introduction to events, message queues, and async processing.",
    "articleType": "standard",
    "tags": ["architecture", "eda", "kafka"],
    "body": "# Event-Driven Architecture\n\nEvent-driven architectures decouple services..."
  }
]
```

### Course JSON Example (`course.json`)
```json
[
  {
    "type": "COURSE",
    "title": "Mastering PostgreSQL",
    "categorySlug": "database",
    "description": "Deep dive into query optimization, indexing, and administration.",
    "courseType": "STANDARD",
    "tags": ["postgres", "sql", "database"],
    "body": "Course overview content explaining target audience and outcomes.",
    "sections": [
      {
        "title": "Indexing Deep Dive",
        "order": 0,
        "lessons": [
          {
            "title": "B-Tree vs GIN Indexes",
            "type": "text",
            "duration": 15,
            "order": 0,
            "body": "Detailed explanation of B-Tree indexing mechanisms..."
          },
          {
            "title": "Analyzing Execution Plans",
            "type": "text",
            "duration": 20,
            "order": 1,
            "body": "Using EXPLAIN ANALYZE to identify performance bottlenecks..."
          }
        ]
      }
    ]
  }
]
```

---

## 4. CSV (`.csv`) Specification

CSV is suitable for flat article imports or creating course shells.

> [!NOTE]
> CSV imports create empty course shells. To import full course section/lesson hierarchies, use Markdown or JSON.

### CSV Column Reference
- `type` (`ARTICLE` or `COURSE`)
- `title` (Required)
- `categorySlug` / `category`
- `description`
- `articleType`
- `courseType`
- `tags` (Semicolon-separated values, e.g. `go;backend;api`)
- `body`

### CSV Example (`import-data.csv`)
```csv
type,title,categorySlug,description,articleType,tags,body
ARTICLE,REST API Best Practices,backend,Design clean RESTful services,standard,rest;api;go,"# REST API Best Practices..."
COURSE,Docker & Kubernetes Fundamentals,devops,Container orchestration course,STANDARD,docker;k8s,"Course overview text..."
```

---

## 5. Validation & Import Flow

When content is uploaded or pasted:

1. **Parser Validation**:
   - Title must not be empty.
   - Type must be `ARTICLE`, `COURSE`, or `VIDEO`.
   - Course sections and lessons must contain valid titles.
2. **Interactive Preview**:
   - Parsed items are displayed in the preview table.
   - You can review title, type, category, and expand item details to see sections/lessons.
3. **Confirmation & Draft Creation**:
   - Selecting items and clicking **Import** sends the payload to `/api/import/confirm`.
   - Items are stored in the database with status `DRAFT`.
   - Tasks are automatically assigned to the importing user for review and publishing workflow.

---

## 6. Technical Architecture & Endpoints

For developers integrating third-party tools or automated content generation (e.g. AI Content Factory):

| Endpoint | Auth | Purpose |
| :--- | :--- | :--- |
| `POST /api/import/preview` | JWT User Session | Parses uploaded `.md`, `.json`, or `.csv` files and returns a preview tree without mutating database. |
| `POST /api/import/confirm` | JWT User Session | Ingests validated preview items, creating entities, sections, lessons, and owner tasks. |
| `POST /api/import/ingest` | `X-Factory-Sync-Secret` Header | Machine-to-machine sync endpoint for automated generators (e.g. AI Content Factory). |

### Key Source Files
- **Frontend Component**: [BulkImport.tsx](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/frontend/react-ui/src/pages/BulkImport.tsx)
- **Backend Import Handler**: [import_handler.go](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/internal/interfaces/http/handler/import_handler.go)
- **Parser Engine**: [parser.go](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms/backend/go-cms/internal/application/importer/parser.go)

# GeekGully Content Catalog & Backend Integration Blueprint

**Document Type:** Subject Matter Expert (SME) Blueprint & System Specification  
**Status:** APPROVED  
**Governing Document:** [TAXONOMY_ARCHITECTURE_DECISION.md](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/docs/TAXONOMY_ARCHITECTURE_DECISION.md)  
**Target Ingestion Engine:** `gg-cms` Go Importer (`importer.Parse`) & FastAPI `content-factory`

---

## 1. Executive Summary

This document specifies the **Content Writing Architecture**, **Metadata Schemas**, **Multi-Agent Authoring Workflow**, and **Backend Import Integration Contracts** for GeekGully. All educational assets generated within `content/` follow strict structural and semantic guidelines so they seamlessly ingest into `gg-cms` PostgreSQL & MongoDB storage layers, auto-tag into the Knowledge Graph, and feed the `personalization.Service` recommendation engine.

---

## 2. Multi-Agent Authoring & Review Workflow

Content generation in GeekGully is driven by a 4-Agent Pipeline operating autonomously or semi-autonomously:

```text
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Planner Agent  │ ──► │  Researcher Agent │ ──► │   Writer Agent  │ ──► │  Reviewer Agent  │
└─────────────────┘     └───────────────────┘     └─────────────────┘     └──────────────────┘
  • Identify Gaps         • Code Specs & API        • Educative Format      • Frontmatter Schema
  • Syllabus Design       • Best Practices          • Code & Diagrams       • Technical Accuracy
  • Target Topics         • Diagram Blueprints      • Metadata Tagging      • Import Readiness
```

### Agent Roles & Responsibilities

1. **Planner Agent**:
   - Analyzes category gaps and topic coverage requirements.
   - Defines target `categorySlug`, `articleType`, `title`, and primary/secondary topics.
   - Formulates course syllabus and lesson sequence for `COURSE` content types.

2. **Researcher Agent**:
   - Gathers production-grade code snippets, API contracts, security standards, and architecture diagrams.
   - Ensures technical accuracy (e.g. Go 1.22+ routing, OAuth 2.1 RFCs, OWASP Top 10 2025 updates).

3. **Writer Agent**:
   - Generates Educative-style Markdown articles with clean section headers (`##`, `###`), Mermaid diagrams, code fences, and key takeaways.
   - Embeds YAML frontmatter adhering to `importer.Parse` rules.

4. **Reviewer Agent**:
   - Validates frontmatter parsing, tag slug correctness, and markdown readability.
   - Emits approval status for `import_manifest.json`.

---

## 3. Frontmatter & Data Schema Specification

Every Markdown document in `content/` MUST include YAML frontmatter matching the schema below:

```yaml
---
title: "Securing Go Microservices with OAuth 2.0 and JWT"
description: "Learn how to implement OAuth 2.0 authorization server integration, JWT verification, and middleware protection in Go microservices."
type: "ARTICLE"
categorySlug: "identity-and-access"
articleType: "GUIDE"
tags:
  - "oauth-2"
  - "jwt"
  - "go"
  - "microservices"
---
```

### Supported Metadata Fields

| Field Name | Type | Required | Values / Constraints |
| :--- | :--- | :--- | :--- |
| `title` | string | **Yes** | 10 to 120 chars, title-case, descriptive |
| `description` | string | **Yes** | 30 to 250 chars, clear summary of learning outcome |
| `type` | string | **Yes** | `ARTICLE` or `COURSE` |
| `categorySlug` | string | **Yes** | Must match an existing category slug (e.g., `identity-and-access`, `generative-ai`) |
| `articleType` | string | **Yes** | `CONCEPT`, `TUTORIAL`, `GUIDE`, `REFERENCE`, `CHEAT_SHEET` |
| `tags` | string[] | **Yes** | Array of topic slugs matching topic registry |

---

## 4. Backend Import Contract Integration

When content is imported via `/api/import/preview` and `/api/import/confirm`:

1. **Parser Execution (`importer.Parse`)**:
   - Reads Markdown frontmatter (`--- ... ---`).
   - Extracts `title`, `description`, `categorySlug`, `tags`, and `body`.
   - Resolves `categorySlug` against existing DB categories.

2. **Canonical Topic Resolution**:
   - Each tag in `tags` is checked against `topics` and `topic_aliases`.
   - Hits match `MATCH` (exact hit) or `SUGGESTION` (needs review) per §4 of `TAXONOMY_ARCHITECTURE_DECISION.md`.

3. **PostgreSQL Injection**:
   - Inserts row into `articles` or `courses` in state `DRAFT`.
   - Attaches join records in `content_topics` with `(content_id, content_type, topic_id)`.

---

## 5. Catalog Taxonomy Tree & Target Wave 1 Inventory

### Domain 1: Software Engineering (`software-engineering/`)
- `programming-languages/`: Go Concurrency Patterns, Python AsyncIO Deep Dive.
- `backend-and-apis/`: gRPC vs REST Microservices Architecture, Event-Driven Architectures with Kafka.
- `software-design/`: Domain-Driven Design (DDD) in Practice, Clean Architecture in Go.

### Domain 2: Cloud & Infrastructure (`cloud-and-infrastructure/`)
- `cloud-platforms/`: GCP Cloud Run Production Deployment, AWS Multi-Region VPC Architecture.
- `containers-and-orchestration/`: Kubernetes Zero-Downtime Deployment Strategies, Multi-Stage Docker Builds.
- `infrastructure-as-code/`: Terraform Modular Architecture & State Management.

### Domain 3: Cybersecurity (`cybersecurity/`)
- `identity-and-access/`: OAuth 2.0 and OIDC Implementation Guide, Passkeys & WebAuthn Deep Dive.
- `pki-and-cryptography/`: TLS 1.3 & X.509 Public Key Infrastructure, Mutual TLS (mTLS) Setup.
- `appsec-and-threats/`: OWASP Top 10 LLM Security & Mitigation, Zero Trust Architecture Blueprint.

### Domain 4: Data (`data/`)
- `databases/`: PostgreSQL Indexing & Query Optimization, MongoDB Sharding & Aggregation.
- `data-engineering/`: Data Modeling for Event-Driven Microservices.

### Domain 5: AI & Machine Learning (`ai-and-machine-learning/`)
- `machine-learning-foundations/`: Machine Learning Model Evaluation & Drift Detection.
- `generative-ai/`: Enterprise RAG Architecture with Vector Databases, Prompt Engineering Patterns.

---

## 6. Execution & Quality Standards

- **Educative Reader Compatibility**: Content must render clearly in `EducativeArticleReader` (`/components/articles/EducativeArticleReader.tsx`).
- **Syntax Highlighting**: All code blocks must declare language identifiers (e.g. ````go`, ````python`, ````yaml`, ````sql`, ````bash`).
- **No Placeholders**: Articles must contain complete, functional code examples rather than stub comments.

# AI Learning Content Factory — System Design & Architecture Proposition

**Document Version:** 2.0  
**Status:** PROPOSED ARCHITECTURAL BASELINE  
**Target Runtime:** Go (Golang) — Native Compiled Monolith  
**Cost Target:** Completely Free Tier Compatible ($0.00/month)  
**Primary Engine:** Google Gemini Batch API + LangChainGo  
**Task Management:** River Task Queue (PostgreSQL-backed)  

---

## 1. Executive Summary & Core Proposition

This document presents the architectural proposal for the **AI Learning Content Factory (ai-content-factory)**, a state-of-the-art, knowledge-driven content production and intelligence engine designed to sit upstream of your existing learning management platform (such as GG-CMS).

### 1.1 The "Ultra-Lightweight" Philosophy
Traditional AI agent architectures are built on Python using LangGraph, Celery/Redis, and heavy scraping libraries, resulting in:
* Bloated Docker images.
* Severe RAM consumption (over 1 GB idle), requiring expensive dedicated cloud instances.
* High infrastructure costs (requiring Redis instances, vector databases, and heavy orchestration nodes).

**Our Proposition:** Re-engineer the entire system as a **Go-native Modular Monolith**. By utilizing Go's compiled execution, concurrency primitives, and modern PostgreSQL extensions (like pgvector and River), we deliver the same multi-agent pipeline at:
* A Docker image size of under 20MB.
* RAM consumption of under 30MB under peak load.
* **$0.00/month Infrastructure Costs** by running entirely within the GCP Always Free Tier.

---

## 2. Go-Native Technology Stack Selection

To maintain an ultra-lightweight footprint, we recommend using only high-performance, open-source Go components:

- **HTTP API Layer:** gin-gonic/gin. Lightweight, fast web routing, matching the existing GG-CMS stack.
- **Relational Database:** PostgreSQL 16. The single transactional and metadata database.
- **Vector Engine:** pgvector Extension. Handles semantic RAG search and near-duplicate checks directly in PostgreSQL, eliminating the need for an external Vector DB.
- **Asynchronous Queue:** riverqueue/river. High-performance, PostgreSQL-backed async worker. Eliminates the need for Redis, allowing the background worker pool to run directly on standard Postgres.
- **AI LLM Client:** tmc/langchaingo. Go-native client for Gemini API, providing recursive text splitters, prompt templates, and structured output parsers.
- **Web Crawlers:** gocolly/colly/v2. Super-fast concurrent crawling of documentation, blogs, and portals.
- **Boilerplate Stripper:** go-shiori/go-readability. Go port of Mozilla's readability engine to extract clean, noise-free text blocks from URLs.
- **HTML Parser:** PuerkitoBio/goquery. jQuery-style selector for extracting specific code blocks or tables from crawled pages.
- **Validation Engine:** go-playground/validator/v10. Enforces fast, compile-time tag validation on DTO schemas.

---

## 3. End-to-End System Architecture

The Go binary serves both HTTP requests (from the React Admin Console) and processes background multi-agent workflows.

```text
                           [ React Admin Console ]
                                      ¦
                                      ?
                        [ Go HTTP API Server (Gin) ]
                                      ¦
                     +---------------------------------+
                     ? synchronous                     ? transactional
             [ Ingest Service ]              [ River Queue (Postgres) ]
             - Colly Parser                            ¦
             - go-readability                          ¦ (Job Popped)
                     ¦                                 ?
                     ?                       [ Stateful Agent Step ]
             [ Vector Storage ]              - Custom State Engine
             - pgvector Embeddings           - LangChainGo Gemini
```

---

## 4. Logical Codebase Organization (Clean Architecture)

- **cmd/server/main.go:** Entry point — Database, Migrations, River Worker, Gin Engine.
- **internal/domain/entity:** Pure GORM structs (Source, Opportunity, ContentItem).
- **internal/domain/repository:** Repository interface signatures (ports).
- **internal/application/services:** Business logic (Ingestion, Campaigns, Exports).
- **internal/application/agents:** Go LLM Agents (Strategy, Research, Writer, Quality).
- **internal/infrastructure/persistence:** GORM Postgres + pgvector implementations.
- **internal/infrastructure/queue:** River queue worker register and setup.
- **internal/infrastructure/crawler:** Colly web crawlers & go-readability integrations.
- **internal/infrastructure/storage:** GCS SDK implementation.
- **internal/interfaces/http:** Gin routes, handlers and middleware.


# AI Content Factory V2 — Technical Architecture & LLD Design

**Status:** APPROVED / IMPLEMENTATION REFERENCE  
**Revision:** 2.0 (Knowledge-Driven Autonomous Learning Content Engine)  

---

## 1. Core Architectural Paradigm Shift (V1 ? V2)

The V2 specification elevates the system from a "linear content generation tool" to a **multi-stream, knowledge-reusable Learning Content Operating System (LCOS)**. 

### 1.1 Key Requirement Deltas (Add-Ons & Modifications)

| Requirement Dimension | V1 (Baseline Prompt) | V2 (Implementation Spec) |
|-----------------------|-----------------------|--------------------------|
| **Operational Modes** | Primary manual batch processing of curated keywords. | **Dual-Mode System:** Mode A (User-directed tutorial generation) + **Mode B (Fully Autonomous Discovery and Niche Topic Harvesting)**. |
| **Ingestion Formats** | PDFs, URLs, standard Web-crawling, plain Text. | **Extended Formats:** EPUB, Sitemap extraction, **RSS feeds**, Documentations, **GitHub repositories**, existing Markdown/JSON dumps. |
| **Research Intermediary** | Prompt maps raw chunks directly to the Writer Agent. | **Evidence Pack Pattern:** Strict structured intermediate JSON schema containing facts, claims, controversies, and code examples. Writer cannot draft without an approved Evidence Pack. |
| **Quality Gate** | Fact check + simple word-count checks. | **8-Dimension Audit:** Accuracy, Citation, Source Integrity, Learning Quality, Originality, Readability, SEO, and **GEO (Generative Engine Optimization / AI-Search Readiness)**. |
| **Scale Viability (10k/mo)** | Linear research-to-generation runs (high cost). | **1-to-Many Multiplexing:** 1 Topic Research ? 1 Evidence Pack ? Reusable Knowledge Pack ? Multi-Content Plan ? Multiple Outputs (Article, Quiz, Cheat Sheet, Exercises). Reduces AI cost by **70%–90%**. |
| **Content Strategy** | Campaign-based batch dumps. | **Dual Evergreen/Trending Streams** with freshness-class mappings and automated claims-refresh loop. |

---

## 2. Updated High-Level Design (HLD)

The system is architected as a Python-based Modular Monolith built on **FastAPI** and **LangGraph**, communicating with a React agent console and backed by **PostgreSQL + pgvector** and **GCS**.

```text
                                 [ ADMIN USER ]
                                        ¦
                                        ?
                             [ React Agent Console ]
                                        ¦
                                        ?
                            [ FastAPI API Gateway ]
                                        ¦
                                        ?
                          [ LangGraph Workflow Engine ]
                                        ¦
                  +---------------------+---------------------+
                  ?                     ?                     ?
           [Strategy Agent]     [Opportunity Agent]    [Research Agent]
                  ¦                     ¦                     ¦
                  ?                     ?                     ?
          Project Strategy        Topic Opportunity     Evidence Pack (JSON)
                  ¦                     ¦                     ¦
                  +---------------------+---------------------+
                                        ¦
                                        ?
                            [Learning Architect Agent]
                                        ¦
                                        ?
                             [Content Planner Agent]
                                        ¦
                                        ?
                              [Writer Agent (prose)]
                                        ¦
                                        ?
                         [Quality Gate / Audit Matrix]
                         - Fact, Citation, Integrity
                         - SEO, Readability, Originality
                         - GEO (AI-search readiness)
                                        ¦
                        +-------------------------------+
                        ? PASS                          ? FAIL
                 [Export Engine]                 [Revision Agent]
                  (JSON + MD ZIP)                 (Max 3 iterations)
                        ¦                               ¦
                        ?                               ?
                 [GG-CMS / LMS]                  [Needs Human Review]
```

---

## 3. Modular Monolith Codebase Map (Python / FastAPI)

Based on Section 63 of V2, the local development and deployment code layout maps to:

```text
ai-content-factory/
+-- frontend/                 # React Agent Console SPA (Vite, TS, Tailwind)
+-- backend/                  # FastAPI Application Monolith
¦   +-- api/                  # REST Controllers & DTOs
¦   +-- agents/               # Stateful LangGraph worker modules
¦   ¦   +-- strategy/         # Audience, level, language parser
¦   ¦   +-- opportunity/      # Demand, trend signals, content gap scorer
¦   ¦   +-- research/         # Claim extractor, conflict resolver, Google search
¦   ¦   +-- learning/         # instructional designer, sequencer
¦   ¦   +-- planning/         # outline and example planner
¦   ¦   +-- writing/          # progressive tutorial and explainer drafter
¦   ¦   +-- quality/          # 8-dimensional deterministic/model auditor
¦   +-- ingestion/            # EPUB, PDF, RSS, Crawler, and GitHub extractors
¦   +-- knowledge/            # Chunking, metadata, and pgvector embeddings
¦   +-- retrieval/            # Hybrid vector + keyword search routines
¦   +-- models/               # Configurable ModelProvider abstractions
¦   +-- workflows/            # Stateful graph state transitions
¦   +-- exporters/            # ZIP package packager (JSON ? Markdown)
¦   +-- services/             # Auth, jobs, and cost analytics
+-- prompts/                  # Versioned prompt library (.md templates)
+-- schemas/                  # Shared Pydantic data schemas
+-- ...
```

---

## 4. Key Agent Interfaces & Contracts

### 4.1 Strategy Agent Contract
```python
class ProjectStrategy(BaseModel):
    niche: List[str]
    audience: List[str]
    levels: List[str] # beginner, intermediate, advanced
    language: str = "en"
    country: str = "India"
    content_goals: List[str]
    brand_voice: str
    prohibited_topics: List[str]
```

### 4.2 Research Evidence Pack Contract
The writer must ONLY use claims registered inside this Evidence Pack to eliminate hallucinations.
```python
class EvidenceClaim(BaseModel):
    claim_id: str
    claim_text: str
    evidence_quote: str
    source_id: str
    source_url: str
    confidence_score: float

class EvidencePack(BaseModel):
    topic: str
    claims: List[EvidenceClaim]
    definitions: List[dict]
    code_examples: List[dict]
    limitations: List[str]
    citations: List[dict]
```

### 4.3 Content Item Metadata (JSON) Schema
This is the canonical storage format. Markdown is generated deterministically from this format.
```python
class ContentSection(BaseModel):
    section_id: str
    title: str
    body_markdown: str
    source_claims: List[str] # Claim IDs mapping to the Evidence Pack

class CanonicalContentItem(BaseModel):
    schema_version: str = "2.0"
    content_id: str
    content_type: str # article, tutorial, exercise, quiz
    title: str
    slug: str
    summary: str
    audience: str
    difficulty: str
    objectives: List[str]
    sections: List[ContentSection]
    sources: List[str]
    freshness_class: str # evergreen, technical, fast-moving
    review_after_days: int
    generated_at: str
    metadata: dict
```

---

## 5. Phased Implementation Roadmap
1. **Phase 1 (MVP Baseline):** Ingest PDFs/Web pages ? Extract to pgvector ? Strategy Loader ? Opportunity Selector ? Evidence Pack Crawler ? Learning Planner ? Prose Writer ? Quality Audit ? JSON/MD Export.
2. **Phase 2 (Autonomous Factory):** Integrated Trend signals (Reddit, RSS, GitHub API) ? Autonomous Mode Selector ? Pub/Sub Async Job Worker ? Cost tracking dashboard.
3. **Phase 3 (Continuous Intelligence):** Integrated Learner Analytics feed ? Claims Refresh loop ? Auto-update stale content versions.


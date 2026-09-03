# AI Learning Content Factory

An autonomous/semi-autonomous multi-agent content production platform for educational platforms. Designed to discover high-value topics, ingest research sources, and generate versioned JSON/Markdown learning packages using the Gemini API and LangGraph orchestrator.

## Quickstart (Mock Mode)

```bash
cd ai-learning-content-factory
npm install
docker compose up -d
npm run dev
```

## Structure
- `apps/api/` - Backend Node/TypeScript REST API
- `apps/web/` - React Admin Console
- `apps/worker/` - LangGraph-compatible Asynchronous Workflows
- `packages/` - Modular monolithic shared packages (agents, AI providers, schemas, database, ingestion)
- `infra/` - Deployment templates (Docker, GCP Cloud Run)


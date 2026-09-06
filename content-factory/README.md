# AI Content Factory — Autonomous Content Generation Platform

An autonomous multi-agent content production platform integrated with **GG-CMS**. Discovers high-value topics, ingests web/file/Google Drive sources, and generates versioned learning packages using Gemini 2.0.

> 📘 **User & GCP Deployment Guide**: See [release/gcp/CONTENT-FACTORY-USER-GUIDE.md](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/release/gcp/CONTENT-FACTORY-USER-GUIDE.md)

---

## 🚀 Live Access

- **Public Proxy URL**: [https://geekgully.com/factory](https://geekgully.com/factory)
- **Direct Cloud Run URL**: [https://content-factory-backend-wuisbddlxq-uc.a.run.app](https://content-factory-backend-wuisbddlxq-uc.a.run.app)
- **Master Admin Credentials**: `info@serenyax.com` / `Admin@12345`

---

## ⚙️ Workflow Overview

1. **Access System Settings**: Enter your Gemini API key under **System Settings**. Keys are stored in GCP Secret Manager and displayed as status badges.
2. **Create Project & Add Sources**: Ingest target URLs, local PDFs, or Google Drive folders into a project.
3. **Multi-Agent Generation**:
   - **Planner Agent**: Builds curriculum outlines.
   - **Researcher Agent**: Crawls web & extracts source material.
   - **Writer Agent**: Writes Markdown content with Gemini.
   - **Reviewer Agent**: Audits quality and formatting.
4. **Push to GG-CMS**: Export generated content into GG-CMS as **`DRAFT`** state for final review at [https://geekgully.com/admin](https://geekgully.com/admin).

---

## 🛠️ GCP Deployment

To deploy updates to Cloud Run:

```bash
bash release/gcp/deploy-content-factory.sh
```

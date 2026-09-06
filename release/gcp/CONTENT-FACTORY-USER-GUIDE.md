# Content Factory — User & Deployment Guide

> **Live Service**: [https://geekgully.com/factory](https://geekgully.com/factory)  
> **Cloud Run Direct**: [https://content-factory-backend-wuisbddlxq-uc.a.run.app](https://content-factory-backend-wuisbddlxq-uc.a.run.app)  
> **Master Admin Login**: `info@serenyax.com` / `Admin@12345`  

---

## 🔑 1. How to Access & Log In

1. Navigate to **[https://geekgully.com/factory](https://geekgully.com/factory)**.
2. Sign in with your **GG-CMS Master Admin** credentials (`info@serenyax.com`).
3. Single Sign-On (SSO) JWT session grants access across both GG-CMS Admin and Content Factory.

---

## ⚙️ 2. System Settings & Gemini Key Setup

1. Click **System Settings** in the left sidebar.
2. Under **LLM & Models**, enter your **Gemini API key** (obtainable free from [Google AI Studio](https://aistudio.google.com)).
3. Click **Save system settings**.
4. The system validates the key and displays a green **Key Configured** badge. Raw key strings are never exposed over HTTP GET endpoints.

---

## 📝 3. End-to-End Content Generation Workflow

### Step 1: Create a Project
- Navigate to **Projects** → Click **+ New Project**.
- Enter project title, target audience, and content domain.

### Step 2: Ingest Sources & Add Topics
- **Web & File Sources**: Add target documentation URLs or upload PDF/DOCX source files.
- **Google Drive**: Configure shared Drive folder URL in **System Settings** → **Google Drive Integration**.
- **Topics**: Click **+ Add Topic** or **Bulk Add Topics**.

### Step 3: Run Multi-Agent Generation
- Click **Generate** on any topic.
- The automated pipeline runs:
  - 🧠 **Planner**: Designs structured curriculum outline.
  - 🔎 **Researcher**: Extracts facts from ingested sources & web search.
  - ✍️ **Writer**: Generates comprehensive Markdown content using Gemini 2.0.
  - 🔬 **Reviewer**: Evaluates quality, accuracy, and formatting.

### Step 4: Export & Sync to GG-CMS
- Open any completed topic under **Content Items**.
- Click **Export / Push to GG-CMS**.
- The item is pushed via `X-Factory-Sync-Secret` directly into GG-CMS in **`DRAFT`** state.
- Review and publish at **[https://geekgully.com/admin](https://geekgully.com/admin)**.

---

## 🛠️ 4. GCP Redeployment Command

To redeploy the service after code updates:

```bash
bash release/gcp/deploy-content-factory.sh
```

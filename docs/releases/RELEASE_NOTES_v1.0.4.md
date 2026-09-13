# Release Notes: GG-CMS System & AI Content Factory (v1.0.4)

**Release Date:** September 12, 2026  
**Build Target:** Production (`prod`) & Test (`test`)  
**Deployment Status:** ✅ **DEPLOYED & ACTIVE**  
**GCP Account Authenticated:** `info@serenyax.com` (Project: `ggcms-free-tier-vivek`)

---

## 📦 Package Release Versions

| Component | Target Version | Package Path | Build Artifact Status |
| :--- | :--- | :--- | :--- |
| **Content Factory Release** | `v1.0.2` | `content-factory/ga/prod/latest` | ✅ Built & Packaged |
| **Content Factory Backend** | `v1.0.5` | `content-factory/backend` | ✅ Deployed (`cloudbuild.yaml`) |
| **Content Factory Frontend** | `v1.0.6` | `content-factory/frontend` | ✅ Deployed (`dist/assets/index-BjGN3fsi.js`) |

---

## 🛠️ Key Technical Enhancements & Bug Fixes

### 1. Universal Interactive Field Info (`i`) Buttons & Guides
- **Field Info Modal**: Created `FieldInfoModal.tsx` providing popups explaining field purpose, AI multi-agent usage, and sample inputs.
- **Form Primitives**: Enhanced `Field` in `ui.tsx` to render interactive `What's this?` info buttons alongside labels when `info` props are passed.
- **Metadata Dictionary**: Created `fieldInfo.ts` with detailed field guides across Projects, Config, Strategy, Sources, Portals, Opportunities, Generate, Knowledge Library, and System Settings.

### 2. Strategy Page Restoration & High-Accuracy Presets
- **Resolved Blank Page Bug**: Updated `StrategyTab` in `ProjectDetail.tsx` to ensure data structures are initialized upon loading.
- **Quality Protocol Presets**: Pre-populated recommended strategy guidelines for writing validated, reviewed, and correct content (fact-checked goals, zero-hallucination guardrails, peer-reviewed/official sources).
- **One-Click Quick Action**: Added an **"Apply Recommended Guidelines"** button to apply high-accuracy quality guardrails with one click.

### 3. Persistent Data Retention Engine (Google Cloud Storage)
- **Persistent Bucket Provisioned**: Created GCS bucket `gs://ggcms-free-tier-vivek-content-factory-data` and granted `roles/storage.objectAdmin` permissions to `content-factory-sa@ggcms-free-tier-vivek.iam.gserviceaccount.com`.
- **Automatic Cloud Sync**: Updated `file_store.py` so every atomic write (`save_project`, `save_project_strategy`, `save_source`, `save_opportunity`, `save_job`, `save_content_item`) uploads updated YAML files to `gs://<bucket_name>/data/...`.
- **Startup Data Restoration**: Added `restore_data_from_gcs()` to `api/main.py` `@app.on_event("startup")` so whenever a new Cloud Run container revision boots up or scales up, all project files are restored from GCS bucket storage.

### 4. Gemini Production Model Migration & Error Handling
- **Official Production Models**: Migrated models to official Google Gemini production models: `gemini-1.5-flash` (Planner, Researcher, Reviewer) and `gemini-1.5-pro` (Writer).
- **GCP Secret Binding**: Mounted Secret Manager secret `factory-gemini-api-key:latest` containing valid Gemini API key credentials.
- **Resilient Error Handling**: Wrapped `discover_opportunities` in `opportunities.py` to return friendly HTTP 400 messages directing users to System Settings if an API key is missing or invalid.

---

## ⚙️ Environment Variables & Deployment Specification

| Variable / Secret | Value / Source | Scope & Usage |
| :--- | :--- | :--- |
| `GCS_BUCKET` | `ggcms-free-tier-vivek-content-factory-data` | Environment variable for persistent data sync & restoration across deployments. |
| `GEMINI_MODEL_PLANNER` | `gemini-1.5-flash` | Environment variable (overridable via System Settings UI). |
| `GEMINI_MODEL_RESEARCHER` | `gemini-1.5-flash` | Environment variable (overridable via System Settings UI). |
| `GEMINI_MODEL_WRITER` | `gemini-1.5-pro` | Environment variable (overridable via System Settings UI). |
| `GEMINI_MODEL_REVIEWER` | `gemini-1.5-flash` | Environment variable (overridable via System Settings UI). |
| `DATA_DIR` | `/app/data` | Container data directory mapped to GCS storage engine. |
| `GEMINI_API_KEY` | `factory-gemini-api-key:latest` | GCP Secret Manager binding for Gemini API access. |
| `FACTORY_SYNC_SECRET` | `factory-sync-secret:latest` | GCP Secret Manager binding for machine-to-machine sync. |
| `JWT_SECRET` | `gg-cms-jwt-secret:latest` | GCP Secret Manager binding for user session validation. |

# Release Notes: GG-CMS System & AI Content Factory (v1.0.5)

**Release Date:** September 13, 2026  
**Build Target:** Production (`prod`) & Test (`test`)  
**Deployment Status:** ✅ **DEPLOYED & ACTIVE**  
**GCP Account Authenticated:** `info@serenyax.com` (Project: `ggcms-free-tier-vivek`)

---

## 📦 Package Release Versions

| Component | Target Version | Package Path | Build / Deployment Status |
| :--- | :--- | :--- | :--- |
| **Go Backend Service** | `v1.2.11` | `gg-cms/backend/go-cms` | ✅ Deployed (`gg-cms-backend-00052-54k`) |
| **React UI Frontend** | `v1.0.9` | `gg-cms/frontend/react-ui` | ✅ Deployed & Served Live |
| **DB Migrations & Schemas** | `v1.0.7` | `gg-cms/backend/go-cms/migrations` | ✅ Deployed on DB VM (`gg-cms-db`) |
| **Content Factory Service** | `v1.0.5` | `content-factory` | ✅ Deployed (`https://geekgully.com/factory`) |
| **GG-CMS System Version** | `v1.0.5` | `release/ga/prod/latest` | ✅ Release GA Packaged |

---

## 🛠️ Key Technical Enhancements & Bug Fixes

### 1. Multi-Format Batch Upload & Archive Ingest Engine
- **ZIP Archive Support**: Automated recursive unpacking of `.zip` archives containing `.md`, `.json`, `.csv`, `.html`, and `.htm` files (safely filtering system files like `__MACOSX`, `.DS_Store`, and `._*`).
- **HTML Content & Metadata Parser**: Added HTML file parser extracting metadata (`<title>`, `<h1>`, `<meta name="...">`) and body content.
- **Strict Format Error Prefixing**: All validation errors (unsupported extensions, malformed JSON/CSV, missing titles) are explicitly prefixed with `Wrong format:` for clarity.
- **Panic Protection**: Guarded parser against `nil`-pointer dereference panics when handling orphan course lessons (`### Lesson:` headings occurring before any `## Section:`).

### 2. On-Page Interactive Content View Preview UI
- **Formatted Preview Tabs**: Created interactive content preview cards rendering styled titles, category/format/type/tag badges, rendered Markdown/HTML body previews, and raw payload error cards.
- **Course Structure View**: Rendered nested section tree structures displaying section titles, order, and lesson types (`text`, `video`, `quiz`).
- **Expand All Previews Button**: Added a header quick-action toggle allowing administrators to expand/collapse all uploaded previews simultaneously.

### 3. Automated GCP Deployment & Permission Hardening
- **PostgreSQL Cert Ownership Automation**: Added automated `chown 70:70` and `chmod 600` for `/etc/postgresql/certs/server.key` in `deploy.sh` so host user permission resets never crash database containers on boot.
- **Secret Manager IAM Auto-Binding**: Integrated automated `roles/secretmanager.secretAccessor` policy bindings for `factory-sync-secret` across both `deploy-prod.sh` and `deploy-test.sh`.
- **Certificate Retention Optimization**: Skips unnecessary certificate re-uploads if certs are already present on the database VM.

---

## ⚙️ Deployment & Service Endpoints

| Service / Component | Live URL / Target | Status |
| :--- | :--- | :--- |
| **GG-CMS Backend API** | `https://gg-cms-backend-274495931884.us-central1.run.app` | ✅ 100% Traffic Serving |
| **Main Web Portal** | `https://geekgully.com` | ✅ Live |
| **AI Content Factory** | `https://geekgully.com/factory` | ✅ Live |
| **Database VM** | `gg-cms-db` (`10.128.0.2` in `us-central1-a`) | ✅ Postgres & Mongo Healthy |

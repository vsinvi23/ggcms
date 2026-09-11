# Release Notes: GG-CMS (v1.0.3) & AI Content Factory (v1.0.2)

**Release Date:** September 11, 2026  
**Build Target:** Production (`prod`) & Test (`test`)  
**Deployment Status:** ✅ **READY TO DEPLOY**  
**GCP Account Authenticated:** `info@serenyax.com` (Project: `ggcms-free-tier-vivek`)

---

## 📦 Package Release Versions

| Component | Target Version | Package Path | Build Artifact Status |
| :--- | :--- | :--- | :--- |
| **GG-CMS System Release** | `v1.0.3` | `release/ga/prod/latest` | ✅ Built & Packaged |
| **GG-CMS Go Backend** | `v1.2.6` | `gg-cms/backend/go-cms` | ✅ Verified (`go test ./internal/...`) |
| **GG-CMS React UI SPA** | `v1.0.6` | `gg-cms/frontend/react-ui` | ✅ Built (`dist/assets/index-7hvlTsNT.js`) |
| **GG-CMS DB Migrations** | `v1.0.4` | `release/ga/prod/latest/db/migrations` | ✅ Bundled |
| **Content Factory Release** | `v1.0.2` | `content-factory/ga/prod/latest` | ✅ Built & Packaged |
| **Content Factory Backend** | `v1.0.3` | `content-factory/backend` | ✅ Verified (`123/123 pytest passed`) |
| **Content Factory Frontend** | `v1.0.3` | `content-factory/frontend` | ✅ Built (`dist/assets/index-CxSBE7KW.js`) |

---

## 🛠️ Audit & Issue Fixes Verification

### 1. Content Factory RBAC & Ingest Authentication
- **Verified Ingest Security**: Machine-to-machine sync endpoint (`POST /api/import/ingest`) is secured via `X-Factory-Sync-Secret` header validation.
- **Admin Attribution**: Factory ingest automatically resolves to system user email (`systemUserEmail` / masteradmin account ID) to maintain strict database foreign key integrity (`created_by_id`).
- **Admin Navigation**: Verified access controls and navigation shortcuts for masteradmin and administrator role tiers.

### 2. Gemini API & Global App Settings
- Verified single-row configuration model (`AppSetting`) in Content Factory supporting runtime Gemini API Key overrides, model tier selections (Planner, Researcher, Writer, Reviewer), and search/embedding keys (`Tavily`, `Pexels`).

### 3. IDOR & Endpoint Protection
- Confirmed user-scoped authorization and JWT middleware checks across content management, tasks, enrollments, and user profile endpoints in GG-CMS.

---

## 🌐 Multi-Domain & Multi-Category Content Generation Readiness

### Content Creation Capabilities
- **Multi-Domain Support**:
  - Content Factory structures domain projects via `Project` objects carrying specific `niche`, `audience`, `language`, `levels`, `content_types`, and `brand_voice`.
  - Autonomous topic discovery (`OpportunityAgent` and `portal_scanner`) operates dynamically across diverse niches (Software Development, Artificial Intelligence, Business, Healthcare, Finance, etc.).
- **Category & Topic Resolution**:
  - During content sync, `build_sync_payload` computes taxonomy suggestions.
  - GG-CMS `FactoryImportHandler` executes dynamic lookup and auto-creation (`FindOrCreateByName`) for missing categories and topics, ensuring newly published content lands in the correct domain/category hierarchy automatically.
- **Article & Course Formats**:
  - Supports structured single/multi-section Articles (`ArticleBody`) with markdown content, learning objectives, estimated read time, and reference citations.
  - Supports structured multi-section Courses (`CourseSpecs`) with lesson outlines, quizzes (`QuizSpec`), exercises (`ExerciseSpec`), and provenance records (`ContentGenerationRun`).

---

## 🧪 Build & Test Verification Results

1. **GG-CMS Go Backend**:
   - `go test ./internal/...` completed with **100% PASS** across all domain, application, storage, and HTTP handler packages.
2. **Content Factory Python Backend**:
   - `pytest tests/unit` completed with **100% PASS** (123 out of 123 tests passed in 1.30s).
3. **GG-CMS React UI Frontend**:
   - `npm run build` completed cleanly in 2.4s. Assets written to `gg-cms/backend/go-cms/dist`.
4. **Content Factory Frontend**:
   - `npm run build` completed cleanly in 782ms.
5. **Deployment Delta Check**:
   - `bash release/deploy-prod.sh --check` verified GCP credentials (`info@serenyax.com`), target versions (`v1.0.3`), and deployment readiness.
   - `bash content-factory/deploy-prod.sh --check` verified target version (`v1.0.2`) and deployment readiness.

---

## 🚀 Step-by-Step Deployment Instructions

### Production Deployment (GG-CMS & Content Factory)
To trigger live production deployment:

```bash
# 1. Deploy GG-CMS Production Release
bash release/deploy-prod.sh

# 2. Deploy AI Content Factory Production Service
bash content-factory/deploy-prod.sh
```

### Test / Staging Deployment (Environment Isolated)
To deploy to test/staging environment:

```bash
# 1. Deploy GG-CMS Test Environment
bash release/deploy-test.sh

# 2. Deploy AI Content Factory Test Service
bash content-factory/deploy-test.sh
```

# Production Deployment Script Package (GCP)

This package contains the unified scripts to run automated sanity testing, generate release builds, and deploy **GG-CMS** and **AI Content Factory** to **Google Cloud Platform (GCP)** under strict environment isolation guidelines.

---

## 📁 Package Overview

| Script Path | Purpose |
| :--- | :--- |
| **`release/scripts/deploy-all-prod.sh`** | **Master Production Deployment Script**: Runs test suite, generates GA builds, and deploys both GG-CMS and Content Factory to GCP Cloud Run. |
| **`release/scripts/run-all-tests.sh`** | **Unified Test Runner**: Executes Go unit tests, Python 123 pytest suite, and frontend SPA builds. |
| **`release/deploy-prod.sh`** | GG-CMS Production Delta Deployment script. |
| **`content-factory/deploy-prod.sh`** | AI Content Factory Production Deployment script. |

---

## 🚀 Execution Instructions for GCP Production

### 1. Execute Production Deployment Package
To trigger full automated test verification, GA build generation, and production deployment to GCP:

```bash
# Execute master production deployment script
bash release/scripts/deploy-all-prod.sh --force
```

### 2. Version Bump & Deploy
To bump SemVer patch version and deploy:

```bash
bash release/scripts/deploy-all-prod.sh --bump patch --force
```

### 3. Check Deployment Status (Dry-Run)
To preview version deltas without deploying:

```bash
bash release/scripts/deploy-all-prod.sh --check
```

---

## 🔑 Authentication Notes
- Uses `info@serenyax.com` (Project: `ggcms-free-tier-vivek`, Region: `us-central1`).
- Auto-detects Python 3.11 (`CLOUDSDK_PYTHON`) on local host.
- Supports non-interactive authentication via `GCP_SA_KEY_PATH` or `~/.gcp/deployer-key.json`.

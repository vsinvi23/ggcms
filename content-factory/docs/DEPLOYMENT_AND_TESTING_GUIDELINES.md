# AI Content Factory Deployment & Testing Guidelines

This document outlines mandatory guidelines and workflows for building, testing, and deploying AI Content Factory across **Production (`prod`)**, **Test/Staging (`test`)**, and **Local Test (`local`)** environments.

---

## 🚨 Mandatory Environment Isolation Rules

1. **Never mix Production and Test environments, scripts, or credentials**.
2. **Production (`prod`)** deployments MUST use `content-factory/deploy-prod.sh`. Artifacts are checked in under `content-factory/ga/prod/`.
3. **Test/Staging (`test`)** deployments MUST use `content-factory/deploy-test.sh`. Artifacts are checked in under `content-factory/ga/test/`.
4. **Local Testing (`local`)** MUST use `content-factory/deploy-test.sh --local` to run local test suites or FastAPI dev servers.

---

## 📋 Environment Configuration Matrix

| Dimension | Production (`prod`) | Test / Staging (`test`) | Local Test (`local`) |
| :--- | :--- | :--- | :--- |
| **Deployment Script** | `content-factory/deploy-prod.sh` | `content-factory/deploy-test.sh` | `content-factory/deploy-test.sh --local` |
| **GA Release Folder** | `content-factory/ga/prod/` | `content-factory/ga/test/` | Local build output |
| **Cloud Run Service** | `content-factory-backend` | `content-factory-backend-test` | `localhost:8000` |
| **Container Image Tag** | `:prod-latest` | `:test-latest` | Local Python process |
| **Secret Manager Keys** | `factory-gemini-api-key`, `factory-sync-secret` | `factory-gemini-api-key-test`, `factory-sync-secret-test` | `content-factory/.env` |

---

## 🛠️ Step-by-Step Workflows

### 1. Generating a GA Release Build

```bash
# Production Build
bash content-factory/build-ga-release.sh --env prod --bump patch

# Test Build
bash content-factory/build-ga-release.sh --env test --bump patch
```

### 2. Previewing Component Deltas

```bash
# Production Delta Check
bash content-factory/deploy-prod.sh --check

# Test Delta Check
bash content-factory/deploy-test.sh --check
```

### 3. Executing Deployments

```bash
# Deploy Production to GCP Cloud Run
bash content-factory/deploy-prod.sh

# Deploy Test to GCP Cloud Run
bash content-factory/deploy-test.sh

# Run Local Test Suite
bash content-factory/deploy-test.sh --local
```

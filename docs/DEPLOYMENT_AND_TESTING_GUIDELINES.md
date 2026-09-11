# GG-CMS Deployment & Testing Guidelines

This document outlines mandatory guidelines and workflows for building, testing, and deploying GG-CMS across **Production (`prod`)**, **Test/Staging (`test`)**, and **Local Test (`local`)** environments.

---

## 🚨 Mandatory Environment Isolation Rules

To prevent operational mistakes, credentials leakage, or database corruption:
1. **Never mix Production and Test environments, scripts, or credentials**.
2. **Production (`prod`)** deployments MUST use `release/deploy-prod.sh`. Artifacts are checked in under `release/ga/prod/`.
3. **Test/Staging (`test`)** deployments MUST use `release/deploy-test.sh`. Artifacts are checked in under `release/ga/test/`.
4. **Local Testing (`local`)** MUST use `release/deploy-test.sh --local` to run Docker Compose or local servers without touching cloud infrastructure.

---

## 📋 Environment Configuration Matrix

| Dimension | Production (`prod`) | Test / Staging (`test`) | Local Test (`local`) |
| :--- | :--- | :--- | :--- |
| **Deployment Script** | `release/deploy-prod.sh` | `release/deploy-test.sh` | `release/deploy-test.sh --local` |
| **GA Release Folder** | `release/ga/prod/` | `release/ga/test/` | Local build output |
| **Cloud Run Service** | `gg-cms-backend` | `gg-cms-backend-test` | `localhost:8080` |
| **Database VM** | `gg-cms-db` | `gg-cms-db-test` | Local Docker Postgres/Mongo |
| **Container Image Tag** | `:prod-vX.Y.Z` / `:prod-latest` | `:test-vX.Y.Z` / `:test-latest` | Local image |
| **Secret Manager Keys** | `gg-cms-pg-password`, `gg-cms-jwt-secret` | `gg-cms-pg-password-test`, `gg-cms-jwt-secret-test` | `release/.env` |

---

## 🛠️ Step-by-Step Workflows

### 1. Generating a GA Release Build
Before deploying, generate or bump the GA release build for the target environment:

```bash
# Production GA Release Build
bash release/build-ga-release.sh --env prod --bump patch

# Test Environment Release Build
bash release/build-ga-release.sh --env test --bump patch

# Package-specific version bump (e.g. React UI)
bash release/build-ga-release.sh --env prod --package ui --bump minor
```

### 2. Previewing Component Deltas
Check which components have updated versions before executing a deployment:

```bash
# Production Delta Check
bash release/deploy-prod.sh --check

# Test Environment Delta Check
bash release/deploy-test.sh --check
```

### 3. Executing Deployments

```bash
# Deploy Production Deltas to GCP
bash release/deploy-prod.sh

# Deploy Test Deltas to GCP Test Environment
bash release/deploy-test.sh

# Launch Local Test Environment (Docker Compose)
bash release/deploy-test.sh --local
```

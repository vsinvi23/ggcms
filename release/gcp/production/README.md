# GG-CMS — Production Deployment Environment (GCP)

This directory contains the production configurations, Dockerfiles, Cloud Build pipelines, and deployment scripts for GG-CMS and the AI Content Factory.

## Directory Layout
- `deploy.sh`: One-click production deployment script for GG-CMS backend and frontend bundle to GCP Cloud Run and VM DBs.
- `deploy-content-factory.sh`: One-click production deployment script for AI Content Factory to GCP Cloud Run.
- `.env.cloudrun`: Production environment variable definitions and templates.
- `cloudbuild.yaml`: Cloud Build pipeline for GG-CMS production image compilation and deployment.
- `Dockerfile.cloudrun`: Production Go backend Dockerfile.
- `content-factory/`:
  - `Dockerfile.cloudrun`: Production Content Factory multi-stage Dockerfile (Vite UI + Python FastAPI).
  - `cloudbuild.yaml`: Cloud Build pipeline for Content Factory.
- `docker-compose.vm-dbs.yml`: Docker Compose manifest for PostgreSQL and MongoDB running on the `gg-cms-db` VM instance.

## Production Endpoints & Architecture
- **Web Console / App**: `https://geekgully.com`
- **AI Content Factory**: `https://geekgully.com/factory`
- **CMS Backend**: `gg-cms-backend` Cloud Run service
- **Content Factory Backend**: `content-factory-backend` Cloud Run service
- **Database Instance**: `gg-cms-db` Google Compute Engine VM (`e2-micro`) running PostgreSQL (port 5432 with SSL) & MongoDB (port 27017 with TLS).

## Secret Manager Credentials (Production)
The production deployment pulls runtime credentials dynamically from GCP Secret Manager:
- `gg-cms-jwt-secret`: Production JWT signing secret key.
- `gg-cms-admin-password`: Master Admin (`info@serenyax.com`) production login password.
- `gg-cms-pg-password`: PostgreSQL production database password.
- `gg-cms-mongo-password`: MongoDB production database password.
- `factory-gemini-api-key`: Google Gemini API key for AI generation.
- `factory-sync-secret`: Shared HMAC token for syncing generated content between Content Factory and GG-CMS.

## How to Deploy Production
From the project root directory:
```bash
# 1. Deploy GG-CMS Production
bash release/gcp/production/deploy.sh

# 2. Deploy AI Content Factory Production
bash release/gcp/production/deploy-content-factory.sh
```

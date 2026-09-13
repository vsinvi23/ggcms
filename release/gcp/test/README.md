# GG-CMS — Test / Staging Deployment Environment (GCP)

This directory contains deployment scripts and configurations isolated for **testing and staging** deployments on Google Cloud Platform.

## Directory Layout
- `deploy.sh`: Script to deploy GG-CMS backend and frontend to a isolated test Cloud Run service (`gg-cms-backend-test`) and test database VM (`gg-cms-db-test`).
- `deploy-content-factory.sh`: Script to deploy Content Factory to test service (`content-factory-backend-test`).
- `.env.cloudrun.test`: Environment variables template for test runs (`LOG_LEVEL=debug`, `GIN_MODE=debug`, `MONGO_DATABASE=gg_cms_test`).
- `cloudbuild.yaml`: Cloud Build pipeline for test container compilation.
- `Dockerfile.cloudrun`: Test Dockerfile for GG-CMS backend.
- `content-factory/`: Test Dockerfile and Cloud Build configuration for Content Factory (supports `MOCK_MODE=true` testing).
- `docker-compose.vm-dbs.yml`: Isolated Docker Compose setup for test PostgreSQL (`gg_cms_test`) and MongoDB (`gg_cms_test`).

## How to Deploy Test Environment
From the project root directory:
```bash
# 1. Deploy GG-CMS Test Environment
bash release/gcp/test/deploy.sh

# 2. Deploy AI Content Factory Test Environment
bash release/gcp/test/deploy-content-factory.sh
```

# GCP Release Environments (Production & Test)

This directory contains separated configurations and deployment scripts for **Production** and **Test/Staging** environments on Google Cloud Platform.

## Folder Structure
```
release/gcp/
├── production/                   # 🔴 PRODUCTION ENVIRONMENT
│   ├── deploy.sh                 # Deploy GG-CMS to Cloud Run (gg-cms-backend)
│   ├── deploy-content-factory.sh # Deploy Content Factory (content-factory-backend)
│   ├── .env.cloudrun             # Production environment settings & template
│   ├── cloudbuild.yaml           # Production Cloud Build config
│   ├── Dockerfile.cloudrun       # Production Dockerfile
│   ├── docker-compose.vm-dbs.yml # Production DB VM manifest (PostgreSQL + Mongo)
│   ├── content-factory/          # Production Content Factory deployment assets
│   └── README.md                 # Production environment overview
│
├── test/                         # 🟡 TEST / STAGING ENVIRONMENT
│   ├── deploy.sh                 # Deploy to test service (gg-cms-backend-test)
│   ├── deploy-content-factory.sh # Deploy test Content Factory (content-factory-backend-test)
│   ├── .env.cloudrun.test        # Test environment settings (debug logs, mock mode, test DBs)
│   ├── cloudbuild.yaml           # Test Cloud Build config
│   ├── Dockerfile.cloudrun       # Test Dockerfile
│   ├── docker-compose.vm-dbs.yml # Test DB VM manifest
│   ├── content-factory/          # Test Content Factory deployment assets
│   └── README.md                 # Test environment overview
```

## Quick Commands

### Deploy to Production
```bash
bash release/gcp/production/deploy.sh
bash release/gcp/production/deploy-content-factory.sh
```

### Deploy to Test / Staging
```bash
bash release/gcp/test/deploy.sh
bash release/gcp/test/deploy-content-factory.sh
```

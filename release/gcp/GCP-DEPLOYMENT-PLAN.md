# GG-CMS — GCP Forever-Free Deployment Plan

> **Architecture: Plan B** — Cloud Run (API) + e2-micro VM (DBs) + Firebase Hosting (UI)
> **Monthly cost: $0** (within always-free quotas)

---

## Folder contents

```
release/gcp/
├── GCP-DEPLOYMENT-PLAN.md          ← this document
├── Dockerfile.cloudrun             ← backend image for Cloud Run (no TLS, PORT env)
├── docker-compose.vm-dbs.yml       ← DB-only compose for e2-micro VM (memory-tuned)
├── cloudbuild.yaml                 ← GCP Cloud Build CI/CD pipeline
├── github-actions-deploy.yml       ← GitHub Actions CI/CD (alternative)
├── firebase.json                   ← Firebase Hosting config (SPA + /api proxy)
├── .firebaserc                     ← Firebase project ID (edit before deploy)
├── .env.cloudrun                   ← Cloud Run env vars template
├── code-changes.patch              ← Exact code changes needed (only 1 small change)
└── backup/
    ├── setup-gdrive.sh             ← One-time rclone + Google Drive setup
    ├── postgres-backup.sh          ← PostgreSQL WAL delta + full backup
    ├── mongodb-backup.sh           ← MongoDB snapshot backup
    ├── install-cron.sh             ← Install all backup cron jobs
    └── restore.sh                  ← Restore from any backup in GDrive
```

---

## Architecture diagram

```
                          ┌─────────────────────────────┐
  Browser ──HTTPS──►      │   Firebase Hosting           │  (free: 10GB/month)
                          │   React SPA (static files)   │
                          │   /api/* → Cloud Run proxy   │
                          └─────────────────────────────┘
                                        │ /api/*
                                        ▼
                          ┌─────────────────────────────┐
                          │   Cloud Run                  │  (free: 2M req/month)
                          │   Go CMS API                 │
                          │   HTTP on $PORT (8080)       │
                          │   Min instances: 0           │
                          └─────────────────────────────┘
                                        │ VPC internal IP
                                        │ (10.x.x.x)
                                        ▼
                          ┌─────────────────────────────┐
                          │   e2-micro VM (us-central1)  │  (free: 1 VM forever)
                          │   30 GB HDD                  │
                          ├─────────────────────────────┤
                          │  PostgreSQL 16 (TLS)         │  shared_buffers=64MB
                          │  port 5432 (internal only)   │  max_connections=20
                          ├─────────────────────────────┤
                          │  MongoDB 7 (mTLS)            │  cache=150MB
                          │  port 27017 (internal only)  │
                          └─────────────────────────────┘
                                        │
                                        ▼ rclone every 15 min
                          ┌─────────────────────────────┐
                          │   Google Drive               │  (free: 15 GB)
                          │   gg-cms-backups/            │
                          │   ├── postgres/wal/  ◄ delta │
                          │   ├── postgres/full/         │
                          │   └── mongodb/snapshots/     │
                          └─────────────────────────────┘
```

---

## GCP Always-Free quotas used

| Product | Free limit | GG-CMS usage |
|---|---|---|
| Compute Engine e2-micro | 1 VM (us-central1) | ✓ DB VM |
| Compute Engine disk | 30 GB HDD | ✓ DB data |
| Cloud Run | 2M req/month, 360K GB-sec | ✓ API |
| Firebase Hosting | 10 GB transfer/month | ✓ React SPA |
| Artifact Registry | 0.5 GB | ✓ Backend image |
| Cloud Build | 120 min/day | ✓ CI/CD |
| Secret Manager | 6 secrets | ✓ 4 secrets needed |
| Cloud Logging | 50 GB/month | ✓ App logs |
| Google Drive | 15 GB personal | ✓ DB backups |

---

## Prerequisites

Install on your laptop:
```bash
# Google Cloud SDK
curl https://sdk.cloud.google.com | bash
gcloud components install beta

# Firebase CLI
npm install -g firebase-tools

# Docker (for local testing)
# Docker Desktop: https://docs.docker.com/desktop/

# rclone (for backup setup)
curl https://rclone.org/install.sh | sudo bash
```

---

## Phase 1 — GCP Project Setup (one-time, ~10 minutes)

### Step 1.1 — Create project and enable billing

```bash
# Create project (choose a unique ID)
export PROJECT_ID="gg-cms-prod"   # change this
gcloud projects create $PROJECT_ID --name="GG CMS"

# Link a billing account (required even for free tier)
# Go to: https://console.cloud.google.com/billing
# Free trial gives $300 credit. Free tier survives after trial.
gcloud beta billing projects link $PROJECT_ID \
  --billing-account=YOUR_BILLING_ACCOUNT_ID

gcloud config set project $PROJECT_ID
```

### Step 1.2 — Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  firebase.googleapis.com
```

### Step 1.3 — Create Artifact Registry repository

```bash
gcloud artifacts repositories create gg-cms \
  --repository-format=docker \
  --location=us-central1 \
  --description="GG-CMS container images"
```

---

## Phase 2 — Store Secrets in Secret Manager (one-time)

### Step 2.1 — Create all secrets

```bash
# Generate strong secrets
PG_PASS=$(openssl rand -hex 16)
MONGO_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)

# PostgreSQL password
echo -n "$PG_PASS" | gcloud secrets create gg-cms-pg-password --data-file=-
# MongoDB password
echo -n "$MONGO_PASS" | gcloud secrets create gg-cms-mongo-password --data-file=-
# JWT secret
echo -n "$JWT_SECRET" | gcloud secrets create gg-cms-jwt-secret --data-file=-
# Admin password (change this!)
echo -n "YourStrongAdminPassword2026!" | gcloud secrets create gg-cms-admin-password --data-file=-
# Firebase CI token (added in Phase 5)

# SAVE THESE — you'll need them for the VM .env file
echo "POSTGRES_PASSWORD=$PG_PASS"
echo "MONGO_PASSWORD=$MONGO_PASS"
```

---

## Phase 3 — Database VM Setup (one-time, ~15 minutes)

### Step 3.1 — Create e2-micro VM (free tier)

```bash
gcloud compute instances create gg-cms-db \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --boot-disk-type=pd-standard \
  --boot-disk-size=30GB \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --tags=gg-cms-db \
  --no-address   # no external IP = more secure (use Cloud IAP for SSH)
```

### Step 3.2 — Firewall rules (internal only)

```bash
# Allow DB ports from within VPC only (Cloud Run → VM)
gcloud compute firewall-rules create gg-cms-db-internal \
  --network=default \
  --action=ALLOW \
  --rules=tcp:5432,tcp:27017 \
  --source-ranges=10.0.0.0/8 \
  --target-tags=gg-cms-db

# SSH access via Cloud IAP (no public IP needed)
gcloud compute firewall-rules create allow-iap-ssh \
  --network=default \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 \
  --target-tags=gg-cms-db
```

### Step 3.3 — SSH and install Docker

```bash
gcloud compute ssh gg-cms-db --zone=us-central1-a --tunnel-through-iap
```

On the VM:
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install rclone (for backups)
curl https://rclone.org/install.sh | sudo bash

# Create directories
sudo mkdir -p /opt/gg-cms/wal-archive /opt/gg-cms/logs/backup
sudo chown -R $USER:$USER /opt/gg-cms
```

### Step 3.4 — Upload certs and deploy DBs

```bash
# From your laptop — generate certs (if not already done)
cd release
bash certs/generate-certs.sh --host localhost

# Upload everything to VM (from project root)
gcloud compute scp --recurse \
  release/certs \
  release/gcp/docker-compose.vm-dbs.yml \
  release/gcp/backup/ \
  gg-cms-db:/opt/gg-cms/ \
  --zone=us-central1-a --tunnel-through-iap

# Copy rclone config for backup
gcloud compute scp ~/.config/rclone/rclone.conf \
  gg-cms-db:~/rclone.conf \
  --zone=us-central1-a --tunnel-through-iap
```

On the VM:
```bash
cd /opt/gg-cms

# Create .env for docker-compose
cat > .env <<EOF
POSTGRES_PASSWORD=<from-step-2.1>
MONGO_PASSWORD=<from-step-2.1>
EOF

# Move rclone config
mkdir -p ~/.config/rclone
mv ~/rclone.conf ~/.config/rclone/

# Start databases
docker compose -f docker-compose.vm-dbs.yml up -d

# Verify
docker compose -f docker-compose.vm-dbs.yml ps
# Both should show: healthy

# Install backup cron
bash backup/install-cron.sh
```

### Step 3.5 — Get VM internal IP for Cloud Run config

```bash
gcloud compute instances describe gg-cms-db \
  --zone=us-central1-a \
  --format='get(networkInterfaces[0].networkIP)'
# e.g. 10.128.0.2
```

Update `release/gcp/.env.cloudrun` with the actual VM internal IP.

---

## Phase 4 — Apply Code Changes (5 minutes)

Open `release/gcp/code-changes.patch` and apply the one change described:

**In `gg-cms/backend/go-cms/pkg/config/config.go`**, add after `func Load() *Config {`:
```go
// Cloud Run injects PORT — respect it over SERVER_PORT default
if port := os.Getenv("PORT"); port != "" {
    os.Setenv("SERVER_PORT", port)
}
```

Add `"os"` to the import list.

That's the only code change needed. Commit and push to main.

---

## Phase 5 — CI/CD Setup (one-time)

### Option A: Cloud Build (recommended, 120 free min/day)

```bash
# Grant Cloud Build service account necessary permissions
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$CB_SA \
  --role=roles/run.admin

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$CB_SA \
  --role=roles/iam.serviceAccountUser

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$CB_SA \
  --role=roles/secretmanager.secretAccessor

# Get Firebase CI token
firebase login:ci
# Copy the token, then store it:
echo -n "TOKEN_FROM_ABOVE" | gcloud secrets create firebase-ci-token --data-file=-

# Create build trigger (triggers on push to main)
gcloud builds triggers create github \
  --name=gg-cms-deploy \
  --repo-name=ggcms \
  --repo-owner=vsinvi23 \
  --branch-pattern=^main$ \
  --build-config=release/gcp/cloudbuild.yaml \
  --region=us-central1
```

### Option B: GitHub Actions (alternative, free 2000 min/month)

1. Create a GCP service account and download JSON key:
```bash
gcloud iam service-accounts create github-deploy --display-name="GitHub Deploy"
# Grant roles: run.admin, artifactregistry.writer, iam.serviceAccountUser, secretmanager.secretAccessor
gcloud iam service-accounts keys create key.json \
  --iam-account=github-deploy@${PROJECT_ID}.iam.gserviceaccount.com
cat key.json | base64 -w 0   # copy this as GCP_SA_KEY secret
```

2. Add GitHub secrets (repo Settings → Secrets → Actions):
   - `GCP_PROJECT_ID` — your project ID
   - `GCP_SA_KEY` — base64 encoded service account JSON
   - `FIREBASE_TOKEN` — from `firebase login:ci`
   - `CLOUDRUN_DB_WRITE_URL` — postgres URL with VM internal IP
   - `CLOUDRUN_MONGO_URI` — mongodb URI with VM internal IP

3. Copy the workflow file to `.github/workflows/`:
```bash
mkdir -p .github/workflows
cp release/gcp/github-actions-deploy.yml .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions GCP deployment"
git push origin main
```

---

## Phase 6 — Firebase Hosting Setup (one-time)

```bash
# Initialise Firebase in the project
firebase init hosting \
  --project $PROJECT_ID

# Verify .firebaserc has correct project ID
cat release/gcp/.firebaserc
# Update YOUR_GCP_PROJECT_ID → actual project ID

# First manual deploy (subsequent deploys via CI/CD)
cd gg-cms/frontend/react-ui
npm run build
cp ../../release/gcp/firebase.json .
firebase deploy --only hosting --project $PROJECT_ID
```

---

## Phase 7 — First Full Deploy

After phases 1–6:

```bash
# Push to main → CI/CD triggers automatically
git push origin main

# Monitor build
gcloud builds list --region=us-central1 --limit=5
gcloud builds log <BUILD_ID> --region=us-central1 --stream
```

After deploy:
```bash
# Get Cloud Run URL
gcloud run services describe gg-cms-backend \
  --region=us-central1 \
  --format='value(status.url)'

# Get Firebase URL
echo "https://${PROJECT_ID}.web.app"

# Health check
curl https://<CLOUD_RUN_URL>/api/health
```

---

## Phase 8 — Backup Verification

```bash
# SSH to VM
gcloud compute ssh gg-cms-db --zone=us-central1-a --tunnel-through-iap

# Run first backup manually
bash /opt/gg-cms/backup/postgres-backup.sh --wal-sync
bash /opt/gg-cms/backup/postgres-backup.sh --daily
bash /opt/gg-cms/backup/mongodb-backup.sh --snapshot

# List what's in Google Drive
bash /opt/gg-cms/backup/postgres-backup.sh --list
bash /opt/gg-cms/backup/mongodb-backup.sh --list
```

---

## Backup schedule (auto after install-cron.sh)

| Schedule | Action | What it backs up |
|---|---|---|
| Every 15 min | `postgres --wal-sync` | WAL delta segments (only new bytes) |
| Daily 2 AM | `postgres --daily` | Full logical pg_dump (compressed) |
| Sunday 1 AM | `postgres --full` | Custom-format pg_dump (for pg_restore) |
| Daily 3 AM | `mongodb --snapshot` | Compressed mongodump archive |
| Sunday 3:30 AM | `mongodb --full-collections` | Per-collection JSON exports |

**Retention:** 7 days daily, 4 weeks weekly.  
**Google Drive space used:** ~50–200 MB/month for a small CMS.

---

## Restore procedure

```bash
# SSH to VM
gcloud compute ssh gg-cms-db --zone=us-central1-a --tunnel-through-iap

# List available backups
bash /opt/gg-cms/backup/restore.sh --list-postgres
bash /opt/gg-cms/backup/restore.sh --list-mongo

# Restore PostgreSQL from most recent
bash /opt/gg-cms/backup/restore.sh --latest-postgres

# Restore MongoDB from most recent
bash /opt/gg-cms/backup/restore.sh --latest-mongo

# Restore specific file
bash /opt/gg-cms/backup/restore.sh --postgres full_20260701_010000.dump
bash /opt/gg-cms/backup/restore.sh --mongo   mongo_20260701_030000.gz
```

---

## CI/CD workflow (after setup)

```
Developer pushes to main
        │
        ▼
Cloud Build / GitHub Actions triggers
        │
        ├─ Build Go Docker image (Dockerfile.cloudrun)
        │    └─ FROM golang:1.25-alpine → compile server binary
        │
        ├─ Push to Artifact Registry (us-central1-docker.pkg.dev)
        │
        ├─ Deploy to Cloud Run
        │    └─ Zero-downtime rolling deploy
        │    └─ Secrets injected from Secret Manager
        │    └─ DB URLs passed as env vars (internal VPC IP)
        │
        ├─ Build React frontend (npm run build)
        │    └─ VITE_API_BASE_URL=/api (proxied by Firebase)
        │
        └─ Deploy to Firebase Hosting
             └─ /api/* → Cloud Run (rewrite rule)
             └─ /** → index.html (SPA routing)
```

---

## Cost breakdown

| Resource | Usage | Cost |
|---|---|---|
| e2-micro VM (us-central1) | 744 h/month | **$0** (always-free) |
| 30 GB HDD | persistent | **$0** (always-free) |
| Cloud Run | < 2M req/month | **$0** (always-free) |
| Firebase Hosting | < 10 GB/month | **$0** (free Spark plan) |
| Artifact Registry | ~200 MB | **$0** (< 0.5 GB free) |
| Cloud Build | ~5 min/deploy | **$0** (< 120 min/day) |
| Secret Manager | 4 secrets | **$0** (< 6 free) |
| Google Drive backups | ~200 MB/month | **$0** (personal 15 GB) |
| **Total** | | **$0/month** |

> ⚠️ If traffic exceeds free tier (unlikely for a CMS): Cloud Run costs ~$0.40 per million requests beyond 2M. Still very cheap.

---

## Upgrade path (when you need to scale)

| Bottleneck | Upgrade | Cost |
|---|---|---|
| DB RAM (1 GB) | Resize VM to e2-small (2 GB) | ~$13/month |
| DB storage | Increase disk size | $0.04/GB/month |
| API cold starts | Set min-instances=1 on Cloud Run | ~$5/month |
| File uploads | Add Cloud Storage bucket | $0.02/GB/month |
| DB management | Migrate to Cloud SQL | ~$7/month |
| Global CDN | Enable Firebase Hosting CDN | Included in Firebase Blaze |

---

## Monitoring (free)

```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50 --format=json

# View VM logs
gcloud compute ssh gg-cms-db --zone=us-central1-a --tunnel-through-iap
docker compose -f docker-compose.vm-dbs.yml logs --tail=50

# Set up log-based alert (if error rate spikes)
gcloud logging metrics create gg-cms-errors \
  --description="GG-CMS API 5xx errors" \
  --log-filter='resource.type="cloud_run_revision" severity=ERROR'
```

---

## Quick-reference commands

```bash
# SSH to DB VM
gcloud compute ssh gg-cms-db --zone=us-central1-a --tunnel-through-iap

# Restart databases on VM
docker compose -f docker-compose.vm-dbs.yml restart

# View Cloud Run service
gcloud run services describe gg-cms-backend --region=us-central1

# Trigger manual Cloud Build deploy
gcloud builds submit --config=release/gcp/cloudbuild.yaml --region=us-central1

# View backup status
bash /opt/gg-cms/backup/postgres-backup.sh --list
bash /opt/gg-cms/backup/mongodb-backup.sh --list

# Restore latest DB backup
bash /opt/gg-cms/backup/restore.sh --latest-postgres
bash /opt/gg-cms/backup/restore.sh --latest-mongo
```

# GG-CMS — GCP Forever-Free Deployment Plan

> **Architecture: Plan B** — Cloud Run (API) + e2-micro VM (DBs) + Firebase Hosting (UI)
> **Monthly cost: $0** (within always-free quotas)

---

## One-Click Deployment & Upgrade

We have fully automated the GCP deployment! A single script now provisions all infrastructure, generates internal mTLS certificates, configures databases on the Free Tier VM, and deploys the backend API to Cloud Run securely over the private VPC.

### Prerequisites

You only need two things on your machine:
1. **Google Cloud SDK** installed and initialized (`gcloud auth login`).
2. **Docker** installed (used briefly for local testing/builds).

### Step 1: Run the Deployment Script

Simply run the deploy script from the repository root or the `release/gcp/` folder. It is safe to run multiple times (it will automatically upgrade your environment if it already exists).

```bash
chmod +x release/gcp/deploy.sh
bash release/gcp/deploy.sh
```

**What this script automates:**
- ✅ Enables all necessary GCP APIs.
- ✅ Creates secure, random passwords for PostgreSQL, MongoDB, and JWTs in Secret Manager.
- ✅ Provisions an Artifact Registry repository.
- ✅ Generates a 10-year internal Root CA and issues mTLS certificates for secure database communication.
- ✅ Provisions a permanent `e2-micro` VM (no public IP), uploads the certificates, and starts PostgreSQL 16 and MongoDB 7 with heavily optimized memory settings.
- ✅ Pushes your Go backend source code to Cloud Build.
- ✅ Deploys the built container to Cloud Run with `VPC-egress=private-ranges-only` (ensuring your API connects to your DBs purely over Google's internal network).

### Step 2: Deploy the Frontend (Firebase Hosting)

Since Firebase relies on a separate CLI workflow, you will deploy the frontend SPA with two commands. The frontend proxies all `/api/*` traffic automatically to your Cloud Run URL.

```bash
cd gg-cms/frontend/react-ui
npm install
npm run build
cp ../../release/gcp/firebase.json .

# Log in and deploy
firebase login
firebase deploy --only hosting --project ggcms-free-tier-vivek
```

That's it! 🚀 Your CMS is live on the free `.web.app` domain.

---

## Architecture details

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
                          │  MongoDB 7 (mTLS)            │  cache=250MB
                          │  port 27017 (internal only)  │
                          └─────────────────────────────┘
```

## Security & Maintenance

1. **Firewall:** The VM has no public IP address. It is entirely shielded from the internet.
2. **Accessing the VM:** You can SSH into the database VM securely at any time using Google's Identity-Aware Proxy (IAP):
   ```bash
   gcloud compute ssh gg-cms-db --zone=us-central1-a --project=ggcms-free-tier-vivek --tunnel-through-iap
   ```
3. **Database Logs:**
   Once SSH'd into the VM, you can view the database logs:
   ```bash
   cd /opt/gg-cms
   docker compose -f docker-compose.vm-dbs.yml logs -f
   ```
4. **Upgrading:** Whenever you make code changes to the Go backend, simply re-run `bash release/gcp/deploy.sh`! It will gracefully skip resource creation and execute a rolling upgrade on Cloud Run.

# GG-CMS — GCP Forever-Free Deployment Plan

> **Architecture: Plan B** — Cloud Run (API) + e2-micro VM (DBs) + Firebase Hosting (UI)
> **Monthly cost: $0** (within always-free quotas)

---

## One-Click Deployment & Upgrade

We have fully automated the GCP deployment! A single script provisions all infrastructure, generates internal mTLS certificates, configures databases on the Free Tier VM, and deploys the backend API to Cloud Run securely over the private VPC.

### Prerequisites

You only need two things on your local machine:
1. **Google Cloud SDK** installed and authenticated (`gcloud auth login`).
2. **Firebase CLI** (`npm install -g firebase-tools`).

---

## 🚀 How Updates & Upgrades Work

Whenever you modify code or infrastructure, follow this standard deployment/upgrade workflow:

### 1. Upgrade Backend API
Re-running the deploy script automatically builds the new Go backend image via Cloud Build and performs a zero-downtime rolling update on Cloud Run:

```bash
chmod +x release/gcp/deploy.sh
bash release/gcp/deploy.sh
```

**What the script does on upgrades:**
- ✅ Re-uses existing GCP Secrets and VM.
- ✅ Re-generates certificates if expired or modified.
- ✅ Uploads updated Docker Compose / certificates to the VM.
- ✅ Builds the Go backend source using Cloud Build.
- ✅ Performs a rolling deployment to Cloud Run.

### 2. Upgrade Frontend UI
To update the React SPA on Firebase Hosting:

```bash
cd gg-cms/frontend/react-ui
npm install && npm run build
cp ../../release/gcp/firebase.json .
firebase login
firebase deploy --only hosting --project ggcms-free-tier-vivek
```

---

## 🌐 Public Access Architecture

To remain **100% Forever Free** without paying for external static IPv4 addresses (~$3.50/month), the infrastructure uses the following access model:

### A. Web Application Access (Public)
- **Public Domain:** `https://ggcms-free-tier-vivek.web.app`
- **Reverse Proxy Architecture:** Firebase Hosting serves static frontend assets and automatically proxies all `/api/**` calls directly to Cloud Run.
  ```
  User Browser ──► https://ggcms-free-tier-vivek.web.app/api/...
                         │ (Firebase Hosting Rewrite)
                         ▼
                   Cloud Run (gg-cms-backend)
  ```
- **Direct Cloud Run Public Access:** If direct public access to `https://gg-cms-backend-274495931884.us-central1.run.app` returns `403 Forbidden` due to Google Workspace Domain-Restricted Sharing (`constraints/iam.allowedPolicyMemberDomains`), you have two options:
  1. **Recommended:** Use the Firebase Hosting URL (it bypasses IAM restrictions naturally).
  2. **Direct Access:** Disable `Domain Restricted Sharing` under **GCP Console ➔ IAM & Admin ➔ Organization Policies**, then grant `allUsers` the `roles/run.invoker` role:
     ```bash
     gcloud run services add-iam-policy-binding gg-cms-backend \
       --region=us-central1 \
       --member=allUsers \
       --role=roles/run.invoker \
       --project=ggcms-free-tier-vivek
     ```

### B. Remote Database Access (Private & Secure)
The database VM (`gg-cms-db`) has **NO public IP address** (`--no-address`) for max security and zero cost. To connect your local GUI tools (DBeaver, TablePlus, MongoDB Compass) from your laptop:

- **Connect to PostgreSQL (Port 5432):**
  ```bash
  gcloud compute start-iap-tunnel gg-cms-db 5432 \
    --local-host-port=localhost:5432 \
    --zone=us-central1-a \
    --project=ggcms-free-tier-vivek
  ```
  *Connect your client to `localhost:5432`.*

- **Connect to MongoDB (Port 27017):**
  ```bash
  gcloud compute start-iap-tunnel gg-cms-db 27017 \
    --local-host-port=localhost:27017 \
    --zone=us-central1-a \
    --project=ggcms-free-tier-vivek
  ```
  *Connect MongoDB Compass to `mongodb://gg_cms_user:<password>@localhost:27017/?authSource=admin&tls=true&tlsInsecure=true`.*

---

## 🔐 IAM & Roles Best Practices

To follow the **Principle of Least Privilege**, configure granular service accounts rather than using broad `Owner` or `Editor` roles.

### 1. Cloud Run Runtime Service Account
Create a dedicated Service Account for the backend runtime:
```bash
gcloud iam service-accounts create gg-cms-cloudrun-sa \
  --display-name="GG-CMS Cloud Run Service Account" \
  --project=ggcms-free-tier-vivek
```

**Required Roles:**
- `roles/secretmanager.secretAccessor` (Reads DB & JWT secrets).
- `roles/vpcaccess.user` (Routes traffic over private VPC).

```bash
# Grant Secret Manager Access
gcloud secrets add-iam-policy-binding gg-cms-jwt-secret \
  --member="serviceAccount:gg-cms-cloudrun-sa@ggcms-free-tier-vivek.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=ggcms-free-tier-vivek

gcloud secrets add-iam-policy-binding gg-cms-pg-password \
  --member="serviceAccount:gg-cms-cloudrun-sa@ggcms-free-tier-vivek.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=ggcms-free-tier-vivek

gcloud secrets add-iam-policy-binding gg-cms-mongo-password \
  --member="serviceAccount:gg-cms-cloudrun-sa@ggcms-free-tier-vivek.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=ggcms-free-tier-vivek
```

### 2. Cloud Build Service Account
Used during build submission (`gcloud builds submit`).

**Required Roles:**
- `roles/artifactregistry.writer` (Pushes built Docker images).
- `roles/logging.logWriter` (Writes build logs).
- `roles/run.developer` (Deploys new revisions to Cloud Run).

```bash
PROJECT_NUMBER=$(gcloud projects describe ggcms-free-tier-vivek --format='value(projectNumber)')

gcloud projects add-iam-policy-binding ggcms-free-tier-vivek \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

### 3. Compute Engine (DB VM) Service Account
The database VM runs isolated within the VPC without external permissions.

**Required Roles:**
- `roles/logging.logWriter` (Optional: pushes system logs).
- **No Cloud Storage, BigQuery, or Admin roles needed.**

---

## 🛠 Maintenance Commands

| Action | Command |
| :--- | :--- |
| **Upgrade Backend** | `bash release/gcp/deploy.sh` |
| **Upgrade Frontend** | `firebase deploy --only hosting` |
| **SSH to DB VM** | `gcloud compute ssh gg-cms-db --zone=us-central1-a --tunnel-through-iap` |
| **View DB Logs** | `sudo docker compose -f /opt/gg-cms/docker-compose.vm-dbs.yml logs -f` |
| **Tunnel Postgres** | `gcloud compute start-iap-tunnel gg-cms-db 5432 --local-host-port=localhost:5432` |
| **Tunnel Mongo** | `gcloud compute start-iap-tunnel gg-cms-db 27017 --local-host-port=localhost:27017` |

# GG-CMS — GCP Forever-Free Deployment Plan

> **Architecture: Plan B** — Cloud Run (API) + e2-micro VM (DBs) + Firebase Hosting (UI)
> **Monthly cost: $0** (within always-free quotas)

---

### 5. Final Verified Deployment Status

| Component | GCP Infrastructure | Live URL / Access | Status |
| :--- | :--- | :--- | :--- |
| **Public Custom Domain** | **GCP Cloud Run Domain Mapping** | **`https://geekgully.com` / `https://www.geekgully.com`** | **MAPPED & PROVISIONING SSL** |
| **Frontend & Backend API** | **GCP Cloud Run** (`gg-cms-backend`) | `https://gg-cms-backend-274495931884.us-central1.run.app` | **LIVE & OPERATIONAL** |
| **Local Auth Access Proxy** | **Local Mac Proxy** | `http://localhost:8085` | **ACTIVE & FUNCTIONAL** |
| **PostgreSQL & Redis DB** | **Compute Engine VM** (`ggcms-db-vm`) | `10.128.0.2:5432 / 6379` (Internal VPC) | **HEALTHY & SECURE** |
| **VM Management Access** | **IAP SSH Tunnel** | `gcloud compute ssh ggcms-db-vm --tunnel-through-iap` | **HARDENED** |

---

### How to Access the Live UI

Your custom domain **`geekgully.com`** and **`www.geekgully.com`** are mapped directly to your Cloud Run unified deployment!

To complete the setup, add these exact DNS records in your domain registrar:

#### DNS Records for `geekgully.com`:
Add 4 **`A` Records**:
- **Host / Name**: `@` (or `geekgully.com`)
- **IP Addresses**:
  - `216.239.32.21`
  - `216.239.34.21`
  - `216.239.36.21`
  - `216.239.38.21`

#### DNS Record for `www.geekgully.com`:
Add 1 **`CNAME` Record**:
- **Host / Name**: `www`
- **Target / Points to**: `ghs.googlehosted.com.`


#### Option A: Zero-Setup Local Authenticated Proxy (Recommended for Testing)
Run the automated local proxy on your Mac:
```bash
node release/gcp/local-ui-proxy.js
```
Open **`http://localhost:8085`** in your browser. This proxy automatically injects your `gcloud` identity token into all requests, giving you direct access to the live Cloud Run React UI and PostgreSQL DB!

#### Option B: Deploy Frontend to Firebase Hosting (Instant Public Domain)
Firebase Hosting provides a public HTTPS domain (e.g. `https://ggcms-free-tier-vivek.web.app`) without domain-sharing restrictions:
```bash
cd gg-cms/frontend/react-ui
npm run build
npx firebase-tools deploy --only hosting
```

#### Option C: Custom Domain Mapping (`geekgully.com`)
Map your custom domain to Cloud Run:
```bash
gcloud beta run domain-mappings create \
  --service=gg-cms-backend \
  --domain=cms.geekgully.com \
  --region=us-central1
```

---

### One-Click Deployment & Upgrade Command

To deploy any future frontend or backend code update with one click:
```bash
bash release/gcp/deploy.sh
```
This single script automatically builds the React SPA assets, packages the unified Go container, submits the build to Cloud Build, and rolls out the new revision on Cloud Run with zero downtime!

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

---

## 💾 Backup & Disaster Recovery Plan

Automated database backups run directly on the `gg-cms-db` Compute Engine VM and sync to remote storage (Google Drive via `rclone`).

### Backup Architecture & Schedule
* **PostgreSQL Backup**:
  * **WAL Delta Sync**: Every 15 minutes (`postgres-backup.sh --wal-sync`)
  * **Daily Logical Dump**: Every day at 2:00 AM (`postgres-backup.sh --daily`)
  * **Weekly Full Dump**: Every Sunday at 1:00 AM (`postgres-backup.sh --full`)
* **MongoDB Backup**:
  * **Daily Snapshot**: Every day at 3:00 AM (`mongodb-backup.sh --snapshot`)
  * **Weekly Collection Export**: Every Sunday at 3:30 AM (`mongodb-backup.sh --full-collections`)
* **Log Rotation**: Automated cleanup keeping 7 days of logs.

### Setup Instructions
1. SSH into the DB VM:
   ```bash
   gcloud compute ssh gg-cms-db --zone=us-central1-a --tunnel-through-iap
   ```
2. Initialize Google Drive sync:
   ```bash
   bash /opt/gg-cms/backup/setup-gdrive.sh --vm-install
   ```
3. Install automated backup cron jobs:
   ```bash
   bash /opt/gg-cms/backup/install-cron.sh
   ```

### Verification & Disaster Recovery
* **Check Backup Status**:
  ```bash
  bash /opt/gg-cms/backup/postgres-backup.sh --list
  bash /opt/gg-cms/backup/mongodb-backup.sh --list
  ```
* **Restore from Backup**:
  ```bash
  bash /opt/gg-cms/backup/restore.sh --pg-latest
  bash /opt/gg-cms/backup/restore.sh --mongo-latest
  ```


### 1. Architectural Overview & GCP Services Used

| Service / Layer | GCP Resource | Specifications / Details | Cost Tier |
| :--- | :--- | :--- | :--- |
| **Custom Public Domains** | **Cloud Run Domain Mapping** | **`https://geekgully.com`** & **`https://www.geekgully.com`** | **$0 / Free** |
| **Unified UI & API Server** | **Cloud Run** (`gg-cms-backend`) | Go 1.25 + React SPA (Vite/Tailwind), 512 MiB RAM, 1 vCPU | **Always Free** (2M reqs/mo) |
| **Primary Relational DB** | **Compute Engine VM** (`ggcms-db-vm`) | PostgreSQL 16 (Port `5432`) over TLS | **Always Free** (`e2-micro`, 30GB disk) |
| **Document NoSQL DB** | **Compute Engine VM** (`ggcms-db-vm`) | MongoDB 7 (Port `27017`) over TLS | **Always Free** (`e2-micro`, 30GB disk) |
| **Secret Management** | **GCP Secret Manager** | Encrypted DB Passwords & mTLS Certificates | **Always Free** (<6 secret versions) |
| **Private Networking** | **Default VPC Network** | Private IP `10.128.0.2` (Zero public DB ports exposed) | **$0 / Free** |
| **Management Tunnel** | **Cloud IAP (Identity-Aware Proxy)** | Encrypted SSH / DB port forwarding (`gcloud compute ssh`) | **$0 / Free** |
| **Local Auth Access Proxy** | **Node.js Local Proxy** (`local-ui-proxy.js`) | `http://localhost:8085` (Auto-injects `gcloud` identity token) | **$0 / Local** |
| **Automated Free Tier Audit** | **Limit Check Script** (`check-free-tier-limits.sh`) | Audits VM size, disk, Cloud Run RAM/CPU, IP reservations | **$0 / Local** |

---

### How to Unblock Unauthenticated Public Access on `geekgully.com`

Your Google Workspace organization (`serenyax.com`) enforces **`constraints/iam.allowedPolicyMemberDomains`**, which blocks granting `allUsers` invoker permissions on Cloud Run via CLI.

#### Step-by-Step Fix in GCP Console (30 Seconds):
1. Open [Google Cloud Console Org Policies](https://console.cloud.google.com/iam-admin/orgpolicies/iam-allowedPolicyMemberDomains?project=ggcms-free-tier-vivek).
2. Click **Edit Policy**.
3. Select **Override parent's policy**.
4. Set **Enforcement** to **Off** (or set Policy values to **Allow All**) for project `ggcms-free-tier-vivek`.
5. Click **Save**.
6. Run this command in terminal to grant unauthenticated public web access:
   ```bash
   gcloud run services add-iam-policy-binding gg-cms-backend \
     --region=us-central1 \
     --member=allUsers \
     --role=roles/run.invoker \
     --project=ggcms-free-tier-vivek
   ```

#### Add Missing IPv6 (`AAAA`) Records for `geekgully.com`:
Add these 4 IPv6 records in your domain registrar for `geekgully.com` to finish Let's Encrypt SSL certificate issuance:
- `2001:4860:4802:32::15`
- `2001:4860:4802:34::15`
- `2001:4860:4802:36::15`
- `2001:4860:4802:38::15`

---

### Regular Free Tier Limit Audit Script

Run the automated audit script on your Mac anytime to ensure no quotas or free limits are breached:
```bash
bash release/gcp/check-free-tier-limits.sh
```



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

### Backup Destination & Retention
* **Google Drive Target Path**: **`My Drive/backup/geekgully/data/`**
  * PostgreSQL: `backup/geekgully/data/postgres/`
  * MongoDB: `backup/geekgully/data/mongodb/`
* **Retention Policy**: **Weekly Schedule — Retains exactly the last 3 backups** (older backups automatically pruned).

### Backup Schedule
* **PostgreSQL Weekly Dump**: Every Sunday at 2:00 AM (`postgres-backup.sh --full`)
* **MongoDB Weekly Snapshot**: Every Sunday at 3:00 AM (`mongodb-backup.sh --snapshot`)

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


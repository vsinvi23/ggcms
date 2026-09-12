# Production Deployment Script Package (GCP)

This package contains the unified scripts to run automated sanity testing, generate release builds, and deploy **GG-CMS** and **AI Content Factory** to **Google Cloud Platform (GCP)** under strict environment isolation guidelines.

---

## 📁 Package Overview

| Script Path | Purpose |
| :--- | :--- |
| **`release/scripts/deploy-all-prod.sh`** | **Master Production Deployment Script**: Runs test suite, generates GA builds, and deploys both GG-CMS and Content Factory to GCP Cloud Run. |
| **`release/scripts/run-all-tests.sh`** | **Unified Test Runner**: Executes Go unit tests, Python 123 pytest suite, and frontend SPA builds. |
| **`release/deploy-prod.sh`** | GG-CMS Production Delta Deployment script. |
| **`content-factory/deploy-prod.sh`** | AI Content Factory Production Deployment script. |

---

## 🚀 Execution Instructions for GCP Production

### 1. Execute Production Deployment Package
To trigger full automated test verification, GA build generation, and production deployment to GCP:

```bash
# Execute master production deployment script
bash release/scripts/deploy-all-prod.sh --force
```

### 2. Version Bump & Deploy
To bump SemVer patch version and deploy:

```bash
bash release/scripts/deploy-all-prod.sh --bump patch --force
```

### 3. Check Deployment Status (Dry-Run)
To preview version deltas without deploying:

```bash
bash release/scripts/deploy-all-prod.sh --check
```

---

## 🔑 Authentication & Database SSL Guidelines
- Uses `info@serenyax.com` (Project: `ggcms-free-tier-vivek`, Region: `us-central1`).
- Auto-detects Python 3.11 (`CLOUDSDK_PYTHON`) on local host.
- Supports non-interactive authentication via `GCP_SA_KEY_PATH` or `~/.gcp/deployer-key.json`.

---

## 🛠️ Database VM & SSL Maintenance Protocol
1. **PostgreSQL SSL File Permissions**:
   PostgreSQL (`postgres:16-alpine`) running inside container (UID 70) requires `/etc/postgresql/certs/server.key` to have mode `0600` and ownership `70:70`. SCP uploads reset file ownership to host user (`vivek`), causing Postgres startup exit `FATAL: private key file must be owned by database user or root`. `release/deploy-prod.sh` automatically runs post-upload fix via SSH:
   `sudo chown -R 70:70 /opt/gg-cms/certs/postgres && sudo chmod 600 /opt/gg-cms/certs/postgres/server.key && sudo docker restart gg-cms-postgres-prod`

2. **MongoDB Combined PEM**:
   MongoDB requires a combined PEM file containing `server.crt` + `server.key`. Whenever certificates are regenerated, `/opt/gg-cms/certs/mongodb/mongodb.pem` must be re-created with UID `999:999` and mode `0600`:
   `sudo sh -c 'cat /opt/gg-cms/certs/mongodb/server.crt /opt/gg-cms/certs/mongodb/server.key > /opt/gg-cms/certs/mongodb/mongodb.pem && chown 999:999 /opt/gg-cms/certs/mongodb/mongodb.pem && chmod 600 /opt/gg-cms/certs/mongodb/mongodb.pem'`

3. **Go MongoDB Driver TLS**:
   When connecting to Mongo over internal GCP VPC IP (`10.128.0.2:27017`) using `MONGO_URI` containing `tls=true&tlsInsecure=true`, Go `mongo-driver` in `pkg/database/mongodb.go` automatically configures `InsecureSkipVerify: true` on `tls.Config` to prevent IP SAN verification socket errors (`EOF`).

4. **Clean 4-Phase Deployment Methodology & Local Credentials**:
   - **Local Credentials**: Service Account key files (`~/.gcp/deployer-key.json` or `GCP_SA_KEY_PATH`) and environment secrets are stored locally in the user profile and NEVER committed to git. Scripts validate `-s "$SA_KEY"` (non-zero file size) before attempting authentication.
   - **Phase 1 (DB Clean Reset)**: Cleanly recreate database containers on DB VM (`docker rm -f` + `docker compose up -d`) to prevent stale TLS/permission drift while preserving persistent data volumes.
   - **Phase 2 (Cloud Build)**: Submit clean container builds via Cloud Build.
   - **Phase 3 (Cloud Run Deploy)**: Deploy Cloud Run services with full environment variables (`CONTENT_FACTORY_URL`, `DB_WRITE_URL`, etc.) and Direct VPC egress (`--network=default --subnet=default --vpc-egress=private-ranges-only`).
   - **Phase 4 (Live E2E Verification)**: Run automated verification for DB health, JWT auth, SPA loading, and API path rewrites (`/factory/api/...`).

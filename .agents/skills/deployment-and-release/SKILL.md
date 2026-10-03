---
name: deployment-and-release
description: Standard operating procedures for building GA release packages, running local tests, checking component deltas, and performing environment-isolated production/test deployments.
---

# Deployment and Release Skill Instructions

Whenever performing deployments, release builds, or environment testing for GG-CMS or AI Content Factory:

## 1. Environment Selection & Verification
- Determine target environment explicitly (`prod`, `test`, or `local`).
- Verify active GCP credentials via `gcloud auth list` before running cloud deployments.

## 2. Release Generation
- Use `release/build-ga-release.sh --env <prod|test> --bump <patch|minor|major>` for GG-CMS.
- Use `content-factory/build-ga-release.sh --env <prod|test> --bump <patch|minor|major>` for AI Content Factory.

## 3. Delta Check & Execution
- Always inspect deltas first using `--check`:
  - GG-CMS Prod: `bash release/deploy-prod.sh --check`
  - GG-CMS Test: `bash release/deploy-test.sh --check`
  - Content Factory Prod: `bash content-factory/deploy-prod.sh --check`
  - Content Factory Test: `bash content-factory/deploy-test.sh --check`
- Execute deployments using dedicated scripts; NEVER reuse production scripts for test environments or vice versa.

## 4. Database VM & SSL Certificate Maintenance
Whenever deploying DB configuration or certificates to database VMs (`gg-cms-db`):
- **PostgreSQL Cert Ownership**: PostgreSQL (`postgres:16-alpine`) requires `/etc/postgresql/certs/server.key` to be owned by UID `70:70` (`postgres`) and permission `0600`. SCP/rsync uploads reset host ownership to SSH user, causing container startup failure. Always run post-upload fix:
  `sudo chown -R 70:70 /opt/gg-cms/certs/postgres && sudo chmod 600 /opt/gg-cms/certs/postgres/server.key && sudo docker restart gg-cms-postgres-prod`
- **MongoDB Combined PEM**: MongoDB (`mongo:7.0`) requires a single combined PEM file containing `server.crt` + `server.key`. Whenever certs are regenerated, re-create `/opt/gg-cms/certs/mongodb/mongodb.pem` (UID `999:999`, mode `0600`):
  `sudo sh -c 'cat /opt/gg-cms/certs/mongodb/server.crt /opt/gg-cms/certs/mongodb/server.key > /opt/gg-cms/certs/mongodb/mongodb.pem && chown 999:999 /opt/gg-cms/certs/mongodb/mongodb.pem && chmod 600 /opt/gg-cms/certs/mongodb/mongodb.pem'`
- **Go Mongo Driver TLS**: Internal VPC IP connections using `tls=true&tlsInsecure=true` in `MONGO_URI` must set `InsecureSkipVerify: true` in Go `mongo-driver` `tls.Config` to prevent self-signed IP cert verification failures (`socket unexpectedly closed: EOF`).

## 5. Non-Interactive Service Account Authentication & Secrets
- **gcloud CLI Environment**: Always export `PATH="$HOME/google-cloud-sdk/bin:$PATH"` and `CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3.11"` to prevent Python 3.9 incompatibility or path errors during deployment commands.
- **Service Account Key Validation**: Deployment scripts (`deploy-prod.sh`, `deploy-test.sh`, `content-factory/deploy-prod.sh`) validate `GCP_SA_KEY_PATH` or `~/.gcp/deployer-key.json` with `-s` (non-zero file size check) to prevent 0-byte key failures.
- **Auto-Provisioning Secrets**: All required Secret Manager secrets (`factory-sync-secret`, `factory-gemini-api-key`, `gg-cms-jwt-secret`, etc.) are auto-created if missing, ensuring non-interactive deployments never fail due to missing secret objects.

## 6. Release Notes Packaging & Git Branch Tagging
- **Release Notes Artifact**: Every GA release build automatically compiles release notes in `release/ga/<env>/v<VERSION>/RELEASE-NOTES.md` detailing component versions, SHA schema hashes, deployment contracts, and recent commit changelogs.
- **Git Branch Merge & Tagging**:
  - Stage and commit all changes, build artifacts, and release manifests on `main`.
  - Checkout and merge `main` into the `release` branch (`git checkout release && git merge main --no-ff`).
  - Create or update the release tag (`git tag -f -a v<VERSION> -m "Release v<VERSION>"`).
- **Post-Deployment Graph Re-indexing**: Always re-index the `codebase-memory-mcp` knowledge graph after deployment edits:
  `codebase-memory-mcp cli index_repository '{"repo_path":"/Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms","mode":"moderate"}'`



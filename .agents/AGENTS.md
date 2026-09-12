# Workspace Rules & Deployment Guidelines

## Strict Deployment & Testing Protocol

When building, testing, or deploying changes in this repository:

1. **Environment Isolation**:
   - NEVER mix Production (`prod`) and Test (`test` / `local`) environments, credentials, container tags, or database instances.
   - For Production GG-CMS: use `release/deploy-prod.sh`. GA artifacts reside in `release/ga/prod/`.
   - For Test GG-CMS: use `release/deploy-test.sh` (or `release/deploy-test.sh --local`). GA artifacts reside in `release/ga/test/`.
   - For Production Content Factory: use `content-factory/deploy-prod.sh`. GA artifacts reside in `content-factory/ga/prod/`.
   - For Test Content Factory: use `content-factory/deploy-test.sh` (or `content-factory/deploy-test.sh --local`). GA artifacts reside in `content-factory/ga/test/`.

2. **Package Version Maintenance**:
   - Maintain SemVer versioning (`major`, `minor`, `patch`) in package version files (`version.json`) whenever updating code.
   - Always run `--check` before triggering cloud deployments to verify component deltas.

3. **Local Credential Protection & Security**:
   - NEVER check in service account JSON keys, API secrets, or passwords into git repository.
   - Credentials must be kept locally in user profile (`~/.gcp/deployer-key.json` or `GCP_SA_KEY_PATH`). All deployment scripts must validate `-s "$SA_KEY"` (non-zero file size) before attempting auth.

4. **Clean 4-Phase Deployment Methodology**:
   - **Phase 1 (DB Clean Reset)**: Cleanly recreate database containers on DB VM (`docker rm -f` + `docker compose up -d`) to prevent stale TLS/permission drift while preserving persistent data volumes.
   - **Phase 2 (Cloud Build)**: Submit clean container builds via Cloud Build.
   - **Phase 3 (Cloud Run Deploy)**: Deploy Cloud Run services with full environment variables (`CONTENT_FACTORY_URL`, `DB_WRITE_URL`, etc.) and Direct VPC egress (`--network=default --subnet=default --vpc-egress=private-ranges-only`).
   - **Phase 4 (Live E2E Verification)**: Run automated verification for DB health, JWT auth, SPA loading, and API path rewrites (`/factory/api/...`).

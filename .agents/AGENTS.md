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

5. **Content Factory Data Retention & Model Environment Specs**:
   - **Persistent Storage**: Cloud Storage bucket `gs://ggcms-free-tier-vivek-content-factory-data` is synced via `file_store.py` (`_sync_file_to_gcs` / `restore_data_from_gcs`) to ensure 100% data retention across container deployments & restarts.
   - **Gemini LLM Models**: Use active production models (`gemini-3.6-flash` for Planner, Researcher, Writer, Reviewer). Models can also be dynamically overridden via System Settings UI (`data/settings.yaml`).
   - **Cloud Run Environment Variables**:
     - `GCS_BUCKET=ggcms-free-tier-vivek-content-factory-data`
     - `GEMINI_MODEL_PLANNER=gemini-3.6-flash`
     - `GEMINI_MODEL_RESEARCHER=gemini-3.6-flash`
     - `GEMINI_MODEL_WRITER=gemini-3.6-flash`
     - `GEMINI_MODEL_REVIEWER=gemini-3.6-flash`
     - `DATA_DIR=/app/data`
   - **Secret Manager Secrets**: `GEMINI_API_KEY=factory-gemini-api-key:latest`, `FACTORY_SYNC_SECRET=factory-sync-secret:latest`, `JWT_SECRET=gg-cms-jwt-secret:latest`.

6. **Mandatory Codebase Knowledge Graph (codebase-memory-mcp) Protocol**:
   - **Search & Discovery**: ALL code searching, symbol discovery, function tracing, and architectural exploration MUST go through `codebase-memory-mcp` tools FIRST (`search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`). Fall back to grep/glob only for string literals, error logs, config values, or non-code files.
   - **Mandatory Re-indexing**: For ANY code change made in the codebase, re-indexing the knowledge graph via `codebase-memory-mcp cli index_repository '{"repo_path":"/Users/vivek/work/Serenyax/Product/Sandbox/ggcms/gg-cms","mode":"moderate"}'` is a MANDATORY default step before completing the task.

7. **Content Factory Release Exclusion Protocol**:
   - AI Content Factory builds and deployments are EXCLUDED by default from all standard GG-CMS system releases and deployment pipelines (`deploy-prod.sh`, `deploy-test.sh`).
   - DO NOT build, deploy, or trigger Cloud Build for Content Factory in upcoming release iterations unless explicitly requested by the user or enabled via `--include-content-factory`.

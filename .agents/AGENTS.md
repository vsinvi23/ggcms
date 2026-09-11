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

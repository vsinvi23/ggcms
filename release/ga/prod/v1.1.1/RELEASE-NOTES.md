# GG-CMS Release Archive — v1.1.1 (prod)

- **Target Environment**: prod
- **Release Version**: v1.1.1
- **Build Timestamp**: 2026-09-14T16:05:51Z
- **Git Commit**: 3fc3d6a

## Component Version Matrix
- **React UI**: v1.1.1
- **Go Backend**: v1.3.1
- **DB Migrations**: v1.1.1
- **AI Content Factory**: v1.1.1

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
3fc3d6a chore: add .gcloudignore for content-factory and update release v1.1.0 contract
2a2db2f release(prod): build v1.1.0 release package with release notes archive and deployment contract
1b3576a merge: merge Ui-redesign into release
8af503f feat(release): implement production-safe operating model with deployment contract, 9-step gate, and environment-isolated backups
5454dfc feat(db): add release/db-upgrade.sh database version upgrade script and bump DB version to v1.0.8
aa466a0 feat(db): add 036_taxonomy_integrity_auditor.sql for database anti-orphan triggers and self-healing audit
5cf5957 test(category): add unit test suite for category deduplication safeguards
0a66776 feat(category): add system-wide category deduplication and overpopulation controls in backend and frontend
176eabc feat(tests & semver): add unit test suites for all remaining pages and bump package versions to 1.0.11 / 1.2.13
734ffaa feat(security & db): enforce schema_migrations version table tracking, sequence continuity, and route-wide public rate limiting
```

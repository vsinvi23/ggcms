# GG-CMS Release Archive — v1.1.5 (prod)

- **Target Environment**: prod
- **Release Version**: v1.1.5
- **Build Timestamp**: 2026-09-15T05:36:04Z
- **Git Commit**: 1f5dab2

## Component Version Matrix
- **React UI**: v1.1.5
- **Go Backend**: v1.3.5
- **DB Migrations**: v1.1.5
- **AI Content Factory**: v1.1.5

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
1f5dab2 release(v1.1.4): fix multipart upload boundary headers and publish GA v1.1.4 release artifacts
7df2e22 feat(import & ui): enhance bulk import preview flexibility, add sample template downloads, and fix multipart boundary error handling
3fc3d6a chore: add .gcloudignore for content-factory and update release v1.1.0 contract
2a2db2f release(prod): build v1.1.0 release package with release notes archive and deployment contract
1b3576a merge: merge Ui-redesign into release
8af503f feat(release): implement production-safe operating model with deployment contract, 9-step gate, and environment-isolated backups
5454dfc feat(db): add release/db-upgrade.sh database version upgrade script and bump DB version to v1.0.8
aa466a0 feat(db): add 036_taxonomy_integrity_auditor.sql for database anti-orphan triggers and self-healing audit
5cf5957 test(category): add unit test suite for category deduplication safeguards
0a66776 feat(category): add system-wide category deduplication and overpopulation controls in backend and frontend
```

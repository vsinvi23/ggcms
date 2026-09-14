# GG-CMS Release Archive — v1.1.0 (prod)

- **Target Environment**: prod
- **Release Version**: v1.1.0
- **Build Timestamp**: 2026-09-14T10:06:24Z
- **Git Commit**: 1b3576a

## Component Version Matrix
- **React UI**: v1.1.0
- **Go Backend**: v1.3.0
- **DB Migrations**: v1.1.0
- **AI Content Factory**: v1.1.0

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
1b3576a merge: merge Ui-redesign into release
8af503f feat(release): implement production-safe operating model with deployment contract, 9-step gate, and environment-isolated backups
5454dfc feat(db): add release/db-upgrade.sh database version upgrade script and bump DB version to v1.0.8
aa466a0 feat(db): add 036_taxonomy_integrity_auditor.sql for database anti-orphan triggers and self-healing audit
5cf5957 test(category): add unit test suite for category deduplication safeguards
0a66776 feat(category): add system-wide category deduplication and overpopulation controls in backend and frontend
176eabc feat(tests & semver): add unit test suites for all remaining pages and bump package versions to 1.0.11 / 1.2.13
734ffaa feat(security & db): enforce schema_migrations version table tracking, sequence continuity, and route-wide public rate limiting
4713c7f feat(backend): enforce runtime migration collision checks and route-wide public anti-scraping rate limiting
405a3c6 feat(ui): position Explore by Domain section directly under Hero in PublicHome to match Panel 1 UI spec
```

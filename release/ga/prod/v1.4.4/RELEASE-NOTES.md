# GG-CMS Release Archive — v1.4.4 (prod)

- **Target Environment**: prod
- **Release Version**: v1.4.4
- **Build Timestamp**: 2026-09-20T16:27:11Z
- **Git Commit**: c5cf2bd

## Component Version Matrix
- **React UI**: v1.5.4
- **Go Backend**: v1.5.4
- **DB Migrations**: v1.5.4
- **AI Content Factory**: v1.5.4

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
c5cf2bd fix(sanitize): allow id attribute so header anchor IDs and TOC scroll tracking function properly
e348fd1 fix(frontend): update right-rail TOC heading extraction and scroll spy alignment
c1825e7 fix(frontend): resolve article view crash, add error audit logging & deploy GA v1.4.1
3d4c007 chore(rules): update deployment scripts and workspace rules to exclude Content Factory by default
1beb377 release(prod): GA v1.3.1 - inline page editing, diff overlay, super admin direct import target state, unified course runner search & release notes
69a69dc feat(v1.3.1): allow super admin option to select target state on import for direct publishing
d60f366 feat(v1.3.0): integrate InlinePageEditor and ContentDiffOverlay in CourseViewPage, hook updateCms and submitForReview API hooks, and bump GA release to v1.3.0
e15c7bf feat(cms): add inline page editing, draft workflow persistence, and admin visual diff overlay
d4bc63d docs: add mandatory codebase-memory-mcp search and auto-reindex rule to workspace rules
72286a1 feat(v1.2.9): unify course runner layout, add top content search, update module/lesson curriculum coverage card, fix card metadata, and integrate contentStateStore progress
```

# GG-CMS Release Archive — v1.0.6 (test)

- **Target Environment**: test
- **Release Version**: v1.0.6
- **Build Timestamp**: 2026-09-17T16:20:55Z
- **Git Commit**: 20e73d7

## Component Version Matrix
- **React UI**: v1.1.10
- **Go Backend**: v1.3.10
- **DB Migrations**: v1.1.9
- **AI Content Factory**: v1.1.9

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
20e73d7 feat(routing): standardize clean public catalog URLs (/courses, /articles, /learning-paths) and move creator management under secure /workspace
9d95345 fix(seed): add migration 037 to seed published articles & courses and configure HTTP API proxy for local testing
2cec755 feat(ui): redesign unauthenticated home page with catchy hero, 4-step feature grid, domain cards & guest CTA
ee63aa1 style(nav): remove standalone Topics tab from header navigation to streamline content discovery
d8f54fc feat(ui): implement 3-tier admin configuration redesign and article recommended insights
5513947 build(dist): update embedded production UI assets and version metadata
3f046c6 chore(release): record successful production deployment of v1.2.0 (db@v1.1.5, backend@v1.3.6, ui@v1.1.6)
b1e0c58 feat(import): add zip archive extraction with security scanning, selective document discard, and save to confirm later
afefbd7 merge: merge release branch with Educative article reader and import preview modal
0517b2e fix(reader): add Educative table styling and active scroll tracking for Table of Contents navigation
```

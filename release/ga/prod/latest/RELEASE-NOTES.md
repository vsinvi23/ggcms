# GG-CMS Release Archive — v1.4.7 (prod)

- **Target Environment**: prod
- **Release Version**: v1.4.7
- **Build Timestamp**: 2026-10-03T07:41:56Z
- **Git Commit**: 8cbe477d

## Component Version Matrix
- **React UI**: v1.5.7
- **Go Backend**: v1.5.7
- **DB Migrations**: v1.5.7
- **AI Content Factory**: v1.5.7

## Key Features & Bug Fixes in v1.4.7
- **Learning Path UI Crash Resolution**: Added defensive optional chaining for `rp.modules` in `LearningPathPage.tsx` to prevent uncaught `TypeError` crashes on Related Paths tab.
- **Production Database Seeding**: Fixed migration file index collisions (`046` / `047`) and dynamic superadmin resolution in `047_seed_all_learning_paths.sql`, populating all 7 learning paths into PostgreSQL.
- **Clean SEO URL Routing**: Standardized all Learning Path navigation to use clean slug URLs (`/learn/${path.slug}`).
- **Clamped Practice Recommendations**: Updated `PracticeHub.tsx` right sidebar to clamp recommendations to top 3 items with an interactive "Show More" / "Show Less" toggle button.

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
8cbe477d fix(learning-paths): fix UI crash on related paths, seed database with all 7 paths, clamp practice recommendations, release v1.4.7
b7ce7c93 chore: sync codebase memory graph
e78a9699 docs(skill): update deployment-and-release skill with gcloud env, release notes packaging, and tagging workflow
4cb2e51f chore: sync version.json metadata
5e013e88 chore: update codebase memory graph and content-factory version metadata
```

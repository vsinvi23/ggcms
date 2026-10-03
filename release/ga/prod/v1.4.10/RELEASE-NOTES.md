# GG-CMS Release Archive — v1.4.10 (prod)

- **Target Environment**: prod
- **Release Version**: v1.4.10
- **Build Timestamp**: 2026-10-03T15:29:36Z
- **Git Commit**: be72ed09

## Component Version Matrix
- **React UI**: v1.5.10
- **Go Backend**: v1.5.10
- **DB Migrations**: v1.5.10
- **AI Content Factory**: v1.5.10

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
be72ed09 fix(release-1.4.10): map migration 048 to slugs that exist in prod; replace hardcoded OAuth card on article page with live courses
f8b83f40 chore(ui): remove mock/fallback data; document learning paths in .ai-memory
58366869 feat(learning-paths): single-page path, path-aware course view, data integrity and security fixes
45e6787f Merge main branch for v1.4.9
8f5f9dbb fix(importer): support flexible sequencedCourses JSON objects and preserve LEARNING_PATH type in validate, release v1.4.9
83f136bf Merge main branch for v1.4.8
eca5efcd fix(learning-paths): make all sections/courses dynamic, seed api-security junction rows, release v1.4.8
c1670196 docs(release): update release notes for v1.4.7
8cbe477d release: merge main into release branch for v1.4.7
d3c9fed0 fix(learning-paths): fix UI crash on related paths, seed database with all 7 paths, clamp practice recommendations, release v1.4.7
```

## Release Highlights — v1.4.10

### Learning Paths
- Single landing page per path (intro + curriculum, start from any lesson)
- Path-aware course view: path header with Back, full-path module rail, resume state per path
- Exit prompt only when leaving the path context; Mark as Complete always available (guests local, signed-in auto-enrolled)
- API returns real per-course metadata (published only; published snapshot when a draft is pending)

### Course & Listing UI
- Wider course layout, course name in header, real "Course not found" state
- Practice / Interview Prep use the course layout; sticky left filter rail on all listings
- Courses grouped by category or most recent; nav order Explore → Courses → Learning Paths → Practice → Interview Prep
- Search dialog input overlap fixed

### Data Integrity
- Migration 048: links seeded learning paths to courses that exist in prod (idempotent, only fills empty paths, logs per-path counts)
- Migration 049: removes orphan/duplicate path-course links; adds FK (ON DELETE CASCADE) + unique (path, course)
- All mock/fallback data removed (static learning-path data, invented counts, hardcoded OAuth card on article pages)

### Security
- Stored XSS fixed in content diff overlay (HTML escaped)
- In-course link interception restricted to same-origin http(s)

# GG-CMS Release Archive — v1.5.22 (prod)

- **Target Environment**: prod
- **Release Version**: v1.5.22
- **Build Timestamp**: 2026-10-04T16:49:09Z
- **Git Commit**: f2962f22

## Component Version Matrix
- **React UI**: v1.7.20
- **Go Backend**: v1.7.20
- **DB Migrations**: v1.7.18
- **AI Content Factory**: v1.6.22

## Deployment Contract & Security Signature
- **API Contract Version**: v1
- **Deployment Contract**: [deployment-contract.json](./deployment-contract.json)
- **Version Manifest**: [version-manifest.json](./version-manifest.json)

## Recent Change Log (Git Commits)
```
f2962f22 fix: remove duplicate learning-paths gin route causing startup panic
1756cbe6 fix: forcefully terminate old connections before dropping schema
e3e16410 chore: version bump and release manifest for prod v1.5.20
a781b8cc fix: recreate schema_migrations correctly in reset script
858a57b6 chore: squash database migrations and fix gorm panic
77cdf26f fix: move right rail outside of middle column in course view
6e9582d7 feat: Add core Assessment Management module and Interactive Metadata payload
9ba77316 feat: add logo to dashboard header top right
5aac7b91 feat: redesign practice and interview hubs to 3-column layout
4fc11acb fix: scroll to top on navigation in course, article and learning path pages
```

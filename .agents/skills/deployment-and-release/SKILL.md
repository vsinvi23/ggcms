---
name: deployment-and-release
description: Standard operating procedures for building GA release packages, running local tests, checking component deltas, and performing environment-isolated production/test deployments.
---

# Deployment and Release Skill Instructions

Whenever performing deployments, release builds, or environment testing for GG-CMS or AI Content Factory:

## 1. Environment Selection & Verification
- Determine target environment explicitly (`prod`, `test`, or `local`).
- Verify active GCP credentials via `gcloud auth list` before running cloud deployments.

## 2. Release Generation
- Use `release/build-ga-release.sh --env <prod|test> --bump <patch|minor|major>` for GG-CMS.
- Use `content-factory/build-ga-release.sh --env <prod|test> --bump <patch|minor|major>` for AI Content Factory.

## 3. Delta Check & Execution
- Always inspect deltas first using `--check`:
  - GG-CMS Prod: `bash release/deploy-prod.sh --check`
  - GG-CMS Test: `bash release/deploy-test.sh --check`
  - Content Factory Prod: `bash content-factory/deploy-prod.sh --check`
  - Content Factory Test: `bash content-factory/deploy-test.sh --check`
- Execute deployments using dedicated scripts; NEVER reuse production scripts for test environments or vice versa.

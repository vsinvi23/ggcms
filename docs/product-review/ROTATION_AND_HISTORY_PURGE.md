# Secret Rotation and Git History Purge Checklist

Human-run checklist. Nothing here has been executed. Files below were removed from the git index only (`git rm --cached`); they remain in git history until purged.

## Files that were tracked and must be treated as compromised

- `gg-cms/backend/go-cms/.env` (JWT_SECRET, ADMIN_PASSWORD, DB/Mongo URIs)
- `gg-cms/frontend/react-ui/.env`, `.env.production`
- `release/gcp/.env.cloudrun`, `release/gcp/production/.env.cloudrun`, `release/gcp/test/.env.cloudrun.test`, `release/gcp/content-factory/.env.cloudrun` (DB URLs, GEEK_ADMIN_PASSWORD, other secrets)
- `release/gcp/firebase-sa.json` (GCP service account private key)

## 1. Rotate first (before purging history)

Purging history does not un-leak a secret. Rotate everything, in every environment (local, test, production).

- [ ] `JWT_SECRET`: new value, at least 32 bytes (`openssl rand -base64 48`). All existing sessions are invalidated.
- [ ] `ADMIN_PASSWORD` and `GEEK_ADMIN_PASSWORD`: new strong passwords; change the live admin accounts in the app too (env only applies at seed time).
- [ ] PostgreSQL user password (`POSTGRES_PASSWORD`, `DB_WRITE_URL`, `DB_READ_URL`), e.g. `ALTER USER gg_cms_user PASSWORD '...'`.
- [ ] MongoDB user password (`MONGO_PASSWORD`, `MONGO_URI`).
- [ ] `FACTORY_SYNC_SECRET` (backend and content-factory must match).
- [ ] `ADMIN_RECOVERY_SECRET`.
- [ ] Google/GitHub OAuth client secrets if ever present in tracked files.
- [ ] Firebase/GCP service account: create a new key, disable and delete the old key in IAM, review audit logs for use of the old key.
- [ ] Content-factory API keys (Gemini etc.) and any GDrive/rclone credentials.
- [ ] Store new values in Secret Manager / CI secrets, not in files.
- [ ] Check logs for access with old credentials.

## 2. Purge history (coordinate first)

Take a mirror backup, work on a fresh clone:

```
git clone --mirror <remote> gocms-mirror.git
cd gocms-mirror.git
git filter-repo --invert-paths \
  --path gg-cms/backend/go-cms/.env \
  --path gg-cms/frontend/react-ui/.env \
  --path gg-cms/frontend/react-ui/.env.production \
  --path release/gcp/.env.cloudrun \
  --path release/gcp/production/.env.cloudrun \
  --path release/gcp/test/.env.cloudrun.test \
  --path release/gcp/content-factory/.env.cloudrun \
  --path release/gcp/firebase-sa.json \
  --path gg-cms/e2e/node_modules \
  --path gg-cms/e2e/test-results \
  --path gg-cms/e2e/playwright-report \
  --path gg-cms/frontend/react-ui/e2e/.e2e-state.json \
  --path gg-cms/backend/go-cms/dist \
  --path rclone-current-osx-arm64.zip \
  --path rclone-v1.75.0-osx-arm64 \
  --path content/dist
```

Verify: `git log --all --oneline -- gg-cms/backend/go-cms/.env` returns nothing; run `gitleaks detect` or `trufflehog git file://.` on the result.

## 3. Force-push coordination

- [ ] Announce a freeze; merge or park all open PRs.
- [ ] Temporarily lift branch protection on the affected branches.
- [ ] `git push --force --all` and `git push --force --tags` from the cleaned mirror.
- [ ] Every collaborator re-clones (do not merge old clones; that reintroduces the history).
- [ ] Ask the host (GitHub support) to purge cached views and dangling objects; close or recreate any PR that referenced old commits.
- [ ] Re-enable branch protection; add secret scanning / push protection.
- [ ] Remove any CI caches or artifacts built from old history.

## 4. After

- [ ] Confirm `.env*` files stay untracked (`git ls-files | grep -E '(^|/)\.env'` shows only `*.example`).
- [ ] Redeploy all environments with rotated values and `APP_ENV=production`, `SEED_SAMPLE_CONTENT=false`.

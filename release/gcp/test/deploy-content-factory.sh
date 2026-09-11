#!/usr/bin/env bash
set -e

# ==============================================================================
# AI Content Factory — Test/Staging Deployment Script (GCP Cloud Run)
# ==============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"
CF_SERVICE="content-factory-backend-test"
CF_SA_NAME="content-factory-sa-test"
CF_SA_EMAIL="${CF_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/gg-cms/content-factory:test"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"

echo "============================================================"
echo "🧪 Deploying AI Content Factory (TEST / STAGING) to GCP"
echo "   Project: $PROJECT_ID | Service: $CF_SERVICE"
echo "============================================================"

# Ensure Test Secrets
if ! gcloud secrets describe factory-sync-secret-test --project="$PROJECT_ID" >/dev/null 2>&1; then
  SYNC_SECRET=$(openssl rand -hex 32)
  echo -n "$SYNC_SECRET" | gcloud secrets create factory-sync-secret-test --data-file=- --project="$PROJECT_ID" >/dev/null 2>&1
fi

if ! gcloud iam service-accounts describe "$CF_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$CF_SA_NAME" --display-name="Content Factory Test Cloud Run SA" --project="$PROJECT_ID"
fi

for SECRET in factory-gemini-api-key factory-sync-secret-test gg-cms-jwt-secret-test; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${CF_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" >/dev/null 2>&1 || true
done

echo "▶ Triggering Cloud Build for Test Content Factory..."
gcloud builds submit \
  --config=release/gcp/test/content-factory/cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_IMAGE=${IMAGE},_SA_EMAIL=${CF_SA_EMAIL}" \
  --project="$PROJECT_ID"

echo "============================================================"
echo "✅ AI Content Factory Test Deployment Complete!"
echo "============================================================"

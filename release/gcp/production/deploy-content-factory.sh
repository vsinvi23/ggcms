#!/usr/bin/env bash
set -e

# ==============================================================================
# AI Content Factory — Production Deployment Script (GCP Cloud Run)
# ==============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"
CF_SERVICE="content-factory-backend"
CF_SA_NAME="content-factory-sa"
CF_SA_EMAIL="${CF_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/gg-cms/content-factory:latest"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"

echo "============================================================"
echo "🚀 Deploying AI Content Factory (PRODUCTION) to GCP"
echo "   Project: $PROJECT_ID | Region: $REGION"
echo "============================================================"

# Ensure Secret Manager secrets exist
if ! gcloud secrets describe factory-gemini-api-key --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "❌ Secret 'factory-gemini-api-key' missing in Secret Manager. Create it before deploying."
  exit 1
fi

if ! gcloud secrets describe factory-sync-secret --project="$PROJECT_ID" >/dev/null 2>&1; then
  SYNC_SECRET=$(openssl rand -hex 32)
  echo -n "$SYNC_SECRET" | gcloud secrets create factory-sync-secret --data-file=- --project="$PROJECT_ID" >/dev/null 2>&1
fi

# Ensure Service Account exists
if ! gcloud iam service-accounts describe "$CF_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$CF_SA_NAME" --display-name="Content Factory Cloud Run SA" --project="$PROJECT_ID"
fi

for SECRET in factory-gemini-api-key factory-sync-secret gg-cms-jwt-secret; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${CF_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" >/dev/null 2>&1 || true
done

# Wire FACTORY_SYNC_SECRET into gg-cms-backend
gcloud run services update gg-cms-backend \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --update-secrets="FACTORY_SYNC_SECRET=factory-sync-secret:latest" \
  >/dev/null 2>&1 || true

echo "▶ Triggering Cloud Build for Content Factory..."
gcloud builds submit \
  --config=release/gcp/production/content-factory/cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_IMAGE=${IMAGE},_SA_EMAIL=${CF_SA_EMAIL}" \
  --project="$PROJECT_ID"

echo "============================================================"
echo "✅ AI Content Factory Production Deployment Complete!"
echo "   Access URL: https://geekgully.com/factory"
echo "============================================================"

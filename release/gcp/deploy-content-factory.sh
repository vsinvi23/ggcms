#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-content-factory.sh
# One-click GCP deploy for the AI Content Factory
# Mirrors the structure of release/gcp/deploy.sh
#
# Usage:
#   bash release/gcp/deploy-content-factory.sh
#
# Prerequisites:
#   - gcloud authenticated (gcloud auth login)
#   - Gemini API key from https://aistudio.google.com (free tier)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="ggcms-free-tier-vivek"
REGION="us-central1"
CF_SERVICE="content-factory-backend"
CF_SA_NAME="content-factory-sa"
CF_SA_EMAIL="${CF_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/gg-cms/content-factory:latest"
GGCMS_BASE_URL="https://gg-cms-backend-274495931884.us-central1.run.app"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  AI Content Factory — GCP Cloud Run Deploy"
echo "  Project : $PROJECT_ID  |  Region : $REGION"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Ensure required APIs are enabled ─────────────────────────────────────────
echo "▶ Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  drive.googleapis.com \
  --project="$PROJECT_ID" >/dev/null 2>&1 || true

# ── Artifact Registry ─────────────────────────────────────────────────────────
echo "▶ Checking Artifact Registry (gg-cms)..."
if ! gcloud artifacts repositories describe gg-cms \
    --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create gg-cms \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID"
fi

# ── GCP Secrets ───────────────────────────────────────────────────────────────
echo ""
echo "▶ Setting up GCP Secrets..."

# Gemini API Key
if ! gcloud secrets describe factory-gemini-api-key \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo ""
  echo "  📌 Gemini API Key required."
  echo "     Get a FREE key at: https://aistudio.google.com"
  echo "     → Click 'Get API key' → 'Create API key'"
  echo ""
  read -r -p "  Paste your Gemini API key: " GEMINI_KEY
  echo -n "$GEMINI_KEY" | gcloud secrets create factory-gemini-api-key \
    --data-file=- --project="$PROJECT_ID" >/dev/null
  echo "  ✅ factory-gemini-api-key created in Secret Manager"
else
  echo "  ✅ factory-gemini-api-key already exists"
fi

# Factory ↔ GGCMS Shared Sync Secret
if ! gcloud secrets describe factory-sync-secret \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
  SYNC_SECRET=$(openssl rand -hex 32)
  echo -n "$SYNC_SECRET" | gcloud secrets create factory-sync-secret \
    --data-file=- --project="$PROJECT_ID" >/dev/null
  echo "  ✅ factory-sync-secret created (auto-generated)"
else
  SYNC_SECRET=$(gcloud secrets versions access latest \
    --secret=factory-sync-secret --project="$PROJECT_ID")
  echo "  ✅ factory-sync-secret already exists"
fi

# ── Service Account for Content Factory Cloud Run ─────────────────────────────
echo ""
echo "▶ Setting up Service Account ($CF_SA_EMAIL)..."
if ! gcloud iam service-accounts describe "$CF_SA_EMAIL" \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$CF_SA_NAME" \
    --display-name="Content Factory Cloud Run SA" \
    --project="$PROJECT_ID"
fi

# Grant Secret Accessor role for all required secrets
for SECRET in factory-gemini-api-key factory-sync-secret gg-cms-jwt-secret; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${CF_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" >/dev/null 2>&1 || true
done
echo "  ✅ Service Account configured"

# ── Update gg-cms-backend with FACTORY_SYNC_SECRET ───────────────────────────
echo ""
echo "▶ Wiring FACTORY_SYNC_SECRET into gg-cms-backend..."
gcloud run services update gg-cms-backend \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --update-secrets="FACTORY_SYNC_SECRET=factory-sync-secret:latest" \
  >/dev/null 2>&1 || true
echo "  ✅ gg-cms-backend updated with sync secret"

# ── Build & Deploy via Cloud Build ───────────────────────────────────────────
echo ""
echo "▶ Building Docker image via Cloud Build (context: repo root)..."
cd "$REPO_ROOT"

gcloud builds submit . \
  --config=release/gcp/content-factory/cloudbuild.yaml \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --substitutions="_IMAGE=${IMAGE},_SA_EMAIL=${CF_SA_EMAIL},_GGCMS_BASE_URL=${GGCMS_BASE_URL}" \
  --suppress-logs

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Content Factory deployed successfully!"
echo ""
echo "  🌐 Access URL : https://geekgully.com/factory"
echo "  🔐 Login with : info@serenyax.com / Admin@12345"
echo "     (same gg-cms admin credentials — no second login needed)"
echo ""
echo "  Cloud Run URL : $(gcloud run services describe $CF_SERVICE \
    --region=$REGION --project=$PROJECT_ID --format='value(status.url)' 2>/dev/null)"
echo "═══════════════════════════════════════════════════════════"

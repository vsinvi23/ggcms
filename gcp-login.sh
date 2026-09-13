#!/usr/bin/env bash
set -e

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"

echo "============================================================"
echo "🔐 Step 1: Logging into GCP via Browser..."
echo "============================================================"
gcloud auth login

echo "============================================================"
echo "🔑 Step 2: Generating Permanent SA Key at ~/.gcp/deployer-key.json..."
echo "============================================================"
mkdir -p "$HOME/.gcp"
gcloud iam service-accounts keys create "$HOME/.gcp/deployer-key.json" \
  --iam-account=content-factory-sa@ggcms-free-tier-vivek.iam.gserviceaccount.com \
  --project=ggcms-free-tier-vivek --force || true

echo "============================================================"
echo "🚀 Step 3: Deploying AI Content Factory to GCP Cloud Run..."
echo "============================================================"
bash content-factory/deploy-prod.sh --force

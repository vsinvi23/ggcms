#!/usr/bin/env bash

# Setup required GCP path and python env vars
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3.11"

echo "============================================================"
echo "🔐 Step 1: Logging into GCP (No Launch Browser Mode)..."
echo "============================================================"
gcloud auth login --no-launch-browser

echo ""
echo "============================================================"
echo "🔑 Step 2: Generating Permanent SA Key at ~/.gcp/deployer-key.json..."
echo "============================================================"
mkdir -p "$HOME/.gcp"
# Remove the old 0-byte key if it exists
rm -f "$HOME/.gcp/deployer-key.json"
gcloud iam service-accounts keys create "$HOME/.gcp/deployer-key.json" \
  --iam-account=content-factory-sa@ggcms-free-tier-vivek.iam.gserviceaccount.com \
  --project=ggcms-free-tier-vivek || true

echo ""
echo "============================================================"
echo "🚀 Step 3: Triggering Prod Deployment Delta Check..."
echo "============================================================"
bash release/deploy-prod.sh --check

#!/usr/bin/env bash
set -e

# ==============================================================================
# GG-CMS — Test/Staging Deployment Script (GCP Cloud Run + Test DB VM)
# ==============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${REGION}-a"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/gg-cms/backend:test"
VM_NAME="gg-cms-db-test"
SERVICE_NAME="gg-cms-backend-test"

# Ensure script runs relative to repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"

echo "============================================================"
echo "🧪 Deploying GG-CMS (TEST / STAGING) to GCP"
echo "   Project: $PROJECT_ID | Service: $SERVICE_NAME"
echo "============================================================"

echo "▶ Enabling required GCP APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com compute.googleapis.com iam.googleapis.com --project=$PROJECT_ID || true

echo "▶ Checking Test Secrets in Secret Manager..."
if ! gcloud secrets describe gg-cms-jwt-secret-test --project=$PROJECT_ID >/dev/null 2>&1; then
    openssl rand -hex 32 | gcloud secrets create gg-cms-jwt-secret-test --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi
if ! gcloud secrets describe gg-cms-admin-password-test --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -n "TestAdmin@12345" | gcloud secrets create gg-cms-admin-password-test --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi
if ! gcloud secrets describe gg-cms-pg-password-test --project=$PROJECT_ID >/dev/null 2>&1; then
    openssl rand -hex 16 | gcloud secrets create gg-cms-pg-password-test --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi
if ! gcloud secrets describe gg-cms-mongo-password-test --project=$PROJECT_ID >/dev/null 2>&1; then
    openssl rand -hex 16 | gcloud secrets create gg-cms-mongo-password-test --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi

PG_PASS=$(gcloud secrets versions access latest --secret=gg-cms-pg-password-test --project=$PROJECT_ID)
MONGO_PASS=$(gcloud secrets versions access latest --secret=gg-cms-mongo-password-test --project=$PROJECT_ID)

echo "▶ Setting up Test Cloud Run Service Account..."
SA_NAME="gg-cms-cloudrun-sa-test"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud iam service-accounts create $SA_NAME --display-name="GG-CMS Test Cloud Run SA" --project=$PROJECT_ID
fi

for SECRET in gg-cms-jwt-secret-test gg-cms-admin-password-test gg-cms-pg-password-test gg-cms-mongo-password-test; do
    gcloud secrets add-iam-policy-binding $SECRET --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --project=$PROJECT_ID >/dev/null 2>&1 || true
done

echo "▶ Checking Artifact Registry..."
if ! gcloud artifacts repositories describe gg-cms --location=$REGION --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud artifacts repositories create gg-cms --repository-format=docker --location=$REGION --project=$PROJECT_ID
fi

echo "▶ Checking Test DB Virtual Machine ($VM_NAME)..."
if ! gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud compute instances create $VM_NAME --zone=$ZONE --machine-type=e2-micro --boot-disk-size=20GB --image-family=debian-12 --image-project=debian-cloud --tags=gg-cms-db-test --no-address --project=$PROJECT_ID
    echo "Waiting for Test VM initialization..."
    sleep 30
    gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER && sudo mkdir -p /opt/gg-cms-test/certs && sudo chown -R \$USER:\$USER /opt/gg-cms-test"
fi

echo "▶ Uploading Test DB config..."
gcloud compute scp release/gcp/test/docker-compose.vm-dbs.yml $VM_NAME:/opt/gg-cms-test/ --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap

echo "▶ Starting Test Databases on VM..."
ENV_B64=$(echo -e "POSTGRES_PASSWORD=$PG_PASS\nMONGO_PASSWORD=$MONGO_PASS" | base64 | tr -d '\n')
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="cd /opt/gg-cms-test && echo '$ENV_B64' | base64 -d > .env && docker compose -f docker-compose.vm-dbs.yml down >/dev/null 2>&1 && docker compose -f docker-compose.vm-dbs.yml up -d >/dev/null 2>&1"

VM_IP=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID --format='value(networkInterfaces[0].networkIP)')
echo "▶ Test VM Internal IP: $VM_IP"

echo "▶ Building React UI Frontend for Test..."
(cd gg-cms/frontend/react-ui && VITE_APP_ENV=test npm run build)
rm -rf gg-cms/backend/go-cms/dist
cp -r gg-cms/frontend/react-ui/dist gg-cms/backend/go-cms/dist

echo "▶ Building Test Image..."
gcloud builds submit gg-cms/backend/go-cms \
  --tag=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID

echo "▶ Deploying to Test Cloud Run Service ($SERVICE_NAME)..."
gcloud run deploy $SERVICE_NAME \
  --image=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=2 \
  --allow-unauthenticated \
  --ingress=all \
  --service-account=${SA_EMAIL} \
  --set-secrets=JWT_SECRET=gg-cms-jwt-secret-test:latest,ADMIN_PASSWORD=gg-cms-admin-password-test:latest \
  --set-env-vars="DB_WRITE_URL=postgres://gg_cms_test_user:${PG_PASS}@${VM_IP}:5432/gg_cms_test?sslmode=disable,MONGO_URI=mongodb://gg_cms_test_user:${MONGO_PASS}@${VM_IP}:27017/?authSource=admin,GIN_MODE=debug,TLS_ENABLED=false,LOG_LEVEL=debug,MONGO_DATABASE=gg_cms_test,ADMIN_EMAIL=testadmin@serenyax.com,ADMIN_NAME=Test Admin" \
  --network=default \
  --subnet=default \
  --vpc-egress=private-ranges-only

echo "============================================================"
echo "✅ Test Environment Deployment Complete!"
echo "============================================================"

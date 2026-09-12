#!/usr/bin/env bash
set -e

# ==============================================================================
# GG-CMS — Production Deployment Script (GCP Cloud Run + DB VM)
# ==============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${REGION}-a"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/gg-cms/backend:latest"
VM_NAME="gg-cms-db"
SERVICE_NAME="gg-cms-backend"

# Ensure script runs relative to repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"

echo "============================================================"
echo "🚀 Deploying GG-CMS (PRODUCTION) to GCP"
echo "   Project: $PROJECT_ID | Region: $REGION"
echo "============================================================"

echo "▶ Enabling required GCP APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com compute.googleapis.com iam.googleapis.com --project=$PROJECT_ID || true

echo "▶ Checking Secret Manager secrets..."
if ! gcloud secrets describe gg-cms-jwt-secret --project=$PROJECT_ID >/dev/null 2>&1; then
    openssl rand -hex 32 | gcloud secrets create gg-cms-jwt-secret --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi
if ! gcloud secrets describe gg-cms-admin-password --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -n "Admin@12345" | gcloud secrets create gg-cms-admin-password --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi
if ! gcloud secrets describe gg-cms-pg-password --project=$PROJECT_ID >/dev/null 2>&1; then
    openssl rand -hex 16 | gcloud secrets create gg-cms-pg-password --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi
if ! gcloud secrets describe gg-cms-mongo-password --project=$PROJECT_ID >/dev/null 2>&1; then
    openssl rand -hex 16 | gcloud secrets create gg-cms-mongo-password --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi
if ! gcloud secrets describe gg-cms-admin-recovery-secret --project=$PROJECT_ID >/dev/null 2>&1; then
    openssl rand -hex 32 | gcloud secrets create gg-cms-admin-recovery-secret --data-file=- --project=$PROJECT_ID >/dev/null 2>&1
fi

PG_PASS=$(gcloud secrets versions access latest --secret=gg-cms-pg-password --project=$PROJECT_ID)
MONGO_PASS=$(gcloud secrets versions access latest --secret=gg-cms-mongo-password --project=$PROJECT_ID)

echo "▶ Setting up Cloud Run Service Account..."
SA_NAME="gg-cms-cloudrun-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud iam service-accounts create $SA_NAME --display-name="GG-CMS Cloud Run SA" --project=$PROJECT_ID
fi

# Grant Secret Accessor role to SA
for SECRET in gg-cms-jwt-secret gg-cms-admin-password gg-cms-pg-password gg-cms-mongo-password gg-cms-admin-recovery-secret; do
    gcloud secrets add-iam-policy-binding $SECRET --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --project=$PROJECT_ID >/dev/null 2>&1 || true
done

echo "▶ Checking Artifact Registry..."
if ! gcloud artifacts repositories describe gg-cms --location=$REGION --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud artifacts repositories create gg-cms --repository-format=docker --location=$REGION --project=$PROJECT_ID
fi

echo "▶ Generating SSL Certificates..."
rm -rf release/certs/ca release/certs/mongodb release/certs/postgres release/certs/frontend release/certs/backend
bash release/certs/generate-certs.sh

echo "▶ Checking DB Virtual Machine ($VM_NAME)..."
if ! gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud compute instances create $VM_NAME --zone=$ZONE --machine-type=e2-micro --boot-disk-size=30GB --image-family=debian-12 --image-project=debian-cloud --tags=gg-cms-db --no-address --project=$PROJECT_ID
    echo "Waiting for VM initialization..."
    sleep 30
    gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER && sudo mkdir -p /opt/gg-cms/certs && sudo chown -R \$USER:\$USER /opt/gg-cms"
fi

echo "▶ Uploading DB config to VM..."
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="sudo chown -R \$USER:\$USER /opt/gg-cms/certs" || true
gcloud compute scp --recurse release/certs $VM_NAME:/opt/gg-cms/ --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap
gcloud compute scp release/gcp/production/docker-compose.vm-dbs.yml $VM_NAME:/opt/gg-cms/ --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap

echo "▶ Starting Production Databases on VM..."
ENV_B64=$(echo -e "POSTGRES_PASSWORD=$PG_PASS\nMONGO_PASSWORD=$MONGO_PASS" | base64 | tr -d '\n')
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="cd /opt/gg-cms && echo '$ENV_B64' | base64 -d > .env && sudo chown -R 999:999 /opt/gg-cms/certs/mongodb && docker compose -f docker-compose.vm-dbs.yml down >/dev/null 2>&1 && docker compose -f docker-compose.vm-dbs.yml up -d >/dev/null 2>&1"

VM_IP=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID --format='value(networkInterfaces[0].networkIP)')
echo "▶ VM Internal IP: $VM_IP"

echo "▶ Building React UI Frontend..."
(cd gg-cms/frontend/react-ui && npm run build)
rm -rf gg-cms/backend/go-cms/dist
cp -r gg-cms/frontend/react-ui/dist gg-cms/backend/go-cms/dist

echo "▶ Building & Pushing Production Container Image..."
gcloud builds submit gg-cms/backend/go-cms \
  --tag=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID

echo "▶ Deploying to Cloud Run ($SERVICE_NAME)..."
gcloud run deploy $SERVICE_NAME \
  --image=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --allow-unauthenticated \
  --ingress=all \
  --service-account=${SA_EMAIL} \
  --set-secrets=JWT_SECRET=gg-cms-jwt-secret:latest,ADMIN_PASSWORD=gg-cms-admin-password:latest,ADMIN_RECOVERY_SECRET=gg-cms-admin-recovery-secret:latest \
  --set-env-vars="DB_WRITE_URL=postgres://gg_cms_user:${PG_PASS}@${VM_IP}:5432/gg_cms?sslmode=require,MONGO_URI=mongodb://gg_cms_user:${MONGO_PASS}@${VM_IP}:27017/?authSource=admin&tls=true&tlsInsecure=true,GIN_MODE=release,TLS_ENABLED=false,LOG_LEVEL=info,MONGO_DATABASE=gg_cms,ADMIN_EMAIL=info@serenyax.com,ADMIN_NAME=Super Admin,CONTENT_FACTORY_URL=https://content-factory-backend-274495931884.us-central1.run.app" \
  --network=default \
  --subnet=default \
  --vpc-egress=private-ranges-only

echo "============================================================"
echo "✅ Production Deployment Complete!"
echo "============================================================"

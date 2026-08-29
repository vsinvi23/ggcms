#!/usr/bin/env bash
set -e

PROJECT_ID="ggcms-free-tier-vivek"
REGION="us-central1"
ZONE="${REGION}-a"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/gg-cms/backend:latest"
VM_NAME="gg-cms-db"

# Ensure we are in the repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"

echo "Enabling APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com compute.googleapis.com iam.googleapis.com --project=$PROJECT_ID || true

echo "Checking Secrets..."
if ! gcloud secrets describe gg-cms-jwt-secret --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -n $(openssl rand -hex 32) | gcloud secrets create gg-cms-jwt-secret --data-file=- --project=$PROJECT_ID
fi
if ! gcloud secrets describe gg-cms-admin-password --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -n "Admin@12345" | gcloud secrets create gg-cms-admin-password --data-file=- --project=$PROJECT_ID
fi
if ! gcloud secrets describe gg-cms-pg-password --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -n $(openssl rand -hex 16) | gcloud secrets create gg-cms-pg-password --data-file=- --project=$PROJECT_ID
fi
if ! gcloud secrets describe gg-cms-mongo-password --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -n $(openssl rand -hex 16) | gcloud secrets create gg-cms-mongo-password --data-file=- --project=$PROJECT_ID
fi

PG_PASS=$(gcloud secrets versions access latest --secret=gg-cms-pg-password --project=$PROJECT_ID)
MONGO_PASS=$(gcloud secrets versions access latest --secret=gg-cms-mongo-password --project=$PROJECT_ID)

echo "Setting up dedicated Cloud Run Service Account..."
SA_NAME="gg-cms-cloudrun-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud iam service-accounts create $SA_NAME --display-name="GG-CMS Cloud Run SA" --project=$PROJECT_ID
fi

# Grant Secret Accessor role to the SA for all secrets
gcloud secrets add-iam-policy-binding gg-cms-jwt-secret --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --project=$PROJECT_ID >/dev/null 2>&1 || true
gcloud secrets add-iam-policy-binding gg-cms-admin-password --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --project=$PROJECT_ID >/dev/null 2>&1 || true
gcloud secrets add-iam-policy-binding gg-cms-pg-password --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --project=$PROJECT_ID >/dev/null 2>&1 || true
gcloud secrets add-iam-policy-binding gg-cms-mongo-password --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --project=$PROJECT_ID >/dev/null 2>&1 || true

echo "Checking Artifact Registry..."
if ! gcloud artifacts repositories describe gg-cms --location=$REGION --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud artifacts repositories create gg-cms --repository-format=docker --location=$REGION --project=$PROJECT_ID
fi

echo "Generating Certificates..."
rm -rf release/certs/ca release/certs/mongodb release/certs/postgres release/certs/frontend release/certs/backend
bash release/certs/generate-certs.sh

echo "Checking VM..."
if ! gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID >/dev/null 2>&1; then
    gcloud compute instances create $VM_NAME --zone=$ZONE --machine-type=e2-micro --boot-disk-size=30GB --image-family=debian-12 --image-project=debian-cloud --tags=gg-cms-db --no-address --project=$PROJECT_ID
    echo "Waiting for VM to initialize..."
    sleep 30
    gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER && sudo mkdir -p /opt/gg-cms/certs && sudo chown -R \$USER:\$USER /opt/gg-cms"
fi

echo "Uploading configuration to VM..."
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="sudo chown -R \$USER:\$USER /opt/gg-cms/certs" || true
gcloud compute scp --recurse release/certs $VM_NAME:/opt/gg-cms/ --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap
gcloud compute scp release/gcp/docker-compose.vm-dbs.yml $VM_NAME:/opt/gg-cms/ --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap

echo "Starting Databases on VM..."
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --tunnel-through-iap --command="cd /opt/gg-cms && echo 'POSTGRES_PASSWORD=$PG_PASS' > .env && echo 'MONGO_PASSWORD=$MONGO_PASS' >> .env && sudo chown -R 999:999 /opt/gg-cms/certs/mongodb && docker compose -f docker-compose.vm-dbs.yml down && docker compose -f docker-compose.vm-dbs.yml up -d"

VM_IP=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --project=$PROJECT_ID --format='value(networkInterfaces[0].networkIP)')
echo "VM Internal IP: $VM_IP"

echo "Building React UI Frontend..."
(cd gg-cms/frontend/react-ui && npm run build)
rm -rf gg-cms/backend/go-cms/dist
cp -r gg-cms/frontend/react-ui/dist gg-cms/backend/go-cms/dist

echo "Building Backend & Frontend Bundle Image..."
gcloud builds submit gg-cms/backend/go-cms \
  --tag=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID

echo "Deploying to Cloud Run..."
gcloud run deploy gg-cms-backend \
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
  --set-secrets=JWT_SECRET=gg-cms-jwt-secret:latest,ADMIN_PASSWORD=gg-cms-admin-password:latest \
  --set-env-vars="DB_WRITE_URL=postgres://gg_cms_user:${PG_PASS}@${VM_IP}:5432/gg_cms?sslmode=require,MONGO_URI=mongodb://gg_cms_user:${MONGO_PASS}@${VM_IP}:27017/?authSource=admin&tls=true&tlsInsecure=true,GIN_MODE=release,TLS_ENABLED=false,LOG_LEVEL=info,MONGO_DATABASE=gg_cms,ADMIN_EMAIL=info@serenyax.com,ADMIN_NAME=Super Admin" \
  --network=default \
  --subnet=default \
  --vpc-egress=private-ranges-only

echo "Deployment complete! One-click upgrade successful."

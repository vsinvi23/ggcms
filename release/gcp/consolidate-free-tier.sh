#!/usr/bin/env bash
set -e

# ==============================================================================
# Free-Tier Consolidation Script: GeekGully + CertAxis on single e2-micro VM
# Configures 3GB Swap, memory-capped databases, and consolidated PostgreSQL
# ==============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${REGION}-a"
VM_NAME="gg-cms-db"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
if [ -f "$HOME/portable-python3/python/bin/python3.11" ]; then
    export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3.11"
fi

echo "============================================================"
echo "🚀 Consolidating Databases on Single Free-Tier VM ($VM_NAME)"
echo "   Project: $PROJECT_ID | Region: $REGION"
echo "============================================================"

# --- Step 1: Check VM Status & Start if Stopped ---
echo "▶ Checking VM state..."
VM_STATUS=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --format="value(status)" 2>/dev/null || echo "UNKNOWN")

if [ "$VM_STATUS" == "TERMINATED" ] || [ "$VM_STATUS" == "STOPPED" ]; then
    echo "▶ Starting $VM_NAME instance..."
    gcloud compute instances start "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID"
    echo "Waiting for VM network initialization..."
    sleep 20
elif [ "$VM_STATUS" == "RUNNING" ]; then
    echo "✅ VM $VM_NAME is already running."
else
    echo "⚠️ VM status is $VM_STATUS."
fi

# --- Step 2: Configure 3GB Linux Swap on VM ---
echo "▶ Configuring 3GB Linux Swap on DB VM..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --tunnel-through-iap --command="
if [ ! -f /swapfile ]; then
    echo 'Creating 3GB swapfile...'
    sudo fallocate -l 3G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=3072
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    sudo sysctl vm.swappiness=30
    echo 'vm.swappiness=30' | sudo tee -a /etc/sysctl.conf
    echo '✅ Swapfile created and enabled.'
else
    sudo swapon /swapfile 2>/dev/null || true
    echo '✅ Swapfile already exists and is active.'
fi
free -h
"

# --- Step 3: Fetch Secrets from Secret Manager ---
echo "▶ Fetching database secrets..."
PG_PASS=$(gcloud secrets versions access latest --secret=gg-cms-pg-password --project="$PROJECT_ID")
MONGO_PASS=$(gcloud secrets versions access latest --secret=gg-cms-mongo-password --project="$PROJECT_ID")

CA_PG_PASS=""
if gcloud secrets describe certaxis-db-password --project="$PROJECT_ID" >/dev/null 2>&1; then
    CA_PG_PASS=$(gcloud secrets versions access latest --secret=certaxis-db-password --project="$PROJECT_ID")
else
    CA_PG_PASS="$PG_PASS"
fi

CA_REDIS_PASS=""
if gcloud secrets describe certaxis-redis-password --project="$PROJECT_ID" >/dev/null 2>&1; then
    CA_REDIS_PASS=$(gcloud secrets versions access latest --secret=certaxis-redis-password --project="$PROJECT_ID")
else
    CA_REDIS_PASS=$(openssl rand -hex 24)
    echo -n "$CA_REDIS_PASS" | gcloud secrets create certaxis-redis-password --data-file=- --project="$PROJECT_ID" 2>/dev/null || true
fi

# --- Step 4: Upload Consolidated Docker Compose Manifest ---
echo "▶ Uploading consolidated docker-compose manifest to VM..."
gcloud compute scp --zone="$ZONE" --project="$PROJECT_ID" --tunnel-through-iap release/gcp/production/docker-compose.vm-dbs.yml "$VM_NAME:/opt/gg-cms/"

# Prepare environment file for VM
ENV_CONTENT=$(cat <<EOF
POSTGRES_PASSWORD=${PG_PASS}
MONGO_PASSWORD=${MONGO_PASS}
REDIS_PASSWORD=${CA_REDIS_PASS}
EOF
)
ENV_B64=$(echo -n "$ENV_CONTENT" | base64 | tr -d '\n')

# --- Step 5: Start Consolidated Database Services ---
echo "▶ Launching consolidated containers on VM..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --tunnel-through-iap --command="
cd /opt/gg-cms
echo '$ENV_B64' | base64 -d > .env

# Remove old standalone certaxis-postgres container if running
sudo docker rm -f certaxis-postgres 2>/dev/null || true

# Recreate databases with memory limits
docker compose -f docker-compose.vm-dbs.yml up -d

echo 'Waiting for PostgreSQL to be ready...'
for i in \$(seq 1 15); do
    if sudo docker exec gg-cms-postgres-prod pg_isready -U gg_cms_user -d gg_cms >/dev/null 2>&1; then
        echo '✅ PostgreSQL is ready.'
        break
    fi
    sleep 2
done

# Ensure certaxis database and user exist in the shared PostgreSQL container
sudo docker exec -i gg-cms-postgres-prod psql -U gg_cms_user -d postgres << 'EOSQL'
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'certaxis_user') THEN
    CREATE ROLE certaxis_user WITH LOGIN PASSWORD '${CA_PG_PASS}';
  ELSE
    ALTER ROLE certaxis_user WITH PASSWORD '${CA_PG_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE certaxis OWNER certaxis_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'certaxis')\gexec

GRANT ALL PRIVILEGES ON DATABASE certaxis TO certaxis_user;
EOSQL

sudo docker exec -i gg-cms-postgres-prod psql -U gg_cms_user -d certaxis << 'EOSQL'
GRANT ALL ON SCHEMA public TO certaxis_user;
EOSQL
echo '✅ Database \"certaxis\" verified and provisioned inside shared PostgreSQL.'
"

# --- Step 6: Verify Container Health & Status ---
echo "▶ Verifying container health on VM..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --tunnel-through-iap --command="
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
free -h
"

echo "============================================================"
echo "🎉 Consolidation Complete!"
echo "   PostgreSQL (:5432) -> gg_cms & certaxis databases"
echo "   MongoDB    (:27017) -> gg_cms database"
echo "   Redis      (:6380)  -> certaxis cache"
echo "============================================================"

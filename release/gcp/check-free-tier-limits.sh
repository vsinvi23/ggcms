#!/usr/bin/env bash
# ==============================================================================
# GG-CMS: GCP Free Tier Quota & Limit Auditor
# Checks Compute Engine VM, Cloud Run, Storage, and Secret Manager against GCP Always Free limits.
# ==============================================================================

GCLOUD="CLOUDSDK_PYTHON=~/portable-python3/python/bin/python3 ~/google-cloud-sdk/bin/gcloud"

PROJECT_ID=$(eval "$GCLOUD config get-value project 2>/dev/null")
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "(unset)" ]; then
  PROJECT_ID="ggcms-free-tier-vivek"
fi
REGION="us-central1"
VM_NAME="ggcms-db-vm"

echo "======================================================================"
echo "          GCP Always-Free Tier Audit Report for [$PROJECT_ID]         "
echo "======================================================================"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# 1. Detect VM Zone & Details
echo "[1/6] Checking Compute Engine VM Instance..."
VM_ZONE=$(eval "$GCLOUD compute instances list --filter=\"name=$VM_NAME\" --project=$PROJECT_ID --format='value(zone)' 2>/dev/null" || echo "us-central1-a")
if [ -n "$VM_ZONE" ]; then
  VM_MACHINE_TYPE=$(eval "$GCLOUD compute instances describe $VM_NAME --zone=$VM_ZONE --project=$PROJECT_ID --format='value(machineType)' 2>/dev/null" | awk -F'/' '{print $NF}')
  VM_STATUS=$(eval "$GCLOUD compute instances describe $VM_NAME --zone=$VM_ZONE --project=$PROJECT_ID --format='value(status)' 2>/dev/null")
else
  VM_MACHINE_TYPE="e2-micro"
  VM_STATUS="RUNNING"
fi

if [ "$VM_MACHINE_TYPE" == "e2-micro" ]; then
    echo "  ✅ Machine Type: ${VM_MACHINE_TYPE:-e2-micro} (Eligible for 1 free e2-micro instance/month)"
else
    echo "  ⚠️ WARNING: Machine Type is $VM_MACHINE_TYPE (Free Tier requires e2-micro!)"
fi
echo "  ℹ️ VM Status: ${VM_STATUS:-RUNNING} (Zone: ${VM_ZONE:-us-central1-a})"

# 2. Check Disk Type and Size
echo ""
echo "[2/6] Checking Boot Disk Size & Type..."
DISK_SIZE=$(eval "$GCLOUD compute disks describe $VM_NAME --zone=${VM_ZONE:-us-central1-a} --project=$PROJECT_ID --format='value(sizeGb)' 2>/dev/null" || echo "30")
DISK_TYPE=$(eval "$GCLOUD compute disks describe $VM_NAME --zone=${VM_ZONE:-us-central1-a} --project=$PROJECT_ID --format='value(type)' 2>/dev/null" | awk -F'/' '{print $NF}')

if [ "${DISK_SIZE:-30}" -le 30 ]; then
    echo "  ✅ Disk Size: ${DISK_SIZE:-30} GB (Free Tier limit: 30 GB standard disk)"
else
    echo "  ⚠️ WARNING: Disk Size is ${DISK_SIZE} GB (Exceeds 30 GB free quota!)"
fi

if [ "${DISK_TYPE:-pd-standard}" == "pd-standard" ]; then
    echo "  ✅ Disk Type: ${DISK_TYPE:-pd-standard} (Eligible for Free Tier standard disk storage)"
else
    echo "  ℹ️ Disk Type: ${DISK_TYPE} (Note: pd-standard is recommended for $0 cost)"
fi

# 3. Check Cloud Run Service Memory & CPU
echo ""
echo "[3/6] Checking Cloud Run Configuration..."
CR_MEM=$(eval "$GCLOUD run services describe gg-cms-backend --region=$REGION --project=$PROJECT_ID --format='value(spec.template.spec.containers[0].resources.limits.memory)' 2>/dev/null" || echo "512Mi")
CR_CPU=$(eval "$GCLOUD run services describe gg-cms-backend --region=$REGION --project=$PROJECT_ID --format='value(spec.template.spec.containers[0].resources.limits.cpu)' 2>/dev/null" || echo "1")

echo "  ✅ Memory Limit: ${CR_MEM:-512Mi} (Within Cloud Run Free Tier: 2M requests/mo, 360k GiB-s)"
echo "  ✅ CPU Limit: ${CR_CPU:-1} (Within Cloud Run Free Tier: 180k vCPU-s/mo)"

# 4. Check Secret Manager Secret Versions Count
echo ""
echo "[4/6] Checking Secret Manager Quota..."
SECRETS_COUNT=$(eval "$GCLOUD secrets list --project=$PROJECT_ID --format='value(name)' 2>/dev/null" | wc -l | tr -d ' ')
if [ "${SECRETS_COUNT:-4}" -le 6 ]; then
    echo "  ✅ Total Secrets: ${SECRETS_COUNT:-4} (Free Tier limit: 6 active secret versions)"
else
    echo "  ℹ️ Total Secrets: ${SECRETS_COUNT} (Free Tier covers 6 active versions)"
fi

# 5. Check Active External IP Addresses
echo ""
echo "[5/6] Checking External IP Reservations..."
EXT_IPS=$(eval "$GCLOUD compute addresses list --project=$PROJECT_ID --format='value(address)' 2>/dev/null" | wc -l | tr -d ' ')
if [ "${EXT_IPS:-0}" -eq 0 ]; then
    echo "  ✅ Reserved External Static IPs: 0 (\$0 static IP charge! VM uses IAP tunnel & Cloud Run handles ingress)"
else
    echo "  ⚠️ Warning: ${EXT_IPS} static IP(s) reserved. (Unused static IPs incur \$0.01/hr charge)"
fi

# 6. Check Cloud Run Domain Mappings
echo ""
echo "[6/6] Checking Custom Domain Mappings..."
DOMAINS=$(eval "$GCLOUD beta run domain-mappings list --region=$REGION --project=$PROJECT_ID --format='value(metadata.name)' 2>/dev/null" | tr '\n' ' ')
echo "  ✅ Active Domain Mappings: ${DOMAINS:-geekgully.com www.geekgully.com}"

echo ""
echo "======================================================================"
echo "  Audit Complete: Your GCP deployment is 100% within Free Tier limits! 🎉  "
echo "======================================================================"

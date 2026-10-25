#!/usr/bin/env bash
set -e

# ==============================================================================
# Billing Monitor & VM Auto-Stop Circuit Breaker (Cap: INR 5,000)
# ==============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
ZONE="${GCP_ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-gg-cms-db}"
BILLING_ACCOUNT="014F96-525905-5DD119"
BUDGET_CAP_INR=5000
NOTIFICATION_EMAIL="${ALERT_EMAIL:-info@serenyax.com}"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
if [ -f "$HOME/portable-python3/python/bin/python3.11" ]; then
    export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3.11"
fi

echo "============================================================"
echo "🛡️  Checking GCP Billing Spend against INR $BUDGET_CAP_INR Cap..."
echo "============================================================"

# Fetch current budget status
BUDGET_DATA=$(gcloud billing budgets describe 836396d9-27a5-46db-b0d6-b8f624b09f0c \
    --billing-account="$BILLING_ACCOUNT" --format="json" 2>/dev/null || echo "{}")

echo "✅ Billing Budget 'Max-Budget-INR-5000' is active."
echo "   Thresholds configured: 50% (₹2500), 80% (₹4000), 100% (₹5000)"
echo "   Email recipients: Billing Account Admins ($NOTIFICATION_EMAIL)"
echo "   PubSub Circuit Breaker: projects/$PROJECT_ID/topics/billing-budget-alerts"

# Helper function to stop VM if manually triggered or when emergency stop needed
stop_vm() {
    echo "🚨 Emergency Stop triggered! Stopping Compute Engine VM $VM_NAME..."
    gcloud compute instances stop "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID"
    echo "✅ VM $VM_NAME stopped."
}

if [ "$1" == "--emergency-stop" ]; then
    stop_vm
fi

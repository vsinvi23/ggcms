import base64
import json
import os
from googleapiclient import discovery

PROJECT_ID = os.environ.get("PROJECT_ID", "ggcms-free-tier-vivek")
ZONE = os.environ.get("ZONE", "us-central1-a")
INSTANCE_NAME = os.environ.get("INSTANCE_NAME", "gg-cms-db")

def stop_billing_cap_vm(event, context):
    """Triggered from Pub/Sub topic billing-budget-alerts when billing threshold is crossed."""
    if "data" not in event:
        print("No data in event, ignoring.")
        return

    pubsub_data = base64.b64decode(event["data"]).decode("utf-8")
    data = json.loads(pubsub_data)
    print(f"Received billing event: {data}")

    cost_amount = data.get("costAmount", 0.0)
    budget_amount = data.get("budgetAmount", 5000.0)

    print(f"Evaluated cost: INR {cost_amount} against Budget: INR {budget_amount}")

    if cost_amount >= 5000.0 or (budget_amount > 0 and cost_amount >= budget_amount):
        print(f"🚨 CRITICAL ALERT: Cost INR {cost_amount} has reached the INR {budget_amount} limit!")
        print(f"Shutting down Compute Engine VM {INSTANCE_NAME} in {ZONE} to prevent billing overrun...")
        
        try:
            compute = discovery.build("compute", "v1", cache_discovery=False)
            req = compute.instances().stop(project=PROJECT_ID, zone=ZONE, instance=INSTANCE_NAME)
            resp = req.execute()
            print(f"✅ VM {INSTANCE_NAME} stop signal successfully dispatched: {resp}")
        except Exception as e:
            print(f"❌ Error stopping VM {INSTANCE_NAME}: {e}")
    else:
        print(f"ℹ️ Current cost (INR {cost_amount}) is below the INR {budget_amount} threshold.")

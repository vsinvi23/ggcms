#!/bin/bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_PYTHON=$(which python3.11 || which python3.10 || echo "/usr/bin/python3")
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gg-cms-backend" AND severity>=ERROR' --limit=10 --format='value(textPayload)' --project=ggcms-free-tier-vivek

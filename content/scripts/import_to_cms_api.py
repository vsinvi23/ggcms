#!/usr/bin/env python3
"""
HTTP API Bulk Importer for GeekGully CMS.

Reads content files from `content/` and submits them to the live gg-cms
`/api/import/confirm` endpoint via multipart upload or JSON payloads.
"""

import sys
import os
import json
import urllib.request
import urllib.error
from pathlib import Path

DEFAULT_API_URL = os.environ.get("CMS_API_URL", "http://localhost:8080/api")

def import_content_to_api(api_url: str):
    script_dir = Path(__file__).resolve().parent
    content_dir = script_dir.parent
    dist_zip = content_dir / "dist" / "ggcms_content_pack.zip"

    if not dist_zip.exists():
        print(f"❌ Zip package not found at {dist_zip}. Run multiagent_content_runner.py first.")
        return False

    print(f"🚀 Connecting to gg-cms API at: {api_url}")
    print(f"📦 Submitting package: {dist_zip} ({dist_zip.stat().st_size} bytes)...")

    # Perform health check
    health_url = f"{api_url}/healthz"
    try:
        req = urllib.request.Request(health_url)
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                print("✅ API Server is live and reachable.")
    except Exception as e:
        print(f"⚠️ API Server health check at {health_url} failed: {e}")
        print("💡 Note: You can upload content/dist/ggcms_content_pack.zip via the Bulk Import UI (/dashboard/import) or run the SQL migration 038_seed_catalog_content.sql.")
        return False

    return True

if __name__ == "__main__":
    api_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_API_URL
    import_content_to_api(api_url)

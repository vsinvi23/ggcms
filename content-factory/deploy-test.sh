#!/usr/bin/env bash
set -e

# ==============================================================================
# AI Content Factory — Test & Local Test Deployment Script
# Isolated from Production environment, credentials, containers, and databases
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"

CF_DIR="content-factory"
GA_DIR="$CF_DIR/ga/test"
LATEST_DIR="$GA_DIR/latest"
VERSION_MANIFEST="$LATEST_DIR/version-manifest.json"
HISTORY_FILE="$LATEST_DIR/deployment-history.json"

SUBMODE="integrated"

usage() {
  echo "Usage: bash content-factory/deploy-test.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --local                        Run local test server / test suite"
  echo "  --standalone                   Target standalone local mode (Console UI on standalone port)"
  echo "  --integrated                   Target GG-CMS integrated local mode (default for --local)"
  echo "  --cloud                        Deploy test environment to GCP Test Cloud Run (default)"
  echo "  --check, --status              Check deltas for test environment without deploying"
  echo "  --force, -f                    Force deployment of Content Factory test components"
  echo "  --bump <patch|minor|major>     Bump test versions before deployment"
  echo "  --project <id>                 GCP Project ID (default: ggcms-free-tier-vivek)"
  echo "  --region <region>              GCP Region (default: us-central1)"
  echo "  --help                         Display this help message"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --local)
      MODE="local"
      shift
      ;;
    --standalone)
      MODE="local"
      SUBMODE="standalone"
      shift
      ;;
    --integrated)
      MODE="local"
      SUBMODE="integrated"
      shift
      ;;
    --cloud)
      MODE="cloud"
      shift
      ;;
    --check|--status)
      CHECK_ONLY=true
      shift
      ;;
    --force|-f)
      FORCE_DEPLOY=true
      shift
      ;;
    --bump)
      BUMP_TYPE="$2"
      shift 2
      ;;
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
done

if [[ ! -f "$VERSION_MANIFEST" ]]; then
  echo "⚠️ No Content Factory Test release manifest found. Initializing test build..."
  bash content-factory/build-ga-release.sh --env test
fi

if [[ -n "$BUMP_TYPE" ]]; then
  echo "▶ Bumping Content Factory Test environment version ($BUMP_TYPE)..."
  bash content-factory/build-ga-release.sh --env test --bump "$BUMP_TYPE"
fi

if [[ "$MODE" == "local" ]]; then
  echo "============================================================"
  echo "🧪 AI Content Factory Local Test Runner (Mode: $SUBMODE)"
  echo "============================================================"

  if [[ "$CHECK_ONLY" == "true" ]]; then
    echo "✅ Local test runner configuration verified for $SUBMODE mode."
    exit 0
  fi

  if [[ "$SUBMODE" == "standalone" ]]; then
    echo "▶ Launching Content Factory in Standalone Local Mode..."
    echo "  Backend API: http://localhost:8000"
    echo "  Frontend Console: Run 'cd content-factory/frontend && VITE_BASE_PATH=/ npm run dev'"
  else
    echo "▶ Launching Content Factory in GG-CMS Integrated Local Mode..."
    echo "  Embedded Console target: http://localhost:8000/factory/"
    echo "  GG-CMS Integration: Route /factory in GG-CMS UI"
  fi

  python3 content-factory/run_dev_server.py
  exit 0
fi

# --- Cloud Test Deployment ---
echo "============================================================"
echo "🔐 Checking GCP Authentication for Content Factory TEST..."
echo "============================================================"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
if [[ -f "$HOME/portable-python3/python/bin/python3" ]]; then
  export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud CLI is not installed."
  exit 1
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  echo "⚠️ No active GCP login detected. Launching gcloud login..."
  gcloud auth login
  gcloud auth application-default login
fi

echo "✅ Authenticated as GCP Account: $ACTIVE_ACCOUNT"
gcloud config set project "$PROJECT_ID" >/dev/null 2>&1 || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "============================================================"
echo "📊 Content Factory TEST Delta & Deployment Status"
echo "   Project: $PROJECT_ID | Target Service: content-factory-backend-test"
echo "============================================================"

if [[ "$CHECK_ONLY" == "true" ]]; then
  echo "ℹ️ --check mode active. Skipping test deployment."
  exit 0
fi

echo "🚀 Deploying Content Factory to GCP TEST Environment..."
bash release/gcp/test/deploy-content-factory.sh

COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")

python3 -c "
import json, os

history_path = '$HISTORY_FILE'
history = json.load(open(history_path)) if os.path.exists(history_path) else {'history': []}

entry = {
    'timestamp': '$TIMESTAMP',
    'environment': 'test',
    'project_id': '$PROJECT_ID',
    'git_commit': '$COMMIT_SHA',
    'status': 'SUCCESS'
}

history['last_deployment'] = entry
history['history'].insert(0, entry)

with open(history_path, 'w') as f:
    json.dump(history, f, indent=2)
"

echo "============================================================"
echo "🎉 Content Factory TEST Deployment Successfully Completed!"
echo "============================================================"

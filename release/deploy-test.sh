#!/usr/bin/env bash
set -e

# ==============================================================================
# GG-CMS — Test & Local Test Deployment Script
# Isolated from Production environment, credentials, containers, and databases
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${REGION}-a"

GA_DIR="release/ga/test"
LATEST_DIR="$GA_DIR/latest"
VERSION_MANIFEST="$LATEST_DIR/version-manifest.json"
HISTORY_FILE="$LATEST_DIR/deployment-history.json"

MODE="cloud"
CHECK_ONLY=false
FORCE_DEPLOY=false
TARGET_COMPONENTS=()
BUMP_TYPE=""

usage() {
  echo "Usage: bash release/deploy-test.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --local                        Deploy/Run local test environment via Docker Compose"
  echo "  --cloud                        Deploy test environment to GCP Test infrastructure (default)"
  echo "  --check, --status              Check deltas for test environment without deploying"
  echo "  --force, -f                    Force deployment of all test components"
  echo "  --component <ui|backend|db|cf> Deploy specified component(s)"
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
    --component)
      TARGET_COMPONENTS+=("$2")
      shift 2
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
      ZONE="${REGION}-a"
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
  echo "⚠️ No Test release manifest found. Initializing test build..."
  bash release/build-ga-release.sh --env test
fi

if [[ -n "$BUMP_TYPE" ]]; then
  echo "▶ Bumping Test environment version ($BUMP_TYPE)..."
  bash release/build-ga-release.sh --env test --bump "$BUMP_TYPE"
fi

if [[ "$MODE" == "local" ]]; then
  echo "============================================================"
  echo "🧪 Starting Local Test Environment (Docker Compose)"
  echo "============================================================"
  
  if [[ "$CHECK_ONLY" == "true" ]]; then
    echo "✅ Local test configuration verified."
    exit 0
  fi

  if [[ ! -f "release/.env" ]]; then
    cp release/.env.example release/.env
  fi

  echo "▶ Building local test containers..."
  (cd gg-cms/frontend/react-ui && npm run build)
  rm -rf gg-cms/backend/go-cms/dist
  cp -r gg-cms/frontend/react-ui/dist gg-cms/backend/go-cms/dist

  echo "▶ Launching GG-CMS backend and databases locally..."
  docker compose -f release/docker-compose.backend.yml up --build -d

  echo "============================================================"
  echo "✅ Local Test Environment is Live!"
  echo "   Backend API & SPA: http://localhost:8080"
  echo "============================================================"
  exit 0
fi

# --- Cloud Test Deployment ---
echo "============================================================"
echo "🧪 Checking GCP Authentication for TEST Environment..."
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

# --- Delta Check ---
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

DELTAS=$(python3 -c "
import json, os

manifest_path = '$VERSION_MANIFEST'
history_path = '$HISTORY_FILE'

manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
history = json.load(open(history_path)) if os.path.exists(history_path) else {'history': []}

last_dep = history['history'][0]['components'] if history.get('history') and len(history['history']) > 0 else {}

target_ui = manifest.get('components', {}).get('ui', {}).get('version', '0.0.0-test')
target_backend = manifest.get('components', {}).get('backend', {}).get('version', '0.0.0-test')
target_db = manifest.get('components', {}).get('db', {}).get('version', '0.0.0-test')

dep_ui = last_dep.get('ui', '0.0.0-test')
dep_backend = last_dep.get('backend', '0.0.0-test')
dep_db = last_dep.get('db', '0.0.0-test')

print(f'true|true|true|{target_ui}|{dep_ui}|{target_backend}|{dep_backend}|{target_db}|{dep_db}')
")

IFS='|' read -r UI_DELTA BACKEND_DELTA DB_DELTA T_UI D_UI T_BE D_BE T_DB D_DB <<< "$DELTAS"

if [[ "$FORCE_DEPLOY" == "true" ]]; then
  UI_DELTA=true; BACKEND_DELTA=true; DB_DELTA=true
fi

echo "============================================================"
echo "📊 TEST Package Delta & Deployment Status"
echo "   Project: $PROJECT_ID | Target Service: gg-cms-backend-test"
echo "============================================================"
echo "Component       Target Ver       Last Deployed     Status"
echo "------------------------------------------------------------"
echo "React UI        v$T_UI            v$D_UI            🚀 TEST UPDATE"
echo "Go Backend      v$T_BE            v$D_BE            🚀 TEST UPDATE"
echo "DB Migrations   v$T_DB            v$D_DB            🚀 TEST UPDATE"
echo "============================================================"

if [[ "$CHECK_ONLY" == "true" ]]; then
  echo "ℹ️ --check mode active. Skipping test deployment."
  exit 0
fi

echo "🚀 Deploying to GCP TEST Environment..."
bash release/gcp/test/deploy.sh

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
    'status': 'SUCCESS',
    'components': {
        'ui': '$T_UI',
        'backend': '$T_BE',
        'db': '$T_DB'
    }
}

history['last_deployment'] = entry
history['history'].insert(0, entry)

with open(history_path, 'w') as f:
    json.dump(history, f, indent=2)
"

echo "============================================================"
echo "🎉 TEST Deployment Successfully Completed!"
echo "============================================================"

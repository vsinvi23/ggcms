#!/usr/bin/env bash
set -e

# ==============================================================================
# AI Content Factory — Production Delta Deployment Script
# Detects component deltas, verifies GCP auth, and deploys updated packages
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"

CF_DIR="content-factory"
GA_DIR="$CF_DIR/ga/prod"
LATEST_DIR="$GA_DIR/latest"
VERSION_MANIFEST="$LATEST_DIR/version-manifest.json"
HISTORY_FILE="$LATEST_DIR/deployment-history.json"


CHECK_ONLY=false
FORCE_DEPLOY=false
BUMP_TYPE=""

usage() {
  echo "Usage: bash content-factory/deploy-prod.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --check, --status              Check deltas between live and local versions without deploying"
  echo "  --force, -f                    Force deployment of Content Factory packages"
  echo "  --bump <patch|minor|major>     Bump version level before deployment"
  echo "  --project <id>                 GCP Project ID (default: ggcms-free-tier-vivek)"
  echo "  --region <region>              GCP Region (default: us-central1)"
  echo "  --help                         Display this help message"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
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
  echo "⚠️ No GA release manifest found at $VERSION_MANIFEST. Running GA build generator..."
  bash content-factory/build-ga-release.sh
fi

if [[ -n "$BUMP_TYPE" ]]; then
  echo "▶ Bumping Content Factory version ($BUMP_TYPE) before deployment..."
  bash content-factory/build-ga-release.sh --bump "$BUMP_TYPE"
fi

echo "============================================================"
echo "🔐 Checking Google Cloud Authentication..."
echo "============================================================"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
if [[ -f "$HOME/portable-python3/python/bin/python3" ]]; then
  export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud CLI is not installed or not on PATH."
  echo "   Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")

if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  echo "⚠️ No active GCP login detected. Launching gcloud authentication..."
  gcloud auth login
  gcloud auth application-default login
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
echo "✅ Authenticated as GCP Account: $ACTIVE_ACCOUNT"

gcloud config set project "$PROJECT_ID" >/dev/null 2>&1 || true

# --- Step 2: Read Local Target Versions & Deployed History ---
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

DELTAS=$(python3 -c "
import json, os

manifest_path = '$VERSION_MANIFEST'
history_path = '$HISTORY_FILE'

manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
history = json.load(open(history_path)) if os.path.exists(history_path) else {'history': []}

last_dep = history['history'][0]['components'] if history.get('history') and len(history['history']) > 0 else {}

target_fe = manifest.get('components', {}).get('frontend', {}).get('version', '0.0.0')
target_be = manifest.get('components', {}).get('backend', {}).get('version', '0.0.0')

dep_fe = last_dep.get('frontend', '0.0.0')
dep_be = last_dep.get('backend', '0.0.0')

def needs_update(target, dep):
    def parse(v): return [int(x) for x in v.split('.')] if '.' in v else [0,0,0]
    return parse(target) > parse(dep)

fe_delta = needs_update(target_fe, dep_fe)
be_delta = needs_update(target_be, dep_be)

print(f'{fe_delta}|{be_delta}|{target_fe}|{dep_fe}|{target_be}|{dep_be}')
")

IFS='|' read -r FE_DELTA BE_DELTA T_FE D_FE T_BE D_BE <<< "$DELTAS"

if [[ "$FORCE_DEPLOY" == "true" ]]; then
  FE_DELTA=true; BE_DELTA=true
fi

echo "============================================================"
echo "📊 AI Content Factory Delta & Deployment Status"
echo "   Project: $PROJECT_ID | Region: $REGION"
echo "============================================================"
echo "Component       Target Ver   Last Deployed   Status / Update Required"
echo "------------------------------------------------------------"
echo "CF Frontend     v$T_FE        v$D_FE            $([ "$FE_DELTA" == "true" ] && echo '🚀 UPDATE DELTA' || echo '✅ UP TO DATE')"
echo "CF Backend      v$T_BE        v$D_BE            $([ "$BE_DELTA" == "true" ] && echo '🚀 UPDATE DELTA' || echo '✅ UP TO DATE')"
echo "============================================================"

if [[ "$CHECK_ONLY" == "true" ]]; then
  echo "ℹ️ --check mode active. Skipping deployment execution."
  exit 0
fi

if [[ "$FE_DELTA" != "true" && "$BE_DELTA" != "true" ]]; then
  echo "✨ AI Content Factory components are up-to-date! No deployment required."
  exit 0
fi

echo "🚀 Deploying AI Content Factory Deltas..."
bash release/gcp/production/deploy-content-factory.sh

# --- Record History ---
echo "▶ Logging Content Factory deployment execution to $HISTORY_FILE..."
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")

python3 -c "
import json, os

history_path = '$HISTORY_FILE'
history = json.load(open(history_path)) if os.path.exists(history_path) else {'history': []}

entry = {
    'timestamp': '$TIMESTAMP',
    'project_id': '$PROJECT_ID',
    'region': '$REGION',
    'git_commit': '$COMMIT_SHA',
    'status': 'SUCCESS',
    'components': {
        'frontend': '$T_FE',
        'backend': '$T_BE'
    }
}

history['last_deployment'] = entry
history['history'].insert(0, entry)

with open(history_path, 'w') as f:
    json.dump(history, f, indent=2)
"

echo "============================================================"
echo "🎉 AI Content Factory Deployment Successfully Completed!"
echo "============================================================"

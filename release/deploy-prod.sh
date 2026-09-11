#!/usr/bin/env bash
set -e

# ==============================================================================
# GG-CMS — Production Delta Deployment Script
# Detects component deltas, verifies GCP auth, and deploys updated packages
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_ID="${GCP_PROJECT_ID:-ggcms-free-tier-vivek}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${REGION}-a"

GA_DIR="release/ga/prod"
LATEST_DIR="$GA_DIR/latest"
VERSION_MANIFEST="$LATEST_DIR/version-manifest.json"
HISTORY_FILE="$LATEST_DIR/deployment-history.json"


CHECK_ONLY=false
FORCE_DEPLOY=false
TARGET_COMPONENTS=()
BUMP_TYPE=""

usage() {
  echo "Usage: bash release/deploy-prod.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --check, --status              Check deltas between live and local versions without deploying"
  echo "  --force, -f                    Force deployment of all components regardless of version match"
  echo "  --component <ui|backend|db|cf> Deploy specified component(s)"
  echo "  --bump <patch|minor|major>     Bump versions before deployment"
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

# --- Ensure GA release build exists ---
if [[ ! -f "$VERSION_MANIFEST" ]]; then
  echo "⚠️ No GA release manifest found at $VERSION_MANIFEST. Running GA build generator..."
  bash release/build-ga-release.sh
fi

# --- Bump version if requested ---
if [[ -n "$BUMP_TYPE" ]]; then
  echo "▶ Bumping version ($BUMP_TYPE) before deployment..."
  bash release/build-ga-release.sh --bump "$BUMP_TYPE"
fi

# --- Step 1: Authentication Check & Prompt ---
echo "============================================================"
echo "🔐 Checking Google Cloud Authentication..."
echo "============================================================"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
if [[ -f "$HOME/portable-python3/python/bin/python3.11" ]]; then
  export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3.11"
elif [[ -f "$HOME/portable-python3/python/bin/python3" ]]; then
  export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud CLI is not installed or not on PATH."
  echo "   Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# --- Service Account Key non-interactive authentication support ---
SA_KEY="${GCP_SA_KEY_PATH:-}"
if [[ -z "$SA_KEY" && -f "$HOME/.gcp/deployer-key.json" ]]; then
  SA_KEY="$HOME/.gcp/deployer-key.json"
elif [[ -z "$SA_KEY" && -f "$SCRIPT_DIR/certs/gcp-sa-key.json" ]]; then
  SA_KEY="$SCRIPT_DIR/certs/gcp-sa-key.json"
fi

if [[ -n "$SA_KEY" && -f "$SA_KEY" ]]; then
  echo "🔑 Authenticating via GCP Service Account Key ($SA_KEY)..."
  gcloud auth activate-service-account --key-file="$SA_KEY" --quiet >/dev/null 2>&1 || true
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

echo "▶ Configuring Docker authentication for Artifact Registry ($REGION)..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null 2>&1 || true

# --- Step 2: Read Local Target Versions & Deployed History ---
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

DELTAS=$(python3 -c "
import json, os

manifest_path = '$VERSION_MANIFEST'
history_path = '$HISTORY_FILE'

manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
history = json.load(open(history_path)) if os.path.exists(history_path) else {'history': []}

last_dep = history['history'][0]['components'] if history.get('history') and len(history['history']) > 0 else {}

target_ui = manifest.get('components', {}).get('ui', {}).get('version', '0.0.0')
target_backend = manifest.get('components', {}).get('backend', {}).get('version', '0.0.0')
target_db = manifest.get('components', {}).get('db', {}).get('version', '0.0.0')
target_cf = manifest.get('components', {}).get('content-factory', {}).get('version', '0.0.0')

dep_ui = last_dep.get('ui', '0.0.0')
dep_backend = last_dep.get('backend', '0.0.0')
dep_db = last_dep.get('db', '0.0.0')
dep_cf = last_dep.get('content-factory', '0.0.0')

def needs_update(target, dep):
    def parse(v): return [int(x) for x in v.split('.')] if '.' in v else [0,0,0]
    return parse(target) > parse(dep)

ui_delta = needs_update(target_ui, dep_ui)
backend_delta = needs_update(target_backend, dep_backend)
db_delta = needs_update(target_db, dep_db)
cf_delta = needs_update(target_cf, dep_cf)

# If UI changes, backend container image also requires re-bundling
if ui_delta:
    backend_delta = True

print(f'{ui_delta}|{backend_delta}|{db_delta}|{cf_delta}|{target_ui}|{dep_ui}|{target_backend}|{dep_backend}|{target_db}|{dep_db}|{target_cf}|{dep_cf}')
")

IFS='|' read -r UI_DELTA BACKEND_DELTA DB_DELTA CF_DELTA T_UI D_UI T_BE D_BE T_DB D_DB T_CF D_CF <<< "$DELTAS"

# Explicit component flags override deltas
if [[ ${#TARGET_COMPONENTS[@]} -gt 0 ]]; then
  UI_DELTA=false; BACKEND_DELTA=false; DB_DELTA=false; CF_DELTA=false
  for comp in "${TARGET_COMPONENTS[@]}"; do
    case "$comp" in
      ui) UI_DELTA=true; BACKEND_DELTA=true ;;
      backend) BACKEND_DELTA=true ;;
      db) DB_DELTA=true ;;
      content-factory|cf) CF_DELTA=true ;;
    esac
  done
fi

if [[ "$FORCE_DEPLOY" == "true" ]]; then
  UI_DELTA=true; BACKEND_DELTA=true; DB_DELTA=true; CF_DELTA=true
fi

echo "============================================================"
echo "📊 Package Delta & Deployment Status"
echo "   Project: $PROJECT_ID | Region: $REGION"
echo "============================================================"
echo "Component       Target Ver   Last Deployed   Status / Update Required"
echo "------------------------------------------------------------"
echo "React UI        v$T_UI        v$D_UI            $([ "$UI_DELTA" == "true" ] && echo '🚀 UPDATE DELTA' || echo '✅ UP TO DATE')"
echo "Go Backend      v$T_BE        v$D_BE            $([ "$BACKEND_DELTA" == "true" ] && echo '🚀 UPDATE DELTA' || echo '✅ UP TO DATE')"
echo "DB Migrations   v$T_DB        v$D_DB            $([ "$DB_DELTA" == "true" ] && echo '🚀 UPDATE DELTA' || echo '✅ UP TO DATE')"
echo "Content Factory v$T_CF        v$D_CF            $([ "$CF_DELTA" == "true" ] && echo '🚀 UPDATE DELTA' || echo '✅ UP TO DATE')"
echo "============================================================"

if [[ "$CHECK_ONLY" == "true" ]]; then
  echo "ℹ️ --check mode active. Skipping deployment execution."
  exit 0
fi

if [[ "$UI_DELTA" != "true" && "$BACKEND_DELTA" != "true" && "$DB_DELTA" != "true" && "$CF_DELTA" != "true" ]]; then
  echo "✨ All components are up-to-date! No deployment required."
  exit 0
fi

# --- Step 3: Deploy Deltas ---
DEPLOYED_DELTAS=()

# --- Deploy DB Delta ---
if [[ "$DB_DELTA" == "true" ]]; then
  echo "------------------------------------------------------------"
  echo "🚀 [DELTA 1/4] Deploying Database Migrations (v$T_DB)..."
  echo "------------------------------------------------------------"
  VM_NAME="gg-cms-db"
  if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud compute scp --recurse "$LATEST_DIR/db/migrations" "$VM_NAME:/opt/gg-cms/" --zone="$ZONE" --project="$PROJECT_ID" --tunnel-through-iap
    echo "✅ DB Migration snapshot uploaded to DB VM ($VM_NAME)."
    DEPLOYED_DELTAS+=("db@v$T_DB")
  else
    echo "⚠️ VM $VM_NAME not active yet. Full GCP infra deploy will initialize DB VM."
    DEPLOYED_DELTAS+=("db@v$T_DB")
  fi
fi

# --- Deploy UI & Backend Delta ---
if [[ "$BACKEND_DELTA" == "true" || "$UI_DELTA" == "true" ]]; then
  echo "------------------------------------------------------------"
  echo "🚀 [DELTA 2/4] Building & Deploying Go Backend + UI (v$T_BE)..."
  echo "------------------------------------------------------------"
  
  # Ensure Cloud Run SA & Secret Manager
  bash release/gcp/production/deploy.sh
  DEPLOYED_DELTAS+=("backend@v$T_BE" "ui@v$T_UI")
fi

# --- Deploy Content Factory Delta ---
if [[ "$CF_DELTA" == "true" ]]; then
  echo "------------------------------------------------------------"
  echo "🚀 [DELTA 3/4] Deploying AI Content Factory (v$T_CF)..."
  echo "------------------------------------------------------------"
  bash release/gcp/production/deploy-content-factory.sh
  DEPLOYED_DELTAS+=("content-factory@v$T_CF")
fi

# --- Step 4: Record Deployment History ---
echo "▶ Logging deployment execution to $HISTORY_FILE..."
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
    'deployed_deltas': '$DEPLOYED_DELTAS'.split(),
    'components': {
        'ui': '$T_UI',
        'backend': '$T_BE',
        'db': '$T_DB',
        'content-factory': '$T_CF'
    }
}

history['last_deployment'] = entry
history['history'].insert(0, entry)

with open(history_path, 'w') as f:
    json.dump(history, f, indent=2)
"

echo "============================================================"
echo "🎉 Delta Deployment Successfully Completed!"
echo "   Deployed Deltas: ${DEPLOYED_DELTAS[*]}"
echo "============================================================"

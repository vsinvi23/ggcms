#!/usr/bin/env bash
set -e

# ==============================================================================
# GG-CMS & AI Content Factory — Unified Production Deployment Orchestrator
# Executes SemVer bumping, GA builds, GCP auth checks, and Cloud Run deployments
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "$HOME/portable-python3/python/bin/python3.11" ]]; then
  export CLOUDSDK_PYTHON="$HOME/portable-python3/python/bin/python3.11"
fi

BUMP_FLAG=""
FORCE_FLAG=""
CHECK_FLAG=""

usage() {
  echo "Usage: bash release/scripts/deploy-all-prod.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --bump <patch|minor|major>  Bump SemVer release versions before build"
  echo "  --force, -f                 Force rebuilding and deploying all containers"
  echo "  --check                     Check deployment deltas without pushing"
  echo "  --help                      Display this help message"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --bump)
      BUMP_FLAG="--bump $2"
      shift 2
      ;;
    --force|-f)
      FORCE_FLAG="--force"
      shift
      ;;
    --check)
      CHECK_FLAG="--check"
      shift
      ;;
    --help|-h)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

echo "============================================================"
echo "🚀 Production Deployment Package Orchestrator"
echo "============================================================"

# Step 1: Run Sanity & Automated Tests (Skip on --check)
if [[ -z "$CHECK_FLAG" ]]; then
  echo "▶ Step 1/4: Running automated sanity test suite..."
  bash release/scripts/run-all-tests.sh
fi

# Step 2: Build GA Release Artifacts
echo "▶ Step 2/4: Generating GG-CMS GA release build..."
bash release/build-ga-release.sh --env prod $BUMP_FLAG $FORCE_FLAG

echo "▶ Step 3/4: Generating AI Content Factory GA release build..."
bash content-factory/build-ga-release.sh --env prod $BUMP_FLAG

# Step 3: Trigger Cloud Deployments
echo "▶ Step 4/4: Triggering Cloud Run deployments..."
bash release/deploy-prod.sh $CHECK_FLAG $FORCE_FLAG
bash content-factory/deploy-prod.sh $CHECK_FLAG $FORCE_FLAG

echo "============================================================"
echo "✅ Production Deployment Package Completed Successfully!"
echo "============================================================"

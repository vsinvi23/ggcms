#!/usr/bin/env bash
set -e

# ==============================================================================
# AI Content Factory — GA Release Build Generator
# Handles SemVer version bumping, frontend compilation, and GA manifest updates
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

TARGET_ENV="prod"
BUMP_TYPE=""
TARGET_PACKAGE=""

usage() {
  echo "Usage: bash content-factory/build-ga-release.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --env <prod|test>             Target environment (default: prod)"
  echo "  --bump <patch|minor|major>    Bump version level for release/packages"
  echo "  --package <frontend|backend>  Target specific package for version bump"
  echo "  --help                        Display this help message"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      TARGET_ENV="$2"
      shift 2
      ;;
    --bump)
      BUMP_TYPE="$2"
      shift 2
      ;;
    --package)
      TARGET_PACKAGE="$2"
      shift 2
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

CF_DIR="content-factory"
GA_DIR="$CF_DIR/ga/$TARGET_ENV"
LATEST_DIR="$GA_DIR/latest"
MANIFEST_FILE="$GA_DIR/manifest.json"
VERSION_MANIFEST="$LATEST_DIR/version-manifest.json"


bump_semver() {
  local version="$1"
  local bump="$2"
  
  IFS='.' read -r major minor patch <<< "$version"
  major=${major:-0}
  minor=${minor:-0}
  patch=${patch:-0}

  case "$bump" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
    *) echo "$version"; return ;;
  esac
  echo "${major}.${minor}.${patch}"
}

FRONTEND_VER=$(python3 -c "import json; print(json.load(open('$CF_DIR/frontend/version.json'))['version'])" 2>/dev/null || echo "1.0.0")
BACKEND_VER=$(python3 -c "import json; print(json.load(open('$CF_DIR/backend/version.json'))['version'])" 2>/dev/null || echo "1.0.0")
SYS_VER=$(python3 -c "import json; print(json.load(open('$MANIFEST_FILE'))['current_version'])" 2>/dev/null || echo "1.0.0")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual-build")

echo "============================================================"
echo "📦 AI Content Factory GA Release Build Pipeline"
echo "   Timestamp: $TIMESTAMP | Commit: $COMMIT_SHA"
echo "============================================================"

if [[ -n "$BUMP_TYPE" ]]; then
  if [[ -n "$TARGET_PACKAGE" ]]; then
    echo "▶ Bumping version for package: $TARGET_PACKAGE ($BUMP_TYPE)"
    case "$TARGET_PACKAGE" in
      frontend) FRONTEND_VER=$(bump_semver "$FRONTEND_VER" "$BUMP_TYPE") ;;
      backend) BACKEND_VER=$(bump_semver "$BACKEND_VER" "$BUMP_TYPE") ;;
      *) echo "❌ Invalid package: $TARGET_PACKAGE"; exit 1 ;;
    esac
  else
    echo "▶ Bumping version for entire Content Factory release ($BUMP_TYPE)"
    SYS_VER=$(bump_semver "$SYS_VER" "$BUMP_TYPE")
    FRONTEND_VER=$(bump_semver "$FRONTEND_VER" "$BUMP_TYPE")
    BACKEND_VER=$(bump_semver "$BACKEND_VER" "$BUMP_TYPE")
  fi
fi

echo "📋 Target Versions:"
echo "   • System Release: $SYS_VER"
echo "   • Frontend:       $FRONTEND_VER"
echo "   • Backend:        $BACKEND_VER"
echo "------------------------------------------------------------"

python3 -c "
import json
def update_ver(path, ver):
    with open(path, 'r+') as f:
        data = json.load(f)
        data['version'] = ver
        data['updated_at'] = '$TIMESTAMP'
        f.seek(0)
        json.dump(data, f, indent=2)
        f.truncate()

update_ver('$CF_DIR/frontend/version.json', '$FRONTEND_VER')
update_ver('$CF_DIR/backend/version.json', '$BACKEND_VER')
update_ver('$CF_DIR/version.json', '$SYS_VER')
"

echo "▶ Building Content Factory React frontend..."
(cd "$CF_DIR/frontend" && npm run build)

mkdir -p "$LATEST_DIR"

cat <<EOF > "$VERSION_MANIFEST"
{
  "system_version": "$SYS_VER",
  "build_timestamp": "$TIMESTAMP",
  "git_commit": "$COMMIT_SHA",
  "components": {
    "frontend": {
      "version": "$FRONTEND_VER",
      "package": "content-factory/frontend",
      "description": "AI Content Factory React Frontend SPA"
    },
    "backend": {
      "version": "$BACKEND_VER",
      "package": "content-factory/backend",
      "description": "AI Content Factory FastAPI Backend Service"
    }
  }
}
EOF

python3 -c "
import json
manifest_path = '$MANIFEST_FILE'
with open(manifest_path, 'r+') as f:
    data = json.load(f)
    data['current_version'] = '$SYS_VER'
    data['last_build_at'] = '$TIMESTAMP'
    entry = {
        'version': '$SYS_VER',
        'built_at': '$TIMESTAMP',
        'branch': 'release',
        'commit': '$COMMIT_SHA',
        'components': {
            'frontend': '$FRONTEND_VER',
            'backend': '$BACKEND_VER'
        }
    }
    data['releases'].insert(0, entry)
    f.seek(0)
    json.dump(data, f, indent=2)
    f.truncate()
"

echo "============================================================"
echo "✅ AI Content Factory GA Release Build Complete!"
echo "   Artifacts saved to: $LATEST_DIR"
echo "============================================================"

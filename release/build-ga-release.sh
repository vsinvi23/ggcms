#!/usr/bin/env bash
set -e

# ==============================================================================
# GG-CMS — GA Release Build Generator
# Handles SemVer version bumping, UI compilation, GA packaging, and manifest updates
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

TARGET_ENV="prod"
BUMP_TYPE=""
TARGET_PACKAGE=""
FORCE_BUILD=false

# --- Function to Parse CLI Flags ---
usage() {
  echo "Usage: bash release/build-ga-release.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --env <prod|test>             Target environment (default: prod)"
  echo "  --bump <patch|minor|major>    Bump version level for release/packages"
  echo "  --package <ui|backend|db|cf>  Target specific package for version bump"
  echo "  --force                       Force rebuilding all packages"
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
    --force)
      FORCE_BUILD=true
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

GA_DIR="release/ga/$TARGET_ENV"
LATEST_DIR="$GA_DIR/latest"
MANIFEST_FILE="$GA_DIR/manifest.json"
VERSION_MANIFEST="$LATEST_DIR/version-manifest.json"


# --- Helper: SemVer Increment ---
bump_semver() {
  local version="$1"
  local bump="$2"
  
  IFS='.' read -r major minor patch <<< "$version"
  major=${major:-0}
  minor=${minor:-0}
  patch=${patch:-0}

  case "$bump" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    patch)
      patch=$((patch + 1))
      ;;
    *)
      echo "$version"
      return
      ;;
  esac
  echo "${major}.${minor}.${patch}"
}

# --- Load current package versions ---
UI_VER=$(python3 -c "import json; print(json.load(open('gg-cms/frontend/react-ui/version.json'))['version'])" 2>/dev/null || echo "1.0.0")
BACKEND_VER=$(python3 -c "import json; print(json.load(open('gg-cms/backend/go-cms/version.json'))['version'])" 2>/dev/null || echo "1.0.0")
CF_VER=$(python3 -c "import json; print(json.load(open('content-factory/version.json'))['version'])" 2>/dev/null || echo "1.0.0")
DB_VER=$(python3 -c "import json; print(json.load(open('gg-cms/backend/go-cms/migrations/version.json'))['version'])" 2>/dev/null || echo "1.0.0")
SYS_VER=$(python3 -c "import json; print(json.load(open('$MANIFEST_FILE'))['current_version'])" 2>/dev/null || echo "1.0.0")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual-build")

echo "============================================================"
echo "📦 GG-CMS GA Release Build Pipeline"
echo "   Timestamp: $TIMESTAMP | Commit: $COMMIT_SHA"
echo "============================================================"

# --- Apply Version Bumps ---
if [[ -n "$BUMP_TYPE" ]]; then
  if [[ -n "$TARGET_PACKAGE" ]]; then
    echo "▶ Bumping version for package: $TARGET_PACKAGE ($BUMP_TYPE)"
    case "$TARGET_PACKAGE" in
      ui) UI_VER=$(bump_semver "$UI_VER" "$BUMP_TYPE") ;;
      backend) BACKEND_VER=$(bump_semver "$BACKEND_VER" "$BUMP_TYPE") ;;
      content-factory|cf) CF_VER=$(bump_semver "$CF_VER" "$BUMP_TYPE") ;;
      db) DB_VER=$(bump_semver "$DB_VER" "$BUMP_TYPE") ;;
      *) echo "❌ Invalid package: $TARGET_PACKAGE"; exit 1 ;;
    esac
  else
    echo "▶ Bumping version for entire system release ($BUMP_TYPE)"
    SYS_VER=$(bump_semver "$SYS_VER" "$BUMP_TYPE")
    UI_VER=$(bump_semver "$UI_VER" "$BUMP_TYPE")
    BACKEND_VER=$(bump_semver "$BACKEND_VER" "$BUMP_TYPE")
    CF_VER=$(bump_semver "$CF_VER" "$BUMP_TYPE")
    DB_VER=$(bump_semver "$DB_VER" "$BUMP_TYPE")
  fi
fi

echo "📋 Target Versions:"
echo "   • System:          $SYS_VER"
echo "   • React UI:        $UI_VER"
echo "   • Go Backend:      $BACKEND_VER"
echo "   • Content Factory: $CF_VER"
echo "   • DB Migrations:   $DB_VER"
echo "------------------------------------------------------------"

# --- Update package version.json files ---
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

update_ver('gg-cms/frontend/react-ui/version.json', '$UI_VER')
update_ver('gg-cms/backend/go-cms/version.json', '$BACKEND_VER')
update_ver('content-factory/version.json', '$CF_VER')
update_ver('gg-cms/backend/go-cms/migrations/version.json', '$DB_VER')
"

# --- Build React UI frontend ---
echo "▶ Building React UI SPA frontend..."
(cd gg-cms/frontend/react-ui && npm run build)
rm -rf gg-cms/backend/go-cms/dist
cp -r gg-cms/frontend/react-ui/dist gg-cms/backend/go-cms/dist

# --- Package GA release payload ---
echo "▶ Preparing GA release directory..."
mkdir -p "$LATEST_DIR/db/migrations"
cp -r gg-cms/backend/go-cms/migrations/postgres/* "$LATEST_DIR/db/migrations/"

# --- Write GA latest/version-manifest.json ---
cat <<EOF > "$VERSION_MANIFEST"
{
  "system_version": "$SYS_VER",
  "build_timestamp": "$TIMESTAMP",
  "git_commit": "$COMMIT_SHA",
  "components": {
    "ui": {
      "version": "$UI_VER",
      "package": "gg-cms/frontend/react-ui",
      "description": "GG-CMS React SPA Frontend"
    },
    "backend": {
      "version": "$BACKEND_VER",
      "package": "gg-cms/backend/go-cms",
      "description": "GG-CMS Go Backend API Service"
    },
    "db": {
      "version": "$DB_VER",
      "package": "gg-cms/backend/go-cms/migrations",
      "description": "PostgreSQL & MongoDB Schemas"
    },
    "content-factory": {
      "version": "$CF_VER",
      "package": "content-factory",
      "description": "AI Content Factory Python Service"
    }
  }
}
EOF

# --- Update release/ga/manifest.json ---
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
            'ui': '$UI_VER',
            'backend': '$BACKEND_VER',
            'db': '$DB_VER',
            'content-factory': '$CF_VER'
        }
    }
    data['releases'].insert(0, entry)
    f.seek(0)
    json.dump(data, f, indent=2)
    f.truncate()
"

echo "============================================================"
echo "✅ GA Release Build Complete!"
echo "   Artifacts saved to: $LATEST_DIR"
echo "============================================================"

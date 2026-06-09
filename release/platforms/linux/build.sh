#!/usr/bin/env bash
# GG-CMS — Linux Build Script
# Builds Docker images (for deployment) and native Linux binaries.
#
# Usage:
#   bash build.sh                    — Docker images + native linux/amd64 binary
#   bash build.sh --docker-only      — Docker images only
#   bash build.sh --native-only      — native Go binary only
#   bash build.sh --all-platforms    — native binaries for all target platforms
#   bash build.sh --export           — export Docker images as .tar.gz files
#   bash build.sh --no-cache         — force full Docker rebuild
#   bash build.sh --platform arm64   — set Docker target platform (default: amd64)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$RELEASE_DIR/.." && pwd)"
BACKEND_SRC="$REPO_ROOT/gg-cms/backend/go-cms"
FRONTEND_SRC="$REPO_ROOT/gg-cms/frontend/react-ui"
OUT_DIR="$RELEASE_DIR/dist"
cd "$RELEASE_DIR"

BUILD_DOCKER=true
BUILD_NATIVE=true
ALL_PLATFORMS=false
EXPORT_IMAGES=false
NO_CACHE=""
TARGET_PLATFORM="linux/amd64"

for i in "$@"; do
  case $i in
    --docker-only)   BUILD_NATIVE=false ;;
    --native-only)   BUILD_DOCKER=false ;;
    --all-platforms) ALL_PLATFORMS=true ;;
    --export)        EXPORT_IMAGES=true ;;
    --no-cache)      NO_CACHE="--no-cache" ;;
    --platform)      ;; # handled below
  esac
done
# Handle --platform <value>
PREV=""
for arg in "$@"; do
  [ "$PREV" = "--platform" ] && TARGET_PLATFORM="linux/$arg"
  PREV="$arg"
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo "  [INFO]  $*"; }
ok()      { echo "  [OK]    $*"; }
warn()    { echo "  [WARN]  $*"; }
err()     { echo "  [ERROR] $*" >&2; exit 1; }
header()  { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

DOCKER="docker"
command -v docker &>/dev/null || err "docker not found. Run: bash deploy.sh --install"
docker info &>/dev/null 2>&1 || { DOCKER="sudo docker"; }

header "GG-CMS — Linux Build"
info "Host arch       : $(uname -m)"
info "Docker target   : $TARGET_PLATFORM"
info "Build Docker    : $BUILD_DOCKER"
info "Build native    : $BUILD_NATIVE"

mkdir -p "$OUT_DIR/bin" "$OUT_DIR/frontend" "$OUT_DIR/images"

# ══ DOCKER IMAGE BUILD ════════════════════════════════════════════════════════
if $BUILD_DOCKER; then
  header "Docker Image Build"

  [ -f .env ] || { cp .env.example .env; warn ".env created from example — fill required values"; }

  export DOCKER_DEFAULT_PLATFORM=$TARGET_PLATFORM

  $DOCKER compose build $NO_CACHE backend
  ok "Backend image built (gg-cms-backend:latest)"

  $DOCKER compose build $NO_CACHE frontend
  ok "Frontend image built (gg-cms-frontend:latest)"

  # ── Export ──────────────────────────────────────────────────────────────────
  if $EXPORT_IMAGES; then
    header "Exporting images"
    declare -A IMAGES=(
      ["gg-cms-backend:latest"]="gg-cms-backend.tar.gz"
      ["gg-cms-frontend:latest"]="gg-cms-frontend.tar.gz"
      ["postgres:16-alpine"]="postgres-16-alpine.tar.gz"
      ["mongo:7-jammy"]="mongo-7-jammy.tar.gz"
    )

    for IMG in "${!IMAGES[@]}"; do
      FILE="${IMAGES[$IMG]}"
      info "Saving $IMG → dist/images/$FILE ..."
      # Pull base images if needed
      echo "$IMG" | grep -qv "gg-cms" && $DOCKER pull "$IMG" &>/dev/null || true
      $DOCKER save "$IMG" | gzip > "$OUT_DIR/images/$FILE"
      SIZE=$(du -sh "$OUT_DIR/images/$FILE" | cut -f1)
      ok "$FILE ($SIZE)"
    done

    echo ""
    echo "  Load on target server:"
    echo "    gunzip -c gg-cms-backend.tar.gz  | docker load"
    echo "    gunzip -c gg-cms-frontend.tar.gz | docker load"
    echo "    gunzip -c postgres-16-alpine.tar.gz | docker load"
    echo "    gunzip -c mongo-7-jammy.tar.gz      | docker load"
    echo "    docker compose up -d"
  fi
fi

# ══ NATIVE BINARY BUILD ═══════════════════════════════════════════════════════
if $BUILD_NATIVE; then
  header "Native Binary Build"

  command -v go &>/dev/null || err "Go not found. Install: https://go.dev/dl/"
  info "Go: $(go version)"

  cd "$BACKEND_SRC"

  if $ALL_PLATFORMS; then
    TARGETS=(
      "linux/amd64:"
      "linux/arm64:"
      "darwin/amd64:"
      "darwin/arm64:"
      "windows/amd64:.exe"
    )
  else
    TARGETS=("linux/amd64:")
  fi

  for TARGET in "${TARGETS[@]}"; do
    PLATFORM="${TARGET%%:*}"
    EXT="${TARGET##*:}"
    OS="${PLATFORM%%/*}"
    ARCH="${PLATFORM##*/}"
    BIN_NAME="gg-cms-server-${OS}-${ARCH}${EXT}"

    info "Building $PLATFORM..."
    CGO_ENABLED=0 GOOS="$OS" GOARCH="$ARCH" \
      go build -a -trimpath -ldflags="-w -s" \
      -o "$OUT_DIR/bin/$BIN_NAME" ./cmd/server
    SIZE=$(du -sh "$OUT_DIR/bin/$BIN_NAME" | cut -f1)
    ok "$BIN_NAME ($SIZE)"
  done

  cd "$RELEASE_DIR"

  # ── Frontend Vite production bundle ─────────────────────────────────────────
  command -v node &>/dev/null || err "Node.js not found. Install: https://nodejs.org"
  info "Node: $(node --version)  npm: $(npm --version)"

  cd "$FRONTEND_SRC"

  info "Installing frontend dependencies..."
  npm ci --silent
  ok "Dependencies installed"

  # Source VITE_ vars from release .env
  if [ -f "$RELEASE_DIR/.env" ]; then
    set -o allexport
    # shellcheck disable=SC1090
    source <(grep -E '^VITE_' "$RELEASE_DIR/.env" 2>/dev/null || true)
    set +o allexport
  fi
  export VITE_APP_ENV=production

  info "Building React production bundle..."
  npm run build
  cp -r dist/. "$OUT_DIR/frontend/"
  ok "Frontend bundle saved to dist/frontend/"

  cd "$RELEASE_DIR"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
header "Build complete — dist/"
echo ""
find "$OUT_DIR" -type f | sort | while IFS= read -r f; do
  SIZE=$(du -sh "$f" 2>/dev/null | cut -f1)
  printf "  %6s  %s\n" "$SIZE" "${f#$OUT_DIR/}"
done
echo ""

#!/usr/bin/env bash
# GG-CMS — macOS Build Script
# Builds Docker images (for deployment) AND native macOS binaries (for local run).
#
# Usage:
#   bash build.sh                    — build Docker images (default)
#   bash build.sh --docker-only      — Docker images only
#   bash build.sh --native-only      — native macOS binaries only
#   bash build.sh --export           — build Docker images and export as .tar files
#   bash build.sh --platform amd64   — override target arch (default: matches host)
#   bash build.sh --no-cache         — force full Docker rebuild

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
EXPORT_IMAGES=false
NO_CACHE=""
HOST_ARCH=$(uname -m)
TARGET_PLATFORM="linux/${HOST_ARCH/x86_64/amd64}"  # linux/arm64 or linux/amd64

for arg in "$@"; do
  case $arg in
    --docker-only)  BUILD_NATIVE=false ;;
    --native-only)  BUILD_DOCKER=false ;;
    --export)       EXPORT_IMAGES=true ;;
    --no-cache)     NO_CACHE="--no-cache" ;;
    --platform)     ;;  # next arg is value
  esac
done
# Handle --platform <value>
for i in "${!@}"; do
  if [ "${@:$i:1}" = "--platform" ]; then
    TARGET_PLATFORM="linux/${@:$((i+1)):1}"
  fi
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()   { echo "  [INFO]  $*"; }
ok()     { echo "  [OK]    $*"; }
warn()   { echo "  [WARN]  $*"; }
err()    { echo "  [ERROR] $*" >&2; exit 1; }
header() { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

header "GG-CMS — macOS Build"
info "Host arch : $(uname -m)"
info "Docker target: $TARGET_PLATFORM"

# ── Output directory ──────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR/bin" "$OUT_DIR/frontend" "$OUT_DIR/images"

# ══ DOCKER IMAGE BUILD ════════════════════════════════════════════════════════
if $BUILD_DOCKER; then
  header "Docker Image Build"

  # Verify Docker is available
  docker info &>/dev/null 2>&1 || err "Docker not running. Start Docker Desktop or Colima first."
  command -v docker compose &>/dev/null || docker compose version &>/dev/null \
    || err "docker compose plugin not found."

  # Load .env for build args
  [ -f .env ] || { cp .env.example .env; warn ".env created from example — fill required values"; }

  export DOCKER_DEFAULT_PLATFORM=$TARGET_PLATFORM

  info "Building backend image (gg-cms-backend:latest)..."
  docker compose build $NO_CACHE backend
  ok "Backend image built"

  info "Building frontend image (gg-cms-frontend:latest)..."
  docker compose build $NO_CACHE frontend
  ok "Frontend image built"

  # ── Export images as tar files (for offline/air-gapped deployment) ──────────
  if $EXPORT_IMAGES; then
    header "Exporting images"
    info "Saving gg-cms-backend.tar..."
    docker save gg-cms-backend:latest | gzip > "$OUT_DIR/images/gg-cms-backend.tar.gz"
    ok "Saved: dist/images/gg-cms-backend.tar.gz"

    info "Saving gg-cms-frontend.tar..."
    docker save gg-cms-frontend:latest | gzip > "$OUT_DIR/images/gg-cms-frontend.tar.gz"
    ok "Saved: dist/images/gg-cms-frontend.tar.gz"

    info "Saving postgres image..."
    docker pull postgres:16-alpine
    docker save postgres:16-alpine | gzip > "$OUT_DIR/images/postgres-16-alpine.tar.gz"
    ok "Saved: dist/images/postgres-16-alpine.tar.gz"

    info "Saving mongodb image..."
    docker pull mongo:7-jammy
    docker save mongo:7-jammy | gzip > "$OUT_DIR/images/mongo-7-jammy.tar.gz"
    ok "Saved: dist/images/mongo-7-jammy.tar.gz"

    echo ""
    echo "  Load on target machine:"
    echo "    gunzip -c gg-cms-backend.tar.gz | docker load"
    echo "    docker compose up -d"
  fi
fi

# ══ NATIVE macOS BINARY BUILD ═════════════════════════════════════════════════
if $BUILD_NATIVE; then
  header "Native macOS Binary Build"

  # ── Backend — Go binary ───────────────────────────────────────────────────
  command -v go &>/dev/null || err "Go not found. Install: brew install go"
  GO_VERSION=$(go version | awk '{print $3}')
  info "Go version: $GO_VERSION"

  cd "$BACKEND_SRC"

  info "Building for darwin/arm64 (Apple Silicon)..."
  CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 \
    go build -a -ldflags="-w -s" -o "$OUT_DIR/bin/gg-cms-server-darwin-arm64" ./cmd/server
  ok "Binary: dist/bin/gg-cms-server-darwin-arm64"

  info "Building for darwin/amd64 (Intel Mac)..."
  CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 \
    go build -a -ldflags="-w -s" -o "$OUT_DIR/bin/gg-cms-server-darwin-amd64" ./cmd/server
  ok "Binary: dist/bin/gg-cms-server-darwin-amd64"

  info "Building for linux/amd64 (deployment target)..."
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -a -ldflags="-w -s" -o "$OUT_DIR/bin/gg-cms-server-linux-amd64" ./cmd/server
  ok "Binary: dist/bin/gg-cms-server-linux-amd64"

  info "Building for linux/arm64 (ARM deployment target)..."
  CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
    go build -a -ldflags="-w -s" -o "$OUT_DIR/bin/gg-cms-server-linux-arm64" ./cmd/server
  ok "Binary: dist/bin/gg-cms-server-linux-arm64"

  cd "$RELEASE_DIR"

  # ── Frontend — Vite production bundle ─────────────────────────────────────
  command -v node &>/dev/null || err "Node.js not found. Install: brew install node"
  info "Node version: $(node --version)"

  cd "$FRONTEND_SRC"

  info "Installing frontend dependencies..."
  npm ci --silent
  ok "Dependencies installed"

  # Load VITE_ vars from release .env if present
  if [ -f "$RELEASE_DIR/.env" ]; then
    set -o allexport
    # shellcheck disable=SC1090
    source <(grep -E '^VITE_' "$RELEASE_DIR/.env" || true)
    set +o allexport
  fi
  export VITE_APP_ENV=production

  info "Building React production bundle..."
  npm run build
  cp -r dist/. "$OUT_DIR/frontend/"
  ok "Frontend bundle: dist/frontend/"

  cd "$RELEASE_DIR"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
header "Build complete"
echo "  Output directory: $OUT_DIR"
echo ""
find "$OUT_DIR" -type f | sort | while read -r f; do
  size=$(du -sh "$f" 2>/dev/null | cut -f1)
  echo "    $size  ${f#$OUT_DIR/}"
done
echo ""

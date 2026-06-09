#!/usr/bin/env bash
# GG-CMS — Root Build Script
# Auto-detects platform and delegates to the matching platform build script.
# All output lands in release/dist/ — the release folder becomes self-contained.
#
# Usage (run from the release/ folder):
#   bash build.sh                    — build Docker images + native binary for host OS
#   bash build.sh --docker-only      — Docker images only (no native binary)
#   bash build.sh --native-only      — native binary only (no Docker)
#   bash build.sh --all-platforms    — native binaries for every target OS/arch
#   bash build.sh --no-cache         — force full Docker rebuild
#   bash build.sh --backend-only     — build backend image only (skip frontend)
#   bash build.sh --platform arm64   — override Docker target platform
#
# After a successful build:
#   dist/images/gg-cms-backend.tar.gz   ← backend Docker image
#   dist/images/gg-cms-frontend.tar.gz  ← frontend Docker image
#   dist/images/postgres-16-alpine.tar.gz
#   dist/images/mongo-7-jammy.tar.gz
#   dist/bin/gg-cms-server-<os>-<arch>  ← native Go server binaries
#   dist/frontend/                       ← Vite production bundle
#
# Deploy after build:
#   bash deploy.sh --load            ← loads dist/ images, no source needed
#   bash deploy-backend.sh --load    ← backend-only equivalent

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Helpers ───────────────────────────────────────────────────────────────────
header() { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }
ok()     { echo "  [OK]    $*"; }
info()   { echo "  [INFO]  $*"; }
err()    { echo "  [ERROR] $*" >&2; exit 1; }

# ── Detect platform ───────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin)                           PLATFORM="mac" ;;
  Linux)                            PLATFORM="linux" ;;
  MINGW*|MSYS*|CYGWIN*)             PLATFORM="windows" ;;
  *)                                err "Unsupported OS: $OS" ;;
esac

header "GG-CMS — Build  [platform: $PLATFORM]"
info "Source root : $(cd .. && pwd)/gg-cms"
info "Output dir  : $SCRIPT_DIR/dist"

# ── Handle --backend-only (skip frontend build arg) ───────────────────────────
PASS_ARGS=("$@")
if [[ " $* " == *" --backend-only "* ]]; then
  # Remove --backend-only from args; platform scripts don't know it
  PASS_ARGS=()
  for arg in "$@"; do
    [ "$arg" != "--backend-only" ] && PASS_ARGS+=("$arg")
  done
  PASS_ARGS+=("--docker-only")
  info "Backend-only build requested — skipping frontend and native binaries"
fi

# ── Delegate to platform script ───────────────────────────────────────────────
PLATFORM_SCRIPT="platforms/$PLATFORM/build.sh"

[ -f "$PLATFORM_SCRIPT" ] || err "Platform script not found: $PLATFORM_SCRIPT"

info "Running: platforms/$PLATFORM/build.sh ${PASS_ARGS[*]:-}"
echo ""

# Always include --export so dist/images/ is populated for self-contained deployment
EXPORT_FLAG="--export"
for arg in "${PASS_ARGS[@]}"; do
  [ "$arg" = "--native-only" ] && EXPORT_FLAG="" && break
done

bash "$PLATFORM_SCRIPT" "${PASS_ARGS[@]}" $EXPORT_FLAG

# ── Post-build summary ────────────────────────────────────────────────────────
header "Build complete — dist/"
if [ -d "dist" ]; then
  find dist -type f | sort | while IFS= read -r f; do
    SIZE=$(du -sh "$f" 2>/dev/null | cut -f1)
    printf "  %6s  %s\n" "$SIZE" "${f#dist/}"
  done
fi
echo ""
echo "  Next: deploy from this folder"
echo "    Full stack:   bash deploy.sh --load"
echo "    Backend only: bash deploy-backend.sh --load"
echo ""

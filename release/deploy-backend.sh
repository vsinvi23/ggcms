#!/usr/bin/env bash
# GG-CMS — Backend-only Deployment Script (PostgreSQL + MongoDB + Go API)
# Use when deploying the API server without the frontend.
#
# Usage:
#   bash deploy-backend.sh               — start backend stack (pre-built images)
#   bash deploy-backend.sh --build       — build backend image then start
#   bash deploy-backend.sh --load        — load image from dist/images/ then start
#   bash deploy-backend.sh --no-cache    — force full Docker rebuild (implies --build)
#   bash deploy-backend.sh --with-tools  — also start pgAdmin
#   bash deploy-backend.sh --down        — stop and remove containers
#   bash deploy-backend.sh --logs        — tail live logs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
COMPOSE_FILE="docker-compose.backend.yml"

WITH_TOOLS=false
NO_CACHE=""
DO_BUILD=false
DO_LOAD=false
ACTION="up"

for arg in "$@"; do
  case $arg in
    --with-tools) WITH_TOOLS=true ;;
    --no-cache)   NO_CACHE="--no-cache"; DO_BUILD=true ;;
    --build)      DO_BUILD=true ;;
    --load)       DO_LOAD=true ;;
    --down)       ACTION="down" ;;
    --logs)       ACTION="logs" ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo "  [INFO]  $*"; }
ok()      { echo "  [OK]    $*"; }
warn()    { echo "  [WARN]  $*"; }
err()     { echo "  [ERROR] $*" >&2; exit 1; }
header()  { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

header "GG-CMS — Backend Deploy"

command -v docker &>/dev/null || err "docker not found. Install: https://docs.docker.com/get-docker/"
docker compose version &>/dev/null || err "docker compose plugin not found."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ── Handle --down / --logs ────────────────────────────────────────────────────
if [ "$ACTION" = "down" ]; then
  docker compose -f "$COMPOSE_FILE" down
  ok "Backend services stopped."
  exit 0
fi
if [ "$ACTION" = "logs" ]; then
  docker compose -f "$COMPOSE_FILE" logs -f --tail=100
  exit 0
fi

# ── Data directories ──────────────────────────────────────────────────────────
header "Preparing directories"
for dir in data/postgres data/mongodb data/mongodb-config data/uploads data/pgadmin; do
  mkdir -p "$dir"
  ok "$dir"
done

# ── Environment ───────────────────────────────────────────────────────────────
header "Environment"
if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env created — edit then re-run"
  echo ""
  echo "  Required: POSTGRES_PASSWORD  MONGO_PASSWORD  JWT_SECRET  ADMIN_PASSWORD"
  echo ""
  exit 0
fi
ok ".env present"

[ -f config/backend/app.env ] || { cp config/backend/app.env.example config/backend/app.env; info "config/backend/app.env created"; }
ok "config/backend/app.env ready"

# ── Load pre-built images from dist/ ─────────────────────────────────────────
if $DO_LOAD; then
  header "Loading images from dist/"
  IMG="dist/images/gg-cms-backend.tar.gz"
  [ -f "$IMG" ] || err "Image not found: $IMG  Run: bash build.sh first"
  info "Loading gg-cms-backend..."
  gunzip -c "$IMG" | docker load
  ok "gg-cms-backend:latest loaded"

  for base in postgres-16-alpine mongo-7-jammy; do
    f="dist/images/$base.tar.gz"
    [ -f "$f" ] && { info "Loading $base..."; gunzip -c "$f" | docker load; ok "$base loaded"; }
  done
fi

# ── Build backend image ───────────────────────────────────────────────────────
COMPOSE_PROFILES=()
if $WITH_TOOLS; then COMPOSE_PROFILES=(--profile tools); fi

if $DO_BUILD; then
  header "Building backend image (release mode)"
  docker compose -f "$COMPOSE_FILE" "${COMPOSE_PROFILES[@]}" build $NO_CACHE backend
  ok "Backend image built"
fi

# ── Start ─────────────────────────────────────────────────────────────────────
header "Starting backend services"
docker compose -f "$COMPOSE_FILE" "${COMPOSE_PROFILES[@]}" up -d
ok "Services started"

header "Service status"
docker compose -f "$COMPOSE_FILE" ps

# ── Access ────────────────────────────────────────────────────────────────────
header "Access"
BACKEND_PORT=$(grep -E '^BACKEND_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "8080")
BACKEND_PORT=${BACKEND_PORT:-8080}
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo "  API (local):    http://localhost:${BACKEND_PORT}/api/health"
echo "  API (network):  http://${HOST_IP}:${BACKEND_PORT}/api/health"
if $WITH_TOOLS; then
  PGADMIN_PORT=$(grep -E '^PGADMIN_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "5050")
  echo "  pgAdmin:        http://localhost:${PGADMIN_PORT:-5050}"
fi
echo ""
echo "  Point your frontend VITE_API_BASE_URL to: http://${HOST_IP}:${BACKEND_PORT}/api"
echo ""
echo "  Logs:  bash deploy-backend.sh --logs"
echo "  Stop:  bash deploy-backend.sh --down"
echo ""

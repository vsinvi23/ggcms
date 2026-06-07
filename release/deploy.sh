#!/usr/bin/env bash
# GG-CMS — Full-stack Production Deployment Script (UI + API + DBs)
#
# Workflow:
#   1. Build:   bash build.sh              → populates dist/ with images
#   2. Deploy:  bash deploy.sh --load      → loads dist/ images, starts stack
#
#   OR single command (needs source alongside release/):
#   bash deploy.sh --build                 → build from source then start
#
# Usage:
#   bash deploy.sh                — start with existing local Docker images
#   bash deploy.sh --load         — load images from dist/images/ then start
#   bash deploy.sh --build        — build from source then start
#   bash deploy.sh --no-cache     — force full rebuild (implies --build)
#   bash deploy.sh --with-tools   — also start pgAdmin
#   bash deploy.sh --down         — stop and remove all containers
#   bash deploy.sh --logs         — tail live logs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

header "GG-CMS — Full-stack Deploy"

command -v docker &>/dev/null || err "docker not found. Install: https://docs.docker.com/get-docker/"
docker compose version &>/dev/null || err "docker compose plugin not found."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ── Handle --down / --logs ────────────────────────────────────────────────────
if [ "$ACTION" = "down" ]; then
  docker compose down
  ok "All services stopped."
  exit 0
fi
if [ "$ACTION" = "logs" ]; then
  docker compose logs -f --tail=100
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
  warn ".env created from .env.example — edit required values then re-run"
  echo ""
  echo "  Required: POSTGRES_PASSWORD  MONGO_PASSWORD  JWT_SECRET  ADMIN_PASSWORD"
  echo ""
  exit 0
fi
ok ".env present"

[ -f config/backend/app.env ] || { cp config/backend/app.env.example config/backend/app.env; info "config/backend/app.env created"; }
ok "config/backend/app.env ready"
ok "config/frontend/nginx.conf ready"

# ── Load pre-built images from dist/ ─────────────────────────────────────────
if $DO_LOAD; then
  header "Loading images from dist/"

  for img_name in gg-cms-backend gg-cms-frontend; do
    f="dist/images/${img_name}.tar.gz"
    [ -f "$f" ] || err "Image not found: $f  Run: bash build.sh first"
    info "Loading $img_name..."
    gunzip -c "$f" | docker load
    ok "$img_name:latest loaded"
  done

  for base in postgres-16-alpine mongo-7-jammy; do
    f="dist/images/$base.tar.gz"
    [ -f "$f" ] && { info "Loading $base..."; gunzip -c "$f" | docker load; ok "$base loaded"; }
  done
fi

# ── Build images from source ──────────────────────────────────────────────────
COMPOSE_PROFILES=()
if $WITH_TOOLS; then
  COMPOSE_PROFILES=(--profile tools)
  info "pgAdmin enabled"
fi

if $DO_BUILD; then
  header "Building images from source (release mode)"
  docker compose "${COMPOSE_PROFILES[@]}" build $NO_CACHE
  ok "Images built"
fi

# ── Start ─────────────────────────────────────────────────────────────────────
header "Starting services"
docker compose "${COMPOSE_PROFILES[@]}" up -d
ok "Services started"

header "Service status"
docker compose ps

# ── Access ────────────────────────────────────────────────────────────────────
header "Access"
FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "80")
BACKEND_PORT=$(grep  -E '^BACKEND_PORT='  .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "8080")
FRONTEND_PORT=${FRONTEND_PORT:-80}
BACKEND_PORT=${BACKEND_PORT:-8080}
echo "  UI:       http://localhost:${FRONTEND_PORT}"
echo "  API:      http://localhost:${BACKEND_PORT}/api/health"
if $WITH_TOOLS; then
  PGADMIN_PORT=$(grep -E '^PGADMIN_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "5050")
  echo "  pgAdmin:  http://localhost:${PGADMIN_PORT:-5050}"
fi
echo ""
echo "  Logs:  bash deploy.sh --logs"
echo "  Stop:  bash deploy.sh --down"
echo ""

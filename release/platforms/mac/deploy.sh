#!/usr/bin/env bash
# GG-CMS — macOS Deployment Script
# Usage:
#   bash deploy.sh               — build images and start all services
#   bash deploy.sh --with-tools  — also start pgAdmin
#   bash deploy.sh --no-cache    — force full rebuild
#   bash deploy.sh --down        — stop and remove containers
#   bash deploy.sh --logs        — tail live logs
#   bash deploy.sh --colima      — use Colima instead of Docker Desktop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$RELEASE_DIR"

WITH_TOOLS=false
NO_CACHE=""
ACTION="up"
USE_COLIMA=false

for arg in "$@"; do
  case $arg in
    --with-tools) WITH_TOOLS=true ;;
    --no-cache)   NO_CACHE="--no-cache" ;;
    --down)       ACTION="down" ;;
    --logs)       ACTION="logs" ;;
    --colima)     USE_COLIMA=true ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo "  [INFO]  $*"; }
ok()      { echo "  [OK]    $*"; }
warn()    { echo "  [WARN]  $*"; }
err()     { echo "  [ERROR] $*" >&2; exit 1; }
header()  { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

header "GG-CMS — macOS Deploy"

# ── Docker runtime check ──────────────────────────────────────────────────────
if $USE_COLIMA; then
  if ! command -v colima &>/dev/null; then
    err "Colima not found. Install: brew install colima docker docker-compose"
  fi
  if ! colima status &>/dev/null 2>&1; then
    info "Starting Colima..."
    colima start --cpu 4 --memory 6 --disk 60
  fi
  ok "Colima running"
else
  # Docker Desktop
  if ! docker info &>/dev/null 2>&1; then
    warn "Docker Desktop not running — attempting to start..."
    open -a Docker 2>/dev/null || err "Docker Desktop not found. Install: https://docs.docker.com/desktop/mac/"
    echo "  Waiting for Docker to start (up to 60s)..."
    for i in $(seq 1 30); do
      docker info &>/dev/null 2>&1 && break
      sleep 2
      [ "$i" -eq 30 ] && err "Docker Desktop did not start in 60s. Open it manually."
    done
  fi
  ok "Docker Desktop running"
fi

command -v docker compose &>/dev/null || docker compose version &>/dev/null \
  || err "docker compose plugin not found. Update Docker Desktop."

# ── Detect Apple Silicon ──────────────────────────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  info "Apple Silicon (arm64) detected — images built for linux/arm64"
  export DOCKER_DEFAULT_PLATFORM=linux/arm64
else
  info "Intel (amd64) detected"
  export DOCKER_DEFAULT_PLATFORM=linux/amd64
fi

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
  warn ".env created — edit it then re-run"
  echo ""
  echo "  Required: POSTGRES_PASSWORD  MONGO_PASSWORD  JWT_SECRET  ADMIN_PASSWORD"
  echo "  Open .env: open -e .env"
  echo ""
  open -e .env 2>/dev/null || true
  exit 0
fi
ok ".env present"

if [ ! -f config/backend/app.env ]; then
  cp config/backend/app.env.example config/backend/app.env
  info "config/backend/app.env created (all overrides commented out)"
fi

# ── Build & start ─────────────────────────────────────────────────────────────
header "Building Docker images (release mode)"

COMPOSE_PROFILES=()
if $WITH_TOOLS; then
  COMPOSE_PROFILES=(--profile tools)
fi

docker compose "${COMPOSE_PROFILES[@]}" build $NO_CACHE
ok "Images built"

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

echo "  UI:   http://localhost:${FRONTEND_PORT}"
echo "  API:  http://localhost:${BACKEND_PORT}/api/health"
if $WITH_TOOLS; then
  PGADMIN_PORT=$(grep -E '^PGADMIN_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "5050")
  echo "  pgAdmin: http://localhost:${PGADMIN_PORT:-5050}"
fi
echo ""

# Open browser after a short wait for services to be ready
info "Opening browser in 5s..."
(sleep 5 && open "http://localhost:${FRONTEND_PORT}") &

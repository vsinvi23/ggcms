#!/usr/bin/env bash
# =============================================================================
# setup.sh — Pull Docker images, start databases, and run the Go CMS server
# Usage: bash scripts/setup.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

cd "$ROOT"

# ── Colours ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

# ── Pre-checks ─────────────────────────────────────────────────────────────
command -v docker        >/dev/null 2>&1 || error "Docker not found. Install Docker Desktop first."
command -v docker-compose >/dev/null 2>&1 || command -v docker >/dev/null 2>&1 || error "docker-compose not found."

# Resolve compose command (modern plugin vs standalone)
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

# ── Pull images ─────────────────────────────────────────────────────────────
info "Pulling Docker images..."
$COMPOSE pull postgres mongodb

# ── Start databases ─────────────────────────────────────────────────────────
info "Starting PostgreSQL and MongoDB..."
$COMPOSE up -d postgres mongodb

# ── Wait for PostgreSQL ──────────────────────────────────────────────────────
info "Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U go_cms_user -d go_cms >/dev/null 2>&1; then
    info "PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "PostgreSQL did not become healthy in time."
  fi
  sleep 2
done

# ── Wait for MongoDB ─────────────────────────────────────────────────────────
info "Waiting for MongoDB to be healthy..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
    info "MongoDB is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "MongoDB did not become healthy in time."
  fi
  sleep 2
done

# ── Write .env if absent ─────────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Creating .env from template..."
  cp .env.example .env
  # Patch in the docker-compose credentials
  sed -i 's|DB_WRITE_URL=.*|DB_WRITE_URL=postgres://go_cms_user:go_cms_pass@localhost:5433/go_cms?sslmode=disable|' .env
  sed -i 's|DB_READ_URL=.*|DB_READ_URL=|' .env
  sed -i 's|MONGO_URI=.*|MONGO_URI=mongodb://go_cms_user:go_cms_pass@localhost:27017|' .env
  sed -i 's|MONGO_DATABASE=.*|MONGO_DATABASE=go_cms|' .env
  sed -i 's|JWT_SECRET=.*|JWT_SECRET=change-me-in-production-min-32-chars!!|' .env
  warn ".env created with default credentials — change JWT_SECRET before deploying!"
else
  info ".env already exists, skipping."
fi

# ── Build & run the Go server ─────────────────────────────────────────────────
info "Building Go CMS server..."
go build -o server ./cmd/server

info "Starting Go CMS server on :${SERVER_PORT:-1337} ..."
echo ""
echo "  Default credentials:"
echo "    Admin : admin@serenya.com  / Admin@123"
echo "    Editor: editor@serenya.com / Admin@123"
echo ""
./server

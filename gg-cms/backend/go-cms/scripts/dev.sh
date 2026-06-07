#!/usr/bin/env bash
# =============================================================================
# dev.sh — Start databases (Docker) and the Go CMS server in development mode.
#
# Usage:
#   bash scripts/dev.sh          # start everything
#   bash scripts/dev.sh --db     # start databases only (no server)
#   bash scripts/dev.sh --server # start server only (assumes DBs already up)
#
# Port mapping (matches frontend VITE_API_BASE_URL=http://localhost:1337/api):
#   Go server  : http://localhost:1337
#   PostgreSQL : localhost:5433  (Docker host port)
#   MongoDB    : localhost:27017 (Docker host port)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

cd "$ROOT"

# ── Colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }
section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── Parse flags ──────────────────────────────────────────────────────────────
START_DB=true
START_SERVER=true
if [[ "${1:-}" == "--db" ]];     then START_SERVER=false; fi
if [[ "${1:-}" == "--server" ]]; then START_DB=false; fi

# ── Pre-checks ───────────────────────────────────────────────────────────────
section "Pre-flight checks"

command -v go     >/dev/null 2>&1 || error "Go not found. Install from https://go.dev/dl/"
command -v docker >/dev/null 2>&1 || error "Docker not found. Install Docker Desktop first."

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  error "Neither 'docker compose' nor 'docker-compose' found."
fi

# Load .env so SERVER_PORT is available in this script
if [ -f .env ]; then
  set -a; source .env; set +a
  info ".env loaded"
else
  warn ".env not found — copying from .env.example"
  cp .env.example .env
  set -a; source .env; set +a
fi

PORT="${SERVER_PORT:-1337}"

# Automatically bypass auth rate limiting for local dev/test runs by default.
# Set BYPASS_RATE_LIMIT=0 to disable this behavior when you want to validate the limiter.
BYPASS_RATE_LIMIT="${BYPASS_RATE_LIMIT:-1}"
export BYPASS_RATE_LIMIT

# ── Databases ────────────────────────────────────────────────────────────────
if $START_DB; then
  section "Starting databases"

  $COMPOSE up -d postgres mongodb
  info "Containers started. Waiting for health checks..."

  # Wait for PostgreSQL
  for i in $(seq 1 30); do
    if $COMPOSE exec -T postgres pg_isready -U gg_cms_user -d gg_cms >/dev/null 2>&1; then
      info "PostgreSQL ready."
      break
    fi
    if [ "$i" -eq 30 ]; then error "PostgreSQL did not become healthy in 60 s."; fi
    sleep 2
  done

  # Wait for MongoDB
  for i in $(seq 1 30); do
    if $COMPOSE exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
      info "MongoDB ready."
      break
    fi
    if [ "$i" -eq 30 ]; then error "MongoDB did not become healthy in 60 s."; fi
    sleep 2
  done
fi

# ── Build & run server ────────────────────────────────────────────────────────
if $START_SERVER; then
  section "Building Go CMS server"

  # Use .exe suffix on Windows (git bash / MINGW)
  BIN="./server"
  if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == CYGWIN* ]]; then
    BIN="./server.exe"
  fi

  go build -o "$BIN" ./cmd/server/
  info "Build complete → $BIN"

  section "Starting Go CMS server"
  echo ""
  echo "  API Base URL : http://localhost:${PORT}/api"
  echo "  GraphQL      : http://localhost:${PORT}/graphql"
  echo "  Uploads      : http://localhost:${PORT}/uploads"
  echo "  Log file     : ${LOG_FILE:-logs/app.log}"
  echo "  Log level    : ${LOG_LEVEL:-info}"
  echo ""
  echo "  Default credentials (after first migration run):"
  echo "    Admin  : admin@serenya.com  / Admin@123"
  echo "    Editor : editor@serenya.com / Admin@123"
  echo ""
  echo "  Press Ctrl+C to stop."
  echo ""

  exec "$BIN"
fi

# --db only: print connection info and exit
section "Databases running"
echo "  PostgreSQL : localhost:5433"
echo "  MongoDB    : localhost:27017"
echo ""
echo "  Run 'bash scripts/dev.sh --server' to start the Go server."

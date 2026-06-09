#!/usr/bin/env bash
# =============================================================================
#  gg_gocms.sh  — Start Go CMS backend + React frontend (testcms project)
#
#  Services started:
#    PostgreSQL  : localhost:5433  (Docker)
#    MongoDB     : localhost:27017 (Docker)
#    Go CMS API  : http://localhost:1337/api
#    React UI    : http://localhost:8080
#
#  Usage:
#    bash gg_gocms.sh            # start everything (DB + API + UI)
#    bash gg_gocms.sh --db       # start databases only
#    bash gg_gocms.sh --server   # start API + UI (assumes DB already up)
#
#  Stop:
#    Ctrl+C  (stops all background jobs in this shell session)
#    Or:  docker compose -f backend/go-cms/docker-compose.yml stop
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GOCMS_DIR="$SCRIPT_DIR/backend/go-cms"
FRONTEND_DIR="$SCRIPT_DIR/frontend/react-ui"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }
section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── Parse flags ───────────────────────────────────────────────────────────────
START_DB=true
START_SERVER=true
case "${1:-}" in
  --db)     START_SERVER=false ;;
  --server) START_DB=false ;;
esac

echo ""
echo -e "${CYAN} ============================================${NC}"
echo -e "${CYAN}  GeekGully CMS  |  Go CMS + React Frontend ${NC}"
echo -e "${CYAN} ============================================${NC}"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
section "Pre-flight checks"

command -v go     >/dev/null 2>&1 || error "Go not found. Install from https://go.dev/dl/"
command -v node   >/dev/null 2>&1 || error "Node.js not found. Install from https://nodejs.org/"
command -v npm    >/dev/null 2>&1 || error "npm not found."
command -v docker >/dev/null 2>&1 || error "Docker not found. Install Docker Desktop first."

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  error "Neither 'docker compose' nor 'docker-compose' found."
fi

info "Go, Node, Docker all present."

# ── Ensure go-cms .env exists ─────────────────────────────────────────────────
cd "$GOCMS_DIR"

if [ ! -f ".env" ]; then
  warn ".env not found — copying from .env.example"
  cp .env.example .env
  warn "Review backend/go-cms/.env before first production use."
else
  info "backend/go-cms/.env already exists."
fi

# Load .env to read SERVER_PORT etc.
set -a; source .env; set +a
PORT="${SERVER_PORT:-1337}"

# ── Start databases ───────────────────────────────────────────────────────────
if $START_DB; then
  section "Starting databases (Docker Compose)"

  $COMPOSE up -d postgres mongodb
  info "Containers started — waiting for health checks..."

  # Wait for PostgreSQL (up to 60 s)
  for i in $(seq 1 30); do
    $COMPOSE exec -T postgres pg_isready -U gg_cms_user -d gg_cms >/dev/null 2>&1 && break
    [ "$i" -eq 30 ] && error "PostgreSQL did not become ready in time."
    sleep 2
  done
  info "PostgreSQL is ready."

  # Wait for MongoDB (up to 60 s)
  for i in $(seq 1 30); do
    $COMPOSE exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1 && break
    [ "$i" -eq 30 ] && error "MongoDB did not become ready in time."
    sleep 2
  done
  info "MongoDB is ready."
fi

# ── Build Go binary ───────────────────────────────────────────────────────────
if $START_SERVER; then
  section "Building Go CMS server"

  # Detect Windows (Git Bash / MSYS)
  BIN="./server"
  if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == CYGWIN* ]] || [[ "$(uname -s)" == MSYS* ]]; then
    BIN="./server.exe"
  fi

  # ── Kill any previously running server instance ──────────────────────────────
  if [ -f "$GOCMS_DIR/.server.pid" ]; then
    OLD_PID=$(cat "$GOCMS_DIR/.server.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      info "Stopping existing server (PID $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$GOCMS_DIR/.server.pid"
  fi

  go build -o "$BIN" ./cmd/server/ || { echo -e "${RED}[ERR]${NC}   go build failed — server NOT restarted."; exit 1; }
  info "Build complete → backend/go-cms/${BIN}"

  # ── Launch Go CMS server in background ──────────────────────────────────────
  section "Starting Go CMS API server"
  mkdir -p logs
  "$BIN" >"$GOCMS_DIR/logs/server.log" 2>&1 &
  GOCMS_PID=$!
  echo "$GOCMS_PID" > "$GOCMS_DIR/.server.pid"
  info "Go CMS API started (PID $GOCMS_PID) → http://localhost:${PORT}/api"
  info "Logs: backend/go-cms/logs/server.log"

  # Give the API a moment to bind before starting the UI
  sleep 3

  # ── Install frontend deps if needed ─────────────────────────────────────────
  section "Starting React UI"
  cd "$FRONTEND_DIR"

  if [ ! -d "node_modules" ]; then
    info "node_modules missing — running npm install..."
    npm install
  fi

  # ── Launch React frontend in background ─────────────────────────────────────
  npm run dev >"$SCRIPT_DIR/logs/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  echo "$FRONTEND_PID" > "$SCRIPT_DIR/.frontend.pid"
  info "React UI started (PID $FRONTEND_PID) → http://localhost:8080"
  info "Logs: logs/frontend.log"

  # ── Summary ──────────────────────────────────────────────────────────────────
  echo ""
  echo -e "${CYAN} ============================================${NC}"
  echo -e "${CYAN}  All services are running!                 ${NC}"
  echo -e "${CYAN} ============================================${NC}"
  echo ""
  echo "   PostgreSQL  :  localhost:5433"
  echo "   MongoDB     :  localhost:27017"
  echo "   Go CMS API  :  http://localhost:${PORT}/api"
  echo "   React UI    :  http://localhost:8080"
  echo ""
  echo "   Logs:"
  echo "     tail -f backend/go-cms/logs/server.log"
  echo "     tail -f logs/frontend.log"
  echo ""
  echo "   Stop services:"
  echo "     kill \$(cat .frontend.pid) \$(cat backend/go-cms/.server.pid)"
  echo "     $COMPOSE -f backend/go-cms/docker-compose.yml stop"
  echo ""

  # Wait for background jobs so Ctrl+C cleanly kills both
  wait $GOCMS_PID $FRONTEND_PID
fi

# --db only path
if ! $START_SERVER; then
  section "Databases running"
  echo "   PostgreSQL : localhost:5433"
  echo "   MongoDB    : localhost:27017"
  echo ""
  echo "   Run 'bash gg_gocms.sh --server' to start the API + UI."
fi

#!/usr/bin/env bash
# GG-CMS — Native binary launcher (Linux / macOS)
#
# DBs + Nginx run in Docker; the Go API binary runs on this machine.
#
# Services:
#   PostgreSQL : localhost:5433   (Docker)
#   MongoDB    : localhost:27017  (Docker)
#   React UI   : http://localhost (Docker / Nginx)
#   Go API     : http://localhost:1337/api  (native binary)
#
# Usage:
#   bash start.sh               — start everything
#   bash start.sh --api         — restart API only (Docker already running)
#   bash start.sh --with-tools  — also start pgAdmin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

API_ONLY=false
WITH_TOOLS=false
for arg in "$@"; do
  case $arg in
    --api)        API_ONLY=true ;;
    --with-tools) WITH_TOOLS=true ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()   { echo "  [INFO]  $*"; }
ok()     { echo "  [OK]    $*"; }
warn()   { echo "  [WARN]  $*"; }
err()    { echo "  [ERROR] $*" >&2; exit 1; }
header() { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

header "GG-CMS — Native Binary Launcher"

# ── Resolve binary ────────────────────────────────────────────────────────────
# The binary must run from dist/native/ so migrations/ is its working directory.
OS="$(uname -s)"
ARCH="$(uname -m)"
info "OS/Arch: $OS / $ARCH"

case "$OS-$ARCH" in
  Darwin-arm64)  DIST_BIN="dist/bin/gg-cms-server-darwin-arm64" ;;
  Darwin-x86_64) DIST_BIN="dist/bin/gg-cms-server-darwin-amd64" ;;
  Linux-x86_64)  DIST_BIN="dist/bin/gg-cms-server-linux-amd64" ;;
  Linux-aarch64) DIST_BIN="dist/bin/gg-cms-server-linux-arm64" ;;
  *)             DIST_BIN="" ;;
esac

NATIVE_BIN="dist/native/server"

# Prefer dist/bin/ (freshly built), fall back to dist/native/server
if [ -n "$DIST_BIN" ] && [ -f "$DIST_BIN" ]; then
  cp "$DIST_BIN" "$NATIVE_BIN"
  chmod +x "$NATIVE_BIN"
  info "Binary : $DIST_BIN → dist/native/server"
elif [ -f "$NATIVE_BIN" ]; then
  chmod +x "$NATIVE_BIN"
  info "Binary : dist/native/server"
elif [ -f "dist/native/server.exe" ]; then
  warn "Found server.exe — this is a Windows binary, it won't run on $OS."
  err "Build a native binary first: bash build.sh --native-only"
else
  err "No binary found. Run: bash build.sh --native-only"
fi

# ── Check Docker ──────────────────────────────────────────────────────────────
command -v docker &>/dev/null || err "docker not found. Install: https://docs.docker.com/get-docker/"

if ! docker info &>/dev/null 2>&1; then
  if [ "$OS" = "Darwin" ] && [ -d "/Applications/Docker.app" ]; then
    warn "Docker Desktop not running — starting..."
    open -a Docker
    echo "  Waiting for Docker (up to 60s)..."
    for i in $(seq 1 30); do
      docker info &>/dev/null 2>&1 && break
      sleep 2
    done
    docker info &>/dev/null 2>&1 || err "Docker Desktop did not start. Open it manually."
  else
    err "Docker daemon not running. Start it: sudo systemctl start docker"
  fi
fi
ok "Docker running"

# ── Kill any existing API process ─────────────────────────────────────────────
PID_FILE="$SCRIPT_DIR/.api.pid"
if [ -f "$PID_FILE" ]; then
  OLD=$(cat "$PID_FILE")
  if kill -0 "$OLD" 2>/dev/null; then
    info "Stopping previous API (PID $OLD)..."
    kill "$OLD" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# ── Docker services ───────────────────────────────────────────────────────────
if ! $API_ONLY; then
  header "Preparing directories"
  for dir in data/postgres data/mongodb data/mongodb-config data/pgadmin; do
    mkdir -p "$dir"; ok "$dir"
  done
  mkdir -p dist/native/uploads dist/native/logs

  # Auto-create .env files if missing
  if [ ! -f .env ]; then
    cp .env.example .env
    warn ".env created — edit passwords and secrets, then re-run."
    exit 0
  fi
  if [ ! -f dist/native/.env ]; then
    cp dist/native/.env.example dist/native/.env
    warn "dist/native/.env created — edit DB passwords, JWT_SECRET, ADMIN_PASSWORD, then re-run."
    exit 0
  fi

  header "Starting Docker services"
  PROFILES=""
  $WITH_TOOLS && PROFILES="--profile tools"
  docker compose -f docker-compose.native.yml $PROFILES up -d postgres mongodb frontend

  info "Waiting for PostgreSQL (up to 60s)..."
  for i in $(seq 1 30); do
    docker compose -f docker-compose.native.yml exec -T postgres \
      pg_isready -U gg_cms_user -d gg_cms >/dev/null 2>&1 && break
    [ "$i" -eq 30 ] && err "PostgreSQL did not become ready."
    sleep 2
  done
  ok "PostgreSQL ready"

  info "Waiting for MongoDB (up to 60s)..."
  for i in $(seq 1 30); do
    docker compose -f docker-compose.native.yml exec -T mongodb \
      mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1 && break
    [ "$i" -eq 30 ] && err "MongoDB did not become ready."
    sleep 2
  done
  ok "MongoDB ready"
fi

# ── Launch API ────────────────────────────────────────────────────────────────
header "Starting Go API"
mkdir -p dist/native/uploads dist/native/logs
cd "$SCRIPT_DIR/dist/native"
"$SCRIPT_DIR/$NATIVE_BIN" >"$SCRIPT_DIR/dist/native/logs/server.log" 2>&1 &
API_PID=$!
echo "$API_PID" > "$SCRIPT_DIR/.api.pid"
cd "$SCRIPT_DIR"
ok "API started (PID $API_PID) → http://localhost:1337/api"
info "Logs: dist/native/logs/server.log"

# ── Summary ───────────────────────────────────────────────────────────────────
header "All services running"
echo "  PostgreSQL : localhost:5433"
echo "  MongoDB    : localhost:27017"
echo "  API        : http://localhost:1337/api/health"
echo "  UI         : http://localhost"
echo ""
echo "  Tail logs: tail -f dist/native/logs/server.log"
echo "  Stop:      bash stop.sh"
echo ""

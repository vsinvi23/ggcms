#!/usr/bin/env bash
# GG-CMS — Linux Deployment Script
# Designed for server deployments (Ubuntu/Debian/RHEL/CentOS).
#
# Usage:
#   bash deploy.sh               — build images and start all services
#   bash deploy.sh --with-tools  — also start pgAdmin
#   bash deploy.sh --no-cache    — force full rebuild
#   bash deploy.sh --down        — stop and remove containers
#   bash deploy.sh --logs        — tail live logs
#   bash deploy.sh --install     — install Docker Engine (Ubuntu/Debian only)
#   bash deploy.sh --systemd     — install as a systemd service (auto-start on boot)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$RELEASE_DIR"

WITH_TOOLS=false
NO_CACHE=""
ACTION="up"
INSTALL_DOCKER=false
SETUP_SYSTEMD=false

for arg in "$@"; do
  case $arg in
    --with-tools) WITH_TOOLS=true ;;
    --no-cache)   NO_CACHE="--no-cache" ;;
    --down)       ACTION="down" ;;
    --logs)       ACTION="logs" ;;
    --install)    INSTALL_DOCKER=true ;;
    --systemd)    SETUP_SYSTEMD=true ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo "  [INFO]  $*"; }
ok()      { echo "  [OK]    $*"; }
warn()    { echo "  [WARN]  $*"; }
err()     { echo "  [ERROR] $*" >&2; exit 1; }
header()  { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

# Prefix docker commands with sudo if current user is not in docker group
DOCKER="docker"
if ! docker info &>/dev/null 2>&1 && command -v sudo &>/dev/null; then
  DOCKER="sudo docker"
fi

header "GG-CMS — Linux Deploy"
info "Hostname : $(hostname)"
info "Arch     : $(uname -m)"
info "Kernel   : $(uname -r)"

# ── Optional: install Docker Engine ──────────────────────────────────────────
if $INSTALL_DOCKER; then
  header "Installing Docker Engine"
  if command -v docker &>/dev/null; then
    ok "Docker already installed: $(docker --version)"
  else
    . /etc/os-release 2>/dev/null || true
    case "${ID:-}" in
      ubuntu|debian)
        info "Installing Docker via official script..."
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker "$USER"
        warn "Log out and back in for docker group to take effect, then re-run deploy.sh"
        ;;
      rhel|centos|fedora|rocky|almalinux)
        info "Installing Docker via dnf..."
        sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
        sudo systemctl enable --now docker
        sudo usermod -aG docker "$USER"
        warn "Log out and back in for docker group to take effect, then re-run deploy.sh"
        ;;
      *)
        err "Unsupported distro '${ID:-unknown}'. Install Docker manually: https://docs.docker.com/engine/install/"
        ;;
    esac
  fi
  exit 0
fi

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v docker &>/dev/null || err "docker not found. Run: bash deploy.sh --install"
$DOCKER compose version &>/dev/null \
  || $DOCKER-compose version &>/dev/null \
  || err "docker compose plugin not found. Update Docker or install: sudo apt install docker-compose-plugin"
ok "Docker $($DOCKER --version | awk '{print $3}' | tr -d ',')"

# ── Handle --down / --logs ────────────────────────────────────────────────────
if [ "$ACTION" = "down" ]; then
  $DOCKER compose down
  ok "All services stopped."
  exit 0
fi
if [ "$ACTION" = "logs" ]; then
  $DOCKER compose logs -f --tail=100
  exit 0
fi

# ── Data directories (bind mounts for DB persistence) ─────────────────────────
header "Preparing directories"
for dir in data/postgres data/mongodb data/mongodb-config data/uploads data/pgadmin; do
  mkdir -p "$dir"
  ok "$dir"
done

# PostgreSQL data dir needs specific permissions on Linux
chmod 700 data/postgres 2>/dev/null || true

# ── Environment ───────────────────────────────────────────────────────────────
header "Environment"
if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env created from .env.example — edit it then re-run"
  echo ""
  echo "  Required:  POSTGRES_PASSWORD  MONGO_PASSWORD  JWT_SECRET  ADMIN_PASSWORD"
  echo "  Edit:      nano .env  OR  vi .env"
  echo ""
  exit 0
fi
ok ".env present"

if [ ! -f config/backend/app.env ]; then
  cp config/backend/app.env.example config/backend/app.env
  info "config/backend/app.env created (all overrides commented out)"
fi

# ── Optional: systemd service setup ──────────────────────────────────────────
if $SETUP_SYSTEMD; then
  header "Systemd service setup"
  SERVICE_FILE="/etc/systemd/system/gg-cms.service"
  COMPOSE_BIN=$(command -v docker || echo "docker")

  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=GG-CMS Full Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$RELEASE_DIR
ExecStart=$COMPOSE_BIN compose up -d
ExecStop=$COMPOSE_BIN compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable gg-cms
  ok "Systemd service installed: gg-cms"
  info "Control: sudo systemctl start|stop|status gg-cms"
fi

# ── Build & start ─────────────────────────────────────────────────────────────
header "Building Docker images (release mode)"

COMPOSE_PROFILES=()
if $WITH_TOOLS; then
  COMPOSE_PROFILES=(--profile tools)
fi

$DOCKER compose "${COMPOSE_PROFILES[@]}" build $NO_CACHE
ok "Images built"

header "Starting services"
$DOCKER compose "${COMPOSE_PROFILES[@]}" up -d
ok "Services started"

# ── Status ────────────────────────────────────────────────────────────────────
header "Service status"
$DOCKER compose ps

# ── Firewall notice ───────────────────────────────────────────────────────────
FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "80")
BACKEND_PORT=$(grep  -E '^BACKEND_PORT='  .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "8080")
FRONTEND_PORT=${FRONTEND_PORT:-80}
BACKEND_PORT=${BACKEND_PORT:-8080}

if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  header "Firewall"
  warn "UFW is active — ensure port ${FRONTEND_PORT} is open:"
  warn "  sudo ufw allow ${FRONTEND_PORT}/tcp"
fi

# ── Access ────────────────────────────────────────────────────────────────────
header "Access"
HOST_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
echo "  UI (local):   http://localhost:${FRONTEND_PORT}"
echo "  UI (network): http://${HOST_IP}:${FRONTEND_PORT}"
echo "  API health:   http://localhost:${BACKEND_PORT}/api/health"
if $WITH_TOOLS; then
  PGADMIN_PORT=$(grep -E '^PGADMIN_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || echo "5050")
  echo "  pgAdmin:      http://localhost:${PGADMIN_PORT:-5050}"
fi
echo ""
echo "  Logs:  bash deploy.sh --logs"
echo "  Stop:  bash deploy.sh --down"
echo ""

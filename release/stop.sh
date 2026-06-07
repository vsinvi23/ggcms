#!/usr/bin/env bash
# GG-CMS — Stop all native-mode services (Linux / macOS)
# Stops the native API process and all Docker containers.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "[STOP] Stopping GG-CMS..."

# ── Stop native API process ───────────────────────────────────────────────────
API_PID_FILE="$SCRIPT_DIR/.api.pid"
if [ -f "$API_PID_FILE" ]; then
  PID=$(cat "$API_PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null && echo "[OK]   API stopped (PID $PID)."
  else
    echo "[INFO] API process $PID not running."
  fi
  rm -f "$API_PID_FILE"
else
  # Fallback: kill by binary name
  pkill -f "dist/native/server" 2>/dev/null && echo "[OK]   API stopped." || echo "[INFO] No API process found."
fi

# ── Stop Docker services ──────────────────────────────────────────────────────
docker compose -f docker-compose.native.yml down 2>&1 | grep -v "^$" || true
echo "[OK]   Docker services stopped."
echo ""
echo "  All services stopped."

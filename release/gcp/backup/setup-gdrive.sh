#!/usr/bin/env bash
# GG-CMS — One-time rclone + Google Drive setup
#
# Run this ONCE on a machine that HAS a browser (your laptop), then copy
# the generated rclone.conf to the GCP VM.
#
# What it does:
#   1. Installs rclone (if missing)
#   2. Guides you through Google Drive OAuth2 authorisation
#   3. Prints the config snippet to copy to the VM
#
# Usage (on your laptop first):
#   bash setup-gdrive.sh
#
# Then on the GCP VM:
#   bash setup-gdrive.sh --vm-install

set -euo pipefail

GDRIVE_REMOTE="gdrive"
BACKUP_ROOT="gg-cms-backups"   # folder name inside your Google Drive

ok()     { echo "  [OK]    $*"; }
info()   { echo "  [INFO]  $*"; }
warn()   { echo "  [WARN]  $*"; }
header() { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

# ── VM-only install (no browser needed) ──────────────────────────────────────
if [ "${1:-}" = "--vm-install" ]; then
  header "Installing rclone on VM"
  curl -fsSL https://rclone.org/install.sh | sudo bash
  ok "rclone $(rclone --version | head -1)"

  CONF_DIR="$HOME/.config/rclone"
  mkdir -p "$CONF_DIR"
  if [ -f "$CONF_DIR/rclone.conf" ]; then
    ok "rclone.conf already present"
  else
    warn "rclone.conf not found at $CONF_DIR/rclone.conf"
    echo ""
    echo "  Copy the rclone.conf from your laptop:"
    echo "    gcloud compute scp rclone.conf <vm-name>:~/.config/rclone/rclone.conf --zone=us-central1-a"
    echo ""
  fi

  # Verify connection
  echo ""
  info "Testing Google Drive connection..."
  rclone lsd "$GDRIVE_REMOTE": && ok "Google Drive accessible" || {
    echo "  [ERROR] Cannot reach Google Drive. Check rclone.conf."
    exit 1
  }

  # Create backup folder structure
  rclone mkdir "${GDRIVE_REMOTE}:${BACKUP_ROOT}/postgres/wal"
  rclone mkdir "${GDRIVE_REMOTE}:${BACKUP_ROOT}/postgres/full"
  rclone mkdir "${GDRIVE_REMOTE}:${BACKUP_ROOT}/mongodb/snapshots"
  ok "Backup folder structure created in Google Drive: ${BACKUP_ROOT}/"
  exit 0
fi

# ── Laptop setup (with browser) ──────────────────────────────────────────────
header "GG-CMS — Google Drive Backup Setup"
info "This wizard runs on your laptop. After completion, copy rclone.conf to the VM."
echo ""

# Install rclone if missing
if ! command -v rclone &>/dev/null; then
  info "Installing rclone..."
  curl -fsSL https://rclone.org/install.sh | sudo bash
fi
ok "rclone $(rclone --version | head -1)"

# Interactive config
header "Configuring Google Drive remote"
echo ""
echo "  When rclone config opens:"
echo "    n) New remote"
echo "    Name: gdrive"
echo "    Storage: Google Drive  (type the number shown)"
echo "    client_id: (leave blank)"
echo "    client_secret: (leave blank)"
echo "    scope: 1 (drive — full access)"
echo "    root_folder_id: (leave blank)"
echo "    service_account_file: (leave blank)"
echo "    Edit advanced config: n"
echo "    Use auto config: y  → browser will open, sign in to Google"
echo "    Team drive: n"
echo "    Confirm: y"
echo ""
read -r -p "Press Enter to open rclone config..."
rclone config

# Show the config file location
CONF_FILE="$HOME/.config/rclone/rclone.conf"
header "Config saved"
ok "rclone.conf: $CONF_FILE"
echo ""
echo "  Copy to GCP VM:"
echo "    gcloud compute scp $CONF_FILE <vm-name>:~/rclone.conf --zone=us-central1-a"
echo "    gcloud compute ssh <vm-name> --zone=us-central1-a --command='mkdir -p ~/.config/rclone && mv ~/rclone.conf ~/.config/rclone/'"
echo ""
echo "  Then on the VM, run:"
echo "    bash release/gcp/backup/setup-gdrive.sh --vm-install"
echo ""

# Create the backup folder in GDrive now (from laptop)
header "Creating backup folder structure in Google Drive"
rclone mkdir "${GDRIVE_REMOTE}:${BACKUP_ROOT}/postgres/wal"
rclone mkdir "${GDRIVE_REMOTE}:${BACKUP_ROOT}/postgres/full"
rclone mkdir "${GDRIVE_REMOTE}:${BACKUP_ROOT}/mongodb/snapshots"
ok "Folders created: My Drive/${BACKUP_ROOT}/"

echo ""
echo "  Google Drive folder structure:"
rclone tree "${GDRIVE_REMOTE}:${BACKUP_ROOT}" 2>/dev/null || true
echo ""

#!/usr/bin/env bash
# GG-CMS — PostgreSQL Delta Backup to Google Drive
#
# Strategy:
#   DELTA  : PostgreSQL WAL (Write-Ahead Log) archiving — only ships changed
#            WAL segments since the last archive. True block-level delta.
#   FULL   : Weekly pg_dump compressed snapshot (for point-in-time restore base)
#
# Backup layout in Google Drive (gg-cms-backups/):
#   postgres/wal/          ← WAL segments uploaded by archive_command
#   postgres/full/         ← Weekly full dumps  (full_YYYYMMDD_HHMMSS.sql.gz)
#   postgres/manifest.txt  ← Last backup timestamps
#
# Called by cron:
#   */15 * * * *  bash /opt/gg-cms/backup/postgres-backup.sh --wal-sync
#   0    2 * * *  bash /opt/gg-cms/backup/postgres-backup.sh --daily
#   0    1 * * 0  bash /opt/gg-cms/backup/postgres-backup.sh --full
#
# Usage:
#   bash postgres-backup.sh --wal-sync   (sync WAL archive dir to GDrive, ~15s)
#   bash postgres-backup.sh --daily      (pg_dump + upload, keep 7 days)
#   bash postgres-backup.sh --full       (full dump, keep 4 weeks)
#   bash postgres-backup.sh --list       (show backups in GDrive)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Configuration & CLI Option Parsing ───────────────────────────────────────
ENV_TARGET="${ENV:-prod}"
DEPLOYMENT_ID=""
MODE="--full"
DAILY_KEEP_DAYS=7
KEEP_LAST_COUNT=3

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV_TARGET="$2"; shift 2 ;;
    --deployment-id) DEPLOYMENT_ID="$2"; shift 2 ;;
    --wal-sync|--daily|--full|--list) MODE="$1"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

GDRIVE_REMOTE="gdrive"
BACKUP_ROOT="backup/geekgully/data/${ENV_TARGET}"
GDRIVE_PG="${GDRIVE_REMOTE}:${BACKUP_ROOT}/postgres"

# Container & Database naming
PG_CONTAINER="gg-cms-postgres-${ENV_TARGET}"
PG_USER="gg_cms_user"
PG_DB="gg_cms"

WAL_ARCHIVE_HOST="/opt/gg-cms/wal-archive"
DUMP_DIR="/opt/gg-cms/pg-dumps"

# ── Helpers ───────────────────────────────────────────────────────────────────
ts()     { date '+%Y%m%d_%H%M%S'; }
log()    { echo "$(date '+%F %T') [postgres-backup] [$ENV_TARGET] $*"; }
ok()     { log "[OK]  $*"; }
fail()   { log "[ERR] $*" >&2; exit 1; }

command -v rclone &>/dev/null || fail "rclone not installed. Run setup-gdrive.sh --vm-install"
docker info &>/dev/null 2>&1  || fail "Docker not running"

if ! docker ps --format '{{.Names}}' | grep -q "$PG_CONTAINER"; then
  if docker ps --format '{{.Names}}' | grep -q "gg-cms-postgres"; then
    PG_CONTAINER="gg-cms-postgres"
  else
    fail "PostgreSQL container ($PG_CONTAINER or gg-cms-postgres) not running"
  fi
fi

mkdir -p "$WAL_ARCHIVE_HOST" "$DUMP_DIR"

# ── WAL sync (delta — runs every 15 min) ──────────────────────────────────────
wal_sync() {
  log "Syncing WAL archive to Google Drive (delta)..."

  # Count files to upload
  local before after
  before=$(rclone size "${GDRIVE_PG}/wal" --json 2>/dev/null | grep '"count"' | grep -o '[0-9]*' || echo 0)

  # --update: skip files that are newer on destination
  # --checksum: compare by checksum, not just mtime
  rclone copy "$WAL_ARCHIVE_HOST" "${GDRIVE_PG}/wal/" \
    --update \
    --checksum \
    --transfers=4 \
    --stats=0 \
    --log-level=ERROR

  after=$(rclone size "${GDRIVE_PG}/wal" --json 2>/dev/null | grep '"count"' | grep -o '[0-9]*' || echo 0)
  local uploaded=$(( after - before ))
  ok "WAL sync complete. Uploaded: $uploaded new segment(s)."
}

# ── Daily dump (logical backup — runs at 2 AM) ────────────────────────────────
daily_dump() {
  local STAMP; STAMP=$(ts)
  local FNAME="daily_${STAMP}.sql.gz"
  local LOCAL_PATH="$DUMP_DIR/$FNAME"

  log "Creating daily pg_dump ($FNAME)..."
  docker exec "$PG_CONTAINER" \
    pg_dump -U "$PG_USER" -d "$PG_DB" \
    --compress=9 \
    --format=plain \
    | gzip -9 > "$LOCAL_PATH"

  local SIZE; SIZE=$(du -sh "$LOCAL_PATH" | cut -f1)
  ok "Dump created: $FNAME ($SIZE)"

  log "Uploading to Google Drive..."
  rclone copy "$LOCAL_PATH" "${GDRIVE_PG}/full/" \
    --stats=0 \
    --log-level=ERROR
  ok "Uploaded: ${GDRIVE_PG}/full/$FNAME"

  # Cleanup local
  rm -f "$LOCAL_PATH"

  # Remove old daily dumps from GDrive (keep last N days)
  log "Pruning daily dumps older than ${DAILY_KEEP_DAYS} days..."
  rclone delete "${GDRIVE_PG}/full/" \
    --min-age "${DAILY_KEEP_DAYS}d" \
    --include "daily_*.sql.gz" \
    --log-level=ERROR
  ok "Old daily dumps pruned."
}

# ── Full weekly dump ──────────────────────────────────────────────────────────
full_dump() {
  local STAMP; STAMP=$(ts)
  local FNAME="full_${STAMP}.dump"
  local LOCAL_PATH="$DUMP_DIR/$FNAME"

  log "Creating full pg_dump custom format ($FNAME)..."
  docker exec "$PG_CONTAINER" \
    pg_dump -U "$PG_USER" -d "$PG_DB" \
    --format=custom \
    --compress=9 \
    > "$LOCAL_PATH"

  local SIZE; SIZE=$(du -sh "$LOCAL_PATH" | cut -f1)
  local HASH; HASH="sha256:$(sha256sum "$LOCAL_PATH" 2>/dev/null | awk '{print $1}' || echo "unknown")"
  ok "Full dump created: $FNAME ($SIZE) ($HASH)"

  log "Uploading to Google Drive..."
  rclone copy "$LOCAL_PATH" "${GDRIVE_PG}/full/" \
    --stats=0 \
    --log-level=ERROR
  ok "Uploaded: ${GDRIVE_PG}/full/$FNAME"

  # Generate unified backup manifest
  if [[ -f "$SCRIPT_DIR/backup-manifest.sh" ]]; then
    log "Generating backup manifest envelope..."
    local MANIFEST_FILE="$DUMP_DIR/backup-manifest.json"
    bash "$SCRIPT_DIR/backup-manifest.sh" \
      --env "$ENV_TARGET" \
      --deployment-id "$DEPLOYMENT_ID" \
      --pg-file "$FNAME" \
      --pg-size "$SIZE" \
      --pg-hash "$HASH" \
      --output "$MANIFEST_FILE" || true

    if [[ -f "$MANIFEST_FILE" ]]; then
      rclone copy "$MANIFEST_FILE" "${GDRIVE_PG}/" --stats=0 --log-level=ERROR || true
      ok "Uploaded backup manifest to ${GDRIVE_PG}/backup-manifest.json"
    fi
  fi

  rm -f "$LOCAL_PATH"

  # Prune old full dumps (keep last KEEP_LAST_COUNT backups)
  log "Pruning old full dumps (retaining last ${KEEP_LAST_COUNT} backups)..."
  local files_to_delete
  files_to_delete=$(rclone lsf "${GDRIVE_PG}/full/" --files-only 2>/dev/null | sort -r | tail -n +4)
  for f in $files_to_delete; do
    if [ -n "$f" ]; then
      rclone deletefile "${GDRIVE_PG}/full/$f"
      log "Pruned old dump: $f"
    fi
  done
  ok "Retained last ${KEEP_LAST_COUNT} backups."

  # Update manifest
  echo "last_full=$(date -u +%Y-%m-%dT%H:%M:%SZ) file=$FNAME size=$SIZE" \
    | rclone rcat "${GDRIVE_PG}/manifest.txt"
}

# ── List backups ──────────────────────────────────────────────────────────────
list_backups() {
  echo ""
  echo "  WAL segments in Google Drive:"
  rclone ls "${GDRIVE_PG}/wal/" 2>/dev/null | tail -5 | sed 's/^/    /'
  local wal_size; wal_size=$(rclone size "${GDRIVE_PG}/wal" --json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'{d[\"bytes\"]/1024/1024:.1f} MB')" 2>/dev/null || echo "unknown")
  echo "  Total WAL size: $wal_size"
  echo ""
  echo "  Full dumps:"
  rclone ls "${GDRIVE_PG}/full/" 2>/dev/null | sed 's/^/    /'
  echo ""
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "$MODE" in
  --wal-sync)  wal_sync ;;
  --daily)     daily_dump ;;
  --full)      full_dump ;;
  --list)      list_backups ;;
  *) echo "Usage: $0 --wal-sync | --daily | --full | --list"; exit 1 ;;
esac

#!/usr/bin/env bash
# GG-CMS — MongoDB Delta Backup to Google Drive
#
# Strategy:
#   MongoDB has no WAL-style file-level delta. We use:
#   SNAPSHOT : Daily mongodump (BSON compressed archive).
#              rclone --update --checksum means only NEW snapshots are uploaded.
#   DELTA    : Each dump is timestamped. rclone tracks what's already on GDrive
#              and skips re-uploading existing files — so only today's new
#              snapshot is uploaded each run (true delta at the file level).
#
# Backup layout in Google Drive (gg-cms-backups/):
#   mongodb/snapshots/     ← daily compressed snapshots (mongo_YYYYMMDD_HHMMSS.gz)
#   mongodb/manifest.txt   ← last backup info
#
# Cron schedule:
#   0 3 * * *  bash /opt/gg-cms/backup/mongodb-backup.sh --snapshot
#   0 3 * * 0  bash /opt/gg-cms/backup/mongodb-backup.sh --full-collections
#
# Usage:
#   bash mongodb-backup.sh --snapshot         (daily compressed dump)
#   bash mongodb-backup.sh --full-collections (dump each collection separately)
#   bash mongodb-backup.sh --list             (show backups in GDrive)

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
GDRIVE_REMOTE="gdrive"
BACKUP_ROOT="gg-cms-backups"
GDRIVE_MONGO="${GDRIVE_REMOTE}:${BACKUP_ROOT}/mongodb"

MONGO_CONTAINER="gg-cms-mongodb"
MONGO_USER="gg_cms_user"
MONGO_DB="gg_cms"

DUMP_DIR="/opt/gg-cms/mongo-dumps"
DAILY_KEEP_DAYS=7
FULL_KEEP_WEEKS=4

MODE="${1:---snapshot}"

# ── Helpers ───────────────────────────────────────────────────────────────────
ts()  { date '+%Y%m%d_%H%M%S'; }
log() { echo "$(date '+%F %T') [mongodb-backup] $*"; }
ok()  { log "[OK]  $*"; }
fail(){ log "[ERR] $*" >&2; exit 1; }

command -v rclone &>/dev/null || fail "rclone not installed"
docker info &>/dev/null 2>&1  || fail "Docker not running"
docker ps --filter "name=$MONGO_CONTAINER" --format '{{.Names}}' | grep -q "$MONGO_CONTAINER" \
  || fail "MongoDB container '$MONGO_CONTAINER' not running"

mkdir -p "$DUMP_DIR"

# Read Mongo password from running container env
MONGO_PASS=$(docker inspect "$MONGO_CONTAINER" \
  --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep MONGO_INITDB_ROOT_PASSWORD | cut -d= -f2)

[ -n "$MONGO_PASS" ] || fail "Could not read MONGO_INITDB_ROOT_PASSWORD from container"

# ── Daily snapshot ────────────────────────────────────────────────────────────
daily_snapshot() {
  local STAMP; STAMP=$(ts)
  local FNAME="mongo_${STAMP}.gz"
  local LOCAL_PATH="$DUMP_DIR/$FNAME"

  log "Creating mongodump snapshot ($FNAME)..."

  # mongodump to stdout → gzip → local file
  docker exec "$MONGO_CONTAINER" \
    mongodump \
      --username="$MONGO_USER" \
      --password="$MONGO_PASS" \
      --authenticationDatabase=admin \
      --db="$MONGO_DB" \
      --archive \
      --gzip \
    > "$LOCAL_PATH"

  local SIZE; SIZE=$(du -sh "$LOCAL_PATH" | cut -f1)
  ok "Snapshot created: $FNAME ($SIZE)"

  # Upload only if not already in GDrive (--update --checksum = true delta)
  log "Uploading to Google Drive (delta: skips if already uploaded)..."
  rclone copy "$LOCAL_PATH" "${GDRIVE_MONGO}/snapshots/" \
    --update \
    --checksum \
    --stats=0 \
    --log-level=ERROR
  ok "Uploaded: ${GDRIVE_MONGO}/snapshots/$FNAME"

  rm -f "$LOCAL_PATH"

  # Prune old snapshots
  log "Pruning snapshots older than ${DAILY_KEEP_DAYS} days..."
  rclone delete "${GDRIVE_MONGO}/snapshots/" \
    --min-age "${DAILY_KEEP_DAYS}d" \
    --include "mongo_*.gz" \
    --log-level=ERROR
  ok "Pruned old snapshots."

  # Update manifest
  echo "last_snapshot=$(date -u +%Y-%m-%dT%H:%M:%SZ) file=$FNAME size=$SIZE" \
    | rclone rcat "${GDRIVE_MONGO}/manifest.txt"
}

# ── Per-collection backup (weekly — for granular restore) ─────────────────────
full_collections() {
  local STAMP; STAMP=$(ts)
  local DIR_NAME="collections_${STAMP}"
  local LOCAL_DIR="$DUMP_DIR/$DIR_NAME"

  log "Dumping each collection separately ($DIR_NAME)..."
  mkdir -p "$LOCAL_DIR"

  # Get collection list
  local COLLECTIONS
  COLLECTIONS=$(docker exec "$MONGO_CONTAINER" \
    mongosh \
      --username="$MONGO_USER" \
      --password="$MONGO_PASS" \
      --authenticationDatabase=admin \
      --quiet \
      "$MONGO_DB" \
      --eval "db.getCollectionNames().join('\n')")

  for COLL in $COLLECTIONS; do
    log "  Dumping collection: $COLL"
    docker exec "$MONGO_CONTAINER" \
      mongoexport \
        --username="$MONGO_USER" \
        --password="$MONGO_PASS" \
        --authenticationDatabase=admin \
        --db="$MONGO_DB" \
        --collection="$COLL" \
        --type=json \
      | gzip -9 > "$LOCAL_DIR/${COLL}.json.gz"
  done

  log "Uploading per-collection backup to Google Drive..."
  rclone copy "$LOCAL_DIR" "${GDRIVE_MONGO}/collections/${DIR_NAME}/" \
    --update \
    --checksum \
    --stats=0 \
    --log-level=ERROR
  ok "Uploaded: ${GDRIVE_MONGO}/collections/${DIR_NAME}/"

  rm -rf "$LOCAL_DIR"

  # Prune old collection backups
  local KEEP_DAYS=$(( FULL_KEEP_WEEKS * 7 ))
  rclone delete "${GDRIVE_MONGO}/collections/" \
    --min-age "${KEEP_DAYS}d" \
    --rmdirs \
    --log-level=ERROR
  ok "Old collection backups pruned."
}

# ── List ──────────────────────────────────────────────────────────────────────
list_backups() {
  echo ""
  echo "  MongoDB snapshots:"
  rclone ls "${GDRIVE_MONGO}/snapshots/" 2>/dev/null | sed 's/^/    /'
  local total; total=$(rclone size "${GDRIVE_MONGO}" --json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'{d[\"bytes\"]/1024/1024:.1f} MB')" 2>/dev/null || echo "unknown")
  echo "  Total size: $total"
  echo ""
}

case "$MODE" in
  --snapshot)          daily_snapshot ;;
  --full-collections)  full_collections ;;
  --list)              list_backups ;;
  *) echo "Usage: $0 --snapshot | --full-collections | --list"; exit 1 ;;
esac

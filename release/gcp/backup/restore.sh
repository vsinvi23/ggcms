#!/usr/bin/env bash
# GG-CMS — Restore from Google Drive backup
#
# Usage:
#   bash restore.sh --list-postgres           list available PostgreSQL backups
#   bash restore.sh --list-mongo              list available MongoDB backups
#   bash restore.sh --postgres full_20260101_020000.dump
#   bash restore.sh --mongo    mongo_20260101_030000.gz
#   bash restore.sh --latest-postgres         restore most recent full dump
#   bash restore.sh --latest-mongo            restore most recent snapshot

set -euo pipefail

GDRIVE_REMOTE="gdrive"
BACKUP_ROOT="gg-cms-backups"
GDRIVE_PG="${GDRIVE_REMOTE}:${BACKUP_ROOT}/postgres"
GDRIVE_MONGO="${GDRIVE_REMOTE}:${BACKUP_ROOT}/mongodb"

PG_CONTAINER="gg-cms-postgres"
MONGO_CONTAINER="gg-cms-mongodb"
PG_USER="gg_cms_user"
PG_DB="gg_cms"

RESTORE_DIR="/opt/gg-cms/restore-tmp"

log()  { echo "$(date '+%F %T') [restore] $*"; }
ok()   { log "[OK]  $*"; }
fail() { log "[ERR] $*" >&2; exit 1; }

command -v rclone &>/dev/null || fail "rclone not installed"
mkdir -p "$RESTORE_DIR"

MODE="${1:-}"
FILE="${2:-}"

# ── List ──────────────────────────────────────────────────────────────────────
list_postgres() {
  echo ""
  echo "  Available PostgreSQL backups:"
  echo ""
  echo "  Full dumps (use for --postgres restore):"
  rclone ls "${GDRIVE_PG}/full/" | sort -r | head -20 | sed 's/^/    /'
  echo ""
  echo "  WAL archive count:"
  rclone size "${GDRIVE_PG}/wal" --json | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(f'    {d[\"count\"]} segments, {d[\"bytes\"]/1024/1024:.1f} MB')"
  echo ""
}

list_mongo() {
  echo ""
  echo "  Available MongoDB snapshots:"
  rclone ls "${GDRIVE_MONGO}/snapshots/" | sort -r | head -20 | sed 's/^/    /'
  echo ""
}

# ── PostgreSQL restore from full dump ─────────────────────────────────────────
restore_postgres() {
  local FILE_NAME="$1"
  local LOCAL_PATH="$RESTORE_DIR/$FILE_NAME"

  log "Downloading $FILE_NAME from Google Drive..."
  rclone copy "${GDRIVE_PG}/full/${FILE_NAME}" "$RESTORE_DIR/" \
    --stats=0 --log-level=ERROR
  ok "Downloaded: $LOCAL_PATH"

  echo ""
  echo "  ⚠️  WARNING: This will DROP and recreate database '$PG_DB'."
  read -r -p "  Type YES to continue: " CONFIRM
  [ "$CONFIRM" = "YES" ] || { echo "Aborted."; exit 0; }

  # Stop the backend to prevent connections during restore
  log "Stopping backend container..."
  docker stop gg-cms-backend 2>/dev/null || true

  log "Dropping and recreating database..."
  docker exec "$PG_CONTAINER" \
    psql -U "$PG_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$PG_DB';" \
    -c "DROP DATABASE IF EXISTS $PG_DB;" \
    -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"

  # Restore based on file type
  if [[ "$FILE_NAME" == *.dump ]]; then
    log "Restoring custom-format dump..."
    docker exec -i "$PG_CONTAINER" \
      pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --clean \
      < "$LOCAL_PATH"
  elif [[ "$FILE_NAME" == *.sql.gz ]]; then
    log "Restoring SQL dump (gzipped)..."
    gunzip -c "$LOCAL_PATH" | docker exec -i "$PG_CONTAINER" \
      psql -U "$PG_USER" -d "$PG_DB"
  fi

  ok "PostgreSQL restore complete."
  rm -f "$LOCAL_PATH"

  log "Restarting backend..."
  docker start gg-cms-backend 2>/dev/null || true
}

# ── MongoDB restore ───────────────────────────────────────────────────────────
restore_mongo() {
  local FILE_NAME="$1"
  local LOCAL_PATH="$RESTORE_DIR/$FILE_NAME"

  local MONGO_PASS
  MONGO_PASS=$(docker inspect "$MONGO_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep MONGO_INITDB_ROOT_PASSWORD | cut -d= -f2)

  log "Downloading $FILE_NAME from Google Drive..."
  rclone copy "${GDRIVE_MONGO}/snapshots/${FILE_NAME}" "$RESTORE_DIR/" \
    --stats=0 --log-level=ERROR
  ok "Downloaded: $LOCAL_PATH"

  echo ""
  echo "  ⚠️  WARNING: This will DROP and replace the '$MONGO_DB' database."
  read -r -p "  Type YES to continue: " CONFIRM
  [ "$CONFIRM" = "YES" ] || { echo "Aborted."; exit 0; }

  docker stop gg-cms-backend 2>/dev/null || true

  log "Restoring MongoDB snapshot..."
  docker exec -i "$MONGO_CONTAINER" \
    mongorestore \
      --username="$MONGO_PASS" \
      --password="$MONGO_PASS" \
      --authenticationDatabase=admin \
      --db="$MONGO_DB" \
      --drop \
      --archive \
      --gzip \
    < "$LOCAL_PATH"

  ok "MongoDB restore complete."
  rm -f "$LOCAL_PATH"
  docker start gg-cms-backend 2>/dev/null || true
}

# ── Latest helpers ────────────────────────────────────────────────────────────
latest_postgres() {
  local LATEST
  LATEST=$(rclone ls "${GDRIVE_PG}/full/" | sort -r | head -1 | awk '{print $2}')
  [ -n "$LATEST" ] || fail "No PostgreSQL backups found in GDrive."
  log "Latest backup: $LATEST"
  restore_postgres "$LATEST"
}

latest_mongo() {
  local LATEST
  LATEST=$(rclone ls "${GDRIVE_MONGO}/snapshots/" | sort -r | head -1 | awk '{print $2}')
  [ -n "$LATEST" ] || fail "No MongoDB snapshots found in GDrive."
  log "Latest snapshot: $LATEST"
  restore_mongo "$LATEST"
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "$MODE" in
  --list-postgres)    list_postgres ;;
  --list-mongo)       list_mongo ;;
  --postgres)         [ -n "$FILE" ] || fail "Specify filename: $0 --postgres <filename>"; restore_postgres "$FILE" ;;
  --mongo)            [ -n "$FILE" ] || fail "Specify filename: $0 --mongo <filename>"; restore_mongo "$FILE" ;;
  --latest-postgres)  latest_postgres ;;
  --latest-mongo)     latest_mongo ;;
  *)
    echo "Usage:"
    echo "  $0 --list-postgres"
    echo "  $0 --list-mongo"
    echo "  $0 --postgres  <filename.dump>"
    echo "  $0 --mongo     <filename.gz>"
    echo "  $0 --latest-postgres"
    echo "  $0 --latest-mongo"
    exit 1 ;;
esac

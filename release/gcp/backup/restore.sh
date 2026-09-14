#!/usr/bin/env bash
# GG-CMS — Restore from Google Drive backup
# Sealed, environment-safe database restoration with manifest pre-inspection
#
# Usage:
#   bash restore.sh --env <prod|test|local> --list-postgres
#   bash restore.sh --env <prod|test|local> --list-mongo
#   bash restore.sh --env <prod|test|local> --postgres full_20260101_020000.dump
#   bash restore.sh --env <prod|test|local> --mongo    mongo_20260101_030000.gz
#   bash restore.sh --env <prod|test|local> --latest-postgres
#   bash restore.sh --env <prod|test|local> --latest-mongo

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ENV_TARGET="${ENV:-}"
MODE=""
FILE=""

usage() {
  echo "Usage: bash release/gcp/backup/restore.sh --env <prod|test|local> [MODE] [FILE]"
  echo ""
  echo "Modes:"
  echo "  --list-postgres           List available PostgreSQL backups and manifest"
  echo "  --list-mongo              List available MongoDB backups and manifest"
  echo "  --postgres <filename>     Restore specified PostgreSQL full dump"
  echo "  --mongo    <filename>     Restore specified MongoDB snapshot"
  echo "  --latest-postgres         Restore most recent PostgreSQL full dump"
  echo "  --latest-mongo            Restore most recent MongoDB snapshot"
  echo "  --help                    Display this help message"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV_TARGET="$2"; shift 2 ;;
    --list-postgres|--list-mongo|--latest-postgres|--latest-mongo) MODE="$1"; shift ;;
    --postgres|--mongo) MODE="$1"; FILE="${2:-}"; shift 2 ;;
    --help|-h) usage ;;
    *)
      if [[ -z "$MODE" ]]; then
        MODE="$1"; shift
      else
        FILE="$1"; shift
      fi
      ;;
  esac
done

if [[ -z "$ENV_TARGET" ]]; then
  echo "❌ Error: --env <prod|test|local> is required for restore operations."
  usage
fi

GDRIVE_REMOTE="gdrive"
BACKUP_ROOT="backup/geekgully/data/${ENV_TARGET}"
GDRIVE_PG="${GDRIVE_REMOTE}:${BACKUP_ROOT}/postgres"
GDRIVE_MONGO="${GDRIVE_REMOTE}:${BACKUP_ROOT}/mongodb"

if [[ "$ENV_TARGET" == "prod" ]]; then
  PG_CONTAINER="gg-cms-postgres-prod"
  MONGO_CONTAINER="gg-cms-mongodb-prod"
else
  PG_CONTAINER="gg-cms-postgres"
  MONGO_CONTAINER="gg-cms-mongodb"
fi

PG_USER="gg_cms_user"
PG_DB="gg_cms"
MONGO_DB="gg_cms"

RESTORE_DIR="/opt/gg-cms/restore-tmp"

log()  { echo "$(date '+%F %T') [restore] [$ENV_TARGET] $*"; }
ok()   { log "[OK]  $*"; }
fail() { log "[ERR] $*" >&2; exit 1; }

command -v rclone &>/dev/null || fail "rclone not installed"
mkdir -p "$RESTORE_DIR"

if ! docker ps --format '{{.Names}}' | grep -q "$PG_CONTAINER"; then
  if docker ps --format '{{.Names}}' | grep -q "gg-cms-postgres"; then
    PG_CONTAINER="gg-cms-postgres"
  fi
fi

if ! docker ps --format '{{.Names}}' | grep -q "$MONGO_CONTAINER"; then
  if docker ps --format '{{.Names}}' | grep -q "gg-cms-mongodb"; then
    MONGO_CONTAINER="gg-cms-mongodb"
  fi
fi

# ── Manifest Inspection Helper ────────────────────────────────────────────────
inspect_manifest() {
  local target_remote="$1"
  log "Inspecting remote backup manifest for environment: $ENV_TARGET..."
  local manifest_tmp="$RESTORE_DIR/backup-manifest.json"
  rm -f "$manifest_tmp"
  
  if rclone copy "${target_remote}/backup-manifest.json" "$RESTORE_DIR/" --stats=0 --log-level=ERROR 2>/dev/null; then
    if [[ -f "$manifest_tmp" ]]; then
      echo "------------------------------------------------------------"
      echo "📋 Remote Backup Manifest Envelope:"
      python3 -c "
import json
m = json.load(open('$manifest_tmp'))
print(f'   • Deployment ID:     {m.get(\"deployment_id\")}')
print(f'   • Environment:       {m.get(\"environment\")}')
print(f'   • Timestamp:         {m.get(\"timestamp\")}')
print(f'   • DB Schema Hash:    {m.get(\"db_schema_hash\")}')
print(f'   • UI Version:        {m.get(\"ui_version\")}')
print(f'   • Backend Version:   {m.get(\"backend_version\")}')
print(f'   • DB Migration Ver:  {m.get(\"db_migration_version\")}')
" 2>/dev/null || true
      echo "------------------------------------------------------------"
    fi
  else
    log "⚠️ No backup-manifest.json found at target remote ($target_remote)."
  fi
}

# ── List ──────────────────────────────────────────────────────────────────────
list_postgres() {
  echo ""
  echo "  Available PostgreSQL backups for environment [$ENV_TARGET]:"
  inspect_manifest "$GDRIVE_PG"
  echo "  Full dumps (use for --postgres restore):"
  rclone ls "${GDRIVE_PG}/full/" 2>/dev/null | sort -r | head -20 | sed 's/^/    /' || echo "    (none)"
  echo ""
  echo "  WAL archive count:"
  rclone size "${GDRIVE_PG}/wal" --json 2>/dev/null | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(f'    {d[\"count\"]} segments, {d[\"bytes\"]/1024/1024:.1f} MB')" 2>/dev/null || echo "    (none)"
  echo ""
}

list_mongo() {
  echo ""
  echo "  Available MongoDB snapshots for environment [$ENV_TARGET]:"
  inspect_manifest "$GDRIVE_MONGO"
  echo "  MongoDB snapshots (use for --mongo restore):"
  rclone ls "${GDRIVE_MONGO}/snapshots/" 2>/dev/null | sort -r | head -20 | sed 's/^/    /' || echo "    (none)"
  echo ""
}

# ── PostgreSQL restore from full dump ─────────────────────────────────────────
restore_postgres() {
  local FILE_NAME="$1"
  local LOCAL_PATH="$RESTORE_DIR/$FILE_NAME"

  inspect_manifest "$GDRIVE_PG"

  log "Downloading $FILE_NAME from Google Drive..."
  rclone copy "${GDRIVE_PG}/full/${FILE_NAME}" "$RESTORE_DIR/" \
    --stats=0 --log-level=ERROR
  ok "Downloaded: $LOCAL_PATH"

  local REQUIRED_TOKEN="RESTORE_${ENV_TARGET^^}"
  echo ""
  echo "  ⚠️  HIGH-RISK ACTION: This will DROP and recreate database '$PG_DB' on environment '$ENV_TARGET'."
  read -r -p "  To confirm execution, type '$REQUIRED_TOKEN': " CONFIRM
  [ "$CONFIRM" = "$REQUIRED_TOKEN" ] || { echo "Aborted."; exit 0; }

  # Stop backend to prevent locks
  log "Stopping backend container..."
  docker stop gg-cms-backend 2>/dev/null || docker stop gg-cms-backend-prod 2>/dev/null || true

  log "Dropping and recreating database..."
  docker exec "$PG_CONTAINER" \
    psql -U "$PG_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$PG_DB';" \
    -c "DROP DATABASE IF EXISTS $PG_DB;" \
    -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"

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

  # Run migration audit gate post-restore
  log "Running migration compatibility audit after restore..."
  if [[ -f "$REPO_ROOT/release/db-upgrade.sh" ]]; then
    bash "$REPO_ROOT/release/db-upgrade.sh" --check --env "$ENV_TARGET" || log "⚠️ Migration audit warning post-restore"
  fi

  log "Restarting backend..."
  docker start gg-cms-backend 2>/dev/null || docker start gg-cms-backend-prod 2>/dev/null || true
  ok "Restore flow completed successfully."
}

# ── MongoDB restore ───────────────────────────────────────────────────────────
restore_mongo() {
  local FILE_NAME="$1"
  local LOCAL_PATH="$RESTORE_DIR/$FILE_NAME"

  inspect_manifest "$GDRIVE_MONGO"

  local MONGO_PASS
  MONGO_PASS=$(docker inspect "$MONGO_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep MONGO_INITDB_ROOT_PASSWORD | cut -d= -f2)

  log "Downloading $FILE_NAME from Google Drive..."
  rclone copy "${GDRIVE_MONGO}/snapshots/${FILE_NAME}" "$RESTORE_DIR/" \
    --stats=0 --log-level=ERROR
  ok "Downloaded: $LOCAL_PATH"

  local REQUIRED_TOKEN="RESTORE_${ENV_TARGET^^}"
  echo ""
  echo "  ⚠️  HIGH-RISK ACTION: This will DROP and replace database '$MONGO_DB' on environment '$ENV_TARGET'."
  read -r -p "  To confirm execution, type '$REQUIRED_TOKEN': " CONFIRM
  [ "$CONFIRM" = "$REQUIRED_TOKEN" ] || { echo "Aborted."; exit 0; }

  docker stop gg-cms-backend 2>/dev/null || docker stop gg-cms-backend-prod 2>/dev/null || true

  log "Restoring MongoDB snapshot..."
  docker exec -i "$MONGO_CONTAINER" \
    mongorestore \
      --username="$MONGO_USER" \
      --password="$MONGO_PASS" \
      --authenticationDatabase=admin \
      --db="$MONGO_DB" \
      --drop \
      --archive \
      --gzip \
    < "$LOCAL_PATH"

  ok "MongoDB restore complete."
  rm -f "$LOCAL_PATH"

  log "Restarting backend..."
  docker start gg-cms-backend 2>/dev/null || docker start gg-cms-backend-prod 2>/dev/null || true
  ok "Restore flow completed successfully."
}

latest_postgres() {
  local LATEST
  LATEST=$(rclone ls "${GDRIVE_PG}/full/" 2>/dev/null | sort -r | head -1 | awk '{print $2}')
  [ -n "$LATEST" ] || fail "No PostgreSQL backups found in GDrive for environment '$ENV_TARGET'."
  log "Latest backup: $LATEST"
  restore_postgres "$LATEST"
}

latest_mongo() {
  local LATEST
  LATEST=$(rclone ls "${GDRIVE_MONGO}/snapshots/" 2>/dev/null | sort -r | head -1 | awk '{print $2}')
  [ -n "$LATEST" ] || fail "No MongoDB snapshots found in GDrive for environment '$ENV_TARGET'."
  log "Latest snapshot: $LATEST"
  restore_mongo "$LATEST"
}

case "$MODE" in
  --list-postgres)    list_postgres ;;
  --list-mongo)       list_mongo ;;
  --postgres)         [ -n "$FILE" ] || fail "Specify filename: $0 --env $ENV_TARGET --postgres <filename>"; restore_postgres "$FILE" ;;
  --mongo)            [ -n "$FILE" ] || fail "Specify filename: $0 --env $ENV_TARGET --mongo <filename>"; restore_mongo "$FILE" ;;
  --latest-postgres)  latest_postgres ;;
  --latest-mongo)     latest_mongo ;;
  *)
    echo "Usage: $0 --env <prod|test|local> --list-postgres | --list-mongo | --postgres <f> | --mongo <f> | --latest-postgres | --latest-mongo"
    exit 1 ;;
esac

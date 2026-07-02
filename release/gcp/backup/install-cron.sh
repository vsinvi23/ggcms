#!/usr/bin/env bash
# GG-CMS — Install backup cron jobs on e2-micro VM
# Run once after setup-gdrive.sh --vm-install

set -euo pipefail

BACKUP_DIR="/opt/gg-cms/backup"
LOG_DIR="/opt/gg-cms/logs/backup"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Copy scripts
cp "$(dirname "$0")"/*.sh "$BACKUP_DIR/"
chmod +x "$BACKUP_DIR"/*.sh

echo "Installing backup cron jobs..."

# Write cron entries
CRON_JOBS=$(cat <<EOF
# GG-CMS backup jobs — installed by install-cron.sh
# Logs are written to $LOG_DIR/

# PostgreSQL WAL sync — every 15 minutes (delta: only new WAL segments)
*/15 * * * *  bash $BACKUP_DIR/postgres-backup.sh --wal-sync >> $LOG_DIR/pg-wal.log 2>&1

# PostgreSQL daily logical dump — 2 AM
0 2 * * *  bash $BACKUP_DIR/postgres-backup.sh --daily >> $LOG_DIR/pg-daily.log 2>&1

# PostgreSQL weekly full dump — Sunday 1 AM
0 1 * * 0  bash $BACKUP_DIR/postgres-backup.sh --full >> $LOG_DIR/pg-full.log 2>&1

# MongoDB daily snapshot — 3 AM
0 3 * * *  bash $BACKUP_DIR/mongodb-backup.sh --snapshot >> $LOG_DIR/mongo-daily.log 2>&1

# MongoDB weekly per-collection export — Sunday 3:30 AM
30 3 * * 0  bash $BACKUP_DIR/mongodb-backup.sh --full-collections >> $LOG_DIR/mongo-full.log 2>&1

# Log rotation — keep last 7 days of backup logs
0 4 * * *  find $LOG_DIR -name "*.log" -mtime +7 -delete

EOF
)

# Install crontab (preserving any existing entries that aren't ours)
(crontab -l 2>/dev/null | grep -v "gg-cms backup" | grep -v "$BACKUP_DIR"; echo "$CRON_JOBS") | crontab -

echo "  [OK]    Cron jobs installed"
echo ""
crontab -l | grep -A1 "GG-CMS"
echo ""
echo "  Monitor backup logs:"
echo "    tail -f $LOG_DIR/pg-wal.log"
echo "    tail -f $LOG_DIR/mongo-daily.log"
echo ""
echo "  Test backups manually:"
echo "    bash $BACKUP_DIR/postgres-backup.sh --wal-sync"
echo "    bash $BACKUP_DIR/postgres-backup.sh --daily"
echo "    bash $BACKUP_DIR/mongodb-backup.sh --snapshot"
echo "    bash $BACKUP_DIR/postgres-backup.sh --list"
echo "    bash $BACKUP_DIR/mongodb-backup.sh --list"

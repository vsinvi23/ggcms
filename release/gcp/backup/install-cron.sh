#!/usr/bin/env bash
# GG-CMS — Install backup cron jobs on e2-micro VM
# Run once after setup-gdrive.sh --vm-install

set -euo pipefail

BACKUP_DIR="/opt/gg-cms/backup"
LOG_DIR="/opt/gg-cms/logs/backup"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Copy scripts if running from outside BACKUP_DIR
if [ "$(cd "$(dirname "$0")" && pwd)" != "$(cd "$BACKUP_DIR" 2>/dev/null && pwd)" ]; then
  cp "$(dirname "$0")"/*.sh "$BACKUP_DIR/"
fi
chmod +x "$BACKUP_DIR"/*.sh

echo "Installing backup cron jobs..."

# Write cron entries
CRON_JOBS=$(cat <<EOF
# GG-CMS backup jobs — installed by install-cron.sh
# Logs are written to $LOG_DIR/

# PostgreSQL weekly full dump — Every Sunday at 2:00 AM (retains last 3 backups in backup/geekgully/data/postgres)
0 2 * * 0  bash $BACKUP_DIR/postgres-backup.sh --full >> $LOG_DIR/pg-weekly.log 2>&1

# MongoDB weekly snapshot dump — Every Sunday at 3:00 AM (retains last 3 backups in backup/geekgully/data/mongodb)
0 3 * * 0  bash $BACKUP_DIR/mongodb-backup.sh --snapshot >> $LOG_DIR/mongo-weekly.log 2>&1

# Log rotation — keep last 30 days of backup logs
0 4 * * *  find $LOG_DIR -name "*.log" -mtime +30 -delete

EOF
)

# Install crontab (preserving any existing entries that aren't ours)
EXISTING_CRON=$(crontab -l 2>/dev/null | grep -v "gg-cms backup" | grep -v "$BACKUP_DIR" || true)
printf "%s\n%s\n" "$EXISTING_CRON" "$CRON_JOBS" | crontab -

echo "  [OK]    Cron jobs installed"
echo ""
crontab -l 2>/dev/null | grep -A1 "GG-CMS" || true
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

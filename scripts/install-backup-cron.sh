#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# 🛡️  XOSO66 TV — Install daily backup cron
#
# Usage:
#   bash scripts/install-backup-cron.sh [project_dir] [hour]
#
# Example:
#   bash scripts/install-backup-cron.sh /var/www/xoso66tv 3
# ═══════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="${1:-/var/www/xoso66tv}"
BACKUP_HOUR="${2:-3}"   # default: 3 AM
NODE_BIN="$(command -v node || echo /usr/bin/node)"
LOG_FILE="/var/log/xoso66tv-backup.log"

echo "═══════════════════════════════════════════════════════════════"
echo "🛡️  Installing daily backup cron for XOSO66 TV"
echo "   PROJECT_DIR : $PROJECT_DIR"
echo "   BACKUP_HOUR : $BACKUP_HOUR (every day)"
echo "   NODE_BIN    : $NODE_BIN"
echo "   LOG_FILE    : $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════"

# Verify
if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project dir not found: $PROJECT_DIR"
  exit 1
fi
if [ ! -f "$PROJECT_DIR/scripts/backup.js" ]; then
  echo "❌ backup.js not found at $PROJECT_DIR/scripts/backup.js"
  exit 1
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "❌ Node.js binary not found. Install Node first."
  exit 1
fi

# Setup log file
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"
echo "✅ Log file ready: $LOG_FILE"

# Setup backup dir
BACKUP_DIR_DEFAULT="/var/backups/xoso66tv"
mkdir -p "$BACKUP_DIR_DEFAULT"
echo "✅ Backup dir ready: $BACKUP_DIR_DEFAULT"

# Build cron line — chạy mỗi ngày lúc BACKUP_HOUR:00
CRON_CMD="cd $PROJECT_DIR && $NODE_BIN scripts/backup.js >> $LOG_FILE 2>&1"
CRON_LINE="0 $BACKUP_HOUR * * * $CRON_CMD"

# Add to root crontab (xoá bản cũ nếu có để tránh duplicate)
( crontab -l 2>/dev/null | grep -v "scripts/backup.js" ; echo "$CRON_LINE" ) | crontab -

echo ""
echo "✅ Cron installed:"
echo "   $CRON_LINE"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📋 Verify:"
echo "   crontab -l | grep backup"
echo ""
echo "🧪 Run a test backup NOW:"
echo "   cd $PROJECT_DIR && node scripts/backup.js"
echo ""
echo "📂 List backups:"
echo "   node scripts/restore.js list"
echo ""
echo "📄 Tail log:"
echo "   tail -f $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════"

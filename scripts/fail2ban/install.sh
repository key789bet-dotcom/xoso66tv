#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# 🛡️  XOSO66 TV — Install fail2ban jail
#
# Run as root:
#   bash scripts/fail2ban/install.sh
# ═══════════════════════════════════════════════════════════════════
set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Run as root: sudo bash $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Install fail2ban if missing
if ! command -v fail2ban-client &> /dev/null; then
  echo "📦 Installing fail2ban..."
  apt-get update -qq
  apt-get install -y fail2ban
else
  echo "✅ fail2ban already installed: $(fail2ban-client --version | head -1)"
fi

# 2. Copy filter
echo "📋 Installing filter: /etc/fail2ban/filter.d/xoso66tv.conf"
cp "$SCRIPT_DIR/xoso66tv-filter.conf" /etc/fail2ban/filter.d/xoso66tv.conf
chmod 644 /etc/fail2ban/filter.d/xoso66tv.conf

# 3. Copy jail
echo "📋 Installing jail: /etc/fail2ban/jail.d/xoso66tv.local"
cp "$SCRIPT_DIR/xoso66tv-jail.local" /etc/fail2ban/jail.d/xoso66tv.local
chmod 644 /etc/fail2ban/jail.d/xoso66tv.local

# 4. Validate log path exists
LOG_FILES=(/root/.pm2/logs/xoso66tv-out.log /root/.pm2/logs/xoso66tv-error.log)
for f in "${LOG_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "⚠️  Log not found: $f — creating empty"
    mkdir -p "$(dirname "$f")"
    touch "$f"
    chmod 644 "$f"
  fi
done

# 5. Test filter syntax
echo "🧪 Testing filter syntax..."
if fail2ban-regex /root/.pm2/logs/xoso66tv-out.log /etc/fail2ban/filter.d/xoso66tv.conf 2>&1 | tail -10; then
  echo "✅ Filter syntax OK"
else
  echo "⚠️  Filter test had warnings (normal if no matches yet)"
fi

# 6. Enable + restart fail2ban
echo "🔄 Restarting fail2ban..."
systemctl enable fail2ban
systemctl restart fail2ban
sleep 2

# 7. Verify jail loaded
echo ""
echo "═══════════════════════════════════════════════════════════════"
fail2ban-client status xoso66tv || {
  echo "❌ Jail not loaded! Check: systemctl status fail2ban"
  exit 1
}
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "✅ fail2ban xoso66tv installed!"
echo ""
echo "📋 Commands:"
echo "   fail2ban-client status xoso66tv   # status + banned IPs"
echo "   fail2ban-client set xoso66tv unbanip 1.2.3.4   # unban manual"
echo "   tail -f /var/log/fail2ban.log     # watch ban events"
echo ""
echo "🧪 Test (sẽ ban IP của bạn nếu fail 5 lần — CAREFUL!):"
echo "   for i in {1..6}; do curl -X POST https://xoso66tv.com/admin/login -d 'username=test&password=wrong'; done"
echo "═══════════════════════════════════════════════════════════════"

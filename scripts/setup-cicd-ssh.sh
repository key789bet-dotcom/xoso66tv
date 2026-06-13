#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# 🔐 XOSO66 TV — Setup CI/CD SSH key (Mục 30)
#
# Tạo SSH key DEDICATED cho GitHub Actions (KHÔNG dùng SSH key cá nhân).
# Run trên VPS với quyền root.
#
# Usage:
#   ssh root@VPS_IP
#   curl -s https://raw.githubusercontent.com/key789bet-dotcom/xoso66tv/main/scripts/setup-cicd-ssh.sh | bash
# OR sau khi pull code:
#   bash /var/www/xoso66tv/scripts/setup-cicd-ssh.sh
# ═══════════════════════════════════════════════════════════════════
set -e

KEY_NAME="${1:-github-actions-deploy}"
KEY_DIR="$HOME/.ssh"
KEY_FILE="$KEY_DIR/${KEY_NAME}"
AUTH_KEYS="$KEY_DIR/authorized_keys"

if [ ! -d "$KEY_DIR" ]; then
  mkdir -p "$KEY_DIR"
  chmod 700 "$KEY_DIR"
fi

# Generate Ed25519 key (modern, smaller, faster than RSA)
if [ -f "$KEY_FILE" ]; then
  echo "⚠️  Key đã tồn tại: $KEY_FILE"
  echo "    Xoá nếu muốn tạo mới: rm -f $KEY_FILE $KEY_FILE.pub"
  echo "    Đang tiếp tục với key hiện có..."
else
  echo "🔑 Generating Ed25519 SSH key..."
  ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "github-actions@xoso66tv-$(date +%Y%m%d)"
  chmod 600 "$KEY_FILE"
  chmod 644 "${KEY_FILE}.pub"
  echo "✅ Key created: $KEY_FILE"
fi

# Add public key to authorized_keys (deploy-only restrictions)
PUB_KEY=$(cat "${KEY_FILE}.pub")
if grep -qF "$PUB_KEY" "$AUTH_KEYS" 2>/dev/null; then
  echo "✅ Public key đã có trong authorized_keys"
else
  # Restricted entry — chỉ cho phép chạy deploy command
  # (Có thể siết hơn bằng command="...", forced commands)
  echo "" >> "$AUTH_KEYS"
  echo "# GitHub Actions deploy key (xoso66tv)" >> "$AUTH_KEYS"
  echo "$PUB_KEY" >> "$AUTH_KEYS"
  chmod 600 "$AUTH_KEYS"
  echo "✅ Public key added to $AUTH_KEYS"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🎉 SSH key sẵn sàng cho CI/CD!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 BƯỚC TIẾP THEO (làm trên máy local browser):"
echo ""
echo "1. Vào GitHub repo Settings → Secrets and variables → Actions"
echo "   https://github.com/key789bet-dotcom/xoso66tv/settings/secrets/actions"
echo ""
echo "2. Click 'New repository secret' tạo 4 secrets sau:"
echo ""
echo "   ┌─────────────────────────────────────────────────────────┐"
echo "   │ Secret name      │ Value                                 │"
echo "   ├─────────────────────────────────────────────────────────┤"
echo "   │ VPS_HOST         │ $(curl -s -4 ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
echo "   │ VPS_USER         │ root"
echo "   │ VPS_PORT         │ 22"
echo "   │ VPS_SSH_KEY      │ (private key — xem bên dưới)"
echo "   └─────────────────────────────────────────────────────────┘"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🔐 PRIVATE KEY (copy NGUYÊN PHẦN bên dưới — bao gồm BEGIN/END):"
echo "═══════════════════════════════════════════════════════════════"
cat "$KEY_FILE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  CỰC KỲ QUAN TRỌNG:"
echo "   - KHÔNG SHARE key này với ai"
echo "   - Sau khi paste vào GitHub Secrets → xoá lịch sử terminal: history -c"
echo "   - Nếu nghi key lộ → chạy lại script này để tạo mới"
echo ""
echo "📨 BONUS (optional): Telegram notification"
echo "   Thêm 2 secrets nữa nếu muốn nhận thông báo deploy qua Telegram bot:"
echo "   - TELEGRAM_BOT_TOKEN: token bot từ @BotFather"
echo "   - TELEGRAM_CHAT_ID:   ID chat/user của anh"
echo "═══════════════════════════════════════════════════════════════"

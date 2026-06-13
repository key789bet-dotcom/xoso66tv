#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# 🔐 XOSO66 TV — Setup CI/CD SSH key (Mục 30)
#
# AN TOÀN: Script KHÔNG in private key ra terminal.
# Private key chỉ lưu vào file /root/.ssh/ — anh tự đọc file đó để paste vào GitHub.
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

# Xóa key cũ nếu tồn tại (force re-generate cho an toàn)
if [ -f "$KEY_FILE" ]; then
  echo "⚠️  Key cũ tồn tại — xóa để tạo mới sạch..."
  rm -f "$KEY_FILE" "${KEY_FILE}.pub"
fi

# Xóa public key cũ khỏi authorized_keys
if grep -q "github-actions@xoso66tv" "$AUTH_KEYS" 2>/dev/null; then
  echo "🧹 Xóa public key cũ khỏi authorized_keys..."
  grep -v "github-actions@xoso66tv" "$AUTH_KEYS" > "${AUTH_KEYS}.tmp"
  mv "${AUTH_KEYS}.tmp" "$AUTH_KEYS"
  chmod 600 "$AUTH_KEYS"
fi

# Generate Ed25519 key MỚI
echo "🔑 Generating Ed25519 SSH key mới..."
ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "github-actions@xoso66tv-$(date +%Y%m%d-%H%M%S)" > /dev/null
chmod 600 "$KEY_FILE"
chmod 644 "${KEY_FILE}.pub"
echo "✅ Key mới: $KEY_FILE"

# Add public key vào authorized_keys
PUB_KEY=$(cat "${KEY_FILE}.pub")
echo "" >> "$AUTH_KEYS"
echo "# GitHub Actions deploy key (xoso66tv) - $(date)" >> "$AUTH_KEYS"
echo "$PUB_KEY" >> "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"
echo "✅ Public key đã add vào authorized_keys"

# VPS IP
VPS_IP=$(curl -s -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🎉 SSH key sẵn sàng — BÂY GIỜ CONFIG GITHUB SECRETS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 4 secrets cần tạo trên GitHub:"
echo "   https://github.com/key789bet-dotcom/xoso66tv/settings/secrets/actions"
echo ""
echo "   ┌──────────────┬───────────────────────────────────────────┐"
echo "   │ Secret name  │ Value                                      │"
echo "   ├──────────────┼───────────────────────────────────────────┤"
echo "   │ VPS_HOST     │ $VPS_IP"
echo "   │ VPS_USER     │ root"
echo "   │ VPS_PORT     │ 22"
echo "   │ VPS_SSH_KEY  │ (đọc file bên dưới)                       │"
echo "   └──────────────┴───────────────────────────────────────────┘"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🔐 Đọc private key (CHỈ paste vào GitHub Secrets, KHÔNG vào chat):"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "   cat $KEY_FILE"
echo ""
echo "   → Bôi đen TỪ '-----BEGIN OPENSSH PRIVATE KEY-----'"
echo "     ĐẾN     '-----END OPENSSH PRIVATE KEY-----'"
echo "     (bao gồm cả 2 dòng BEGIN/END)"
echo "   → Paste TRỰC TIẾP vào GitHub web → VPS_SSH_KEY secret"
echo ""
echo "⚠️  TUYỆT ĐỐI KHÔNG paste private key vào chat, Discord, email"
echo "    hay bất kỳ đâu KHÔNG PHẢI GitHub Secrets web UI"
echo ""
echo "📊 Sau khi paste xong, xóa terminal history:"
echo "   history -c && history -w"
echo ""
echo "═══════════════════════════════════════════════════════════════"

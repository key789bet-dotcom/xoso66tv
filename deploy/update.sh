#!/bin/bash
# ============================================================
# XOSO66TV - Quick Update Script
# Chạy mỗi khi push code mới lên GitHub
# ============================================================
# Cách dùng trên VPS:
#   cd /var/www/xoso66tv
#   bash deploy/update.sh
# ============================================================

set -e

APP_DIR="/var/www/xoso66tv"
cd $APP_DIR

echo "[1/4] Pull code mới từ GitHub..."
# Bỏ thay đổi package-lock.json do npm tự sinh (tránh 'unstaged changes' chặn git pull)
git checkout -- package-lock.json 2>/dev/null || true
git pull origin main

echo "[2/4] Cài dependencies mới (nếu có)..."
npm install --omit=dev

echo "[3/4] Restart app bằng PM2..."
pm2 restart xoso66tv

echo "[4/4] Reload nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "✅ Đã update xong!"
pm2 status

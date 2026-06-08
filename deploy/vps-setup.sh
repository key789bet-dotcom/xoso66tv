#!/bin/bash
# ============================================================
# XOSO66TV - VPS Auto Setup Script (Ubuntu 24.04)
# Chạy 1 lần đầu tiên trên VPS Hostinger để cài hết phần mềm
# ============================================================
# Cách dùng:
#   ssh root@187.127.112.134
#   curl -fsSL https://raw.githubusercontent.com/key789bet-dotcom/xoso66tv/main/deploy/vps-setup.sh | bash
# HOẶC upload file này lên VPS rồi: bash vps-setup.sh
# ============================================================

set -e  # Dừng nếu có lỗi

DOMAIN="xoso66tv.com"
APP_DIR="/var/www/xoso66tv"
REPO_URL="https://github.com/key789bet-dotcom/xoso66tv.git"
NODE_VERSION="20"

echo "============================================================"
echo "  XOSO66TV - VPS SETUP (Ubuntu 24.04)"
echo "============================================================"
echo ""

# 1. Update OS
echo "[1/8] Cập nhật hệ điều hành..."
apt update && apt upgrade -y

# 2. Cài Node.js 20 LTS
echo "[2/8] Cài Node.js ${NODE_VERSION} LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt install -y nodejs
fi
node -v && npm -v

# 3. Cài Git
echo "[3/8] Cài Git..."
apt install -y git

# 4. Cài PM2 (process manager)
echo "[4/8] Cài PM2..."
npm install -g pm2

# 5. Cài Nginx
echo "[5/8] Cài Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# 6. Cài Certbot (Let's Encrypt SSL)
echo "[6/8] Cài Certbot SSL..."
apt install -y certbot python3-certbot-nginx

# 7. Mở firewall
echo "[7/8] Cấu hình firewall..."
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# 8. Clone repo
echo "[8/8] Clone source code..."
mkdir -p /var/log/xoso66tv
mkdir -p /var/www/certbot
if [ -d "$APP_DIR" ]; then
  echo "  → Đã có thư mục, pull update..."
  cd $APP_DIR
  git pull
else
  echo "  → Clone từ GitHub..."
  git clone $REPO_URL $APP_DIR
  cd $APP_DIR
fi

# Cài dependencies
echo "  → npm install..."
npm install --production

# Tạo .env nếu chưa có
if [ ! -f "$APP_DIR/.env" ]; then
  echo "  → Tạo .env mẫu..."
  cp .env.example .env
  # Generate random secret
  JWT_SECRET=$(openssl rand -hex 32)
  echo "" >> .env
  echo "JWT_SECRET=$JWT_SECRET" >> .env
  echo "NODE_ENV=production" >> .env
  echo "SITE_URL=https://${DOMAIN}" >> .env
  echo ""
  echo "  ⚠️  NHỚ SỬA .env (admin password, gmail SMTP, telegram bot)!"
  echo "      nano $APP_DIR/.env"
  echo ""
fi

# Cấu hình Nginx
echo ""
echo "============================================================"
echo "  CẤU HÌNH NGINX"
echo "============================================================"
cp $APP_DIR/deploy/nginx-xoso66tv.conf /etc/nginx/sites-available/${DOMAIN}
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
rm -f /etc/nginx/sites-enabled/default

# Test nginx
nginx -t

# Tạo cert tạm trước khi có SSL (để nginx reload không lỗi)
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo ""
  echo "⚠️  CHƯA CÓ SSL. Sẽ tạo cert tự ký tạm thời..."
  mkdir -p /etc/letsencrypt/live/${DOMAIN}
  openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
    -out /etc/letsencrypt/live/${DOMAIN}/fullchain.pem \
    -subj "/CN=${DOMAIN}"
fi

systemctl reload nginx

# Start app bằng PM2
echo ""
echo "============================================================"
echo "  START APP BẰNG PM2"
echo "============================================================"
cd $APP_DIR
pm2 delete xoso66tv 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo ""
echo "============================================================"
echo "  HOÀN TẤT! 🎉"
echo "============================================================"
echo ""
echo "✓ Node.js $(node -v) installed"
echo "✓ PM2 running app on port 4000"
echo "✓ Nginx reverse proxy configured"
echo ""
echo "📌 CÁC BƯỚC TIẾP THEO:"
echo ""
echo "1. Trỏ DNS domain ${DOMAIN} → IP VPS:"
echo "   Loại  Tên   Giá trị"
echo "   A     @     $(curl -s ifconfig.me)"
echo "   A     www   $(curl -s ifconfig.me)"
echo ""
echo "2. Sau khi DNS propagate (5-30 phút), chạy SSL:"
echo "   certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --agree-tos -m admin@${DOMAIN}"
echo ""
echo "3. Sửa file .env với password admin thật:"
echo "   nano ${APP_DIR}/.env"
echo "   pm2 restart xoso66tv"
echo ""
echo "4. Kiểm tra:"
echo "   pm2 status"
echo "   pm2 logs xoso66tv"
echo "   curl http://localhost:4000"
echo ""
echo "5. Test trên browser: http://${DOMAIN}"
echo ""

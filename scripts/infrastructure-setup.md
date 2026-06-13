# 🏗️ Infrastructure Setup Guide

Hướng dẫn setup các infrastructure features:

- Mục 27: Tách subdomain api.xoso66tv.com + static.xoso66tv.com
- Mục 29: Staging environment (staging.xoso66tv.com)

---

# 🔀 Mục 27: Subdomain split (api + static)

## Lợi ích

- **CDN tách biệt**: static.xoso66tv.com aggressive cache (1 năm) + Cloudflare CDN
- **API riêng**: api.xoso66tv.com bypass CDN cache, có rate limit riêng
- **Cookieless static**: assets không gửi cookie → bandwidth tiết kiệm
- **Browser parallel**: trình duyệt download từ nhiều subdomain song song

## Setup

### 1. Cloudflare DNS

Vào https://dash.cloudflare.com → DNS → Add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | api | <VPS_IP> | ✅ Proxied |
| A | static | <VPS_IP> | ✅ Proxied |

### 2. Nginx config thêm vhost

```bash
sudo nano /etc/nginx/sites-available/xoso66tv-subdomains
```

Paste:

```nginx
# api.xoso66tv.com - proxy API endpoints
server {
    listen 80;
    listen [::]:80;
    server_name api.xoso66tv.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name api.xoso66tv.com;

    ssl_certificate     /etc/letsencrypt/live/xoso66tv.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xoso66tv.com/privkey.pem;

    location / {
        # Chỉ cho /api/* qua, các URL khác → 404
        if ($uri !~* "^/api/") {
            return 404 "Use main domain for non-API";
        }
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Host xoso66tv.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# static.xoso66tv.com - aggressive cache
server {
    listen 80;
    listen [::]:80;
    server_name static.xoso66tv.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name static.xoso66tv.com;

    ssl_certificate     /etc/letsencrypt/live/xoso66tv.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xoso66tv.com/privkey.pem;

    # Cookieless static (browser bandwidth save)
    add_header Access-Control-Allow-Origin "https://xoso66tv.com" always;
    add_header Cross-Origin-Resource-Policy "cross-origin" always;

    location / {
        root /var/www/xoso66tv/public/;
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        access_log off;
    }

    # /uploads/ alias
    location /uploads/ {
        alias /var/www/xoso66tv/public/uploads/;
        expires 7d;
        access_log off;
    }
}
```

### 3. Enable + reload

```bash
sudo ln -s /etc/nginx/sites-available/xoso66tv-subdomains /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Update app code (optional)

Sửa `lib/api.js` để dùng `https://api.xoso66tv.com` thay `https://xoso66tv.com/api`
và HTML templates dùng `https://static.xoso66tv.com/css/...` thay `/static/css/...`.

(Để tối ưu, em đề xuất giữ chính domain cho user-facing, chỉ tách static cho assets.)

---

# 🧪 Mục 29: Staging Environment

## Strategy

Cùng VPS, **port khác + nginx subdomain**:
- Production: `xoso66tv.com` → port 4001
- Staging:    `staging.xoso66tv.com` → port 4002 (clone code branch `staging`)

## Setup

### 1. Clone repo riêng

```bash
cd /var/www
sudo git clone https://github.com/key789bet-dotcom/xoso66tv.git xoso66tv-staging
cd xoso66tv-staging
sudo git checkout staging  # tạo branch riêng nếu chưa có
sudo npm install
```

### 2. .env staging (port khác)

```bash
sudo cp /var/www/xoso66tv/.env .env
sudo nano .env
# Sửa: PORT=4002, NODE_ENV=staging, SITE_URL=https://staging.xoso66tv.com
```

### 3. PM2 staging process

```bash
sudo nano ecosystem.staging.config.js
```

```js
module.exports = {
  apps: [{
    name: 'xoso66tv-staging',
    script: 'server.js',
    cwd: '/var/www/xoso66tv-staging',
    instances: 1,
    exec_mode: 'fork',
    env: { NODE_ENV: 'staging', PORT: 4002 }
  }]
};
```

```bash
sudo pm2 start ecosystem.staging.config.js
sudo pm2 save
```

### 4. DNS + Nginx

Cloudflare DNS: add `staging.xoso66tv.com` → VPS IP (proxied)

Nginx config `/etc/nginx/sites-available/xoso66tv-staging`:

```nginx
server {
    listen 80;
    server_name staging.xoso66tv.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name staging.xoso66tv.com;

    ssl_certificate     /etc/letsencrypt/live/xoso66tv.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xoso66tv.com/privkey.pem;

    # Basic Auth để protect staging (chỉ team xem được)
    auth_basic "Staging - Internal Only";
    auth_basic_user_file /etc/nginx/.htpasswd-staging;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Create basic auth:

```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-staging admin
# Nhập password mong muốn

sudo ln -s /etc/nginx/sites-available/xoso66tv-staging /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. CI/CD branch staging (optional)

Update `.github/workflows/deploy.yml`:

```yaml
on:
  push:
    branches: [main, staging]
```

Add step phân biệt branch:
```yaml
- name: Deploy to staging or production
  run: |
    if [ "${{ github.ref_name }}" = "staging" ]; then
      cd /var/www/xoso66tv-staging
    else
      cd /var/www/xoso66tv
    fi
    git pull origin ${{ github.ref_name }}
    npm install --omit=dev
    pm2 reload ${{ github.ref_name == 'staging' && 'xoso66tv-staging' || 'xoso66tv' }}
```

## Workflow

1. Anh code feature mới ở local
2. `git push origin staging` → tự deploy lên `staging.xoso66tv.com`
3. Test trên staging (có basic auth bảo vệ)
4. OK → merge staging → main → tự deploy production

---

## ✅ DONE — Tất cả infrastructure docs

Production-ready ngay khi anh chạy các lệnh trong file này.

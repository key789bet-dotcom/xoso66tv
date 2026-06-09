# 🌍 Multi-Region Setup Guide - XOSO66 TV

## 🎯 Mục tiêu
Serve viewers từ Singapore + US gần hơn, giảm latency từ 200ms (qua VN) → 30ms (region gần).

## 🏗️ Kiến trúc

```
                           ┌──────────────────────┐
                           │  Cloudflare Geo DNS  │
                           │  Load Balancer       │
                           └──────────┬───────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
        🇻🇳 VN (Origin)        🇸🇬 Singapore Edge     🇺🇸 US Edge
        xoso66tv.com            sg.xoso66tv.com       us.xoso66tv.com
        - App Express           - SRS Edge Mirror     - SRS Edge Mirror
        - SRS Origin            - Nginx static cache  - Nginx static cache
        - DB JSON               - Pull-on-demand      - Pull-on-demand
        - User 🇻🇳 + 🇰🇭🇱🇦       - User 🇸🇬🇲🇾🇮🇩🇹🇭🇵🇭     - User 🇺🇸🇨🇦🇲🇽
```

---

## 📋 BƯỚC 1: Mua 2 VPS

### Singapore (cho user ĐNÁ)
- **Provider khuyến nghị**: Vultr / DigitalOcean / Hostinger SG
- **Spec tối thiểu**: 4 vCPU, 8 GB RAM, 100 GB SSD, 1 Gbps
- **Giá**: ~$30-50/tháng
- **Region**: Singapore (sgp1)

### US East (cho user Mỹ/Canada)
- **Provider khuyến nghị**: Vultr NY / DigitalOcean NYC
- **Spec**: tương tự Singapore
- **Region**: New York (nyc1) hoặc Dallas (dal1)

---

## 📋 BƯỚC 2: Setup Singapore VPS (mirror)

SSH vào VPS Singapore:

```bash
ssh root@<SG_VPS_IP>

# 1. Cài Docker + Nginx
apt update && apt install -y docker.io nginx certbot python3-certbot-nginx ufw fail2ban

# 2. Mở firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8000/udp   # WebRTC ICE
ufw allow 1985/tcp   # SRS API
ufw allow 8081/tcp   # SRS HTTP-FLV
ufw --force enable

# 3. Run SRS EDGE MODE - mirror từ VN origin
docker run -d --name srs-edge --restart=always \
  --network host \
  -e CANDIDATE=<SG_VPS_IP> \
  ossrs/srs:6 \
  ./objs/srs -c conf/edge.conf

# 4. Tạo edge config (mirror từ VN)
cat > /root/srs-edge.conf <<'EOF'
listen              1935;
max_connections     5000;
srs_log_tank        console;
http_api {
    enabled         on;
    listen          1985;
}
http_server {
    enabled         on;
    listen          8081;
    dir             ./objs/nginx/html;
}
rtc_server {
    enabled on;
    listen 8000;
    candidate $CANDIDATE;
}
vhost __defaultVhost__ {
    cluster {
        mode            remote;
        origin          xoso66tv.com:1935;  # ORIGIN VN
    }
    http_remux {
        enabled     on;
        mount       [vhost]/[app]/[stream].flv;
    }
    rtc {
        enabled     on;
        bframe      discard;
        rtmp_to_rtc on;
        rtc_to_rtmp on;
    }
}
EOF

# 5. Mount config vào container
docker stop srs-edge && docker rm srs-edge
docker run -d --name srs-edge --restart=always \
  --network host \
  -e CANDIDATE=<SG_VPS_IP> \
  -v /root/srs-edge.conf:/usr/local/srs/conf/edge.conf \
  ossrs/srs:6 \
  ./objs/srs -c conf/edge.conf
```

---

## 📋 BƯỚC 3: Setup Nginx trên Singapore VPS

```bash
cat > /etc/nginx/sites-enabled/sg.xoso66tv.com <<'EOF'
server {
    listen 80;
    server_name sg.xoso66tv.com;

    # Static cache từ origin (proxy + cache 1h)
    location /static/ {
        proxy_pass https://xoso66tv.com/static/;
        proxy_cache_valid 200 1h;
        proxy_set_header Host xoso66tv.com;
        add_header X-Cache-Status $upstream_cache_status;
        expires 7d;
    }

    # FLV stream từ SRS edge local
    location ~ ^/live/.+\.flv$ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        add_header Access-Control-Allow-Origin "*" always;
    }

    # HTML pages proxy về VN origin
    location / {
        proxy_pass https://xoso66tv.com;
        proxy_set_header Host xoso66tv.com;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Edge-Region "sg";
    }
}
EOF

nginx -t && systemctl reload nginx

# 6. SSL với Certbot
certbot --nginx -d sg.xoso66tv.com --non-interactive --agree-tos -m admin@xoso66tv.com
```

---

## 📋 BƯỚC 4: Setup US VPS (giống Singapore)

Lặp lại bước 2-3 nhưng:
- `CANDIDATE=<US_VPS_IP>`
- `server_name us.xoso66tv.com`
- `X-Edge-Region "us"`

---

## 📋 BƯỚC 5: Cloudflare GeoDNS Setup

### 5.1. Tạo subdomain DNS records:
Vào **Cloudflare → DNS → Add Record**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | sg | `<SG_VPS_IP>` | ✓ Proxied |
| A | us | `<US_VPS_IP>` | ✓ Proxied |
| A | @ (root) | `<VN_VPS_IP>` | ✓ Proxied |

### 5.2. Setup Load Balancing (cần Cloudflare Pro $20/tháng):

**Cloudflare → Traffic → Load Balancing → Create**:

- **Name**: `xoso66tv-geo`
- **Hostname**: `xoso66tv.com`
- **Origin Pools** (tạo 3 pool):
  - Pool **VN**: Origin `xoso66tv.com` (root VN)
  - Pool **SG**: Origin `sg.xoso66tv.com`
  - Pool **US**: Origin `us.xoso66tv.com`
- **Steering**: **Geo Steering**
  - Asia → SG pool
  - North America → US pool
  - Default → VN pool
- **Health checks**: GET `/`, expect 200

### 5.3. Alternative miễn phí (KHÔNG cần Pro):

Dùng **Cloudflare Workers** + JS routing:

```javascript
// Worker route: xoso66tv.com/*
addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const country = event.request.headers.get('CF-IPCountry');

  // Asia (trừ VN) → sg.xoso66tv.com
  if (['SG','MY','ID','TH','PH','JP','KR','CN','TW','HK'].includes(country)) {
    url.hostname = 'sg.xoso66tv.com';
  }
  // North America → us.xoso66tv.com
  else if (['US','CA','MX'].includes(country)) {
    url.hostname = 'us.xoso66tv.com';
  }
  // Default (VN + others) → origin

  event.respondWith(fetch(url, event.request));
});
```

Deploy lên Worker → Routes: `xoso66tv.com/*`

---

## 📋 BƯỚC 6: Test latency từ các region

### Từ máy ở Singapore:
```bash
ping sg.xoso66tv.com   # Phải <30ms
ping xoso66tv.com      # ~200ms (qua VN)
curl -w "%{time_total}\n" -o /dev/null -s https://xoso66tv.com/
# Phải hit sg.xoso66tv.com (check header X-Edge-Region: sg)
```

### Từ máy ở US:
```bash
ping us.xoso66tv.com   # Phải <50ms
curl -I https://xoso66tv.com/ | grep X-Edge-Region
# Phải thấy: X-Edge-Region: us
```

---

## 📋 BƯỚC 7: Auto-deploy script cho VPS mới

Lưu script này, chạy 1 lệnh setup VPS mới:

```bash
cat > /usr/local/bin/setup-edge.sh <<'EOF'
#!/bin/bash
# Usage: setup-edge.sh <region> <origin_host>
# Example: setup-edge.sh sg xoso66tv.com

REGION=${1:-sg}
ORIGIN=${2:-xoso66tv.com}
VPS_IP=$(curl -s ifconfig.me)

echo "Setting up edge node: $REGION → mirror from $ORIGIN"

# Install dependencies
apt update -y
apt install -y docker.io nginx certbot python3-certbot-nginx ufw

# Firewall
ufw allow 22,80,443/tcp
ufw allow 8000/udp
ufw --force enable

# SRS Edge
docker rm -f srs-edge 2>/dev/null
mkdir -p /etc/srs
cat > /etc/srs/edge.conf <<EOC
listen              1935;
max_connections     5000;
srs_log_tank        console;
http_api { enabled on; listen 1985; }
http_server { enabled on; listen 8081; dir ./objs/nginx/html; }
rtc_server { enabled on; listen 8000; candidate \$CANDIDATE; }
vhost __defaultVhost__ {
    cluster { mode remote; origin $ORIGIN:1935; }
    http_remux { enabled on; mount [vhost]/[app]/[stream].flv; }
    rtc { enabled on; bframe discard; rtmp_to_rtc on; rtc_to_rtmp on; }
}
EOC

docker run -d --name srs-edge --restart=always \
  --network host \
  -e CANDIDATE=$VPS_IP \
  -v /etc/srs/edge.conf:/usr/local/srs/conf/edge.conf \
  ossrs/srs:6 ./objs/srs -c conf/edge.conf

# Nginx
cat > /etc/nginx/sites-enabled/$REGION.$ORIGIN <<EON
server {
    listen 80;
    server_name $REGION.$ORIGIN;
    location ~ ^/live/.+\.flv\$ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        add_header Access-Control-Allow-Origin "*" always;
    }
    location / {
        proxy_pass https://$ORIGIN;
        proxy_set_header Host $ORIGIN;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Edge-Region "$REGION";
    }
}
EON
nginx -t && systemctl reload nginx
certbot --nginx -d $REGION.$ORIGIN --non-interactive --agree-tos -m admin@$ORIGIN || true

echo "✅ Edge node $REGION ready at https://$REGION.$ORIGIN"
echo "Add DNS A record: $REGION → $VPS_IP (Cloudflare proxied)"
EOF
chmod +x /usr/local/bin/setup-edge.sh

# Usage: ./setup-edge.sh sg xoso66tv.com
```

---

## 💰 CHI PHÍ ƯỚC TÍNH

| Component | Cost/tháng |
|-----------|-----------|
| VPS Singapore (4vCPU/8GB) | $30-50 |
| VPS US East (4vCPU/8GB) | $30-50 |
| Cloudflare Pro (Load Balancer + GeoDNS) | $20 |
| Bandwidth overage (nếu vượt) | $0-30 |
| **TỔNG** | **$80-150/tháng** |

### So với chi phí KHÔNG dùng multi-region:
- Single VPS = $50/tháng nhưng user SG/US load chậm 200-400ms
- Multi-region = $80-150/tháng nhưng load nhanh 30-50ms khắp Châu Á + Mỹ
- **ROI**: nếu có >5000 user/ngày ngoài VN → đáng đầu tư

---

## ✅ CHECKLIST DEPLOY

- [ ] Mua VPS Singapore + US
- [ ] Chạy `setup-edge.sh sg xoso66tv.com` trên VPS SG
- [ ] Chạy `setup-edge.sh us xoso66tv.com` trên VPS US
- [ ] Thêm DNS records: sg + us → IP của VPS tương ứng
- [ ] Test ping <50ms từ region tương ứng
- [ ] Setup Cloudflare GeoDNS (Pro plan) hoặc Worker miễn phí
- [ ] Monitor 24h xem có request route đúng region
- [ ] Update SRS origin (VN) cho phép edge mirror: thêm IP của SG/US VPS vào allowlist nếu có

---

## 📊 KẾT QUẢ MONG ĐỢI

| Metric | Trước (single VN) | Sau (multi-region) |
|--------|-------------------|---------------------|
| Latency user VN | 20ms | 20ms |
| Latency user Singapore | 200ms | **30ms** ⚡ |
| Latency user Mỹ | 400ms | **50ms** ⚡ |
| Stream buffer rate | 5-10% | **<1%** |
| Concurrent viewer worldwide | 50K | **500K+** |

---

## 🆘 TROUBLESHOOTING

**Edge node không pull stream từ origin:**
```bash
docker logs srs-edge --tail 50 | grep -i "origin\|cluster"
# Phải thấy: "Edge connected to origin xoso66tv.com:1935"
```

**Cloudflare LB không route đúng region:**
- Check **Cloudflare Analytics → Traffic → Load Balancing**
- Test với curl từ VPS ở region khác: `curl -I https://xoso66tv.com/`

**Latency cao dù đã setup edge:**
- Edge có thể chưa cache stream → request đầu tiên vẫn chậm, lần 2 nhanh
- Tăng cache TTL trong nginx

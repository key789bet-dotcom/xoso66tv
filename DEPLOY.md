# 🚀 HƯỚNG DẪN DEPLOY XOSO66TV LÊN VPS HOSTINGER

> VPS: Ubuntu 24.04 LTS · KVM 8 · IP `187.127.112.134`
> Domain: `xoso66tv.com`
> GitHub: `github.com/key789bet-dotcom/xoso66tv`

---

## 📋 TỔNG QUAN 4 BƯỚC

```
[MÁY BẠN]  →  GitHub  →  VPS  →  Domain (DNS)  →  SSL  →  LIVE
```

1. **Bước 1**: Push code lên GitHub (chạy trên máy bạn)
2. **Bước 2**: Cài VPS + clone repo (chạy trên VPS qua SSH)
3. **Bước 3**: Trỏ DNS domain → VPS IP (làm trên Hostinger panel)
4. **Bước 4**: Cài SSL Let's Encrypt (chạy trên VPS)

---

## 🔧 BƯỚC 1: PUSH CODE LÊN GITHUB (1 lần đầu)

Mở **PowerShell** hoặc **Terminal** tại folder dự án `D:\tài liệu\Claude\Projects\diendanbongda.com\okwin-clone\`:

```powershell
# Khởi tạo git (nếu chưa)
git init
git branch -M main

# Cấu hình user (1 lần)
git config user.name "key789bet-dotcom"
git config user.email "key789bet@gmail.com"

# Link remote GitHub
git remote add origin https://github.com/key789bet-dotcom/xoso66tv.git

# Add + commit toàn bộ code
git add .
git commit -m "Initial deploy"

# Push lên GitHub (sẽ hỏi username/password)
# Username: key789bet-dotcom
# Password: dùng GitHub Personal Access Token (KHÔNG dùng mật khẩu)
# Tạo token tại: https://github.com/settings/tokens (chọn quyền 'repo')
git push -u origin main
```

> ⚠️ **Nếu push bị lỗi do `node_modules` quá to**: kiểm tra `.gitignore` đã có dòng `node_modules/` chưa. File `.gitignore` đã sẵn sàng.

---

## 🖥️ BƯỚC 2: CÀI VPS (chạy script tự động)

### SSH vào VPS từ Hostinger panel hoặc PowerShell:

```bash
ssh root@187.127.112.134
# Nhập password root mà Hostinger cung cấp
```

### Chạy script setup tự động (mất 5-10 phút):

```bash
# Tải script và chạy
curl -fsSL https://raw.githubusercontent.com/key789bet-dotcom/xoso66tv/main/deploy/vps-setup.sh -o setup.sh
bash setup.sh
```

Script sẽ tự động:
- ✅ Update Ubuntu
- ✅ Cài Node.js 20 LTS
- ✅ Cài Git, PM2, Nginx, Certbot
- ✅ Mở firewall (port 80, 443, 22)
- ✅ Clone repo từ GitHub
- ✅ `npm install --production`
- ✅ Tạo `.env` với JWT secret random
- ✅ Cấu hình Nginx reverse proxy
- ✅ Start app bằng PM2
- ✅ Setup PM2 autostart khi reboot VPS

### Sau khi script chạy xong, **sửa file `.env`** với thông tin thật:

```bash
nano /var/www/xoso66tv/.env
```

Chỉnh các giá trị:
```env
ADMIN_USER=admin
ADMIN_PASS=MAT_KHAU_ADMIN_THAT_DAY        # ⚠️ ĐỔI NGAY
SMTP_USER=email_gmail_cua_ban@gmail.com   # cho gửi OTP quên MK
SMTP_PASS=app_password_16_ky_tu          # App Password Gmail
TELEGRAM_BOT_TOKEN=...                    # Tùy chọn
JWT_SECRET=...                            # Đã random tự động
SITE_URL=https://xoso66tv.com
```

Lưu file (`Ctrl+O`, Enter, `Ctrl+X`) rồi restart:
```bash
pm2 restart xoso66tv
```

---

## 🌐 BƯỚC 3: TRỎ DNS DOMAIN → IP VPS

Vào **Hostinger panel** → DNS / Máy chủ tên miền của `xoso66tv.com`:

### Tùy chọn A: Dùng nameserver Hostinger (đơn giản nhất)

Đổi nameserver từ `apollo/athena.dns-parking.com` → `ns1.dns-parking.com` & `ns2.dns-parking.com`, RỒI thêm bản ghi A:

| Loại | Tên   | Giá trị            | TTL   |
|------|-------|--------------------|---------|
| A    | @     | `187.127.112.134`  | 14400 |
| A    | www   | `187.127.112.134`  | 14400 |

### Tùy chọn B: Cloudflare (khuyến nghị - bảo vệ DDoS + CDN free)

1. Đăng ký https://cloudflare.com
2. Add site `xoso66tv.com`
3. Cloudflare cho 2 nameserver (vd: `kira.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
4. Vào Hostinger DNS panel → "Thay đổi máy chủ tên miền" → dán 2 nameserver Cloudflare
5. Trong Cloudflare DNS thêm:
   - `A @ 187.127.112.134` (proxied 🟧)
   - `A www 187.127.112.134` (proxied 🟧)

### Kiểm tra DNS đã propagate chưa:

```bash
# Trên VPS hoặc máy local
nslookup xoso66tv.com
# Phải thấy IP 187.127.112.134
```

Hoặc dùng web: https://dnschecker.org/#A/xoso66tv.com

> ⏱️ Đợi 5-30 phút (đôi khi tới 24h tùy provider).

---

## 🔒 BƯỚC 4: CÀI SSL HTTPS (Let's Encrypt FREE)

Sau khi DNS đã trỏ về VPS, chạy trên VPS:

```bash
certbot --nginx -d xoso66tv.com -d www.xoso66tv.com --agree-tos -m key789bet@gmail.com
```

Trả lời:
- Email: `key789bet@gmail.com`
- Terms: `A` (agree)
- Share email với EFF: `N` (No)
- Chọn `2` để redirect tất cả HTTP → HTTPS

Cert tự gia hạn mỗi 60 ngày (certbot đã add cron job tự động).

---

## ✅ TEST HOẠT ĐỘNG

```bash
# Trên VPS - check app
pm2 status              # Phải thấy xoso66tv: online
pm2 logs xoso66tv       # Xem log real-time (Ctrl+C để thoát)
curl http://localhost:4000   # Phải trả về HTML

# Check nginx
systemctl status nginx
nginx -t

# Check port mở
ss -tlnp | grep -E ':80|:443|:4000'
```

Truy cập browser:
- `https://xoso66tv.com` → trang chủ XOSO66 TV
- `https://xoso66tv.com/admin/login` → admin login (user: admin / pass: như đã set trong .env)

---

## 🔄 CÁCH UPDATE CODE SAU NÀY

### Trên máy bạn (sau mỗi lần sửa code):

```powershell
cd "D:\tài liệu\Claude\Projects\diendanbongda.com\okwin-clone"
git add .
git commit -m "Cập nhật game 3D"
git push
```

### Trên VPS (chạy 1 lệnh):

```bash
cd /var/www/xoso66tv
bash deploy/update.sh
```

Script `update.sh` sẽ tự pull code mới, npm install nếu cần, restart PM2 + reload nginx.

---

## 🆘 TROUBLESHOOTING

### ❌ Lỗi `502 Bad Gateway`
→ App Node.js chưa chạy. Check:
```bash
pm2 status
pm2 logs xoso66tv --lines 50
```

### ❌ Lỗi `Cannot GET /` khi vào localhost:4000
→ App chưa start. Restart:
```bash
cd /var/www/xoso66tv
pm2 restart xoso66tv
```

### ❌ Đổi mật khẩu admin hash đã cũ
→ App tự tạo hash mới khi start. Đổi `ADMIN_PASS` trong `.env` rồi:
```bash
pm2 restart xoso66tv
```

### ❌ DNS chưa trỏ về VPS
→ Test:
```bash
dig xoso66tv.com +short
# Phải trả về 187.127.112.134
```
Nếu chưa có, đợi thêm hoặc check lại bản ghi DNS trên Hostinger.

### ❌ SSL fail "Domain validation failed"
→ DNS chưa propagate. Đợi rồi chạy lại certbot.

### ❌ PM2 không tự start sau reboot
```bash
pm2 startup systemd -u root --hp /root
# Copy lệnh nó in ra rồi chạy
pm2 save
```

---

## 📊 MONITOR & MAINTENANCE

```bash
# Real-time CPU/RAM của app
pm2 monit

# Disk space
df -h

# Memory
free -h

# Log app (60 dòng cuối)
pm2 logs xoso66tv --lines 60 --nostream

# Log nginx error
tail -100 /var/log/nginx/xoso66tv-error.log

# Log nginx access
tail -100 /var/log/nginx/xoso66tv-access.log

# Restart toàn bộ
pm2 restart xoso66tv && systemctl reload nginx
```

---

## 🎁 BACKUP DATA (DB JSON file)

DB hiện tại là JSON file (`data/db.json`). Backup định kỳ:

```bash
# Backup thủ công
cp /var/www/xoso66tv/data/db.json ~/db-backup-$(date +%Y%m%d).json

# Cron tự backup mỗi ngày 3h sáng
crontab -e
# Thêm dòng:
0 3 * * * cp /var/www/xoso66tv/data/db.json /root/backups/db-$(date +\%Y\%m\%d).json && find /root/backups -name "db-*.json" -mtime +30 -delete
```

Hoặc dùng Hostinger snapshot (đã có sẵn trong panel).

---

## ✨ KẾT QUẢ MONG ĐỢI

Khi xong:
- ✅ `https://xoso66tv.com` mở trang chủ XOSO66 TV
- ✅ HTTPS xanh, không cảnh báo cert
- ✅ Admin login hoạt động với bcrypt + JWT + 2FA
- ✅ PM2 tự restart nếu app crash
- ✅ Nginx serve static file siêu nhanh
- ✅ App tự start khi VPS reboot

Báo lỗi cụ thể nếu có vấn đề - sẽ giúp fix! 🚀

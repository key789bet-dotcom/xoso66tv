# 🛠️ Fix DB tự re-seed Linh Trang/Mai Chi - Deploy guide

## 🎯 Mục tiêu
1. Bỏ hết user/idol ảo trong seed code
2. Tạo `admin` + `yennhi` (idol thật) với bcrypt password
3. Auto-backup `db.json` mỗi lần save → KHÔNG BAO GIỜ mất data
4. `git pull` không overwrite db.json (đã add `.gitignore`)

---

## 📤 PHẦN 1: Push code mới (máy local)

```powershell
cd "D:\tài liệu\Claude\Projects\diendanbongda.com\okwin-clone"

# Verify .gitignore đã ignore db.json
git check-ignore data/db.json
# (phải in ra: data/db.json - nghĩa là đã ignore)

# Untrack db.json khỏi git (giữ file local, chỉ remove khỏi index)
git rm --cached data/db.json 2>$null

# Commit & push
git add .gitignore lib/db.js ecosystem.config.js scripts/init-db.js DEPLOY-FIX-DB.md
git commit -m "Fix DB tự re-seed: seed sạch + auto-backup + bcrypt admin/yennhi + .gitignore db.json"
git push
```

---

## 🚀 PHẦN 2: Trên VPS (chạy từng bước, kiểm tra output)

### Bước 1 - Backup db.json hiện tại (an toàn)
```bash
cd /var/www/xoso66tv
cp data/db.json data/db.json.before-fix-$(date +%s) 2>/dev/null
ls -la data/
```

### Bước 2 - Pull code mới
```bash
# Stash các thay đổi local (nếu có) để pull sạch
git stash

# Pull code mới
git pull --rebase

# Verify file mới đã có
ls -la scripts/init-db.js lib/db.js ecosystem.config.js
```

### Bước 3 - Verify seed code đã sạch
```bash
grep -A 3 "function seed" lib/db.js
# Phải thấy:
#   function seed() {
#     return {
#       users: [],
#       blvs: [],
```

### Bước 4 - Xóa db.json cũ + chạy init
```bash
# Xóa db.json cũ (đã backup ở bước 1)
rm -f data/db.json data/db.json.bak

# Chạy script init - tự hash bcrypt + tạo admin + yennhi
node scripts/init-db.js
```

**Output mong đợi:**
```
🔧 init-db.js - Khởi tạo DB sạch
   ADMIN_USER: admin
   YENNHI_USER: yennhi
🔐 Đang hash bcrypt password...
   ✅ admin hash: $2a$10$...
   ✅ yennhi hash: $2a$10$...
💾 Đã ghi: /var/www/xoso66tv/data/db.json

✅ DONE! DB hiện tại:
   Users: 2 → admin(admin), yennhi(idol)
   Idols: 1 → Yến Nhi(canLive=true)
   BLVs: 0

🔑 Thông tin đăng nhập:
   👑 Admin  → username: admin  | password: Baohan@04072023
   🎤 Yennhi → username: yennhi | password: 123456789
```

### Bước 5 - Restart PM2 với env mới
```bash
# Reload với ecosystem để pick up ADMIN_PASS env
pm2 delete xoso66tv
pm2 start ecosystem.config.js
pm2 save

# Kiểm tra env đã load
pm2 env 0 | grep ADMIN_PASS
# Phải in: ADMIN_PASS: Baohan@04072023
```

### Bước 6 - Verify DB qua API
```bash
# Check db.json hiện tại
cat data/db.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('USERS:'); [print(' -', u['username'], '(role:', u.get('role','user'),')') for u in d['users']]
print('IDOLS:'); [print(' -', i['name'], '| canLive:', i.get('canLive'), '| liveNow:', i.get('liveNow')) for i in d['idols']]
"
```

**Phải in:**
```
USERS:
 - admin (role: admin)
 - yennhi (role: idol)
IDOLS:
 - Yến Nhi | canLive: True | liveNow: False
```

### Bước 7 - Test trên web
1. Mở https://xoso66tv.com → sidebar tab "Idol Live" phải TRỐNG (vì yennhi chưa live)
2. Đăng nhập `yennhi` / `123456789` → vào `/idol-studio`
3. Push OBS → tab Idol Live sẽ hiện "Yến Nhi"
4. Đăng nhập `admin` / `Baohan@04072023` → vào `/admin`

---

## 🔒 PHẦN 3: Bảo vệ tương lai (đã code sẵn)

✅ `data/db.json` ở `.gitignore` → `git pull` KHÔNG overwrite nữa  
✅ `save()` auto-backup → `db.json.bak`  
✅ `load()` corrupt → tự restore từ `.bak`  
✅ `seed()` trả EMPTY → không bao giờ có Linh Trang/Mai Chi quay lại  

---

## ⚠️ Nếu cần đăng ký thêm idol/BLV mới
- Vào `/dang-ky-idol` hoặc `/dang-ky-blv` (form public)
- Admin vào `/admin/idols` hoặc `/admin/blvs` để duyệt + tick `canLive`
- Sau khi duyệt, idol/BLV có thể vào `/idol-studio` để lên sóng

---

## 🆘 Rollback (nếu có lỗi)
```bash
# Khôi phục từ backup bước 1
cd /var/www/xoso66tv
cp data/db.json.before-fix-XXXXXXXXXX data/db.json
pm2 restart xoso66tv
```

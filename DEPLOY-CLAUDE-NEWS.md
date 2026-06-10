# 🤖 Deploy Claude AI News Generator

## ⚠️ BƯỚC 1 - QUAN TRỌNG: Revoke key đã LỘ

Key `sk-ant-api03-sCiPXPU...` đã bị share trong chat → **PHẢI revoke**:

1. Vào https://console.anthropic.com/settings/keys
2. Click **Revoke** key cũ
3. **Create new key** → COPY (đừng paste vào chat!)

---

## 🚀 BƯỚC 2 - Push code mới (máy local)

```powershell
cd "D:\tài liệu\Claude\Projects\diendanbongda.com\okwin-clone"
git add lib/claude-ai.js lib/news-store.js scripts/generate-news.js server.js views/tw-tin-tuc.ejs views/tw-tin-tuc-detail.ejs .gitignore DEPLOY-CLAUDE-NEWS.md
git commit -m "Setup Claude AI news generator: auto sinh bài soi kèo bóng đá daily 6h sáng"
git push
```

---

## 🔑 BƯỚC 3 - Setup CLAUDE_API_KEY trên VPS (KHÔNG dán key vào file commit!)

### Cách A: Set qua ecosystem.config.js (PM2)

SSH vào VPS, edit file:
```bash
cd /var/www/xoso66tv
nano ecosystem.config.js
```

Thêm vào `env`:
```js
env: {
  NODE_ENV: 'production',
  PORT: 4001,
  ADMIN_USER: 'admin',
  ADMIN_PASS: 'Baohan@04072023',
  CLAUDE_API_KEY: 'sk-ant-api03-XXX_KEY_MỚI_CỦA_BẠN'  // ← Paste key mới ở đây
}
```

Save → restart PM2 với env mới:
```bash
pm2 delete xoso66tv
pm2 start ecosystem.config.js --update-env
pm2 save
```

### Cách B: Set qua .env file (nếu prefer)

```bash
cd /var/www/xoso66tv
echo "CLAUDE_API_KEY=sk-ant-api03-XXX_KEY_MỚI" >> .env
pm2 restart xoso66tv
```

> **LƯU Ý**: `.env` đã ở `.gitignore` → an toàn

---

## 🧪 BƯỚC 4 - Pull code + Test sinh bài thủ công

```bash
cd /var/www/xoso66tv
git fetch origin && git reset --hard origin/main
pm2 restart xoso66tv

# Run script manual để test (chỉ sinh 2 bài để tiết kiệm token)
NEWS_MAX=2 node scripts/generate-news.js
```

**Output mong đợi:**
```
🤖 [NEWS] Bắt đầu generate news...
📊 Sẽ sinh bài cho 2 trận:
  1. Liverpool vs MU (Premier League)
  2. Barcelona vs Real (La Liga)

📝 [1/2] Đang sinh: Liverpool vs MU...
  ✅ "Nhận định Liverpool vs MU 23/12..." → /tin-tuc/nhan-dinh-liverpool-vs-mu...

📝 [2/2] Đang sinh: Barcelona vs Real...
  ✅ "..." → /tin-tuc/...

🎉 Hoàn tất! Thành công: 2, Lỗi: 0
📰 Tổng bài: 2
```

---

## 📊 BƯỚC 5 - Verify

```bash
# Xem bài trong DB
ls -lh data/news.json
cat data/news.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {len(d)} bài')
for n in d[:3]:
  print(f'  - {n[\"title\"][:60]}... → /tin-tuc/{n[\"slug\"]}')
"

# Test route
curl -s http://127.0.0.1:4001/tin-tuc | grep -o '<h2[^>]*>' | head -5

# Check log cron
pm2 logs xoso66tv --lines 5 --nostream | grep NEWS-CRON
```

---

## 🌐 BƯỚC 6 - Test trên browser

1. https://xoso66tv.com/tin-tuc → hiện list bài AI sinh
2. Click 1 bài → vào `/tin-tuc/:slug` → đọc nội dung markdown được render đẹp
3. F12 → Lighthouse → check SEO score (phải > 90)

---

## ⏰ BƯỚC 7 - Cron tự động

Đã setup trong `server.js` - **mỗi 6h sáng giờ VN** sẽ tự sinh bài cho 5 trận hot trong ngày.

Verify log sau 6h sáng hôm sau:
```bash
pm2 logs xoso66tv --lines 50 --nostream | grep "NEWS-CRON"
# Phải thấy: [NEWS-CRON] 🤖 Bắt đầu auto generate news...
```

---

## 💰 Cost ước tính

- 1 bài ≈ 1500 output tokens
- 5 bài/ngày × 30 ngày = 225,000 token/tháng
- Sonnet 4.6 = $3/1M input + $15/1M output
- **Tổng ~$3.5/tháng** = ~85K VND/tháng

## 🛡️ Bảo mật

- ✅ API key set qua env, KHÔNG hardcode trong code
- ✅ `data/news.json` đã ở `.gitignore`
- ✅ `.env` đã ở `.gitignore`
- ✅ Mỗi VPS có news riêng (không sync qua git)

## 📝 Bài viết SEO chuẩn

Mỗi bài AI sinh có:
- Title chứa keyword (nhận định + tên trận + ngày)
- Meta description 150-200 ký tự
- Headings H2 → H3 hierarchy
- JSON-LD Article schema cho Google
- Open Graph cho social share
- Internal links đến `/live/:id` + `/lich-phat-song`
- Tags để liên kết bài

# XOSO66 TV — Project Context
> **Claude PHẢI đọc file này ĐẦU TIÊN ở MỖI session để hiểu context dự án.**
> File này là source-of-truth — Claude không được đoán mò khi đã có thông tin ở đây.

---

## 1. BRAND & SEO

- **Domain chính:** xoso66tv.com
- **Brand:** XOSO66 TV / xoso66 / xổ số 66
- **Partner đăng ký:** https://qt99.click (mọi nút "Đăng Ký", "Cược Ngay" trỏ về đây)
- **Owner:** sang (key789bet@gmail.com)

### Từ khóa SEO (BẠN ĐIỀN)

- **Từ khóa CHÍNH (priority 1):** `[xoso66]`
- **Từ khóa phụ:**
  - `[trực tiếp bóng đá]`
  - `[nhận định bóng đá]`
  - `[soi kèo bóng đá]`
- **Long-tail keywords:**
  - `[xem trực tiếp bóng đá]`
- **Đối thủ đang top Google:**
  - `[https://xoilaccn.tv/]`
  - `[https://bongda24h.vn/]`

### Target audience
- Người Việt xem livestream bóng đá + idol live
- Mobile-first (60%+ traffic mobile)

---

## 2. STACK & ARCHITECTURE

| Layer | Tech |
|---|---|
| Backend | Node.js + Express + EJS templates |
| DB | **MySQL** (mysql2) + Redis (session/cache/og-image) |
| Live streaming | SRS server (RTMP push → FLV/HLS pull), port host 1936 |
| Static assets | `/static/*` mount `public/*`, `/uploads/*` mount root `uploads/` |
| PM2 | Cluster mode 2 workers (id 14, 15) |
| Deploy | VPS srv1603996, repo at `/var/www/xoso66tv` |
| CDN | Cloudflare (DNS + cache HTML 60s + Workers) |
| AI | Anthropic Claude API (`CLAUDE_API_KEY`) — generate news daily 6h |

### Folder structure
```
okwin-clone/
├── server.js             # Main Express app + route handlers
├── lib/                  # Utility modules
│   ├── api.js            # Adapter API thethaoviet.vip
│   ├── og-image.js       # Dynamic OG image SVG→PNG (sharp)
│   ├── upload-helper.js  # SEO filename + sharp compress
│   ├── league-logos.js   # Map league name → api-sports CDN URL
│   └── ...
├── routes/admin.js       # Admin upload routes (7 multer storage)
├── views/                # EJS templates (tw-*.ejs = TailwindCSS-styled)
├── views/partials/       # Shared partials (header, footer, sidebar)
├── public/               # Static + uploads
├── data/                 # JSON DBs (GITIGNORED)
└── scripts/              # Cron + maintenance scripts
```

---

## 3. DATA FILES — GITIGNORED ⚠️

**Tuyệt đối KHÔNG commit các file sau:**
- `data/db.json` (users, idols, BLVs, OBS keys, schedules)
- `data/news.json` (86+ bài news AI-generated)
- `data/banners.json` (3 banner hero)
- `data/promos.json` (banner trang Sự kiện)
- `data/chat-history.json` + `data/chat-bans.json`
- `data/checkin.json`, `data/predict-store.json`, ...
- `public/uploads/**` (avatars, banners, cards, gifts, leagues, header-banner, tab-icons)
- `.env`

**Khi cần sửa data trên VPS:** backup trước bằng `cp file file.bak-$(date +%s)`.

---

## 4. EXTERNAL APIs

| API | URL | Purpose |
|---|---|---|
| thethaoviet.vip | `https://api.thethaoviet.vip/api/fixtures?date=...` | Live fixtures + odds |
| thethaoviet detail | `https://api.thethaoviet.vip/api/p/fixtures/:id/detail` | Match detail |
| api-sports CDN | `https://media.api-sports.io/football/leagues/{id}.png` | League logo (FREE, no key) |
| Claude AI | Anthropic API | News generation cron 6h |
| BetsAPI bet types | `1=1X2, 4=AH, 5=OU` | Odds prematch |

### Cache
- Redis L2: `apicache:*` (TTL 5 phút), `og:*` (TTL 1h)
- In-memory L1: `_cache` 5 phút trong api.js
- Flush khi cần: `redis-cli --scan --pattern 'apicache:*' | xargs -r redis-cli DEL`

---

## 5. CONVENTIONS

### Naming
- Files Vietnamese → slugify bỏ dấu, dấu `-` (vd: `viet-nam-vs-thai-lan.jpg`)
- View templates: `tw-<page>.ejs` (Tailwind-styled), partials `tw-<comp>.ejs`
- Upload filename: dùng `_seoName(prefix, file, extra)` helper trong `routes/admin.js`

### Format
- Timezone: VN +7 (UTC+7), 24h format
- Date display: `dd/mm/yyyy`
- Currency: `1.000.000đ`

### Service Worker
- `public/sw.js` VERSION bump mỗi commit ảnh hưởng front-end (vd `v63-2026-06-16-...`)
- Invalidate cache PWA tự động khi user mở site

### Git
- Repo: github.com/key789bet-dotcom/xoso66tv
- Branch: `main`
- Commit message: `<type>(<scope>): <description>` (vd `fix(banner): ...`)

---

## 6. KEY DECISIONS đã làm

| Decision | Lý do |
|---|---|
| Banner header dùng `<img object-contain>` thay `bg-image` | Không bao giờ crop, auto fit mọi tỷ lệ |
| Hero player layout = SofaScore (2 logos + time) | Chuyên nghiệp, data đủ từ API |
| OG cover article = composite logo thật + brand | Đẹp, share social pro |
| News cover image dùng `/og/article/:slug.png` | Dynamic, không cần static file |
| Filter trận đã qua > 3h khỏi "Sắp diễn ra" | API thethaoviet chậm update status |
| 3 trang riêng `/livescore`, `/bxh`, `/ket-qua` | SEO traffic riêng cho keyword chính |
| Lazy load `<img>` dưới viewport via JS | Tiết kiệm bandwidth, tăng PageSpeed |
| Auto-compress upload (sharp 82 quality) | Giảm size 30-70% |

### ⚠️ LESSONS LEARNED — tránh lặp lỗi

**Layout `tw-idol-room.ejs` — Grid 2 cột (player+quality bar) | chat aside:**

- **VẤN ĐỀ HAY GẶP**: Chat aside có nhiều messages → kéo dài height → tràn ra khỏi khung 480px → đè section info dưới.
- **NGUYÊN NHÂN**: Grid `align-items: start` (hoặc default) khi grid không có `height` fixed → chat aside tự stretch theo content (messages).
- **FIX ĐÚNG**:
  ```css
  @media (min-width: 768px) {
    .idol-room-grid { grid-template-columns: minmax(0,1fr) 320px; height: 528px; }
    .idol-room-chat { height: 100%; max-height: 100%; overflow: hidden; }
    /* Messages container BÊN TRONG chat phải overflow-y: auto để scroll */
  }
  ```
  - `height: 528px` = player 480 + quality bar ~40 + gap 8
  - Chat `overflow: hidden` + `max-height: 100%` → bounded theo grid cell
  - Messages list bên trong CHAT cần `overflow-y: auto` để scroll bên trong panel
- **KHÔNG fix bằng** `align-items: stretch` đơn thuần (chat vẫn expand theo content nếu grid không fixed height).
- **KHÔNG dùng** `min-height: 480px` cho section (chat content > 480 → grid expand).

**Quality bar dưới player (giống BLV):**

- Wrap player + quality bar trong `<div class="idol-player-col">` (flex column) để giữ trong 1 grid col.
- KHÔNG để quality bar làm child trực tiếp của section grid (sẽ chiếm cột chat).

**Khi thay đổi layout idol-room, PHẢI test cả 2 viewport:**

- Mobile <768px (stack 1 col)
- Desktop ≥768px (2 cols ngang)

---

## 7. PENDING TASKS (chưa làm)

- [ ] Telegram bot OTP + auto-share news
- [ ] AdSense apply (cần >15 visitor/ngày)
- [ ] Google News submit (cần 30 ngày tuổi domain)
- [ ] Cốc Cốc Webmaster verify
- [ ] Phase 1 Batch 2: SVG migration cho header buttons remaining
- [ ] BunnyCDN integration cho upload (đã code, chưa wire vào upload route)

---

## 8. CODING RULES (CLAUDE phải tuân thủ)

Tham khảo file `CLAUDE.md` (16 rules nghiêm ngặt). Tóm tắt 5 rule quan trọng nhất:

1. **KHÔNG đoán mò** — verify bằng Read/Grep/curl trước khi đề xuất
2. **Đọc FULL file** trước khi sửa (Rule #15)
3. **Patch tối thiểu** — chỉ sửa đúng phần liên quan (Rule #16)
4. **Verify sau khi sửa** — chạy lệnh check thực tế (Rule #3)
5. **KHÔNG tự ý động vào data files** (banners.json, db.json...) trừ khi user yêu cầu rõ

---

## 9. VPS Quick Reference

```bash
# Deploy
cd /var/www/xoso66tv && git pull origin main && pm2 restart xoso66tv

# Flush API cache
redis-cli --scan --pattern 'apicache:*' | xargs -r redis-cli DEL

# Flush OG image cache
redis-cli --scan --pattern 'og:*' | xargs -r redis-cli DEL

# Check log
pm2 logs xoso66tv --lines 30 --nostream
pm2 logs xoso66tv --lines 30 --nostream --err

# Backup data trước khi sửa
cp data/banners.json data/banners.json.bak-$(date +%s)

# Test render fresh (bypass cache)
curl -s -H "Host: xoso66tv.com" "http://127.0.0.1/?bust=$(date +%s)" | head -c 200
```

---

**Last updated:** 2026-06-16 (v63 deploy)
**Maintained by:** sang + Claude

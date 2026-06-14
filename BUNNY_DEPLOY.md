# 🐰 BunnyCDN Stream Integration — HƯỚNG DẪN DEPLOY

## ĐÃ BUILD SẴN — ANH CHỈ CẦN PASTE KEY KHI MUỐN BẬT

Hệ thống Bunny đã được tích hợp HOÀN CHỈNH vào code. Khi anh chưa cấu hình → site chạy bình thường với SRS local. Khi muốn scale 10k+ viewers → vào admin paste key + bật toggle.

---

## FILES MỚI / SỬA

1. `lib/bunny-config-store.js` — lưu config (enabled, libraryId, apiKey, cdnHostname, rtmpUrl)
2. `lib/bunny-stream.js` — wrapper API BunnyCDN (createVideo, getHlsUrl, getRtmpUrl, …)
3. `views/admin/bunny-stream.ejs` — UI admin (paste key + assign video cho idol/blv)
4. `routes/admin.js` — 5 endpoints: get/update/toggle/test/assign/create-for
5. `views/admin/partials/layout-start.ejs` — thêm menu sidebar "BunnyCDN Stream" (badge 10k)
6. `views/partials/tw-live-video-player.ejs` — auto switch sang HLS Bunny khi enabled + idol có `bunny_video_id`
7. `views/tw-idol-studio.ejs` — hiện banner BunnyCDN ACTIVE trong tab OBS

---

## DEPLOY VPS

```bash
cd /var/www/xoso66tv
git pull origin main
pm2 reload all
```

KHÔNG cần chạy migration — schema cũ vẫn dùng. Field `bunny_video_id` lưu trong cột `extra JSON` đã có sẵn.

---

## KHI ANH MUỐN BẬT BUNNY (sau này)

### Bước 1 — Nạp tiền Bunny

- Đăng nhập https://dash.bunny.net
- Billing → nạp tối thiểu $10

### Bước 2 — Tạo Stream Library

- Sidebar trái → Stream → Add Video Library
- Tên: `xoso66tv`
- Replication tick: Singapore (SG) + Hong Kong (HK)
- Click vào library → copy 3 thông tin:
  - **Library ID** (số trong URL)
  - **API Key** (tab API → Default API Key)
  - **Pull Zone Hostname** (tab API → `vz-xxxxx.b-cdn.net`)

### Bước 3 — Paste vào admin

- Vào `https://xoso66tv.com/admin/bunny-stream`
- Paste 3 trường → Lưu cấu hình
- Click "Test kết nối API" → xác nhận OK
- Bật toggle "BẬT"

### Bước 4 — Gán video cho idol/blv

Có 2 cách:

**A. Auto (khuyến nghị)** — trong section "Gán Bunny Video ID":
- Chọn type (idol/blv) + nhập ID (vd `yennhi`)
- Click "Tạo + gán tự động" → hệ thống tự gọi Bunny API, tạo video container, gán vào DB

**B. Manual** — nếu đã có sẵn video trên dashboard Bunny:
- Copy GUID video → paste vào form → click "Gán GUID"

### Bước 5 — Idol/BLV đẩy stream

Trên tab Live Streaming trong dashboard Bunny library:
- Lấy stream key của video vừa tạo
- Idol mở OBS:
  - Server: `rtmps://live.bunnycdn.com/live`
  - Stream Key: paste từ Bunny

Khán giả vào phòng → player tự dùng HLS Bunny → scale 10k+ viewers.

---

## CHI PHÍ DỰ KIẾN (Standard $0.005/GB)

| Concurrent viewers | Bandwidth/tháng | Chi phí |
|--------------------|-----------------|---------|
| 500                | ~2 TB           | $10-30  |
| 2,000              | ~8 TB           | $50-150 |
| 5,000              | ~20 TB          | $150-400 |
| 10,000             | ~40 TB          | $300-800 |

---

## CÁCH HỆ THỐNG HOẠT ĐỘNG

```
OBS Idol/BLV → push RTMP → BunnyCDN Origin
                              ↓ (auto distribute)
                      BunnyCDN Edge worldwide
                              ↓
                    10,000+ viewers (KHÔNG LIMIT)

Latency: 2-5 giây (LL-HLS)
Chat + Gift: WebSocket VPS (đã có sẵn)
```

**Tự động fallback:** nếu Bunny disabled hoặc idol chưa có `bunny_video_id` → player dùng SRS local như cũ (FLV/HLS via live.xoso66tv.com).

---

## ROTATE KEY (nếu lộ)

1. Dashboard Bunny → API → Reset Key
2. Vào `/admin/bunny-stream` → paste key mới → Lưu
3. KHÔNG cần restart PM2 (config đọc trực tiếp từ file mỗi request)

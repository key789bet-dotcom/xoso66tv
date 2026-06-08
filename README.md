# XOSO66 TV — Web phát sóng trực tiếp đa môn (style OkwinTV)

Trang phát sóng trực tiếp đa môn thể thao + casino + idol live, **dữ liệu thật** từ TheSportsDB API (miễn phí), **URL sạch không `.html`**, liên kết affiliate đầy đủ tới **xoso66tv.com**.

## Tính năng

### Đa nội dung — như OkwinTV
- **Thể thao**: Bóng đá, Bóng rổ, Tennis, Bóng chuyền, Bóng bàn, Esports
- **Giải trí**: Casino (Baccarat, Slot, Roulette...), Idol Live (100+ phòng), Mini Game (Tài Xỉu, Bắn Cá...)
- **Khuyến mãi**: Carousel banner xoay, voucher, vòng quay may mắn

### Giao diện chuyên nghiệp
- **Sidebar trái cố định** với logo, danh mục thể thao, đếm số trận live theo từng môn, khu CSKH 24/7
- **Header** với promo strip cuộn ngang + nút Đăng Nhập + Tải APP
- **Hero banner carousel** tự động xoay 5s
- **Featured stream card lớn** ở trang chủ + 2 phòng phụ
- **Trang phòng xem** có player, scoreboard, chọn BLV, chat realtime giả lập, banner cược trong chat, info trận
- **Sport landing pages** mỗi môn có hero banner riêng theo màu đặc trưng
- **Casino / Idol Live** có landing partner riêng với game grid + CTA "Vào sảnh"

### Clean URL (không `.html`, không `index`)
| URL | Trang |
|---|---|
| `/` | Trang chủ |
| `/live/:id` (vd: `/live/aston-villa-vs-arsenal-602345`) | Phòng xem trực tiếp |
| `/lich-phat-song` `?mon=bong-da` | Lịch phát sóng có filter môn |
| `/the-thao/bong-da` | Bóng đá |
| `/the-thao/bong-ro` | Bóng rổ |
| `/the-thao/tennis` | Tennis |
| `/the-thao/bong-chuyen` | Bóng chuyền |
| `/the-thao/bong-ban` | Bóng bàn |
| `/esports` | Esports |
| `/casino` | Casino landing |
| `/idol-live` | Idol Live |
| `/su-kien` | Sự kiện khuyến mãi |
| `/qua-tang` | Quà tặng + vòng quay |
| `/mini-game` | Mini game |
| `/video-noi-bat` | Video highlight |
| `/tin-tuc` | Tin tức (tự sinh từ kết quả thật) |
| `/api/live`, `/api/upcoming` | JSON API |

`/index.html`, `/casino.html`,... đều trả **404**.

## Cài đặt &amp; chạy

```bash
# 1. Cần Node.js >= 18
cd okwin-clone
npm install
npm start
```

Mở http://localhost:4000

Đổi cổng:
```bash
PORT=8080 npm start             # Linux/macOS
$env:PORT=8080; npm start       # Windows PowerShell
```

## Cấu trúc

```
okwin-clone/
├── server.js               # Express routes, clean URL
├── package.json
├── lib/
│   ├── api.js              # Adapter TheSportsDB đa môn + cache 60s
│   └── partners.js         # ⭐ CẤU HÌNH LINK xoso66tv.com — sửa ở đây
├── public/
│   ├── css/style.css       # Theme dark sidebar style OkwinTV
│   └── js/app.js           # Sidebar mobile, carousel, chat, player
└── views/
    ├── partials/
    │   ├── head.ejs, header.ejs, sidebar.ejs, footer.ejs, layout-start.ejs
    │   └── stream-card.ejs
    ├── home.ejs            # Trang chủ với hero + featured + grid
    ├── live.ejs            # Phòng xem live
    ├── lich-phat-song.ejs
    ├── the-thao.ejs        # Dùng chung cho /the-thao/:cat và /esports
    ├── casino.ejs (qua partner-landing.ejs)
    ├── idol-live.ejs
    ├── su-kien.ejs
    ├── qua-tang.ejs
    ├── mini-game.ejs
    ├── video-noi-bat.ejs
    ├── tin-tuc.ejs
    ├── partner-landing.ejs # Template casino
    ├── 404.ejs, 500.ejs
```

## ⭐ Cấu hình liên kết xoso66tv.com

Mở file **`lib/partners.js`** và sửa các URL cho khớp với cấu trúc trang xoso66tv của bạn:

```js
partner: {
  home:     'https://xoso66tv.com',
  register: 'https://xoso66tv.com/register?ref=live',
  login:    'https://xoso66tv.com/login?ref=live',
  download: 'https://xoso66tv.com/download?ref=live',
  sportbet: 'https://xoso66tv.com/sport?ref=live',
  casino:   'https://xoso66tv.com/casino?ref=live',
  idol:     'https://xoso66tv.com/idol?ref=live',
  minigame: 'https://xoso66tv.com/minigame?ref=live',
  promo:    'https://xoso66tv.com/promo?ref=live',
  gift:     'https://xoso66tv.com/gift?ref=live',
  cskh:     'https://xoso66tv.com/cskh',
  telegram: 'https://t.me/xoso66tv',
}
```

Cũng sửa **`banners[]`** trong cùng file để đổi banner khuyến mãi ở hero + trang Sự kiện.

## Liên kết affiliate có sẵn

| Vị trí | Link tới |
|---|---|
| Nút "Đăng Nhập / Đăng Ký" header | `partner.login` |
| Nút "Tải APP" header | `partner.download` |
| Promo strip header | `partner.promo` |
| Hero banner carousel (3 banner) | Từ `banners[]` |
| Sidebar CSKH | `partner.telegram` |
| Trang `/casino` | `partner.casino` |
| Trang `/idol-live` cards | `partner.idol` |
| Trang `/mini-game` cards | `partner.minigame` |
| Trang `/qua-tang` cards | `partner.gift` |
| Trong phòng xem live: nút "💰 Đặt cược" | `partner.sportbet` |
| Banner trong chat | `partner.register` |
| Mọi trang `/the-thao/:cat`: nút "Đặt cược" | `partner.sportbet` |
| Footer "Tải APP" | `partner.download` |

## Đổi nguồn dữ liệu

`lib/api.js` đã chuẩn hoá schema (`m.home, m.away, m.score, m.status`...) nên đổi từ TheSportsDB sang **API-Football / Football-Data.org / Sofascore scrape** chỉ cần sửa file này, không phải đụng view.

## Tích hợp stream thật

Trong `views/live.ejs`, hàm `startStream()` trong `public/js/app.js` hiện đang là placeholder. Để phát stream HLS thật:

```html
<!-- Trong head -->
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
```

Rồi sửa `startStream()`:
```js
function startStream(){
  const ph = document.getElementById('playerPh');
  const m3u8 = ph.dataset.streamUrl; // truyền từ server
  const video = document.createElement('video');
  video.controls = true; video.autoplay = true;
  ph.replaceWith(video);
  if (Hls.isSupported()) {
    const hls = new Hls(); hls.loadSource(m3u8); hls.attachMedia(video);
  }
}
```

## Deploy

- **Vercel / Railway / Render**: kết nối Git, build `npm install`, start `npm start`
- **VPS Ubuntu**: PM2 `pm2 start server.js --name xoso66tv`
- **Nginx**: `proxy_pass http://localhost:4000;`

## Ghi chú

- Project này song song với `diendanbongda.com` ở folder cha. Chạy cả hai cùng lúc dùng 2 cổng khác nhau (mặc định 4000 vs 3000).
- Chat trong phòng xem là **giả lập client-side**. Để chat thật cần WebSocket (`socket.io`/Firebase/Pusher).
- Idol Live, Casino, Mini Game là **landing affiliate** — không có data thật từ API miễn phí. Khi user click sẽ deep-link sang xoso66tv.com để chuyển đổi cao.
- Cảnh báo: tuân thủ pháp luật địa phương về cá cược/casino.

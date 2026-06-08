# Icons sidebar - hướng dẫn upload

Bỏ file PNG/SVG vào folder này (`public/img/icons/`) để **thay icon mặc định** trong sidebar.

## 7 icon menu chính (đặt đúng tên file)

| Tên file | Menu | Gợi ý hình |
|---|---|---|
| `home.png` | Trang chủ | 🏠 nhà |
| `lich.png` | Lịch phát sóng | 📅 lịch |
| `su-kien.png` | Sự kiện & Khuyến mãi | 🎉 quà / % |
| `qua-tang.png` | Quà tặng | 🎁 hộp quà |
| `video.png` | Video nổi bật | 📹 video |
| `news.png` | Tin tức | 📰 báo |
| `mini.png` | Mini Game | 🎮 game pad |

## 9 icon danh mục thể thao (tên bắt đầu `sport-`)

| Tên file | Danh mục |
|---|---|
| `sport-hot.png` | 🔥 Hot |
| `sport-bong-da.png` | ⚽ Bóng đá |
| `sport-bong-ro.png` | 🏀 Bóng rổ |
| `sport-tennis.png` | 🎾 Tennis |
| `sport-bong-chuyen.png` | 🏐 Bóng chuyền |
| `sport-bong-ban.png` | 🏓 Bóng bàn |
| `sport-esports.png` | 🎮 Esports |
| `sport-casino.png` | 🎰 Casino |
| `sport-idol.png` | 👑 Idol Live |

## Quy cách icon

- **Kích thước**: 64x64 px (auto co thành 24x24 hiển thị)
- **Định dạng**: PNG nền trong suốt (recommended), hoặc SVG
- **Style**: nét trắng/cam outline để hợp tone tối, hoặc icon màu đầy đủ
- **Nền**: trong suốt (transparent)
- **Padding**: 4-8 px margin xung quanh để icon thoáng

## Hệ thống fallback tự động

Nếu file **KHÔNG tồn tại**:
- Menu chính → tự dùng SVG outline đẹp (Heroicons style)
- Danh mục thể thao → tự dùng emoji ⚽ 🏀 🎾...

Bạn KHÔNG cần upload đủ hết. Chỉ cần upload icon nào bạn có, còn lại hệ thống tự fallback.

## Nguồn icon miễn phí gợi ý

- **Iconify** — https://icon-sets.iconify.design (hơn 200,000 icon SVG)
- **Heroicons** — https://heroicons.com (outline/solid sạch sẽ)
- **Lucide** — https://lucide.dev (modern, đa dạng)
- **Flaticon** — https://www.flaticon.com (PNG/SVG miễn phí có credit)
- **Icons8** — https://icons8.com (sẵn nhiều bộ themed)

## Đổi định dạng

Code đang dò file `.png`. Nếu bạn dùng `.svg` hoặc `.webp`, sửa trong `views/partials/tw-sidebar.ejs` đoạn:
```js
var imgUrl = '/static/img/icons/' + it.key + '.png';
```
Đổi `.png` → `.svg` / `.webp` tương ứng.

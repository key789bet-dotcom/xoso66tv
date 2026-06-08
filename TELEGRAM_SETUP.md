# Hướng dẫn setup Telegram Bot OTP

## Bước 1: Tạo bot mới

1. Mở Telegram → tìm **@BotFather** → bấm Start
2. Gõ `/newbot`
3. Đặt tên (display name): vd `X66 TV Bot`
4. Đặt username (phải kết thúc bằng `Bot` hoặc `_bot`): vd `X66TVBot`
5. BotFather sẽ trả về **TOKEN** dạng:
   ```
   1234567890:AAAAaaaaBBBBbbbbCCCCccccDDDDeeeeFF
   ```
   → Copy lại!

## Bước 2: Cấu hình project

```powershell
$env:TELEGRAM_BOT_TOKEN="1234567890:AAAAaaaaBBBBbbbb..."
$env:TELEGRAM_BOT_USERNAME="X66TVBot"
npm start
```

Hoặc thêm vào `.env`:
```
TELEGRAM_BOT_TOKEN=1234567890:AAAAaaaaBBBBbbbb...
TELEGRAM_BOT_USERNAME=X66TVBot
```

## Bước 3: User connect Telegram với account

### Cách A — Thủ công (đơn giản, không cần webhook)

1. User chat với bot `@X66TVBot` → bấm Start
2. Bot trả về `chatId` (vd `123456789`)
3. User vào trang cá nhân → dán chatId
4. Admin (hoặc API) lưu `user.telegramChatId = "123456789"`

API admin:
```bash
curl -X POST http://localhost:4000/admin/api/users/u1/telegram \
  -H "Content-Type: application/json" \
  -d '{"chatId":"123456789"}' \
  -b cookie.txt
```

### Cách B — Auto link qua deep-link (cần webhook public)

1. Trang profile gọi `POST /api/telegram/connect-link` với `{userId}`
2. Server tạo magic code, trả deep-link `https://t.me/X66TVBot?start=<code>`
3. User bấm link → mở Telegram → Bot nhận `/start <code>`
4. Webhook xử lý → tự link chatId vào account

**Setup webhook** (chỉ chạy 1 lần, cần domain public + HTTPS):
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourdomain.com/api/telegram/webhook"
```

Kiểm tra webhook:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## Bước 4: Test quên mật khẩu

1. Vào http://localhost:4000/quen-mat-khau
2. Chọn **📨 Telegram**
3. Nhập username / email / SĐT đã có `telegramChatId`
4. Bấm "GỬI MÃ OTP"
5. Mở Telegram → nhận tin nhắn từ bot có OTP 6 số đẹp:
   ```
   🔐 X66 TV - Khôi phục mật khẩu
   
   Mã OTP của bạn là:
   
   123456
   
   Có hiệu lực trong 5 phút.
   Không chia sẻ cho bất kỳ ai.
   ```

## Trường hợp user chưa connect Telegram

API trả `{ok:false, needConnect:true, botLink: "https://t.me/..."}`.  
UI tự hiện hint box xanh "Lần đầu dùng Telegram? Truy cập @bot và gửi `/start`..."

## Demo mode

Nếu chưa set `TELEGRAM_BOT_TOKEN`, hệ thống tự fallback:
- KHÔNG gửi message thật
- Trả `{ok:true, demo:true, code:"123456"}` để test luồng UI

## Lệnh bot hỗ trợ

User có thể gửi:
- `/start` — đăng nhập + hiển thị chatId
- `/start <code>` — auto link account (qua deep-link)
- `/chatid` hoặc `/id` — xem lại chatId

## Lưu ý production

- Bot cần webhook HTTPS để auto-link hoạt động
- Hoặc dùng polling bằng package `node-telegram-bot-api` nếu chạy local
- Bot token KHÔNG được commit lên Git
- Telegram FREE không giới hạn message (chỉ rate-limit 30 msg/s/bot)

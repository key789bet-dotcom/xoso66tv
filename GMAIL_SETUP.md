# Hướng dẫn setup Gmail SMTP cho OTP

## Bước 1: Bật xác thực 2 lớp (2FA) cho Gmail

1. Vào https://myaccount.google.com/security
2. Tìm mục **"2-Step Verification"** → Bật

## Bước 2: Tạo App Password

1. Sau khi bật 2FA, vào https://myaccount.google.com/apppasswords
2. Chọn app **"Mail"**, device **"Other"** (đặt tên: `XOSO66 TV`)
3. Bấm **Generate** → Google sẽ cho 1 mật khẩu 16 ký tự dạng `abcd efgh ijkl mnop`
4. Copy mật khẩu này (KHÔNG được để lộ!)

## Bước 3: Cấu hình project

### Cách 1: Dùng biến môi trường (Windows PowerShell)

```powershell
$env:SMTP_USER="your.email@gmail.com"
$env:SMTP_PASS="abcd efgh ijkl mnop"
$env:SMTP_FROM_NAME="X66 TV"
npm start
```

### Cách 2: Tạo file `.env` (cần cài thêm gói `dotenv`)

```bash
npm install dotenv
```

Tạo file `.env` ở root project:
```
SMTP_USER=your.email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
SMTP_FROM_NAME=X66 TV
```

Thêm dòng đầu tiên trong `server.js`:
```js
require('dotenv').config();
```

### Cách 3: Hardcode trực tiếp trong `lib/mailer.js` (chỉ test, KHÔNG production)

```js
const USER = 'your.email@gmail.com';
const PASS = 'abcd efgh ijkl mnop';
```

## Bước 4: Cài Nodemailer

```bash
npm install nodemailer bcryptjs
```

## Bước 5: Test

1. `npm start`
2. Vào http://localhost:4000/quen-mat-khau
3. Nhập email thật của bạn → "GỬI MÃ OTP"
4. Check Gmail → bạn sẽ nhận mail có OTP 6 số đẹp
5. Nhập OTP → đặt mật khẩu mới → reset thành công!

## Lưu ý bảo mật

- **KHÔNG** dùng mật khẩu chính của Gmail, chỉ dùng App Password
- **KHÔNG** commit `.env` lên Git (đã có trong `.gitignore`)
- Production nên dùng **SendGrid** / **Mailgun** thay vì Gmail (Gmail giới hạn ~500 mail/ngày)

## Demo mode (không cần Gmail)

Nếu chưa setup SMTP, hệ thống tự fallback **demo mode**:
- OTP sẽ KHÔNG gửi email
- Response API trả về `{ ok:true, demo:true, code:"123456" }`
- UI hiển thị OTP demo trong toast → bạn có thể test luồng UI ngay

## Troubleshooting

**Lỗi "Invalid login: 535"**
→ Sai App Password. Tạo lại tại myaccount.google.com/apppasswords

**Lỗi "Less secure app"**
→ Gmail không còn cho "Less secure app". Phải dùng App Password.

**Không nhận được mail**
→ Check Spam folder. Gmail có thể chặn vì IP server lạ. Đợi 1-2 phút.

**Production gửi mail nhiều bị chặn**
→ Migrate sang SendGrid (free 100 mail/ngày) hoặc Mailgun (free 5000 mail/tháng đầu)

/**
 * Password reset 3-step flow: send-otp -> verify-otp -> reset
 * Su dung Gmail SMTP + OTP store + db.json
 */
const express = require('express');
const db      = require('../lib/db');
const otp     = require('../lib/otp-store');
const mailer  = require('../lib/mailer');
const tele    = require('../lib/telegram');
const bcrypt  = (() => { try { return require('bcryptjs'); } catch(e){ return null; } })();

const router = express.Router();

// Email validator
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'')); }
function isPhone(s) { return /^0[3-9][0-9]{8}$/.test(String(s||'').replace(/\s/g,'')); }

// Rate limit gui OTP theo IP (3 OTP / 10 phut)
const ipLimit = new Map(); // ip -> [ts, ts, ts]
function checkIp(ip) {
  const now = Date.now();
  const arr = (ipLimit.get(ip) || []).filter(function(t){ return now - t < 10*60*1000; });
  if (arr.length >= 3) return { ok: false, wait: Math.ceil((10*60*1000 - (now - arr[0]))/60000) };
  arr.push(now); ipLimit.set(ip, arr);
  return { ok: true };
}

// Step 1: GUI OTP qua email
router.post('/api/quen-mat-khau/send-otp', async function (req, res) {
  const b = req.body || {};
  const contact = String(b.contact || '').trim();
  const method  = b.method || 'email';
  if (!contact) return res.json({ ok:false, message:'Thieu thong tin' });

  if (method === 'email' && !isEmail(contact)) {
    return res.json({ ok:false, message:'Email khong hop le' });
  }
  if (method === 'telegram' && !contact) {
    return res.json({ ok:false, message:'Vui long nhap email/SDT/username de tim tai khoan' });
  }

  // Rate limit per IP - dùng IP HASH thay vì IP thật (privacy)
  const ip = require('../lib/privacy').getHashedIp(req);
  const ipChk = checkIp(ip);
  if (!ipChk.ok) return res.json({ ok:false, message:'Ban da yeu cau qua nhieu, vui long thu lai sau '+ipChk.wait+' phut' });

  // Cooldown per contact
  const cd = otp.canResend(contact);
  if (!cd.ok) return res.json({ ok:false, message:'Vui long cho '+Math.ceil(cd.wait/1000)+'s de gui lai' });

  // (Optional) check user co ton tai khong - bo qua de khong leak info
  const data = db.load();
  const user = data.users.find(function(u){ return u.email === contact || u.phone === contact || u.username === contact; });
  // Khong tiet lo neu khong tim thay - van tra ok de chong enumeration

  // Issue OTP
  const issued = otp.issue(contact);
  const brandName = (process.env.SMTP_FROM_NAME) || 'XOSO66 TV';

  // Gui email (chi voi email + Gmail SMTP)
  if (method === 'email') {
    try {
      const r = await mailer.sendOtp(contact, issued.code, brandName, issued.ttl);
      if (r.demo) {
        return res.json({ ok:true, demo:true, code: issued.code, message:'Demo mode: OTP la '+issued.code+' (set SMTP_USER/SMTP_PASS de gui email that)' });
      }
      return res.json({ ok:true, message:'Da gui OTP toi '+contact, ttl: issued.ttl });
    } catch (e) {
      console.error('[Send OTP]', e.message);
      return res.json({ ok:false, message:'Khong gui duoc email. '+e.message });
    }
  }

  // Telegram
  if (method === 'telegram') {
    if (!user) {
      // user khong ton tai - khong leak, van fake success de chong enumeration
      return res.json({ ok:true, demo:true, code: issued.code, message:'Demo OTP: '+issued.code+' (user khong ton tai hoac chua ket noi Telegram)' });
    }
    if (!user.telegramChatId) {
      var link = tele.deepLinkConnect('connect_'+(user.id||'x'));
      return res.json({
        ok: false,
        needConnect: true,
        botLink: link,
        botUsername: tele.getBotUsername(),
        message: 'Tai khoan chua ket noi Telegram. Bam vao @' + (tele.getBotUsername()||'X66TVBot') + ' va gui /start de ket noi truoc.'
      });
    }
    var r = await tele.sendOtp(user.telegramChatId, issued.code, brandName, issued.ttl);
    if (r.demo) return res.json({ ok:true, demo:true, code: issued.code, message:'Demo (chua set TELEGRAM_BOT_TOKEN): OTP la '+issued.code });
    if (!r.ok) return res.json({ ok:false, message: 'Khong gui duoc Telegram: '+r.error });
    return res.json({ ok:true, message:'Da gui OTP qua Telegram', ttl: issued.ttl });
  }

  return res.json({ ok:false, message:'Phuong thuc khong ho tro. Chon Email hoac Telegram.' });
});

// Step 2: Xac thuc OTP
router.post('/api/quen-mat-khau/verify-otp', function (req, res) {
  const { contact, code } = req.body || {};
  if (!contact || !code) return res.json({ ok:false, message:'Thieu thong tin' });
  const r = otp.verify(String(contact).trim(), String(code).trim());
  res.json(r);
});

// Step 3: Doi mat khau moi
router.post('/api/quen-mat-khau/reset', async function (req, res) {
  const { token, password } = req.body || {};
  if (!token || !password) return res.json({ ok:false, message:'Thieu thong tin' });
  if (password.length < 8) return res.json({ ok:false, message:'Mat khau toi thieu 8 ky tu' });

  const contact = otp.consumeResetToken(token);
  if (!contact) return res.json({ ok:false, message:'Token het han, vui long thuc hien lai tu dau' });

  // Update DB
  const data = db.load();
  const user = data.users.find(function(u){ return u.email === contact || u.phone === contact || u.username === contact; });
  if (!user) {
    // Khong tim thay - van tra success de UX dong nhat
    return res.json({ ok:true, message:'Mat khau da duoc cap nhat' });
  }
  if (bcrypt) {
    user.passwordHash = await bcrypt.hash(password, 10);
    delete user.password;
  } else {
    user.password = password;  // fallback (khong nen dung production)
  }
  user.updatedAt = Date.now();
  db.audit(data, 'Reset password', user.username, 'self-service');
  db.save(data);

  res.json({ ok:true, message:'Mat khau da duoc cap nhat thanh cong' });
});

module.exports = router;

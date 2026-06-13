/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ ADMIN AUTH — Signed cookie (HMAC) thay vì in-memory Map           ║
 * ║                                                                    ║
 * ║ Cookie format: base64url(payload).hmac_sha256(SECRET, payload)    ║
 * ║   payload = JSON { username, exp }                                 ║
 * ║                                                                    ║
 * ║ Ưu điểm vs in-memory Map:                                          ║
 * ║   ✓ Cluster-safe: mọi worker verify được cùng cookie               ║
 * ║   ✓ Stateless: PM2 reload KHÔNG mất session                        ║
 * ║   ✓ HMAC chống giả mạo: attacker không có SECRET → không sign     ║
 * ║                                                                    ║
 * ║ ENV:                                                                ║
 * ║   ADMIN_USER, ADMIN_PASS — credential                              ║
 * ║   ADMIN_SECRET hoặc JWT_SECRET — secret để sign cookie             ║
 * ╚══════════════════════════════════════════════════════════════════*/
const crypto = require('crypto');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SECRET     = process.env.ADMIN_SECRET || process.env.JWT_SECRET ||
                   'x66-CHANGE-THIS-IN-ENV-' + (process.env.HOSTNAME || 'dev');
const COOKIE     = 'x66_admin';
const TTL_MS     = 12 * 60 * 60 * 1000; // 12h

function parseCookie(req) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.substring(COOKIE.length + 1)) : null;
}

function _sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function _verify(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const body = parts[0], sig = parts[1];
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  // Constant-time compare
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch (_) { return null; }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.username) return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (_) { return null; }
}

function _setCookie(res, token, maxAgeS) {
  // ⚠️ Dùng res.append để KHÔNG ghi đè cookie từ middleware khác (CSRF, analytics)
  const cookieStr = COOKIE + '=' + encodeURIComponent(token) +
                    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAgeS +
                    (process.env.NODE_ENV === 'production' ? '; Secure' : '');
  if (typeof res.append === 'function') {
    res.append('Set-Cookie', cookieStr);
  } else {
    const existing = res.getHeader('Set-Cookie');
    if (existing) {
      const arr = Array.isArray(existing) ? existing : [existing];
      arr.push(cookieStr);
      res.setHeader('Set-Cookie', arr);
    } else {
      res.setHeader('Set-Cookie', cookieStr);
    }
  }
}

function isAuthed(req) {
  const tok = parseCookie(req);
  if (!tok) return false;
  const payload = _verify(tok);
  if (!payload) return false;
  return payload; // { username, exp }
}

function login(username, password, res, otp) {
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return { ok: false, error: 'Sai tài khoản hoặc mật khẩu' };
  }
  // 2FA check (nếu admin đã setup)
  try {
    const db = require('./db');
    const sec = require('./security');
    const data = db.load();
    const admin2fa = data.admin2fa && data.admin2fa.secret;
    if (admin2fa) {
      if (!otp) return { ok: false, needs2FA: true, error: '2FA_REQUIRED' };
      const ok2fa = sec.verify2FAToken(admin2fa, otp);
      if (!ok2fa) return { ok: false, error: 'Mã OTP không đúng' };
    }
  } catch (e) { console.warn('[admin-auth] 2FA check failed:', e.message); }

  const tok = _sign({ username: username, exp: Date.now() + TTL_MS });
  _setCookie(res, tok, TTL_MS / 1000);
  return { ok: true };
}

function logout(req, res) {
  // Set cookie với Max-Age=0 để browser xoá
  _setCookie(res, '', 0);
}

// Middleware: chặn khi chưa đăng nhập admin (chỉ dùng nếu không qua admin-guard)
function requireAuth(req, res, next) {
  const s = isAuthed(req);
  if (!s) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, message: 'Chưa đăng nhập' });
    }
    return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
  }
  res.locals.adminUser = s.username;
  next();
}

module.exports = { ADMIN_USER, requireAuth, login, logout, isAuthed };

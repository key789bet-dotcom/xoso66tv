/**
 * Admin auth don gian dung cookie session (in-memory).
 * Mac dinh: admin / admin123 (sua env ADMIN_USER / ADMIN_PASS de override).
 */
const crypto = require('crypto');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const COOKIE     = 'x66_admin';

// in-memory session store
const sessions = new Map();   // token -> { username, exp }
const TTL_MS   = 12 * 60 * 60 * 1000; // 12h

function parseCookie(req) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

function isAuthed(req) {
  const tok = parseCookie(req);
  if (!tok) return false;
  const s = sessions.get(tok);
  if (!s) return false;
  if (Date.now() > s.exp) { sessions.delete(tok); return false; }
  return s;
}

function login(username, password, res, otp) {
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return { ok:false, error:'Sai tài khoản hoặc mật khẩu' };
  // Check 2FA if enabled
  try {
    const db = require('./db');
    const sec = require('./security');
    const data = db.load();
    const admin2fa = data.admin2fa && data.admin2fa.secret;
    if (admin2fa) {
      if (!otp) return { ok:false, needs2FA:true, error:'2FA_REQUIRED' };
      const ok2fa = sec.verify2FAToken(admin2fa, otp);
      if (!ok2fa) return { ok:false, error:'Mã OTP không đúng' };
    }
  } catch(e){ console.warn('2FA check failed:', e.message); }
  const tok = crypto.randomBytes(24).toString('hex');
  sessions.set(tok, { username: username, exp: Date.now() + TTL_MS });
  res.setHeader('Set-Cookie', COOKIE + '=' + tok + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (TTL_MS/1000));
  return { ok:true };
}

function logout(req, res) {
  const tok = parseCookie(req);
  if (tok) sessions.delete(tok);
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Max-Age=0');
}

// Middleware: chan khi chua dang nhap
function requireAuth(req, res, next) {
  const s = isAuthed(req);
  if (!s) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ ok:false, message:'Chua dang nhap' });
    return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
  }
  res.locals.adminUser = s.username;
  next();
}

module.exports = { ADMIN_USER, requireAuth, login, logout, isAuthed };

/**
 * Public user auth - JWT tokens + bcrypt password + role detection
 * Replaces in-memory sessions with stateless JWT.
 */
const sec = require('./security');
const db = require('./db');

const COOKIE = 'x66_jwt';
const TTL_S = 30 * 24 * 60 * 60; // 30 days

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
// Default admin password - HASHED at startup
let ADMIN_PASS_HASH = null;
(async function(){
  const plain = process.env.ADMIN_PASS || 'admin123';
  ADMIN_PASS_HASH = await sec.hashPassword(plain);
})();

function parseCookie(req) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

function detectRole(username, db_data) {
  const lname = String(username || '').toLowerCase();
  if (lname === ADMIN_USER.toLowerCase()) return 'admin';

  // 🆙 Priority 1: Check user.role trong users[] (set bởi admin approve)
  const user = db_data.users && db_data.users.find(u =>
    (u.username || '').toLowerCase() === lname
  );
  if (user && ['admin','idol','blv'].includes(user.role)) return user.role;

  // Priority 2: Check idols[] (match by userId, username, or name)
  const idol = db_data.idols && db_data.idols.find(i =>
    (i.userId || '').toLowerCase() === lname ||
    (i.username || '').toLowerCase() === lname ||
    (i.name || '').toLowerCase() === lname
  );
  if (idol && idol.status === 'active') return 'idol';

  // Priority 3: Check blvs[] (match by userId, username, or name)
  const blv = db_data.blvs && db_data.blvs.find(b =>
    (b.userId || '').toLowerCase() === lname ||
    (b.username || '').toLowerCase() === lname ||
    (b.name || '').toLowerCase() === lname
  );
  if (blv && blv.status === 'active') return 'blv';

  return 'user';
}

async function login(username, password, res, options) {
  options = options || {};
  if (!username || username.length < 3) return { ok:false, error:'Username quá ngắn' };

  let isAdmin = false;
  if (username === ADMIN_USER) {
    // Verify admin password against bcrypt hash
    const ok = await sec.verifyPassword(password, ADMIN_PASS_HASH);
    if (!ok) return { ok:false, error:'Sai mật khẩu admin' };
    isAdmin = true;

    // 2FA check for admin (if enabled in db)
    const data = db.load();
    const admin2fa = (data.admin2fa && data.admin2fa.secret) || null;
    if (admin2fa) {
      if (!options.otp) return { ok:false, error:'2FA_REQUIRED', needs2FA:true };
      const ok2fa = sec.verify2FAToken(admin2fa, options.otp);
      if (!ok2fa) return { ok:false, error:'Mã OTP không đúng' };
    }
  } else {
    // 🛡️ FIX security: BẮT BUỘC user tồn tại + có passwordHash + verify đúng
    //    (Trước đây có "demo mode" cho phép bất kỳ username nào + 4 ký tự → bug nghiêm trọng)
    const data = db.load();
    const user = data.users && data.users.find(u =>
      (u.username || '').toLowerCase() === username.toLowerCase()
    );
    if (!user) return { ok:false, error:'Tài khoản không tồn tại' };
    if (user.banned) return { ok:false, error:'Tài khoản đã bị khóa' };
    if (!user.passwordHash) {
      return { ok:false, error:'Tài khoản chưa thiết lập mật khẩu. Liên hệ admin để reset.' };
    }
    const ok = await sec.verifyPassword(password, user.passwordHash);
    if (!ok) return { ok:false, error:'Sai mật khẩu' };
  }

  const data = db.load();
  const role = isAdmin ? 'admin' : detectRole(username, data);

  // Sign JWT
  const token = sec.signToken({ username: username, role: role });

  // Set HTTP-only cookie
  res.setHeader('Set-Cookie', COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + TTL_S);
  return { ok:true, username: username, role: role, token: token };
}

function getUser(req) {
  // 1. Check new JWT cookie (x66_jwt)
  const tok = parseCookie(req);
  if (tok) {
    const u = sec.verifyToken(tok);
    if (u) return u;
  }
  // 2. Fallback: check OLD admin cookie (x66_admin) for backwards compat
  try {
    const adminAuth = require('./admin-auth');
    const adminSession = adminAuth.isAuthed(req);
    if (adminSession && adminSession.username) {
      return { username: adminSession.username, role: 'admin', via: 'admin_cookie' };
    }
  } catch(e){}
  return null;
}

function logout(req, res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Max-Age=0');
}

function requireStreamer(req, res, next) {
  const s = getUser(req);
  if (!s) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
    return res.redirect('/dang-nhap?next=' + encodeURIComponent(req.originalUrl) + '&msg=login_required');
  }
  if (!['admin','idol','blv'].includes(s.role)) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ ok:false, error:'Cần quyền streamer (idol/BLV/admin)' });
    return res.status(403).render('tw-403', { role: s.role, username: s.username });
  }
  // 🔐 NEW: Check canLive permission (admin bypass)
  if (s.role !== 'admin') {
    try {
      const db = require('./db');
      const data = db.load();
      const arr = s.role === 'idol' ? (data.idols || []) : (data.blvs || []);
      const profile = arr.find(function(x){
        return (x.userId === s.username) || (x.username === s.username) || ((x.name||'').toLowerCase() === (s.username||'').toLowerCase());
      });
      if (!profile || !profile.canLive) {
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({ ok:false, error:'Tài khoản chưa được admin cấp quyền LIVE. Vui lòng liên hệ admin.' });
        }
        return res.status(403).send(
          '<div style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#161a22;color:#fff;min-height:100vh">' +
          '<h1 style="font-size:48px;margin:0">🚫</h1>' +
          '<h2 style="color:#ff7a18;margin:16px 0">Chưa được cấp quyền LIVE</h2>' +
          '<p style="color:#999;max-width:480px;margin:16px auto">Tài khoản <b style="color:#fff">' + s.username + '</b> (' + s.role + ') chưa được admin cấp quyền lên sóng.</p>' +
          '<p style="color:#666;font-size:13px">Vui lòng liên hệ admin để được duyệt.</p>' +
          '<a href="/" style="display:inline-block;margin-top:24px;padding:10px 24px;background:#ff7a18;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">← Về trang chủ</a>' +
          '</div>'
        );
      }
    } catch(e) { console.error('canLive check err:', e); }
  }
  res.locals.publicUser = s;
  next();
}

function requireLogin(req, res, next) {
  const s = getUser(req);
  if (!s) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
    return res.redirect('/dang-nhap?next=' + encodeURIComponent(req.originalUrl));
  }
  res.locals.publicUser = s;
  next();
}

function requireAdmin(req, res, next) {
  const s = getUser(req);
  if (!s || s.role !== 'admin') {
    if (req.path.startsWith('/api/')) return res.status(403).json({ ok:false, error:'Cần quyền admin' });
    return res.status(403).render('tw-403', { role: s ? s.role : 'guest', username: s ? s.username : '?' });
  }
  res.locals.publicUser = s;
  next();
}

module.exports = { login, logout, getUser, requireStreamer, requireLogin, requireAdmin, detectRole, ADMIN_USER };

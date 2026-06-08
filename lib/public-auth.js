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
  const idol = db_data.idols && db_data.idols.find(i =>
    (i.username || '').toLowerCase() === lname || (i.name || '').toLowerCase() === lname
  );
  if (idol) return 'idol';
  const blv = db_data.blvs && db_data.blvs.find(b =>
    (b.username || '').toLowerCase() === lname || (b.name || '').toLowerCase() === lname
  );
  if (blv) return 'blv';
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
    // Regular user: verify password from DB hash (or accept demo if no hash)
    const data = db.load();
    const user = data.users && data.users.find(u => 
      (u.username || '').toLowerCase() === username.toLowerCase()
    );
    if (user && user.passwordHash) {
      const ok = await sec.verifyPassword(password, user.passwordHash);
      if (!ok) return { ok:false, error:'Sai mật khẩu' };
    } else {
      // Demo mode: accept any password ≥4 chars
      if (!password || password.length < 4) return { ok:false, error:'Mật khẩu quá ngắn' };
    }
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

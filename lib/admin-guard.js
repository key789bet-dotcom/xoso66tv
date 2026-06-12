/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ ADMIN GUARD — Middleware chặn TẤT CẢ truy cập trang admin    ║
 * ║                                                                ║
 * ║ Cho phép VÀO khi (1 trong 2):                                  ║
 * ║   1. Có cookie x66_admin hợp lệ (login qua /admin/login)       ║
 * ║   2. Có cookie x66_jwt + user.role === 'admin' trong DB        ║
 * ║                                                                ║
 * ║ Khác đi → redirect /admin/login (HTML) hoặc 401 (API).        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const adminAuth = require('./admin-auth');
const pubAuth   = require('./public-auth');

module.exports = function requireAnyAdmin(req, res, next) {
  // ✓ Check 1: cookie x66_admin (admin login cũ)
  try {
    const adminSess = adminAuth.isAuthed(req);
    if (adminSess && adminSess.username) {
      res.locals.adminUser = adminSess.username;
      res.locals.adminAuthMethod = 'admin-cookie';
      return next();
    }
  } catch (e) { /* ignore */ }

  // ✓ Check 2: cookie x66_jwt với role='admin'
  try {
    const jwtUser = pubAuth.getUser(req);
    if (jwtUser && jwtUser.role === 'admin') {
      res.locals.adminUser = jwtUser.username || jwtUser.fullname || 'admin';
      res.locals.adminAuthMethod = 'jwt-role';
      return next();
    }
  } catch (e) { /* ignore */ }

  // ✗ Không có quyền → reject
  if (req.path.startsWith('/api/') || (req.xhr || req.headers.accept === 'application/json')) {
    return res.status(401).json({ ok:false, error:'Cần đăng nhập admin để truy cập' });
  }
  return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
};

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🛡️  CSRF PROTECTION — Mục 21                                     ║
 * ║                                                                    ║
 * ║ Pattern: Double-Submit Cookie (modern, stateless)                 ║
 * ║                                                                    ║
 * ║ Flow:                                                              ║
 * ║   1. Mỗi request GET → middleware ensure cookie x66_csrf tồn tại  ║
 * ║      Nếu không có → generate random 32-byte token, set cookie     ║
 * ║   2. Mỗi POST/PUT/DELETE → middleware so sánh:                    ║
 * ║      - Header X-CSRF-Token (AJAX) HOẶC body._csrf (form)          ║
 * ║      - Phải EQUAL với cookie x66_csrf                              ║
 * ║   3. Token random + per-session = attacker cross-site KHÔNG biết. ║
 * ║                                                                    ║
 * ║ Whitelist (skip CSRF):                                            ║
 * ║   - GET, HEAD, OPTIONS (idempotent)                               ║
 * ║   - Webhooks from external (xoso66.com, srs callback)             ║
 * ║   - /api/health, /api/ping (monitoring)                           ║
 * ║                                                                    ║
 * ║ Server-side render: token được expose qua res.locals.csrfToken    ║
 * ║   → EJS template: <meta name="csrf-token" content="<%= csrfToken %>">║
 * ║   → JS đọc: document.querySelector('meta[name=csrf-token]').content║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
const crypto = require('crypto');

const COOKIE_NAME = 'x66_csrf';
const HEADER_NAME = 'x-csrf-token';
const FIELD_NAME = '_csrf';
const COOKIE_TTL_S = 7 * 24 * 60 * 60; // 7 ngày
const TOKEN_LEN = 32;

// Whitelist paths — KHÔNG check CSRF (cho webhooks, health check, ...)
const SKIP_PATHS = [
  /^\/api\/health$/,
  /^\/api\/ping/,
  /^\/api\/webhook\//,           // webhook từ partner xoso66
  /^\/api\/srs\//,                // SRS callback (publish/play)
  /^\/sitemap\.xml$/,
  /^\/robots\.txt$/,
  /^\/manifest\.webmanifest$/,
  /^\/service-worker\.js$/,
  /^\/static\//,
  /^\/uploads\//
];

function shouldSkip(req) {
  // Skip cho safe methods
  const m = req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  // Skip whitelist paths
  const p = req.path || req.url || '';
  for (var i = 0; i < SKIP_PATHS.length; i++) {
    if (SKIP_PATHS[i].test(p)) return true;
  }
  return false;
}

function parseCookieToken(req) {
  const c = req.headers.cookie || '';
  const m = c.split(';')
    .map(function(x){ return x.trim(); })
    .find(function(x){ return x.startsWith(COOKIE_NAME + '='); });
  if (!m) return null;
  try { return decodeURIComponent(m.substring(COOKIE_NAME.length + 1)); }
  catch (_) { return null; }
}

function generateToken() {
  return crypto.randomBytes(TOKEN_LEN).toString('hex');
}

function setCookie(res, token) {
  // SameSite=Lax: gửi cookie cho top-level navigation từ cross-site (đủ an toàn)
  // KHÔNG HttpOnly vì JS cần đọc để gửi vào header AJAX
  res.setHeader('Set-Cookie',
    COOKIE_NAME + '=' + encodeURIComponent(token) +
    '; Path=/; SameSite=Lax; Max-Age=' + COOKIE_TTL_S +
    (process.env.NODE_ENV === 'production' ? '; Secure' : '')
  );
}

// ─── Middleware 1: ensure cookie (mọi request) ───
function ensureToken(req, res, next) {
  let token = parseCookieToken(req);
  if (!token || token.length < 16) {
    token = generateToken();
    setCookie(res, token);
  }
  // Expose cho EJS template
  res.locals.csrfToken = token;
  req.csrfToken = function() { return token; };
  next();
}

// ─── Middleware 2: verify trên POST/PUT/DELETE ───
function verify(req, res, next) {
  if (shouldSkip(req)) return next();

  const cookieToken = parseCookieToken(req);
  const submitted = req.headers[HEADER_NAME] ||
                    (req.body && req.body[FIELD_NAME]) ||
                    req.query[FIELD_NAME] || '';

  if (!cookieToken || !submitted) {
    return rejectCsrf(req, res, 'missing_token');
  }
  // Constant-time compare để tránh timing attack
  try {
    const a = Buffer.from(String(cookieToken));
    const b = Buffer.from(String(submitted));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return rejectCsrf(req, res, 'token_mismatch');
    }
  } catch (_) {
    return rejectCsrf(req, res, 'token_compare_error');
  }
  next();
}

function rejectCsrf(req, res, reason) {
  // Log để Sentry track + fail2ban có thể parse
  console.warn('[CSRF] rejected ' + reason + ' path=' + req.path +
               ' ip=' + (req.headers['cf-connecting-ip'] || req.ip));
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({
      ok: false,
      error: 'CSRF token sai hoặc thiếu',
      reason: reason
    });
  }
  return res.status(403).send(
    '<div style="font-family:sans-serif;text-align:center;padding:60px 20px">' +
    '<h1>🛡️ 403 — CSRF Protection</h1>' +
    '<p>Phiên làm việc đã hết hạn. Vui lòng <a href="/">tải lại trang</a> rồi thử lại.</p>' +
    '</div>'
  );
}

module.exports = {
  ensureToken,
  verify,
  COOKIE_NAME,
  HEADER_NAME,
  FIELD_NAME,
  shouldSkip
};

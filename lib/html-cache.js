/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ HTML CACHE MIDDLEWARE — Redis 60s cho guests                  ║
 * ║                                                                ║
 * ║ Strategy: cache full HTML response cho user CHƯA LOGIN (guest) ║
 * ║   - User login (có cookie x66_jwt) → BYPASS cache (render dynamic)║
 * ║   - Guest GET request → check Redis cache → trả ngay (1ms)     ║
 * ║   - Cache miss → render + lưu Redis 60s                        ║
 * ║                                                                ║
 * ║ Whitelist routes (chỉ cache những trang static-ish):           ║
 * ║   /, /idol-live, /lich-phat-song, /tin-tuc, /su-kien,         ║
 * ║   /the-thao/*, /idol/*, /live/*                                 ║
 * ║                                                                ║
 * ║ Skip routes (luôn dynamic):                                    ║
 * ║   /api/*, /admin/*, /profile, /dang-nhap, /dang-ky, /idol-studio║
 * ║                                                                ║
 * ║ Impact: trang chủ từ 1000ms → ~50ms khi cache hit (20× faster) ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const CACHE_TTL_S = 60;          // 60 giây - đủ tươi cho live data
const KEY_PREFIX  = 'xoso66:html:';

// Whitelist: GET path nào được cache (regex)
const CACHEABLE_PATHS = [
  /^\/$/,                          // Trang chủ
  /^\/idol-live\/?$/,
  /^\/lich-phat-song\/?$/,
  /^\/tin-tuc\/?$/,
  /^\/tin-tuc\/[^/]+\/?$/,         // /tin-tuc/{slug}
  /^\/su-kien\/?$/,
  /^\/qua-tang\/?$/,
  /^\/khuyen-mai\/?$/,
  /^\/the-thao(\/[^/]+)?\/?$/,     // /the-thao, /the-thao/bong-da
  /^\/idol\/[^/]+\/?$/,            // /idol/i_yennhi
  /^\/live\/[^/]+\/?$/,            // /live/match-123
  /^\/gioi-thieu\/?$/,
  /^\/lien-he\/?$/,
  /^\/chinh-sach-bao-mat\/?$/,
  /^\/dieu-khoan-su-dung\/?$/
];

function isCacheable(req) {
  if (req.method !== 'GET') return false;
  // User đã login → KHÔNG cache (render dynamic với username, balance, ...)
  const cookie = req.headers.cookie || '';
  if (/x66_jwt=/.test(cookie) || /x66_admin=/.test(cookie)) return false;
  // Có query string (ngoài UTM tracking) → KHÔNG cache (kết quả khác nhau)
  const q = req.query || {};
  const allowedQueryKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid', 'ref'];
  for (const k in q) {
    if (allowedQueryKeys.indexOf(k) === -1) return false;
  }
  // Check whitelist
  return CACHEABLE_PATHS.some(re => re.test(req.path));
}

function _getRedis() {
  try {
    const r = require('./redis');
    if (r && r.isReady && r.isReady()) return r;
  } catch (_) {}
  return null;
}

/**
 * Middleware factory — gắn vào app.use() SAU body-parser, TRƯỚC routes
 */
function middleware(opts) {
  opts = opts || {};
  const ttl = opts.ttl || CACHE_TTL_S;

  return function htmlCacheMiddleware(req, res, next) {
    if (!isCacheable(req)) return next();

    const redis = _getRedis();
    if (!redis) return next();    // Redis không có → skip cache

    const key = KEY_PREFIX + req.path;

    // 1. Check cache
    redis.get(key).then(cached => {
      if (cached) {
        // Cache HIT: trả ngay
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('X-Cache', 'HIT');
        res.set('Cache-Control', 'public, max-age=' + ttl);
        return res.send(cached);
      }

      // Cache MISS: intercept res.send() để lưu cache sau khi render
      const originalSend = res.send.bind(res);
      res.send = function(body) {
        // Chỉ cache 200 + text/html
        const ct = res.getHeader('content-type') || res.getHeader('Content-Type') || '';
        if (res.statusCode === 200 && /text\/html/i.test(ct) && typeof body === 'string') {
          // Save Redis fire-and-forget (không block response)
          redis.setex(key, ttl, body).catch(e => console.warn('[html-cache] save:', e.message));
        }
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', 'public, max-age=' + ttl);
        return originalSend(body);
      };
      next();
    }).catch(err => {
      console.warn('[html-cache] redis get:', err.message);
      next();
    });
  };
}

/**
 * Invalidate cache toàn site (gọi sau admin update banner/idol/...)
 */
async function purgeAll() {
  const redis = _getRedis();
  if (!redis) return 0;
  try {
    const keys = await redis.keys(KEY_PREFIX + '*');
    if (keys && keys.length) {
      await redis.del(...keys);
      return keys.length;
    }
  } catch(_) {}
  return 0;
}

/**
 * Invalidate 1 path cụ thể
 */
async function purgePath(path) {
  const redis = _getRedis();
  if (!redis) return;
  try { await redis.del(KEY_PREFIX + path); } catch(_) {}
}

module.exports = { middleware, purgeAll, purgePath, isCacheable };

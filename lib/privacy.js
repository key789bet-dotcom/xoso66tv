// ============================================================
// PRIVACY UTILITIES - Ẩn IP người dùng + server
// ============================================================
const crypto = require('crypto');

/**
 * Mask IP: 192.168.1.234 → 192.168.1.xxx
 * Dùng cho display admin panel, logs
 */
function maskIp(ip) {
  if (!ip || typeof ip !== 'string') return 'unknown';
  // IPv4: giữ 3 octet đầu, ẩn cuối
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return ip.replace(/\.\d+$/, '.xxx');
  }
  // IPv6: giữ 3 group đầu, ẩn còn lại
  if (ip.includes(':')) {
    const parts = ip.split(':').slice(0, 3).join(':');
    return parts + ':xxxx::';
  }
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (ip.startsWith('::ffff:')) return maskIp(ip.replace('::ffff:', ''));
  return 'masked';
}

/**
 * Hash IP irreversibly - dùng để track unique visitor không lộ IP thật
 * Cùng IP → cùng hash (để rate limit, ban...)
 */
function hashIp(ip, salt) {
  const SALT = salt || process.env.IP_SALT || 'xoso66tv_default_salt_2026';
  return crypto.createHash('sha256').update((ip || '') + SALT).digest('hex').substring(0, 16);
}

/**
 * Lấy IP thật từ request - tin tưởng X-Forwarded-For từ Cloudflare
 */
function getClientIp(req) {
  // Cloudflare gửi IP thật trong CF-Connecting-IP
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp;
  // Fallback: X-Forwarded-For (proxy chain)
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  // Cuối: socket address
  return (req.connection && req.connection.remoteAddress) || req.ip || 'unknown';
}

/**
 * Lấy IP MASKED cho admin panel - không lộ IP thật cho admin (nếu cần che cả admin)
 */
function getMaskedIp(req) {
  return maskIp(getClientIp(req));
}

/**
 * Lấy IP HASH cho rate limit / ban (không thể decode ngược)
 */
function getHashedIp(req) {
  return hashIp(getClientIp(req));
}

/**
 * Sanitize object trước khi gửi ra frontend - xóa các field nhạy cảm
 */
function sanitizeUser(user) {
  if (!user) return null;
  const safe = Object.assign({}, user);
  delete safe.passwordHash;
  delete safe.password;
  delete safe.ip;
  delete safe.lastIp;
  delete safe.email;            // ẩn email
  delete safe.phone;            // ẩn SĐT
  delete safe.twoFASecret;
  delete safe.streamKey;
  // Mask user agent ngắn lại
  if (safe.userAgent) safe.userAgent = safe.userAgent.substring(0, 30);
  return safe;
}

/**
 * Log request KHÔNG lộ IP - dùng thay console.log
 */
function privacyLog(req, message) {
  const masked = getMaskedIp(req);
  console.log('[' + masked + '] ' + message);
}

module.exports = {
  maskIp,
  hashIp,
  getClientIp,
  getMaskedIp,
  getHashedIp,
  sanitizeUser,
  privacyLog
};

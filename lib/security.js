/**
 * Production security utilities
 * - bcrypt password hashing
 * - JWT token signing/verifying
 * - Rate limiting (in-memory)
 * - TOTP 2FA (speakeasy)
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const JWT_SECRET = process.env.JWT_SECRET || 'xoso66-jwt-secret-CHANGE-IN-PRODUCTION-' + Date.now();
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

// ===== BCRYPT =====
async function hashPassword(plain) {
  if (!plain || plain.length < 4) throw new Error('Password too short');
  return await bcrypt.hash(plain, 10); // 10 rounds = ~10ms hash time
}
async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try { return await bcrypt.compare(plain, hash); }
  catch(e) { return false; }
}

// ===== JWT =====
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch(e) { return null; }
}

// ===== RATE LIMITING (sliding window in-memory) — fallback khi Redis off =====
const attempts = new Map(); // key -> array of timestamps
function rateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  if (!attempts.has(key)) attempts.set(key, []);
  const arr = attempts.get(key).filter(t => now - t < windowMs);
  attempts.set(key, arr);
  if (arr.length >= maxAttempts) {
    const retryAfter = Math.ceil((windowMs - (now - arr[0])) / 1000);
    return { blocked: true, retryAfter: retryAfter, count: arr.length };
  }
  arr.push(now);
  return { blocked: false, count: arr.length, remaining: maxAttempts - arr.length };
}
function resetRateLimit(key) { attempts.delete(key); }

// ===== 🛡️ Mục 19: SHARED rate limit via Redis (cluster-safe) =====
// Khi PM2 cluster mode, in-memory Map() per-worker → 2 workers x max=5 = thực tế max=10.
// Redis INCR là atomic + shared → tất cả workers cùng count.
async function rateLimitShared(key, maxAttempts, windowMs) {
  let redis;
  try { redis = require('./redis'); }
  catch (_) { return rateLimit(key, maxAttempts, windowMs); }

  if (!redis.isReady || !redis.isReady()) {
    return rateLimit(key, maxAttempts, windowMs);
  }

  try {
    const ttlS = Math.ceil(windowMs / 1000);
    const rkey = 'rl:' + key;
    const count = await redis.incr(rkey, ttlS);
    if (count == null) {
      // Redis lỗi → fallback
      return rateLimit(key, maxAttempts, windowMs);
    }
    if (count > maxAttempts) {
      return { blocked: true, retryAfter: ttlS, count };
    }
    return { blocked: false, count, remaining: maxAttempts - count };
  } catch (e) {
    return rateLimit(key, maxAttempts, windowMs);
  }
}

// Express middleware factory
function createLimiter(opts) {
  const max = opts.max || 5;
  const windowMs = opts.windowMs || 60000;
  // 🔒 PRIVACY: rate limit dùng IP HASH (không lưu IP thật vào memory)
  const privacy = require('./privacy');
  const keyGen = opts.keyGenerator || (req => privacy.getHashedIp(req));
  const message = opts.message || 'Too many requests, please try again later';
  // 🛡️ Mục 22: log structured cho fail2ban parse (chỉ khi blocked + có category)
  const fail2banTag = opts.fail2banTag || null;
  return async function (req, res, next) {
    const key = keyGen(req);
    // 🛡️ Dùng Redis-backed (cluster-safe) thay vì in-memory per-worker
    const result = await rateLimitShared(key, max, windowMs);
    res.setHeader('X-RateLimit-Limit', String(max));
    if (result.blocked) {
      res.setHeader('Retry-After', String(result.retryAfter));
      // fail2ban: log line dễ parse: [FAIL2BAN] <ISO> <category> ip=<realIp>
      if (fail2banTag) {
        const realIp = req.headers['cf-connecting-ip'] ||
                       (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                       req.ip || 'unknown';
        console.log('[FAIL2BAN] ' + new Date().toISOString() + ' ' + fail2banTag +
                    ' blocked ip=' + realIp + ' path=' + req.path);
      }
      if (req.path.startsWith('/api/')) {
        return res.status(429).json({ ok:false, error: message, retryAfter: result.retryAfter });
      }
      return res.status(429).send('<h1>429 Too Many Requests</h1><p>' + message + '</p><p>Retry after ' + result.retryAfter + 's</p>');
    }
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    next();
  };
}

// ===== 🛡️  Mục 19 + 22: NAMED LIMITERS cho từng route attack-surface =====
// Mỗi limiter tự lookup IP+identifier để giới hạn FINE-GRAINED (không chỉ theo IP)
const privacyMod = require('./privacy');

function _keyByIpAndField(field) {
  return function(req) {
    const ipHash = privacyMod.getHashedIp(req);
    const v = ((req.body && req.body[field]) || '').toString().toLowerCase().trim().slice(0, 64);
    return ipHash + ':' + v;
  };
}

// Login: 5 lần / 15 phút, fail2ban tag = AUTH_LOGIN
const loginStrictLimiter = createLimiter({
  max: 5, windowMs: 15*60*1000,
  message: 'Quá nhiều lần đăng nhập sai. Đợi 15 phút.',
  keyGenerator: _keyByIpAndField('username'),
  fail2banTag: 'AUTH_LOGIN'
});
// Register: 3/giờ/IP
const registerStrictLimiter = createLimiter({
  max: 3, windowMs: 60*60*1000,
  message: 'Bạn đã đăng ký quá nhiều tài khoản. Đợi 1 giờ.',
  fail2banTag: 'AUTH_REGISTER'
});
// OTP send: 3/giờ/(IP+phone)
const otpLimiter = createLimiter({
  max: 3, windowMs: 60*60*1000,
  message: 'Quá nhiều OTP. Đợi 1 giờ.',
  keyGenerator: _keyByIpAndField('phone'),
  fail2banTag: 'OTP_SEND'
});
// Forgot password: 3/giờ/(IP+email)
const forgotPwLimiter = createLimiter({
  max: 3, windowMs: 60*60*1000,
  message: 'Quá nhiều lần thử. Đợi 1 giờ.',
  keyGenerator: _keyByIpAndField('email'),
  fail2banTag: 'AUTH_FORGOT'
});
// Admin login: NGHIÊM NGẶT 3 lần / 30 phút
const adminLoginLimiter = createLimiter({
  max: 3, windowMs: 30*60*1000,
  message: 'Quá nhiều lần thử admin. Đợi 30 phút.',
  keyGenerator: _keyByIpAndField('username'),
  fail2banTag: 'ADMIN_LOGIN'
});
// Chat send: 20 msg / 1 phút (rộng để chat thật không bị chặn)
const chatSendLimiter = createLimiter({
  max: 20, windowMs: 60*1000,
  message: 'Bạn nhắn quá nhanh, slow down.',
  fail2banTag: null  // không log fail2ban (spam thường, không phải attack)
});
// 2FA verify: 5 lần / 5 phút
const twoFaLimiter = createLimiter({
  max: 5, windowMs: 5*60*1000,
  message: 'Quá nhiều lần nhập 2FA sai.',
  fail2banTag: 'ADMIN_2FA'
});

// ===== 2FA TOTP =====
function generate2FASecret(label) {
  const secret = speakeasy.generateSecret({
    name: label || 'XOSO66 Admin',
    issuer: 'XOSO66 TV',
    length: 20
  });
  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url
  };
}
async function generate2FAQRCode(otpauthUrl) {
  return await qrcode.toDataURL(otpauthUrl);
}
function verify2FAToken(secret, token) {
  if (!secret || !token) return false;
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: String(token),
    window: 1 // allow 30s drift
  });
}

module.exports = {
  hashPassword, verifyPassword,
  signToken, verifyToken,
  rateLimit, rateLimitShared, resetRateLimit, createLimiter,
  // 🛡️ Mục 19 + 22: named limiters
  loginStrictLimiter, registerStrictLimiter, otpLimiter,
  forgotPwLimiter, adminLoginLimiter, chatSendLimiter, twoFaLimiter,
  generate2FASecret, generate2FAQRCode, verify2FAToken,
  JWT_SECRET
};

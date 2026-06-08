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

// ===== RATE LIMITING (sliding window in-memory) =====
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

// Express middleware factory
function createLimiter(opts) {
  const max = opts.max || 5;
  const windowMs = opts.windowMs || 60000;
  // 🔒 PRIVACY: rate limit dùng IP HASH (không lưu IP thật vào memory)
  const privacy = require('./privacy');
  const keyGen = opts.keyGenerator || (req => privacy.getHashedIp(req));
  const message = opts.message || 'Too many requests, please try again later';
  return function (req, res, next) {
    const key = keyGen(req);
    const result = rateLimit(key, max, windowMs);
    res.setHeader('X-RateLimit-Limit', String(max));
    if (result.blocked) {
      res.setHeader('Retry-After', String(result.retryAfter));
      if (req.path.startsWith('/api/')) {
        return res.status(429).json({ ok:false, error: message, retryAfter: result.retryAfter });
      }
      return res.status(429).send('<h1>429 Too Many Requests</h1><p>' + message + '</p><p>Retry after ' + result.retryAfter + 's</p>');
    }
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    next();
  };
}

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
  rateLimit, resetRateLimit, createLimiter,
  generate2FASecret, generate2FAQRCode, verify2FAToken,
  JWT_SECRET
};

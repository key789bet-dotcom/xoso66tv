/**
 * OTP store in-memory voi TTL + rate limit chong spam.
 * Key thuong la email/SDT cua user.
 */
const TTL_MS         = 5 * 60 * 1000; // OTP song 5 phut
const MAX_ATTEMPTS   = 5;             // sai 5 lan -> invalid
const RESEND_COOL_MS = 60 * 1000;     // moi 60s moi cho gui lai

const store = new Map();  // key -> { code, exp, attempts, lastSentAt }
const verified = new Map(); // key -> exp (token de cho phep reset password)

function genCode() {
  return String(Math.floor(100000 + Math.random()*900000));
}

function canResend(key) {
  const rec = store.get(key);
  if (!rec) return { ok: true, wait: 0 };
  const elapsed = Date.now() - rec.lastSentAt;
  if (elapsed >= RESEND_COOL_MS) return { ok: true, wait: 0 };
  return { ok: false, wait: RESEND_COOL_MS - elapsed };
}

function issue(key) {
  const code = genCode();
  const now = Date.now();
  store.set(key, { code, exp: now + TTL_MS, attempts: 0, lastSentAt: now });
  return { code, ttl: TTL_MS };
}

function verify(key, input) {
  const rec = store.get(key);
  if (!rec) return { ok: false, message: 'Ma OTP khong ton tai hoac da het han' };
  if (Date.now() > rec.exp) { store.delete(key); return { ok: false, message: 'Ma OTP da het han' }; }
  if (rec.attempts >= MAX_ATTEMPTS) { store.delete(key); return { ok: false, message: 'Ban da nhap sai qua nhieu lan, vui long gui lai OTP' }; }
  rec.attempts++;
  if (String(input) !== rec.code) return { ok: false, message: 'Ma OTP khong dung (con '+(MAX_ATTEMPTS-rec.attempts)+' lan thu)' };
  // OK - mark verified, cho phep reset password trong 10 phut
  store.delete(key);
  const token = require('crypto').randomBytes(16).toString('hex');
  verified.set(token, { key, exp: Date.now() + 10*60*1000 });
  return { ok: true, token };
}

function consumeResetToken(token) {
  const rec = verified.get(token);
  if (!rec) return null;
  if (Date.now() > rec.exp) { verified.delete(token); return null; }
  verified.delete(token);
  return rec.key;
}

// Cleanup dinh ky
setInterval(function(){
  const now = Date.now();
  store.forEach(function(v, k){ if (now > v.exp) store.delete(k); });
  verified.forEach(function(v, k){ if (now > v.exp) verified.delete(k); });
}, 60*1000);

module.exports = { issue, verify, canResend, consumeResetToken, TTL_MS, RESEND_COOL_MS };

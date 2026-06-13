/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🛡️  CLOUDFLARE TURNSTILE — Mục 20                                ║
 * ║                                                                    ║
 * ║ Free CAPTCHA service từ Cloudflare. Privacy-friendly, no puzzle.  ║
 * ║                                                                    ║
 * ║ Setup:                                                             ║
 * ║   1. https://dash.cloudflare.com → Turnstile → Add site            ║
 * ║   2. Domain: xoso66tv.com, Widget mode: Managed                    ║
 * ║   3. Copy Site Key + Secret Key                                    ║
 * ║   4. Add vào .env:                                                 ║
 * ║        TURNSTILE_SITE_KEY=0x4AAA...                                ║
 * ║        TURNSTILE_SECRET_KEY=0x4AAA...                              ║
 * ║                                                                    ║
 * ║ Usage:                                                             ║
 * ║   const { verify } = require('./lib/turnstile');                  ║
 * ║   const result = await verify(req.body.cf_token, req.ip);         ║
 * ║   if (!result.success) return res.status(400).json({...});       ║
 * ║                                                                    ║
 * ║ Graceful fallback: nếu chưa cấu hình SITE_KEY → skip verify       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
const https = require('https');

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const SITE_KEY   = process.env.TURNSTILE_SITE_KEY   || '';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Test keys (Cloudflare provides for dev)
//   Always passes: 1x00000000000000000000AA / 1x0000000000000000000000000000000AA
//   Always fails:  2x00000000000000000000AB / 2x0000000000000000000000000000000AA

function isConfigured() {
  return !!(SECRET_KEY && SITE_KEY);
}

function getSiteKey() {
  return SITE_KEY;
}

/**
 * Verify Turnstile token
 * @param {string} token - cf-turnstile-response từ frontend
 * @param {string} clientIp - optional, IP của user (cho fraud detection)
 * @returns {Promise<{success:boolean, errorCodes:string[], action?:string}>}
 */
function verify(token, clientIp) {
  if (!SECRET_KEY) {
    // Chưa cấu hình → cho qua (development mode)
    console.warn('[TURNSTILE] ⚠️  SECRET_KEY not set → skip verify');
    return Promise.resolve({ success: true, skipped: true });
  }
  if (!token || typeof token !== 'string') {
    return Promise.resolve({ success: false, errorCodes: ['missing-input-response'] });
  }

  return new Promise(function(resolve) {
    const body = new URLSearchParams({
      secret: SECRET_KEY,
      response: token,
      remoteip: clientIp || ''
    }).toString();

    const req = https.request(VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 5000
    }, function(res) {
      let raw = '';
      res.on('data', function(c){ raw += c; });
      res.on('end', function() {
        try {
          const json = JSON.parse(raw);
          resolve({
            success: !!json.success,
            errorCodes: json['error-codes'] || [],
            challenge_ts: json.challenge_ts,
            hostname: json.hostname,
            action: json.action
          });
        } catch (e) {
          console.warn('[TURNSTILE] parse fail:', e.message);
          resolve({ success: false, errorCodes: ['parse-error'] });
        }
      });
    });
    req.on('error', function(e) {
      console.warn('[TURNSTILE] request fail:', e.message);
      resolve({ success: false, errorCodes: ['network-error'] });
    });
    req.on('timeout', function() {
      req.destroy();
      resolve({ success: false, errorCodes: ['timeout'] });
    });
    req.write(body);
    req.end();
  });
}

/**
 * Express middleware factory
 * Usage: app.post('/route', turnstile.middleware(), handler)
 */
function middleware(opts) {
  opts = opts || {};
  const tokenField = opts.tokenField || 'cf_token';
  return async function(req, res, next) {
    // Skip nếu chưa cấu hình
    if (!isConfigured()) return next();
    // Skip cho admin bypass (vd dev test)
    if (opts.skipIf && opts.skipIf(req)) return next();

    const token = (req.body && req.body[tokenField]) ||
                  req.headers['cf-turnstile-response'] ||
                  '';
    const ip = req.headers['cf-connecting-ip'] || req.ip || '';
    const result = await verify(token, ip);

    if (!result.success) {
      console.warn('[TURNSTILE] verify failed:',
                   result.errorCodes.join(',') || 'unknown',
                   'ip=' + ip);
      if (req.path.startsWith('/api/')) {
        return res.status(400).json({
          ok: false,
          error: 'Vui lòng hoàn thành xác minh CAPTCHA',
          errorCodes: result.errorCodes
        });
      }
      return res.status(400).send(
        '<h1>🛡️ CAPTCHA Failed</h1>' +
        '<p>Vui lòng quay lại và hoàn thành xác minh.</p>' +
        '<a href="' + (req.headers.referer || '/') + '">← Quay lại</a>'
      );
    }
    req.turnstile = result;
    next();
  };
}

module.exports = { verify, middleware, isConfigured, getSiteKey, SITE_KEY };

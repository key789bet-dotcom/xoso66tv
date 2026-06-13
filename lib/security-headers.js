/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🛡️  SECURITY HEADERS — Mục 18: Helmet + CSP                       ║
 * ║                                                                    ║
 * ║ Bảo vệ:                                                            ║
 * ║   - XSS (Content-Security-Policy)                                  ║
 * ║   - Clickjacking (X-Frame-Options + frame-ancestors)              ║
 * ║   - MIME sniffing (X-Content-Type-Options)                        ║
 * ║   - HTTPS enforcement (HSTS 1 year preload)                       ║
 * ║   - Referrer leak (Referrer-Policy strict-origin)                 ║
 * ║                                                                    ║
 * ║ CSP design:                                                        ║
 * ║   - 'unsafe-inline' cho script + style: BẮT BUỘC vì code legacy   ║
 * ║     có nhiều inline <script> trong EJS. Sau này refactor → nonce. ║
 * ║   - 'unsafe-eval' cho flv.js + hls.js parser                      ║
 * ║   - Cho phép Sentry, Cloudflare, jsdelivr, qt99.click (partner)   ║
 * ║                                                                    ║
 * ║ ENV:                                                               ║
 * ║   CSP_REPORT_ONLY=1  → chỉ log violation, không block (test mode) ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
let helmet = null;
try { helmet = require('helmet'); }
catch (e) { console.warn('[SEC-HEADERS] ⚠️  helmet not installed → run: npm install helmet'); }

const REPORT_ONLY = process.env.CSP_REPORT_ONLY === '1';

function getCspDirectives() {
  return {
    defaultSrc: ["'self'"],

    // Scripts: self + inline (EJS legacy) + eval (flv.js/hls.js) + trusted CDNs
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://cdn.jsdelivr.net',
      'https://cdnjs.cloudflare.com',
      'https://cdn.tailwindcss.com',
      'https://js.sentry-cdn.com',
      'https://browser.sentry-cdn.com',
      'https://*.sentry-cdn.com',
      'https://static.cloudflareinsights.com'
    ],
    scriptSrcAttr: ["'unsafe-inline'"],  // onclick="..." in EJS

    // Styles: self + inline (Tailwind dynamic + EJS) + jsdelivr
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://cdn.jsdelivr.net',
      'https://cdn.tailwindcss.com',
      'https://fonts.googleapis.com'
    ],

    // Images: self + data: + blob: + all HTTPS (avatars, badges, partner logos)
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],

    // Fonts: self + Google Fonts
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],

    // XHR/fetch: self + APIs em dùng
    connectSrc: [
      "'self'",
      'https://xoso66tv.com',
      'https://live.xoso66tv.com',
      'wss://xoso66tv.com',
      'wss://live.xoso66tv.com',
      'https://api.thethaoviet.vip',
      'https://api.telegram.org',
      'https://*.ingest.us.sentry.io',
      'https://*.ingest.sentry.io',
      // CDN source maps (chỉ load khi DevTools mở, vẫn cần whitelist để không spam console)
      'https://cdn.jsdelivr.net',
      'https://cdnjs.cloudflare.com'
    ],

    // Media (video streaming): self + FLV/HLS subdomain
    mediaSrc: ["'self'", 'https://live.xoso66tv.com', 'blob:', 'data:'],

    // Web Workers (FLV.js MSE)
    workerSrc: ["'self'", 'blob:'],
    childSrc: ["'self'", 'blob:'],

    // iframe: chỉ self (anti-clickjacking)
    frameAncestors: ["'self'"],
    frameSrc: ["'self'", 'https://www.google.com', 'https://challenges.cloudflare.com'],

    // Form submit: self + partner qt99.click (cược ngay button)
    formAction: ["'self'", 'https://qt99.click', 'https://*.qt99.click'],

    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: []
  };
}

function attachSecurityHeaders(app) {
  if (!helmet) {
    console.warn('[SEC-HEADERS] ⚠️  Skipped (helmet not installed)');
    return false;
  }

  app.use(helmet({
    // HSTS: force HTTPS 1 year (subdomains + preload)
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },

    // X-Content-Type-Options: nosniff
    noSniff: true,

    // X-Frame-Options: SAMEORIGIN — anti-clickjacking fallback (CSP frameAncestors mạnh hơn)
    frameguard: { action: 'sameorigin' },

    // Referrer-Policy: strict-origin-when-cross-origin
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // X-Permitted-Cross-Domain-Policies: none (chặn Flash/PDF)
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    // X-DNS-Prefetch-Control: enable (tăng tốc DNS lookup)
    dnsPrefetchControl: { allow: true },

    // X-Download-Options: noopen (IE legacy)
    ieNoOpen: true,

    // Origin-Agent-Cluster: ?1
    originAgentCluster: true,

    // X-XSS-Protection: 0 (deprecated, em dùng CSP thay)
    xssFilter: false,

    // CSP — main protection
    contentSecurityPolicy: {
      useDefaults: false,
      directives: getCspDirectives(),
      reportOnly: REPORT_ONLY
    },

    // Tắt COEP — FLV stream từ live.xoso66tv.com KHÔNG có CORP header → COEP sẽ block
    crossOriginEmbedderPolicy: false,

    // CORP: cross-origin (cho phép xoso66tv.com load resource từ live.xoso66tv.com)
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    // COOP: same-origin (anti-tabnabbing) — KHÔNG block popup nội bộ
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
  }));

  console.log('[SEC-HEADERS] ✅ Helmet + CSP attached' + (REPORT_ONLY ? ' (REPORT-ONLY mode)' : ''));
  return true;
}

// Endpoint nhận CSP violation reports (dev/debug)
function cspReportEndpoint(req, res) {
  try {
    const report = req.body || {};
    console.warn('[CSP-VIOLATION]', JSON.stringify(report).slice(0, 500));
  } catch (_) {}
  res.status(204).end();
}

module.exports = { attachSecurityHeaders, cspReportEndpoint, getCspDirectives };

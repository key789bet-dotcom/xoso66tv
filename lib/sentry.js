/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ SENTRY — Error monitoring cho Node.js server                  ║
 * ║                                                                ║
 * ║ Strategy:                                                      ║
 * ║   - Init từ ENV SENTRY_DSN (KHÔNG hardcode để dễ rotate)       ║
 * ║   - Sample rate 100% cho ERRORS, 0% cho traces (giữ quota)    ║
 * ║   - Filter noise: bot 404, network err, broken pipe, etc.     ║
 * ║   - Safe: nếu chưa cấu hình DSN → no-op (app vẫn chạy)        ║
 * ║                                                                ║
 * ║ Usage:                                                         ║
 * ║   const sentry = require('./lib/sentry');                      ║
 * ║   sentry.init();              // gọi 1 lần khi boot           ║
 * ║   sentry.attachExpressBefore(app); // RẤT SỚM, trước routes   ║
 * ║   sentry.attachExpressAfter(app);  // SAU routes, trước error handler║
 * ║   sentry.captureException(err);    // manual capture          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
let Sentry = null;
try { Sentry = require('@sentry/node'); }
catch (e) { console.warn('[SENTRY] ⚠️  @sentry/node chưa cài. Chạy: npm install @sentry/node'); }

const DSN = process.env.SENTRY_DSN || '';
const RELEASE = process.env.SENTRY_RELEASE || ('xoso66tv@' + (process.env.npm_package_version || '1.0.0'));
const ENV = process.env.NODE_ENV || 'production';
const DISABLED = process.env.SENTRY_DISABLED === '1';

let _initialized = false;

function init() {
  if (_initialized || !Sentry || !DSN || DISABLED) {
    if (!DSN && !DISABLED) console.warn('[SENTRY] ⚠️  SENTRY_DSN not set in .env → disabled');
    return false;
  }
  try {
    Sentry.init({
      dsn: DSN,
      release: RELEASE,
      environment: ENV,

      // ⚡ QUOTA SAFE — chỉ capture errors, KHÔNG capture performance traces (Mục 9 dùng Prometheus)
      tracesSampleRate: 0,

      // Lọc noise
      ignoreErrors: [
        // Browser extensions
        'top.GLOBALS', 'ResizeObserver loop limit exceeded',
        // Network errors mặc nhiên (user mất WiFi)
        'NetworkError', 'Failed to fetch', 'Load failed',
        // Browser quirks
        'Non-Error promise rejection captured',
        // Cancel requests (user navigate away)
        'AbortError', 'The operation was aborted',
        // Bots crawl 404
        'EPIPE', 'ECONNRESET', 'ECONNREFUSED',
        // Express 404 (handled by 404 page, không cần report)
        'NotFoundError'
      ],

      // Sanitize sensitive data
      beforeSend: function(event, hint) {
        // Bỏ password, token khỏi request body nếu có
        try {
          if (event.request && event.request.data) {
            const d = event.request.data;
            if (typeof d === 'object') {
              ['password','token','otp','captcha','privateKey','apiKey','dsn'].forEach(k => {
                if (d[k]) d[k] = '[REDACTED]';
              });
            }
          }
          // Bỏ cookie chứa session
          if (event.request && event.request.cookies) {
            event.request.cookies = '[REDACTED]';
          }
        } catch (_) {}
        return event;
      },

      // Skip lỗi từ static asset 404
      beforeSendTransaction: () => null
    });
    _initialized = true;
    console.log('[SENTRY] ✅ Initialized', ENV, 'release=' + RELEASE);
    return true;
  } catch (e) {
    console.error('[SENTRY] ❌ Init fail:', e.message);
    return false;
  }
}

// Express middleware — phải dùng SAU init()
// v8 API: chỉ cần expressErrorHandler() ở cuối routes
function attachExpressBefore(app) {
  if (!Sentry || !_initialized) return;
  // v8 tự attach request handler khi init() — không cần manual
  // Giữ hàm này để compat với code cũ
}

function attachExpressAfter(app) {
  if (!Sentry || !_initialized) return;
  try {
    Sentry.setupExpressErrorHandler(app);
    console.log('[SENTRY] ✅ Express error handler attached');
  } catch (e) {
    console.warn('[SENTRY] attachExpressAfter fail:', e.message);
  }
}

function captureException(err, context) {
  if (!Sentry || !_initialized) return;
  try {
    if (context) Sentry.withScope(scope => {
      Object.keys(context).forEach(k => scope.setExtra(k, context[k]));
      Sentry.captureException(err);
    });
    else Sentry.captureException(err);
  } catch (_) {}
}

function captureMessage(msg, level) {
  if (!Sentry || !_initialized) return;
  try { Sentry.captureMessage(msg, level || 'info'); } catch (_) {}
}

function isReady() { return _initialized; }

module.exports = {
  init, attachExpressBefore, attachExpressAfter,
  captureException, captureMessage, isReady,
  DSN_CONFIGURED: !!DSN
};

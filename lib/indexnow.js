/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🚀 IndexNow API integration                                       ║
 * ║                                                                    ║
 * ║ Push URL mới đến Bing + Yandex + Seznam + Naver instant indexing  ║
 * ║ Không cần đợi crawler — Bing crawl trong < 60s.                   ║
 * ║                                                                    ║
 * ║ Spec: https://www.indexnow.org/documentation                      ║
 * ║ Cách dùng:                                                        ║
 * ║   const indexNow = require('./lib/indexnow');                     ║
 * ║   indexNow.submitUrls(['/tin-tuc/abc']);                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const HOST       = 'xoso66tv.com';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const KEY_FILE   = path.join(PUBLIC_DIR, 'indexnow-key.txt');

// Lazy generate or load 32-char hex API key
let API_KEY = '';
try {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) {
    API_KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
  }
  if (!/^[a-f0-9]{8,128}$/i.test(API_KEY)) {
    API_KEY = crypto.randomBytes(16).toString('hex');  // 32 chars
    fs.writeFileSync(KEY_FILE, API_KEY);
    console.log('[IndexNow] Generated new key:', API_KEY);
  }
  // IndexNow yêu cầu file <key>.txt ở root chứa chính key đó
  const VERIFY_FILE = path.join(PUBLIC_DIR, API_KEY + '.txt');
  if (!fs.existsSync(VERIFY_FILE)) {
    fs.writeFileSync(VERIFY_FILE, API_KEY);
  }
} catch (e) {
  console.warn('[IndexNow] init error:', e.message);
}

const KEY_LOCATION = 'https://' + HOST + '/' + API_KEY + '.txt';

// Endpoint: Bing là master, sẽ broadcast cho Yandex, Seznam, Naver
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';

/**
 * Submit 1 hoặc nhiều URL tới IndexNow
 * @param {string|string[]} urls - URL hoặc array URL (relative hoặc absolute)
 * @returns {Promise<{ok:boolean, status?:number, error?:string}>}
 */
function submitUrls(urls) {
  if (!API_KEY) return Promise.resolve({ ok:false, error:'No API key' });
  if (typeof urls === 'string') urls = [urls];
  if (!Array.isArray(urls) || !urls.length) {
    return Promise.resolve({ ok:false, error:'No URLs to submit' });
  }
  // Normalize: relative → absolute
  const absUrls = urls
    .filter(u => typeof u === 'string' && u.trim())
    .map(u => u.startsWith('http') ? u : ('https://' + HOST + u))
    .slice(0, 10000);  // IndexNow limit: 10k URLs/request

  if (!absUrls.length) {
    return Promise.resolve({ ok:false, error:'All URLs invalid after normalize' });
  }

  const body = JSON.stringify({
    host: HOST,
    key: API_KEY,
    keyLocation: KEY_LOCATION,
    urlList: absUrls
  });

  return new Promise((resolve) => {
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'xoso66tv-indexnow/1.0'
      },
      timeout: 10000
    };

    const req = https.request(INDEXNOW_ENDPOINT, opts, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        // 200 = OK | 202 = Accepted | 400 = Bad request | 403 = Wrong key
        // 422 = URL not from host | 429 = Rate limited
        if (ok) {
          console.log('[IndexNow] ✅', res.statusCode, absUrls.length, 'URLs submitted');
        } else {
          console.warn('[IndexNow] ❌', res.statusCode, chunks.slice(0, 200));
        }
        resolve({ ok, status: res.statusCode, body: chunks, count: absUrls.length });
      });
    });

    req.on('error', (e) => {
      console.warn('[IndexNow] network error:', e.message);
      resolve({ ok:false, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok:false, error:'timeout after 10s' });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Submit toàn bộ URL chính của site (lúc deploy / khởi tạo)
 */
function submitAllCoreUrls() {
  const core = [
    '/',
    '/tin-tuc',
    '/lich-phat-song',
    '/the-thao/bong-da',
    '/the-thao/bong-ro',
    '/the-thao/tennis',
    '/idol-live',
    '/su-kien',
    '/qua-tang',
    '/video-noi-bat',
    '/mini-game'
  ];
  return submitUrls(core);
}

module.exports = {
  submitUrls,
  submitAllCoreUrls,
  getKey: () => API_KEY,
  getKeyLocation: () => KEY_LOCATION,
  get API_KEY() { return API_KEY; }
};

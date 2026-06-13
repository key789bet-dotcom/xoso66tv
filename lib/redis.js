/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ REDIS CLIENT — Singleton với graceful fallback                 ║
 * ║                                                                ║
 * ║ Strategy:                                                      ║
 * ║   - Boot: try connect Redis localhost:6379                     ║
 * ║   - Success: enabled() = true, dùng làm cache primary          ║
 * ║   - Fail:    enabled() = false, app vẫn chạy (in-memory fallback)║
 * ║                                                                ║
 * ║ Helpers exposed:                                               ║
 * ║   - isReady()           : check Redis alive                    ║
 * ║   - get(key)            : async, null nếu không có hoặc fail   ║
 * ║   - set(key, val, ttlS) : async, set với TTL giây              ║
 * ║   - del(key)            : async, xoá key                       ║
 * ║   - mget(keys)          : async, batch get                     ║
 * ║   - publish(channel, msg) / subscribe(channel, cb)             ║
 * ║                                                                ║
 * ║ Tất cả async, không throw. Lỗi → log + trả null/false.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
let Redis = null;
try { Redis = require('ioredis'); }
catch (e) { console.warn('[REDIS] ⚠️  ioredis chưa cài. Chạy: npm install ioredis'); }

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);
const REDIS_DISABLED = process.env.REDIS_DISABLED === '1';

let _client = null;     // main read/write client
let _subscriber = null; // dedicated subscriber (pub/sub yêu cầu connection riêng)
let _publisher  = null; // dedicated publisher (recommended)
let _ready = false;
let _initFailed = false;
let _subscribers = new Map(); // channel -> [callbacks]

function _connectOnce() {
  if (!Redis || REDIS_DISABLED || _client || _initFailed) return;

  try {
    const opts = {
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD || undefined,
      db: REDIS_DB,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 10) {
          console.warn('[REDIS] ❌ Connect fail 10x, dừng retry — app dùng in-memory fallback');
          return null; // stop retry
        }
        return Math.min(times * 200, 2000);
      },
      reconnectOnError: () => true,
      maxRetriesPerRequest: 2
    };

    _client = new Redis(opts);

    _client.on('connect', () => {
      _ready = true;
      console.log('[REDIS] ✅ Connected', REDIS_HOST + ':' + REDIS_PORT);
    });
    _client.on('ready',   () => { _ready = true; });
    _client.on('error',   (e) => {
      _ready = false;
      // Throttle log
      if (!_client._lastErrAt || Date.now() - _client._lastErrAt > 5000) {
        console.warn('[REDIS] ⚠️ ', e.code || e.message);
        _client._lastErrAt = Date.now();
      }
    });
    _client.on('end',     () => { _ready = false; });

    // Dedicated subscriber (read-only) — chỉ tạo khi cần
    // Lazy create trong subscribe()
  } catch (e) {
    _initFailed = true;
    console.error('[REDIS] ❌ Init fail:', e.message);
  }
}

_connectOnce();

// ════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════

function isReady() { return !!_ready && !!_client; }

async function get(key) {
  if (!isReady()) return null;
  try {
    const v = await _client.get(key);
    if (v == null) return null;
    // Try parse JSON, fallback to raw string
    try { return JSON.parse(v); } catch (_) { return v; }
  } catch (e) {
    console.warn('[REDIS] get fail:', key, e.message);
    return null;
  }
}

async function set(key, val, ttlSeconds) {
  if (!isReady()) return false;
  try {
    const s = typeof val === 'string' ? val : JSON.stringify(val);
    if (ttlSeconds && ttlSeconds > 0) {
      await _client.set(key, s, 'EX', ttlSeconds);
    } else {
      await _client.set(key, s);
    }
    return true;
  } catch (e) {
    console.warn('[REDIS] set fail:', key, e.message);
    return false;
  }
}

async function del(key) {
  if (!isReady()) return false;
  try { await _client.del(key); return true; }
  catch (e) { console.warn('[REDIS] del fail:', key, e.message); return false; }
}

async function mget(keys) {
  if (!isReady() || !keys || !keys.length) return new Array(keys ? keys.length : 0).fill(null);
  try {
    const arr = await _client.mget(keys);
    return arr.map(v => {
      if (v == null) return null;
      try { return JSON.parse(v); } catch (_) { return v; }
    });
  } catch (e) {
    console.warn('[REDIS] mget fail:', e.message);
    return new Array(keys.length).fill(null);
  }
}

async function incr(key, ttlSeconds) {
  if (!isReady()) return null;
  try {
    const n = await _client.incr(key);
    if (n === 1 && ttlSeconds) await _client.expire(key, ttlSeconds);
    return n;
  } catch (e) { console.warn('[REDIS] incr fail:', key, e.message); return null; }
}

// Pub/sub helpers
async function publish(channel, msg) {
  if (!isReady()) return false;
  try {
    if (!_publisher) _publisher = _client.duplicate();
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    await _publisher.publish(channel, s);
    return true;
  } catch (e) { console.warn('[REDIS] publish fail:', channel, e.message); return false; }
}

function subscribe(channel, callback) {
  if (!isReady()) return false;
  try {
    if (!_subscriber) {
      _subscriber = _client.duplicate();
      _subscriber.on('message', (ch, raw) => {
        const cbs = _subscribers.get(ch) || [];
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) {}
        for (const cb of cbs) {
          try { cb(parsed); } catch (e) { console.warn('[REDIS] sub callback err:', e.message); }
        }
      });
    }
    const arr = _subscribers.get(channel) || [];
    if (arr.length === 0) _subscriber.subscribe(channel);
    arr.push(callback);
    _subscribers.set(channel, arr);
    return true;
  } catch (e) { console.warn('[REDIS] subscribe fail:', channel, e.message); return false; }
}

// Disconnect tất cả (graceful shutdown)
async function disconnect() {
  try { if (_subscriber) await _subscriber.quit(); } catch (_){}
  try { if (_publisher)  await _publisher.quit();  } catch (_){}
  try { if (_client)     await _client.quit();     } catch (_){}
  _ready = false;
}

module.exports = { isReady, get, set, del, mget, incr, publish, subscribe, disconnect };

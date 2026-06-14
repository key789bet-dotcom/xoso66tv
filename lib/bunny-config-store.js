/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ BUNNY CDN CONFIG STORE                                        ║
 * ║                                                                ║
 * ║ Lưu cấu hình BunnyCDN Stream trong data/bunny-config.json     ║
 * ║   - enabled: master toggle ON/OFF                              ║
 * ║   - libraryId: Stream Library ID (số 6-7 chữ số)              ║
 * ║   - apiKey: BunnyCDN API Key (UUID)                            ║
 * ║   - cdnHostname: Pull Zone CDN URL (vz-xxxx.b-cdn.net)         ║
 * ║   - rtmpUrl: RTMP push URL (rtmps://live.bunnycdn.com/live)    ║
 * ║                                                                ║
 * ║ Admin update qua /admin/bunny-stream UI                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'bunny-config.json');

const DEFAULT_CONFIG = {
  enabled: false,
  libraryId: '',
  apiKey: '',
  cdnHostname: '',
  rtmpUrl: 'rtmps://live.bunnycdn.com/live',
  updatedAt: null
};

function _load() {
  try {
    if (!fs.existsSync(FILE)) return Object.assign({}, DEFAULT_CONFIG);
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Object.assign({}, DEFAULT_CONFIG, data);
  } catch (e) {
    return Object.assign({}, DEFAULT_CONFIG);
  }
}

function _save(data) {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[bunny-config] save error:', e.message);
  }
}

module.exports = {
  get() { return _load(); },

  /** Bunny đã được cấu hình + bật chưa */
  isReady() {
    const c = _load();
    return !!(c.enabled && c.libraryId && c.apiKey && c.cdnHostname);
  },

  /** Cập nhật config (admin) */
  update(patch) {
    const c = _load();
    if (typeof patch.enabled === 'boolean')      c.enabled = patch.enabled;
    if (typeof patch.libraryId === 'string')     c.libraryId = patch.libraryId.trim();
    if (typeof patch.apiKey === 'string')        c.apiKey = patch.apiKey.trim();
    if (typeof patch.cdnHostname === 'string')   c.cdnHostname = patch.cdnHostname.trim().replace(/^https?:\/\//, '');
    if (typeof patch.rtmpUrl === 'string')       c.rtmpUrl = patch.rtmpUrl.trim();
    _save(c);
    return c;
  },

  /** Mask API key để hiển thị (chỉ show 8 ký tự đầu + cuối) */
  getMasked() {
    const c = _load();
    return Object.assign({}, c, {
      apiKey: c.apiKey ? (c.apiKey.slice(0, 8) + '...' + c.apiKey.slice(-4)) : ''
    });
  }
};

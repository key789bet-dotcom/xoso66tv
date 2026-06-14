/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ TAB ICONS STORE — 4 ảnh icon cho tab Hot/Thể thao/Idol/Casino║
 * ║                                                                ║
 * ║ Lưu trong data/tab-icons.json (đã gitignore):                 ║
 * ║   {                                                            ║
 * ║     hot:     "/uploads/tab-icons/xxx.png",                    ║
 * ║     thethao: "/uploads/tab-icons/yyy.png",                    ║
 * ║     idol:    "/uploads/tab-icons/zzz.png",                    ║
 * ║     casino:  "/uploads/tab-icons/www.png"                     ║
 * ║   }                                                            ║
 * ║                                                                ║
 * ║ Render logic ở tw-home.ejs:                                   ║
 * ║   - Có URL → <img>                                            ║
 * ║   - Không có URL → fallback emoji 🔥 ⚽ 👑 🎰                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'tab-icons.json');
const VALID_KEYS = ['hot', 'thethao', 'idol', 'casino', 'esport'];

function _load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function _save(data) {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[tab-icons-store] save error:', e.message);
  }
}

module.exports = {
  /** Trả về object 4 key, mỗi key có URL hoặc '' */
  list() {
    const d = _load();
    const out = {};
    VALID_KEYS.forEach(k => { out[k] = d[k] || ''; });
    return out;
  },
  /** Set URL cho 1 key */
  set(key, url) {
    if (VALID_KEYS.indexOf(key) === -1) return null;
    const d = _load();
    d[key] = String(url || '').slice(0, 500);
    _save(d);
    return d[key];
  },
  /** Xoá ảnh 1 key (fallback về emoji) */
  remove(key) {
    if (VALID_KEYS.indexOf(key) === -1) return false;
    const d = _load();
    const old = d[key];
    delete d[key];
    _save(d);
    return old || '';
  },
  VALID_KEYS
};

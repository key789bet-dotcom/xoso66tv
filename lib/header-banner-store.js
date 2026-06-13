/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ HEADER BANNER STORE — banner thông báo trên cùng header       ║
 * ║                                                                ║
 * ║ Lưu trong data/header-banner.json:                             ║
 * ║   { enabled, image, link, alt, updatedAt }                     ║
 * ║                                                                ║
 * ║ - enabled: bật/tắt hiển thị                                    ║
 * ║ - image: URL ảnh banner (admin upload qua /admin/header-banner)║
 * ║ - link: URL khi user click (mặc định partner.promo)            ║
 * ║ - alt: text mô tả (SEO + accessibility)                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'header-banner.json');

function _load() {
  try {
    if (!fs.existsSync(FILE)) {
      return { enabled: false, image: '', link: '', alt: 'Khuyến mãi XOSO66', updatedAt: null };
    }
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    return { enabled: false, image: '', link: '', alt: 'Khuyến mãi XOSO66', updatedAt: null };
  }
}

function _save(data) {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[header-banner-store] save error:', e.message);
  }
}

module.exports = {
  get() { return _load(); },

  /** Có nên render banner ảnh không (enabled + có image) */
  isActive() {
    const d = _load();
    return !!d.enabled && !!d.image;
  },

  /** Cập nhật ảnh (kèm enable tự động lần đầu) */
  setImage(url) {
    const d = _load();
    const wasEmpty = !d.image;
    d.image = url;
    if (wasEmpty) d.enabled = true;
    _save(d);
    return d;
  },

  /** Cập nhật text + link + alt */
  update(patch) {
    const d = _load();
    if (typeof patch.link === 'string') d.link = patch.link.trim();
    if (typeof patch.alt === 'string')  d.alt  = patch.alt.trim() || 'Khuyến mãi XOSO66';
    _save(d);
    return d;
  },

  /** Bật/tắt master toggle */
  toggle(state) {
    const d = _load();
    d.enabled = !!state;
    _save(d);
    return d;
  },

  /** Xoá ảnh (giữ link/alt) */
  removeImage() {
    const d = _load();
    d.image = '';
    d.enabled = false;
    _save(d);
    return d;
  }
};

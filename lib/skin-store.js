// ╔══════════════════════════════════════════════════════════════╗
// ║ SKIN STORE — Quản lý skin overlay cho phòng live              ║
// ║ Lưu trong data/skin-config.json                                ║
// ║ - enabled: master toggle ON/OFF                                ║
// ║ - files: { slotId: '/static/img/skin/...' }                    ║
// ║ → CHỈ apply khi enabled=true VÀ có ít nhất 1 file uploaded    ║
// ╚══════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');

const SKIN_FILE = path.join(__dirname, '..', 'data', 'skin-config.json');

// Các slot skin chuẩn theo mockup
const SKIN_SLOTS = [
  { id: 'page-bg',      name: 'Nền page',                    size: '1920×1080', format: 'jpg/webp',  required: false },
  { id: 'top-header',   name: 'Banner thông báo trên cùng',  size: '1920×60',   format: 'png',       required: false },
  { id: 'sidebar-bg',   name: 'Nền sidebar trái',            size: '240×1080',  format: 'png',       required: false },
  { id: 'hero-banner',  name: 'Hero banner khuyến mãi',      size: '1400×140',  format: 'jpg/webp',  required: false },
  { id: 'player-frame', name: 'Khung viền VIDEO ⚠ trong suốt giữa', size: '1280×720', format: 'png', required: false },
  { id: 'logo-overlay', name: 'Logo góc trên player',        size: '200×60',    format: 'png',       required: false },
  { id: 'bottom-strip', name: 'Thanh dưới player',           size: '1280×60',   format: 'png',       required: false },
  { id: 'chat-header',  name: 'Header chat (tiêu đề)',       size: '400×60',    format: 'png',       required: false },
  { id: 'chat-frame',   name: 'Khung viền CHAT ⚠ trong suốt giữa',  size: '400×720',  format: 'png',  required: false },
  { id: 'chat-input',   name: 'Ô nhập tin nhắn',             size: '400×80',    format: 'png',       required: false }
];

function _load() {
  try {
    if (!fs.existsSync(SKIN_FILE)) return { enabled: false, files: {}, updatedAt: null };
    return JSON.parse(fs.readFileSync(SKIN_FILE, 'utf8'));
  } catch (e) {
    return { enabled: false, files: {}, updatedAt: null };
  }
}

function _save(data) {
  try {
    const dir = path.dirname(SKIN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(SKIN_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[skin-store] save error:', e.message);
  }
}

module.exports = {
  SLOTS: SKIN_SLOTS,

  /** Danh sách slot kèm trạng thái upload */
  list() {
    const data = _load();
    return SKIN_SLOTS.map(s => ({
      ...s,
      url: (data.files && data.files[s.id]) || null,
      uploaded: !!(data.files && data.files[s.id])
    }));
  },

  /** Config thô cho admin / view */
  config() {
    return _load();
  },

  /** Set 1 file slot. Tự enable lần đầu upload */
  setFile(id, url) {
    const data = _load();
    data.files = data.files || {};
    const wasEmpty = Object.keys(data.files).length === 0;
    data.files[id] = url;
    if (wasEmpty) data.enabled = true; // auto-on khi upload file đầu tiên
    _save(data);
    return data;
  },

  /** Xóa 1 file (không xóa file vật lý — chỉ unlink trong config) */
  removeFile(id) {
    const data = _load();
    if (data.files) delete data.files[id];
    _save(data);
    return data;
  },

  /** Bật/tắt master toggle */
  toggle(state) {
    const data = _load();
    data.enabled = !!state;
    _save(data);
    return data;
  },

  /** Có nên render skin overlay không? (enabled + có ít nhất 1 file) */
  isActive() {
    const data = _load();
    return !!data.enabled && data.files && Object.keys(data.files).length > 0;
  },

  /** Active config pass vào view — null nếu không active */
  activeConfig() {
    if (!this.isActive()) return null;
    return _load();
  }
};

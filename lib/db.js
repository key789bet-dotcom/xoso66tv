/**
 * Database JSON-file đơn giản cho admin panel.
 * - seed() trả về DB SẠCH (không có user/idol/blv ảo)
 * - save() tự backup file cũ → db.json.bak trước khi ghi đè
 * - load() corrupt → khôi phục từ .bak trước khi fallback seed
 *
 * Để khởi tạo dữ liệu thật (admin + yennhi):
 *   node scripts/init-db.js
 */
const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const DB_FILE   = path.join(DATA_DIR, 'db.json');
const DB_BACKUP = path.join(DATA_DIR, 'db.json.bak');

const VIP_TIERS = [
  { id:0, name:'Thuong',    color:'#8b93a3', minDeposit:0 },
  { id:1, name:'Silver',    color:'#c0c0c0', minDeposit:5000000 },
  { id:2, name:'Gold',      color:'#f1c40f', minDeposit:20000000 },
  { id:3, name:'Platinum',  color:'#9b59b6', minDeposit:50000000 },
  { id:4, name:'Diamond',   color:'#1abc9c', minDeposit:200000000 },
  { id:5, name:'Royal',     color:'#ff3b3b', minDeposit:1000000000 }
];

/**
 * SEED SẠCH - không có user/idol/blv ảo nào.
 * Sau khi server start lần đầu, chạy `node scripts/init-db.js` để tạo
 * admin + yennhi với bcrypt password đúng.
 */
function seed() {
  return {
    users: [],
    blvs: [],
    idols: [],
    obs: [],
    auditLog: []
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE, JSON.stringify(seed(), null, 2));
}

// ⚡ In-memory cache để tránh đọc disk mỗi request (50-100x nhanh hơn)
// TTL ngắn (2s) để vẫn pickup change từ file (script chạy ngoài, init-db, etc.)
let __cache = null;
let __cacheAt = 0;
const CACHE_TTL_MS = 2000;

function loadFromDisk() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('[DB] ❌ db.json corrupt:', e.message);
    if (fs.existsSync(DB_BACKUP)) {
      try {
        const backup = JSON.parse(fs.readFileSync(DB_BACKUP, 'utf8'));
        console.warn('[DB] ✅ Khôi phục từ db.json.bak (idols:', (backup.idols||[]).length, ', users:', (backup.users||[]).length, ')');
        try { fs.writeFileSync(DB_FILE, JSON.stringify(backup, null, 2)); } catch(_){}
        return backup;
      } catch (e2) {
        console.error('[DB] ❌ Backup cũng corrupt:', e2.message);
      }
    }
    console.warn('[DB] ⚠️  Dùng seed sạch (DB sẽ trống - cần chạy scripts/init-db.js)');
    return seed();
  }
}

function load() {
  const now = Date.now();
  if (__cache && (now - __cacheAt) < CACHE_TTL_MS) {
    // Trả về SHALLOW CLONE để không bị mutate cache trực tiếp (giữ tính chất immutable cho callers an toàn)
    // Nhưng vì save() được dùng để persist, callers thường modify rồi save → ta clone deep cho an toàn
    return JSON.parse(JSON.stringify(__cache));
  }
  __cache = loadFromDisk();
  __cacheAt = now;
  return JSON.parse(JSON.stringify(__cache));
}

function invalidateCache() { __cache = null; __cacheAt = 0; }

function save(db) {
  ensureFile();
  // Auto-backup file cũ trước khi ghi đè
  try {
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, DB_BACKUP);
    }
  } catch (e) {
    console.error('[DB] ⚠️  Backup fail:', e.message);
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  // Update cache ngay lập tức để request sau dùng data mới
  __cache = JSON.parse(JSON.stringify(db));
  __cacheAt = Date.now();
}

function genId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 10); }
function genStreamKey(name) {
  var s = (name||'').toLowerCase().replace(/[^a-z0-9]/g, '');
  return 'sk_' + s.slice(0, 12) + '_' + Math.random().toString(36).slice(2, 10);
}

function audit(db, action, target, byUser) {
  db.auditLog.unshift({ id: genId('a'), at: Date.now(), action: action, target: target, by: byUser || 'admin' });
  if (db.auditLog.length > 500) db.auditLog = db.auditLog.slice(0, 500);
}

module.exports = { load, save, seed, invalidateCache, VIP_TIERS, genId, genStreamKey, audit };

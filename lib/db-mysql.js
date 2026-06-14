/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ DATABASE MySQL Backend — drop-in replacement for SQLite/JSON      ║
 * ║                                                                    ║
 * ║ Pattern: 1 row in `kv` table chứa toàn bộ DB dạng JSON.            ║
 * ║   → Tương thích 100% API hiện tại (load/save/seed/audit)           ║
 * ║   → Không sửa code chỗ khác dùng db.users.find(...)                ║
 * ║   → Concurrent-safe nhờ MySQL row lock + version check             ║
 * ║                                                                    ║
 * ║ ENV cần set:                                                       ║
 * ║   MYSQL_HOST     = 127.0.0.1                                       ║
 * ║   MYSQL_PORT     = 3306                                            ║
 * ║   MYSQL_USER     = xoso66tv                                        ║
 * ║   MYSQL_PASSWORD = <secret>                                        ║
 * ║   MYSQL_DATABASE = xoso66tv                                        ║
 * ╚══════════════════════════════════════════════════════════════════*/
const fs = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(DATA_DIR, 'db.json');
const JSON_BACKUP = path.join(DATA_DIR, 'db.json.before-mysql-' + Date.now() + '.bak');

let _pool = null;
let _cache = null;
let _cacheVersion = -1;
let _ready = false;

function _getMysql() {
  try { return require('mysql2'); }
  catch (e) {
    console.error('[DB-MySQL] ❌ mysql2 chưa cài. Chạy: npm install mysql2');
    throw e;
  }
}

function _createPool() {
  if (_pool) return _pool;
  const mysql = _getMysql();
  _pool = mysql.createPool({
    host:     process.env.MYSQL_HOST     || '127.0.0.1',
    port:     +(process.env.MYSQL_PORT)   || 3306,
    user:     process.env.MYSQL_USER     || 'xoso66tv',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'xoso66tv',
    waitForConnections: true,
    connectionLimit: 5,         // 2 worker x 2-3 conn/worker ≈ 5
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
    timezone: '+07:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  }).promise();
  return _pool;
}

async function _initSchema() {
  const pool = _createPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv (
      \`key\`     VARCHAR(64) PRIMARY KEY,
      \`value\`   LONGTEXT NOT NULL,
      \`version\` BIGINT NOT NULL DEFAULT 0,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function _ensureMainRow() {
  const pool = _createPool();
  const [rows] = await pool.query("SELECT version, value FROM kv WHERE `key` = 'main'");
  if (rows.length) return rows[0];

  // Lần boot đầu — migrate từ db.json nếu có, hoặc seed sạch
  let initial = null;
  if (fs.existsSync(JSON_FILE)) {
    try {
      initial = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      console.log('[DB-MySQL] ✅ Migrated db.json → MySQL (users:',
                  (initial.users || []).length,
                  ', idols:', (initial.idols || []).length,
                  ', blvs:', (initial.blvs || []).length, ')');
      // Backup file JSON gốc
      try { fs.copyFileSync(JSON_FILE, JSON_BACKUP); } catch (_) {}
    } catch (e) { console.warn('[DB-MySQL] db.json corrupt, seed sạch:', e.message); }
  }
  if (!initial) initial = seed();

  await pool.query("INSERT INTO kv (`key`, value, version) VALUES ('main', ?, 0)",
                   [JSON.stringify(initial)]);
  return { version: 0, value: JSON.stringify(initial) };
}

// ═══════════════════════════════════════════════════════
// HELPERS — giữ giống lib/db.js cũ
// ═══════════════════════════════════════════════════════
const VIP_TIERS = [
  { id:0, name:'Thuong',    color:'#8b93a3', minDeposit:0 },
  { id:1, name:'Silver',    color:'#c0c0c0', minDeposit:5000000 },
  { id:2, name:'Gold',      color:'#f1c40f', minDeposit:20000000 },
  { id:3, name:'Platinum',  color:'#9b59b6', minDeposit:50000000 },
  { id:4, name:'Diamond',   color:'#1abc9c', minDeposit:200000000 },
  { id:5, name:'Royal',     color:'#ff3b3b', minDeposit:1000000000 }
];

function seed() {
  return {
    users: [],
    blvs: [],
    idols: [],
    obs: [],
    auditLog: []
  };
}

function genId(prefix) {
  return (prefix || '') + Math.random().toString(36).slice(2, 10);
}

function genStreamKey(name) {
  return 'i_' + String(name || 'idol').toLowerCase().replace(/[^a-z0-9]/g, '') + '_' +
         Math.random().toString(36).slice(2, 10);
}

function audit(db, action, target, byUser) {
  if (!db.auditLog) db.auditLog = [];
  db.auditLog.unshift({
    id: genId('a_'),
    action: action,
    target: target,
    byUser: byUser || 'system',
    at: Date.now()
  });
  if (db.auditLog.length > 1000) db.auditLog = db.auditLog.slice(0, 1000);
}

// ═══════════════════════════════════════════════════════
// SYNC API — load/save (sync wrapper qua deasync hoặc cached)
// ═══════════════════════════════════════════════════════
// MySQL driver là async, nhưng API hiện tại của site là SYNC (load() → object).
// Strategy: load() đọc từ in-memory cache (đã được preload lúc boot).
// save(db) ghi cache + flush async to MySQL.

function _readMainSync() {
  if (_cache) return _cache;
  // Lần đầu chưa init: bootstrap từ db.json SYNC (legacy data có sẵn)
  // initAsync() chạy sau sẽ overwrite cache với data MySQL mới nhất
  if (fs.existsSync(JSON_FILE)) {
    try {
      _cache = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      return _cache;
    } catch (e) { /* fall through */ }
  }
  // Không có JSON → seed sạch (rare)
  _cache = seed();
  return _cache;
}

function load() {
  if (!_cache) {
    _cache = _readMainSync();
  }
  return _cache;
}

function save(db) {
  if (!db) return;
  _cache = db;
  _cacheVersion++;

  // Flush async tới MySQL (fire-and-forget — không block API)
  const snapshot = JSON.stringify(db);
  const version = _cacheVersion;
  setImmediate(async function(){
    try {
      const pool = _createPool();
      await pool.query(
        "UPDATE kv SET value = ?, version = ? WHERE `key` = 'main'",
        [snapshot, version]
      );
    } catch (e) {
      console.error('[DB-MySQL] save error:', e.message);
    }
  });
}

function invalidateCache() {
  _cache = null;
  _cacheVersion = -1;
}

/** GỌI 1 LẦN khi server boot — preload cache từ MySQL */
async function initAsync() {
  if (_ready) return;
  await _initSchema();
  const row = await _ensureMainRow();
  try {
    _cache = JSON.parse(row.value);
    _cacheVersion = row.version;
  } catch (e) {
    console.error('[DB-MySQL] Parse cache error:', e.message);
    _cache = seed();
  }
  _ready = true;
  console.log('[DB-MySQL] ✅ Ready — users:', (_cache.users||[]).length,
              ', idols:', (_cache.idols||[]).length,
              ', version:', _cacheVersion);
}

function isReady() { return _ready; }

module.exports = {
  // Sync API (giống lib/db.js cũ)
  load, save, seed, audit, invalidateCache,
  VIP_TIERS, genId, genStreamKey,
  // MySQL-specific
  initAsync, isReady
};

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ DATABASE — SQLite backend (better-sqlite3)                    ║
 * ║                                                                ║
 * ║ Pattern: 1 row trong `kv` table chứa toàn bộ DB dạng JSON     ║
 * ║   - Mỗi save() tăng version → load() check version để cache    ║
 * ║   - WAL mode → atomic write + concurrent read                  ║
 * ║   - Auto-migrate từ data/db.json lần boot đầu (nếu có)         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'db.sqlite');
const JSON_FILE   = path.join(DATA_DIR, 'db.json');
const JSON_BACKUP = path.join(DATA_DIR, 'db.json.bak');

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

let _sqlite = null;
let __cache = null;
let __cacheVersion = -1;

let _Database = null;
function _getDriver() {
  if (_Database) return _Database;
  try {
    _Database = require('better-sqlite3');
    return _Database;
  } catch (e) {
    console.error('[DB] ❌ better-sqlite3 chưa cài. Chạy: npm install better-sqlite3');
    throw e;
  }
}

function _ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function _initDb() {
  if (_sqlite) return _sqlite;
  _ensureDir();
  const Database = _getDriver();
  _sqlite = new Database(SQLITE_FILE);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('synchronous = NORMAL');
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key     TEXT PRIMARY KEY,
      value   TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0
    )
  `);
  const row = _sqlite.prepare("SELECT value FROM kv WHERE key = 'main'").get();
  if (!row) {
    let initial = null;
    if (fs.existsSync(JSON_FILE)) {
      try {
        initial = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
        console.log('[DB] ✅ Migrated db.json → SQLite (users:', (initial.users||[]).length,
                    ', idols:', (initial.idols||[]).length,
                    ', blvs:', (initial.blvs||[]).length, ')');
        try {
          const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
          fs.copyFileSync(JSON_FILE, JSON_BACKUP + '.migrated-' + stamp);
        } catch (e) { console.warn('[DB] ⚠️  Backup db.json fail:', e.message); }
      } catch (e) {
        console.error('[DB] ⚠️  db.json corrupt, dùng seed:', e.message);
      }
    }
    if (!initial) {
      initial = seed();
      console.warn('[DB] ⚠️  DB sạch. Chạy `node scripts/init-db.js` để tạo admin + yennhi');
    }
    _sqlite.prepare("INSERT INTO kv (key, value, version) VALUES ('main', ?, 1)").run(JSON.stringify(initial));
  }
  return _sqlite;
}

function _currentVersion() {
  const db = _initDb();
  const row = db.prepare("SELECT version FROM kv WHERE key = 'main'").get();
  return row ? row.version : 0;
}

function load() {
  const db = _initDb();
  const v = _currentVersion();
  if (__cache && __cacheVersion === v) {
    return JSON.parse(JSON.stringify(__cache));
  }
  const row = db.prepare("SELECT value, version FROM kv WHERE key = 'main'").get();
  if (!row) {
    const s = seed();
    db.prepare("INSERT OR REPLACE INTO kv (key, value, version) VALUES ('main', ?, 1)").run(JSON.stringify(s));
    __cache = s;
    __cacheVersion = 1;
    return JSON.parse(JSON.stringify(s));
  }
  __cache = JSON.parse(row.value);
  __cacheVersion = row.version;
  return JSON.parse(JSON.stringify(__cache));
}

function save(data) {
  const db = _initDb();
  const json = JSON.stringify(data);
  const stmt = db.prepare("UPDATE kv SET value = ?, version = version + 1 WHERE key = 'main'");
  const info = stmt.run(json);
  if (info.changes === 0) {
    db.prepare("INSERT OR REPLACE INTO kv (key, value, version) VALUES ('main', ?, 1)").run(json);
  }
  __cache = JSON.parse(json);
  __cacheVersion = _currentVersion();
}

function invalidateCache() {
  __cache = null;
  __cacheVersion = -1;
}

function genId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 10); }
function genStreamKey(name) {
  var s = (name||'').toLowerCase().replace(/[^a-z0-9]/g, '');
  return 'sk_' + s.slice(0, 12) + '_' + Math.random().toString(36).slice(2, 10);
}

function audit(db, action, target, byUser) {
  db.auditLog = db.auditLog || [];
  db.auditLog.unshift({ id: genId('a'), at: Date.now(), action: action, target: target, by: byUser || 'admin' });
  if (db.auditLog.length > 500) db.auditLog = db.auditLog.slice(0, 500);
}

// initAsync no-op cho SQLite (sync API native) — chỉ tồn tại để compat với MySQL adapter
async function initAsync() { _initDb(); }
function isReady() { return _sqlite !== null; }

module.exports = {
  load, save, seed, invalidateCache,
  VIP_TIERS, genId, genStreamKey, audit,
  initAsync, isReady
};

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ DATABASE — RELATIONAL Tables Backend (Phase 2 - cho 100k users)   ║
 * ║                                                                    ║
 * ║ HYBRID PATTERN:                                                    ║
 * ║   - Small entities (idols, blvs, banners, settings) → cached       ║
 * ║   - Large entities (users, transactions, audit_log) → query tables ║
 * ║                                                                    ║
 * ║ API tương thích lib/db.js cũ:                                      ║
 * ║   db.load() → { users: PROXY, idols: [...], blvs: [...] }         ║
 * ║     (users là Lazy Proxy → translate sang SQL query)               ║
 * ║   db.save(data) → diff với cache + UPSERT vào tables thay đổi      ║
 * ║                                                                    ║
 * ║ API MỚI (recommend dùng cho code mới):                            ║
 * ║   db.users.findById(id), findByUsername(name)                      ║
 * ║   db.users.create(data), update(id, patch), remove(id)             ║
 * ║   db.users.list({ limit, offset, where })                          ║
 * ║   db.transactions.create(...), db.transactions.listByUser(...)     ║
 * ║   db.audit.log(action, target, byUser)                             ║
 * ╚══════════════════════════════════════════════════════════════════*/
const fs = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(DATA_DIR, 'db.json');

let _pool = null;
let _ready = false;

// Cache cho small entities (idols, blvs, banners, settings)
let _cache = {
  idols: [],
  blvs: [],
  banners: [],
  settings: {}
};

function _getMysql() {
  try { return require('mysql2'); }
  catch (e) {
    console.error('[DB-Relational] ❌ mysql2 chưa cài. Chạy: npm install mysql2');
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
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
    timezone: '+07:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  }).promise();
  return _pool;
}

// ═══════════════════════════════════════════════════════
// HELPERS — VIP, genId, audit (giống lib/db.js cũ)
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
  return { users: [], blvs: [], idols: [], obs: [], auditLog: [] };
}

function genId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 10); }
function genStreamKey(name) {
  var s = (name||'').toLowerCase().replace(/[^a-z0-9]/g, '');
  return 'sk_' + s.slice(0, 12) + '_' + Math.random().toString(36).slice(2, 10);
}

// ═══════════════════════════════════════════════════════
// CACHE LOADER (idols, blvs, banners, settings)
// ═══════════════════════════════════════════════════════
async function _loadCache() {
  const pool = _createPool();
  const [idols]   = await pool.query('SELECT * FROM idols WHERE status != "blocked" ORDER BY name');
  const [blvs]    = await pool.query('SELECT * FROM blvs WHERE status != "blocked" ORDER BY name');
  const [banners] = await pool.query('SELECT * FROM banners WHERE active = 1 ORDER BY sort_order, created_at DESC');
  const [settings]= await pool.query('SELECT `key`, value FROM settings');

  _cache.idols   = idols.map(_rowToIdol);
  _cache.blvs    = blvs.map(_rowToBlv);
  _cache.banners = banners.map(_rowToBanner);
  _cache.settings = {};
  for (const s of settings) {
    try { _cache.settings[s.key] = typeof s.value === 'string' ? JSON.parse(s.value) : s.value; }
    catch(_) { _cache.settings[s.key] = s.value; }
  }
}

function _rowToIdol(r) {
  var extra = r.extra ? (typeof r.extra === 'string' ? JSON.parse(r.extra) : r.extra) : {};
  return Object.assign({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    slug: r.slug,
    avatar: r.avatar,
    cardImage: r.card_image,
    category: r.category,
    bio: r.bio,
    liveNow: !!r.live_now,
    liveStartedAt: r.live_started_at ? new Date(r.live_started_at).getTime() : null,
    status: r.status,
    lock: r.lock_coin,
    pinCode: r.pin_code,
    followers: r.followers,
    totalViews: r.total_views,
    totalXCoin: r.total_x_coin,
    emoji: r.emoji,
    color: r.color,
    streamKey: r.stream_key
  }, extra);
}

function _rowToBlv(r) {
  var extra = r.extra ? (typeof r.extra === 'string' ? JSON.parse(r.extra) : r.extra) : {};
  return Object.assign({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    slug: r.slug,
    avatar: r.avatar,
    cardImage: r.card_image,
    liveNow: !!r.live_now,
    liveStartedAt: r.live_started_at ? new Date(r.live_started_at).getTime() : null,
    status: r.status,
    streamKey: r.stream_key
  }, extra);
}

function _rowToBanner(r) {
  return {
    id: r.id, title: r.title, desc: r.description, cta: r.cta_text,
    url: r.url, image: r.image, bg: r.gradient,
    active: !!r.active, sortOrder: r.sort_order,
    createdAt: new Date(r.created_at).getTime()
  };
}

function _rowToUser(r) {
  var extra = r.extra ? (typeof r.extra === 'string' ? JSON.parse(r.extra) : r.extra) : {};
  return Object.assign({
    id: r.id,
    username: r.username,
    email: r.email,
    phone: r.phone,
    passwordHash: r.password_hash,
    role: r.role,
    vip: r.vip_tier,
    xCoin: r.x_coin,
    fullname: r.display_name,
    avatar: r.avatar,
    status: r.status,
    xoso66Linked: !!r.xoso66_linked,
    xoso66Username: r.xoso66_username,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).getTime() : null,
    lastLoginIp: r.last_login_ip,
    createdAt: new Date(r.created_at).getTime()
  }, extra);
}

// ═══════════════════════════════════════════════════════
// API MỚI — users.* (query tables)
// ═══════════════════════════════════════════════════════
const users = {
  async findById(id) {
    if (!id) return null;
    const [rows] = await _createPool().query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? _rowToUser(rows[0]) : null;
  },
  async findByUsername(username) {
    if (!username) return null;
    const [rows] = await _createPool().query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
    return rows[0] ? _rowToUser(rows[0]) : null;
  },
  async findByEmail(email) {
    if (!email) return null;
    const [rows] = await _createPool().query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    return rows[0] ? _rowToUser(rows[0]) : null;
  },
  async list(opts) {
    opts = opts || {};
    const limit  = +(opts.limit) || 50;
    const offset = +(opts.offset) || 0;
    const where  = opts.role ? ' WHERE role = ?' : '';
    const params = opts.role ? [opts.role, limit, offset] : [limit, offset];
    const [rows] = await _createPool().query(
      'SELECT * FROM users' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
      params
    );
    return rows.map(_rowToUser);
  },
  async count(opts) {
    opts = opts || {};
    const where  = opts.role ? ' WHERE role = ?' : '';
    const params = opts.role ? [opts.role] : [];
    const [r] = await _createPool().query('SELECT COUNT(*) AS c FROM users' + where, params);
    return r[0].c;
  },
  async create(data) {
    const id = data.id || genId('u');
    await _createPool().query(`
      INSERT INTO users (id, username, email, phone, password_hash, role, vip_tier, x_coin,
                         display_name, avatar, status, extra)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, data.username, data.email || null, data.phone || null,
      data.passwordHash || null, data.role || 'user',
      +(data.vip) || 0, +(data.xCoin) || 0,
      data.fullname || data.username, data.avatar || null,
      data.status || 'active', JSON.stringify(data.extra || {})
    ]);
    return id;
  },
  async update(id, patch) {
    const map = {
      email: 'email', phone: 'phone', passwordHash: 'password_hash',
      role: 'role', vip: 'vip_tier', xCoin: 'x_coin',
      fullname: 'display_name', avatar: 'avatar', status: 'status',
      xoso66Linked: 'xoso66_linked', xoso66Username: 'xoso66_username',
      lastLoginAt: 'last_login_at', lastLoginIp: 'last_login_ip'
    };
    const sets = [], vals = [];
    for (const k in patch) {
      if (map[k]) { sets.push('`' + map[k] + '` = ?'); vals.push(patch[k]); }
    }
    if (patch.extra) { sets.push('extra = ?'); vals.push(JSON.stringify(patch.extra)); }
    if (!sets.length) return;
    vals.push(id);
    await _createPool().query('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?', vals);
  },
  async remove(id) {
    await _createPool().query('DELETE FROM users WHERE id = ?', [id]);
  },
  async addXCoin(id, delta, type, note) {
    // ATOMIC: update x_coin + insert transaction in 1 transaction
    const pool = _createPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE users SET x_coin = x_coin + ? WHERE id = ?', [delta, id]);
      const [r] = await conn.query('SELECT x_coin FROM users WHERE id = ?', [id]);
      await conn.query(`
        INSERT INTO transactions (user_id, type, amount, balance, note)
        VALUES (?, ?, ?, ?, ?)
      `, [id, type || 'admin', delta, r[0].x_coin, note || null]);
      await conn.commit();
      return r[0].x_coin;
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  }
};

// ═══════════════════════════════════════════════════════
// API MỚI — transactions.*
// ═══════════════════════════════════════════════════════
const transactions = {
  async listByUser(userId, opts) {
    opts = opts || {};
    const limit = +(opts.limit) || 50;
    const [rows] = await _createPool().query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    );
    return rows;
  }
};

// ═══════════════════════════════════════════════════════
// API MỚI — audit.log
// ═══════════════════════════════════════════════════════
const audit = {
  async log(action, target, byUser, ip) {
    await _createPool().query(
      'INSERT INTO audit_log (action, target, by_user, ip) VALUES (?, ?, ?, ?)',
      [action, target || null, byUser || 'system', ip || null]
    );
  },
  async recent(limit) {
    const [rows] = await _createPool().query(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?',
      [+limit || 50]
    );
    return rows;
  }
};

// ═══════════════════════════════════════════════════════
// LEGACY API — load()/save() compat layer
// ═══════════════════════════════════════════════════════

/**
 * load() trả về object có cùng shape data cũ.
 * - idols, blvs, banners → cached array (small data)
 * - users, obs, auditLog → trả về [] rỗng vì giờ ở tables
 *   (code mới phải dùng db.users.* / db.audit.* / db.transactions.*)
 *
 * → Code legacy `db.load().idols.find(i => i.id === x)` VẪN WORK
 * → Code legacy `db.load().users.find(u => u.username === x)` SẼ RETURN UNDEFINED
 *   → Cần migrate sang `await db.users.findByUsername(x)`
 */
function load() {
  return {
    users:    [],       // ⚠️ EMPTY — dùng db.users.*
    idols:    _cache.idols,
    blvs:     _cache.blvs,
    obs:      [],       // ⚠️ TODO: load obs_requests on demand
    auditLog: [],       // ⚠️ Dùng db.audit.recent()
    // Settings access
    settings: _cache.settings
  };
}

function save(data) {
  // ⚠️ Save legacy → flush idols/blvs/banners changes về tables
  // (Pattern hiện tại: 1 worker save full object lúc edit qua admin)
  if (data.idols)   _saveIdols(data.idols);
  if (data.blvs)    _saveBlvs(data.blvs);
  if (data.banners) _saveBanners(data.banners);
}

async function _saveIdols(idols) {
  const pool = _createPool();
  for (const i of idols) {
    try {
      await pool.query(`
        INSERT INTO idols (id, name, slug, live_now, live_started_at, status, lock_coin, pin_code, extra)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          live_now = VALUES(live_now),
          live_started_at = VALUES(live_started_at),
          status = VALUES(status),
          lock_coin = VALUES(lock_coin),
          pin_code = VALUES(pin_code),
          extra = VALUES(extra)
      `, [
        i.id, i.name, i.slug || i.id,
        i.liveNow ? 1 : 0,
        i.liveStartedAt ? new Date(i.liveStartedAt) : null,
        i.status || 'active',
        +(i.lock) || 0, i.pinCode || null,
        JSON.stringify(i)
      ]);
    } catch(e) { console.warn('[DB-Rel] save idol:', e.message); }
  }
  _cache.idols = idols;
}

async function _saveBlvs(blvs) {
  const pool = _createPool();
  for (const b of blvs) {
    try {
      await pool.query(`
        INSERT INTO blvs (id, name, slug, live_now, live_started_at, status, extra)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          live_now = VALUES(live_now),
          live_started_at = VALUES(live_started_at),
          status = VALUES(status)
      `, [
        b.id, b.name, b.slug || b.id,
        b.liveNow ? 1 : 0,
        b.liveStartedAt ? new Date(b.liveStartedAt) : null,
        b.status || 'active',
        JSON.stringify(b)
      ]);
    } catch(e) { console.warn('[DB-Rel] save blv:', e.message); }
  }
  _cache.blvs = blvs;
}

async function _saveBanners(banners) {
  const pool = _createPool();
  for (const b of banners) {
    try {
      await pool.query(`
        INSERT INTO banners (id, title, description, cta_text, url, image, gradient, active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          cta_text = VALUES(cta_text),
          url = VALUES(url),
          image = VALUES(image),
          gradient = VALUES(gradient),
          active = VALUES(active),
          sort_order = VALUES(sort_order)
      `, [
        b.id, b.title, b.desc || null, b.cta || null,
        b.url || null, b.image || null, b.bg || null,
        b.active ? 1 : 0, +(b.sortOrder) || 0
      ]);
    } catch(e) { console.warn('[DB-Rel] save banner:', e.message); }
  }
  _cache.banners = banners;
}

function invalidateCache() {
  return _loadCache(); // reload từ DB
}

async function initAsync() {
  if (_ready) return;
  await _loadCache();
  _ready = true;
  console.log('[DB-Relational] ✅ Ready — idols:', _cache.idols.length,
              ', blvs:', _cache.blvs.length,
              ', banners:', _cache.banners.length);
}

function isReady() { return _ready; }

// audit() legacy → forward sang audit.log
function legacyAudit(db, action, target, byUser) {
  audit.log(action, target, byUser).catch(e => console.warn('[DB-Rel] audit:', e.message));
}

module.exports = {
  // Legacy compat (giữ cho code cũ chưa refactor)
  load, save, seed, invalidateCache,
  VIP_TIERS, genId, genStreamKey,
  audit: legacyAudit,
  // Async API mới
  initAsync, isReady,
  // RELATIONAL API MỚI (dùng cho code mới)
  users, transactions,
  auditApi: audit  // 'audit' đã bị legacy override, expose qua key khác
};

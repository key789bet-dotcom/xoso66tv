/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ DATABASE — Multi-backend ROUTER                                ║
 * ║                                                                ║
 * ║ Auto-detect backend theo ENV:                                  ║
 * ║   MYSQL_HOST có set → MySQL  (lib/db-mysql.js)                 ║
 * ║   MYSQL_HOST không  → SQLite (lib/db-sqlite.js) [default]      ║
 * ║                                                                ║
 * ║ API GIỮ NGUYÊN cho cả 2 backend:                              ║
 * ║   load() / save(db) / seed() / invalidateCache()              ║
 * ║   audit(db, action, target, byUser) / VIP_TIERS               ║
 * ║   genId(prefix) / genStreamKey(name)                           ║
 * ║   initAsync() — gọi 1 lần ở server.js trước listen (MySQL)    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
if (process.env.MYSQL_HOST) {
  console.log('[DB] 🐬 MySQL backend (host:', process.env.MYSQL_HOST + ')');
  module.exports = require('./db-mysql');
} else {
  console.log('[DB] 💾 SQLite backend (default)');
  module.exports = require('./db-sqlite');
}

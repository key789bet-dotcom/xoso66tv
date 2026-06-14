/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ DATABASE — Multi-backend ROUTER (3 backends)                  ║
 * ║                                                                ║
 * ║ Auto-detect theo ENV:                                          ║
 * ║   USE_RELATIONAL=1 → MySQL Relational Tables (Phase 2)         ║
 * ║   MYSQL_HOST set   → MySQL KV pattern (Phase 1, default)       ║
 * ║   Mặc định         → SQLite local (fallback)                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
if (process.env.USE_RELATIONAL === '1' && process.env.MYSQL_HOST) {
  console.log('[DB] 🚀 MySQL RELATIONAL backend (Phase 2 - cho 100k users)');
  module.exports = require('./db-relational');
} else if (process.env.MYSQL_HOST) {
  console.log('[DB] 🐬 MySQL KV backend (host:', process.env.MYSQL_HOST + ')');
  module.exports = require('./db-mysql');
} else {
  console.log('[DB] 💾 SQLite backend (default)');
  module.exports = require('./db-sqlite');
}

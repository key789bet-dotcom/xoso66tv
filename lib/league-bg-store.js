/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ LEAGUE BACKGROUND STORE — ảnh nền giải đấu                    ║
 * ║                                                                ║
 * ║ FIX DỨT ĐIỂM (2026-06-14): tách sang file JSON riêng           ║
 * ║   - Trước: lưu trong db.json field `leagueBackgrounds`         ║
 * ║   - Bug: db-relational.js KHÔNG persist field này → reload PM2 ║
 * ║     hoặc rebuild cache → MẤT sạch (vì MySQL không có table)    ║
 * ║   - Sau: lưu trong data/league-bg.json (đã gitignore)          ║
 * ║                                                                ║
 * ║ AUTO-MIGRATE: lần đầu boot, nếu db.json có `leagueBackgrounds` ║
 * ║   sẽ copy vào file mới rồi xoá khỏi db.json                    ║
 * ║                                                                ║
 * ║ API giữ nguyên 100%: list, get, set, remove, getDefault, ...   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'league-bg.json');
const DEFAULT_KEY = '__default__';

function _load() {
  try {
    if (!fs.existsSync(FILE)) {
      // 🔄 AUTO-MIGRATE: legacy data trong db.json (nếu còn)
      try {
        const db = require('./db');
        const d  = db.load();
        if (d && d.leagueBackgrounds && Object.keys(d.leagueBackgrounds).length) {
          _save(d.leagueBackgrounds);
          // Xoá khỏi db.json để clean
          delete d.leagueBackgrounds;
          try { db.save(d); } catch(_) {}
          console.log('[league-bg-store] ✅ Migrated legacy from db.json (' + Object.keys(_load()).length + ' entries)');
          return JSON.parse(fs.readFileSync(FILE, 'utf8'));
        }
      } catch(_) {}
      return {};
    }
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch (e) {
    console.error('[league-bg-store] load error:', e.message);
    return {};
  }
}

function _save(map) {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
  } catch (e) {
    console.error('[league-bg-store] save error:', e.message);
  }
}

function normalize(name) {
  return String(name || '').trim();
}

function list() {
  return _load();
}

function getDefault() {
  return _load()[DEFAULT_KEY] || '';
}

function setDefault(imageUrl) {
  const map = _load();
  map[DEFAULT_KEY] = String(imageUrl || '').slice(0, 500);
  _save(map);
  return map[DEFAULT_KEY];
}

function removeDefault() {
  const map = _load();
  if (!map[DEFAULT_KEY]) return false;
  delete map[DEFAULT_KEY];
  _save(map);
  return true;
}

function get(leagueName) {
  const n = normalize(leagueName);
  if (!n) return '';
  return _load()[n] || '';
}

function set(leagueName, imageUrl) {
  const n = normalize(leagueName);
  if (!n) return null;
  const map = _load();
  map[n] = String(imageUrl || '').slice(0, 500);
  _save(map);
  return map[n];
}

function remove(leagueName) {
  const n = normalize(leagueName);
  if (!n) return false;
  const map = _load();
  if (!map[n]) return false;
  const old = map[n];
  delete map[n];
  _save(map);
  return old;
}

module.exports = { list, get, set, remove, getDefault, setDefault, removeDefault, DEFAULT_KEY };

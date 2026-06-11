/**
 * League background store — quản lý ảnh nền cho từng giải đấu
 * Lưu trong db.json field: leagueBackgrounds { "USL Championship": "/uploads/leagues/xxx.jpg" }
 */
const db = require('./db');

function normalize(name) {
  return String(name || '').trim();
}

function _get() {
  const d = db.load();
  if (!d.leagueBackgrounds || typeof d.leagueBackgrounds !== 'object') d.leagueBackgrounds = {};
  return { data: d, map: d.leagueBackgrounds };
}

function list() {
  return _get().map;
}

function get(leagueName) {
  const n = normalize(leagueName);
  if (!n) return '';
  return _get().map[n] || '';
}

function set(leagueName, imageUrl) {
  const n = normalize(leagueName);
  if (!n) return null;
  const { data, map } = _get();
  map[n] = String(imageUrl || '').slice(0, 500);
  db.save(data);
  return map[n];
}

function remove(leagueName) {
  const n = normalize(leagueName);
  if (!n) return false;
  const { data, map } = _get();
  if (!map[n]) return false;
  const old = map[n];
  delete map[n];
  db.save(data);
  return old;
}

module.exports = { list, get, set, remove };

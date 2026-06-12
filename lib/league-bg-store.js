/**
 * League background store — quản lý ảnh nền cho từng giải đấu
 * Lưu trong db.json field: leagueBackgrounds { "USL Championship": "/uploads/leagues/xxx.jpg" }
 * Special key: __default__ — ảnh fallback áp dụng cho mọi giải KHÔNG có ảnh riêng
 */
const db = require('./db');

const DEFAULT_KEY = '__default__';

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

/** Trả ảnh default cho mọi giải không có ảnh riêng (rỗng nếu admin chưa set) */
function getDefault() {
  return _get().map[DEFAULT_KEY] || '';
}

/** Set ảnh default */
function setDefault(imageUrl) {
  const { data, map } = _get();
  map[DEFAULT_KEY] = String(imageUrl || '').slice(0, 500);
  db.save(data);
  return map[DEFAULT_KEY];
}

/** Xóa ảnh default */
function removeDefault() {
  const { data, map } = _get();
  if (!map[DEFAULT_KEY]) return false;
  delete map[DEFAULT_KEY];
  db.save(data);
  return true;
}

/** Constant cho client */
const _DEFAULT_KEY = DEFAULT_KEY;

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

module.exports = { list, get, set, remove, getDefault, setDefault, removeDefault, DEFAULT_KEY: _DEFAULT_KEY };

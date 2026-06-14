/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ SCHEDULE STORE — đăng ký lịch live của idol/BLV                   ║
 * ║                                                                    ║
 * ║ FIX DỨT ĐIỂM (2026-06-14): tách sang file JSON riêng              ║
 * ║   - Trước: lưu trong db.json field `schedules` + `notifications`  ║
 * ║   - Bug: db-relational.js KHÔNG persist 2 field này → reload PM2  ║
 * ║     → mất sạch schedules + notifications                          ║
 * ║   - Sau: lưu trong data/schedules.json + data/notifications.json  ║
 * ║     (đã gitignore, độc lập DB backend)                            ║
 * ║                                                                    ║
 * ║ AUTO-MIGRATE: lần đầu boot, copy data legacy từ db.json sang file ║
 * ║                                                                    ║
 * ║ API giữ nguyên 100%: add/findById/listByUser/listPending/listAll/ ║
 * ║   approve/reject/cancel/getActiveSchedule/stats/pushNotification/  ║
 * ║   listNotifications/markNotifRead/markEnded/listExpired           ║
 * ╚══════════════════════════════════════════════════════════════════*/
const fs = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const SCHED_FILE = path.join(DATA_DIR, 'schedules.json');
const NOTIF_FILE = path.join(DATA_DIR, 'notifications.json');

function genId() { return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ─── Internal load/save ─────────────────────────────────────────────
function _ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function _loadSchedules() {
  try {
    if (!fs.existsSync(SCHED_FILE)) {
      // AUTO-MIGRATE legacy: db.load().schedules nếu còn
      try {
        const db = require('./db');
        const d  = db.load();
        if (Array.isArray(d.schedules) && d.schedules.length) {
          _saveSchedules(d.schedules);
          delete d.schedules;
          try { db.save(d); } catch(_) {}
          console.log('[schedule-store] ✅ Migrated', d.schedules ? 0 : '(none)', 'legacy schedules from db.json');
          return JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
        }
      } catch(_) {}
      return [];
    }
    return JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8') || '[]');
  } catch (e) {
    console.error('[schedule-store] load schedules error:', e.message);
    return [];
  }
}

function _saveSchedules(list) {
  try {
    _ensureDir();
    fs.writeFileSync(SCHED_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('[schedule-store] save schedules error:', e.message);
  }
}

function _loadNotifs() {
  try {
    if (!fs.existsSync(NOTIF_FILE)) {
      try {
        const db = require('./db');
        const d  = db.load();
        if (Array.isArray(d.notifications) && d.notifications.length) {
          _saveNotifs(d.notifications);
          delete d.notifications;
          try { db.save(d); } catch(_) {}
          return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
        }
      } catch(_) {}
      return [];
    }
    return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8') || '[]');
  } catch (e) {
    console.error('[schedule-store] load notifs error:', e.message);
    return [];
  }
}

function _saveNotifs(list) {
  try {
    _ensureDir();
    fs.writeFileSync(NOTIF_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('[schedule-store] save notifs error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API — giữ nguyên signature cũ
// ═══════════════════════════════════════════════════════════════════

function add(input) {
  const list = _loadSchedules();
  const item = {
    id: genId(),
    username: String(input.username || '').toLowerCase(),
    userType: input.userType || 'idol',
    type: input.type || 'time',
    startTime: parseInt(input.startTime, 10) || Date.now(),
    endTime: parseInt(input.endTime, 10) || (Date.now() + 2 * 3600 * 1000),
    title: String(input.title || 'Live show').slice(0, 120),
    description: String(input.description || '').slice(0, 500),
    matchId: input.matchId || null,
    matchTitle: input.matchTitle || null,
    status: 'pending',
    createdAt: Date.now(),
    reviewedAt: null,
    reviewedBy: null,
    rejectReason: null
  };
  list.unshift(item);
  if (list.length > 500) list.length = 500;
  _saveSchedules(list);
  return item;
}

function findById(id) {
  return _loadSchedules().find(s => s.id === id) || null;
}

function listByUser(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  let arr = _loadSchedules().filter(s => s.username === u);
  if (opts.status) arr = arr.filter(s => s.status === opts.status);
  arr.sort((a, b) => {
    const pA = a.status === 'pending' ? 0 : 1;
    const pB = b.status === 'pending' ? 0 : 1;
    if (pA !== pB) return pA - pB;
    return b.startTime - a.startTime;
  });
  return arr;
}

function listPending() {
  return _loadSchedules()
    .filter(s => s.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);
}

function listAll(opts) {
  opts = opts || {};
  let arr = _loadSchedules().slice();
  if (opts.status) arr = arr.filter(s => s.status === opts.status);
  if (opts.userType) arr = arr.filter(s => s.userType === opts.userType);
  if (opts.username) arr = arr.filter(s => s.username === opts.username.toLowerCase());
  arr.sort((a, b) => b.createdAt - a.createdAt);
  return arr.slice(0, opts.limit || 100);
}

function approve(id, byAdmin) {
  const list = _loadSchedules();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  list[idx].status = 'approved';
  list[idx].reviewedAt = Date.now();
  list[idx].reviewedBy = byAdmin || 'admin';
  list[idx].rejectReason = null;
  _saveSchedules(list);
  return list[idx];
}

function reject(id, reason, byAdmin) {
  const list = _loadSchedules();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  list[idx].status = 'rejected';
  list[idx].reviewedAt = Date.now();
  list[idx].reviewedBy = byAdmin || 'admin';
  list[idx].rejectReason = String(reason || '').slice(0, 300);
  _saveSchedules(list);
  return list[idx];
}

function cancel(id, byUsername) {
  const list = _loadSchedules();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  if (list[idx].status !== 'pending') return null;
  const u = String(byUsername || '').toLowerCase();
  if (list[idx].username !== u) return null;
  list.splice(idx, 1);
  _saveSchedules(list);
  return true;
}

function getActiveSchedule(username) {
  const u = String(username || '').toLowerCase();
  const now = Date.now();
  const PRE_WINDOW = 30 * 60 * 1000;
  const POST_WINDOW = 3 * 3600 * 1000;
  return _loadSchedules().find(s =>
    s.username === u &&
    s.status === 'approved' &&
    now >= s.startTime - PRE_WINDOW &&
    now <= s.endTime + POST_WINDOW
  ) || null;
}

function stats() {
  const list = _loadSchedules();
  return {
    total: list.length,
    pending: list.filter(s => s.status === 'pending').length,
    approved: list.filter(s => s.status === 'approved').length,
    rejected: list.filter(s => s.status === 'rejected').length,
    ended: list.filter(s => s.status === 'ended').length
  };
}

// ─── Cho auto-end-scheduled-live.js ───────────────────────────────
function listExpired(graceMs) {
  const grace = typeof graceMs === 'number' ? graceMs : 5 * 60 * 1000;
  const now = Date.now();
  return _loadSchedules().filter(s =>
    s.status === 'approved' &&
    typeof s.endTime === 'number' &&
    (s.endTime + grace) < now
  );
}

function markEnded(id, extra) {
  const list = _loadSchedules();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  list[idx].status = 'ended';
  list[idx].endedAt = Date.now();
  list[idx].endReason = (extra && extra.reason) || 'auto_end_by_schedule';
  if (extra && typeof extra.kicked === 'boolean') list[idx].kicked = extra.kicked;
  _saveSchedules(list);
  return list[idx];
}

// ─── Notifications ──────────────────────────────────────────────────
function pushNotification(username, notif) {
  const arr = _loadNotifs();
  arr.unshift({
    id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    username: String(username).toLowerCase(),
    title: notif.title || '',
    body: notif.body || '',
    type: notif.type || 'system',
    link: notif.link || '/idol-studio',
    createdAt: Date.now(),
    read: false
  });
  if (arr.length > 1000) arr.length = 1000;
  _saveNotifs(arr);
}

function listNotifications(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  const arr = _loadNotifs().filter(n => n.username === u);
  return arr.slice(0, opts.limit || 30);
}

function markNotifRead(username, notifId) {
  const arr = _loadNotifs();
  const u = String(username || '').toLowerCase();
  const n = arr.find(x => x.id === notifId && x.username === u);
  if (n) {
    n.read = true;
    _saveNotifs(arr);
    return true;
  }
  return false;
}

module.exports = {
  add, findById, listByUser, listPending, listAll,
  approve, reject, cancel,
  getActiveSchedule, stats,
  listExpired, markEnded,
  pushNotification, listNotifications, markNotifRead
};

/**
 * Schedule store - quản lý đăng ký lịch live của idol/BLV
 * Lưu vào db.json field schedules[]
 */
const db = require('./db');

function genId() { return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function _getList() {
  const d = db.load();
  if (!Array.isArray(d.schedules)) d.schedules = [];
  return { data: d, list: d.schedules };
}

function add(input) {
  // input: { username, userType, type, startTime, endTime, title, description, matchId, matchTitle }
  const { data, list } = _getList();
  const item = {
    id: genId(),
    username: String(input.username || '').toLowerCase(),
    userType: input.userType || 'idol',  // 'idol' | 'blv'
    type: input.type || 'time',           // 'time' | 'match'
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
  // Giới hạn 500 schedules
  if (list.length > 500) data.schedules = list.slice(0, 500);
  db.save(data);
  return item;
}

function findById(id) {
  return _getList().list.find(s => s.id === id) || null;
}

function listByUser(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  let arr = _getList().list.filter(s => s.username === u);
  if (opts.status) arr = arr.filter(s => s.status === opts.status);
  // Sort: pending trước, sau đó theo startTime desc
  arr.sort((a, b) => {
    const pA = a.status === 'pending' ? 0 : 1;
    const pB = b.status === 'pending' ? 0 : 1;
    if (pA !== pB) return pA - pB;
    return b.startTime - a.startTime;
  });
  return arr;
}

function listPending() {
  return _getList().list
    .filter(s => s.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);  // cũ nhất trước
}

function listAll(opts) {
  opts = opts || {};
  let arr = _getList().list.slice();
  if (opts.status) arr = arr.filter(s => s.status === opts.status);
  if (opts.userType) arr = arr.filter(s => s.userType === opts.userType);
  if (opts.username) arr = arr.filter(s => s.username === opts.username.toLowerCase());
  // Default sort: mới nhất trước
  arr.sort((a, b) => b.createdAt - a.createdAt);
  return arr.slice(0, opts.limit || 100);
}

function approve(id, byAdmin) {
  const { data, list } = _getList();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  list[idx].status = 'approved';
  list[idx].reviewedAt = Date.now();
  list[idx].reviewedBy = byAdmin || 'admin';
  list[idx].rejectReason = null;
  db.save(data);
  return list[idx];
}

function reject(id, reason, byAdmin) {
  const { data, list } = _getList();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  list[idx].status = 'rejected';
  list[idx].reviewedAt = Date.now();
  list[idx].reviewedBy = byAdmin || 'admin';
  list[idx].rejectReason = String(reason || '').slice(0, 300);
  db.save(data);
  return list[idx];
}

function cancel(id, byUsername) {
  // Idol/BLV tự cancel pending của mình
  const { data, list } = _getList();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  if (list[idx].status !== 'pending') return null;
  const u = String(byUsername || '').toLowerCase();
  if (list[idx].username !== u) return null;
  list.splice(idx, 1);
  db.save(data);
  return true;
}

/**
 * Check user có approved schedule ACTIVE không
 * Active window: 30 phút trước startTime → 3 giờ sau endTime
 * → để idol kịp test OBS trước, kéo dài stream nếu cần
 */
function getActiveSchedule(username) {
  const u = String(username || '').toLowerCase();
  const now = Date.now();
  const PRE_WINDOW = 30 * 60 * 1000;    // 30 phút trước
  const POST_WINDOW = 3 * 3600 * 1000;  // 3 giờ sau end
  return _getList().list.find(s =>
    s.username === u &&
    s.status === 'approved' &&
    now >= s.startTime - PRE_WINDOW &&
    now <= s.endTime + POST_WINDOW
  ) || null;
}

function stats() {
  const list = _getList().list;
  return {
    total: list.length,
    pending: list.filter(s => s.status === 'pending').length,
    approved: list.filter(s => s.status === 'approved').length,
    rejected: list.filter(s => s.status === 'rejected').length
  };
}

// Notification queue: lưu trong db.json field notifications[]
// Mỗi user check theo username
function pushNotification(username, notif) {
  const d = db.load();
  if (!Array.isArray(d.notifications)) d.notifications = [];
  d.notifications.unshift({
    id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    username: String(username).toLowerCase(),
    title: notif.title || '',
    body: notif.body || '',
    type: notif.type || 'system',     // 'schedule-approved' | 'schedule-rejected' | ...
    link: notif.link || '/idol-studio',
    createdAt: Date.now(),
    read: false
  });
  if (d.notifications.length > 1000) d.notifications = d.notifications.slice(0, 1000);
  db.save(d);
}

function listNotifications(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  const d = db.load();
  const arr = (d.notifications || []).filter(n => n.username === u);
  return arr.slice(0, opts.limit || 30);
}

function markNotifRead(username, notifId) {
  const d = db.load();
  if (!Array.isArray(d.notifications)) return false;
  const u = String(username || '').toLowerCase();
  const n = d.notifications.find(x => x.id === notifId && x.username === u);
  if (n) {
    n.read = true;
    db.save(d);
    return true;
  }
  return false;
}

module.exports = {
  add, findById, listByUser, listPending, listAll,
  approve, reject, cancel,
  getActiveSchedule, stats,
  // Notifications
  pushNotification, listNotifications, markNotifRead
};

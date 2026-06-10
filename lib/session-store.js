/**
 * Live Session Store - track mỗi phiên live của idol/blv
 * Lưu vào db.json field sessions[]
 *
 * Session lifecycle:
 *   1. Idol/BLV go live (SRS detect publish) → startSession()
 *   2. Khi off (SRS detect unpublish) → endSession()
 *   3. Auto tính duration + payment dựa trên rate
 */
const db = require('./db');

function genId() { return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function _getList() {
  const d = db.load();
  if (!Array.isArray(d.sessions)) d.sessions = [];
  return { data: d, list: d.sessions };
}

/**
 * Start session khi idol/BLV go live
 * @param {Object} info { username, userType, idolId, scheduleId, matchId, matchTitle }
 */
function startSession(info) {
  const { data, list } = _getList();
  // Check nếu đã có session active (chưa endTime) thì không tạo mới
  const u = String(info.username || '').toLowerCase();
  const existing = list.find(s => s.username === u && !s.endTime);
  if (existing) return existing;

  const item = {
    id: genId(),
    username: u,
    userType: info.userType || 'idol',
    idolId: info.idolId || null,
    scheduleId: info.scheduleId || null,
    matchId: info.matchId || null,
    matchTitle: info.matchTitle || null,
    startTime: Date.now(),
    endTime: null,
    duration: 0,           // milliseconds
    peakViewers: 0,
    totalGifts: 0,
    totalCoins: 0,
    paymentRate: null,     // sẽ tính khi end
    paymentAmount: 0,
    paymentMethod: null,   // 'hour' | 'match'
    paid: false
  };
  list.unshift(item);
  if (list.length > 5000) data.sessions = list.slice(0, 5000);
  db.save(data);
  console.log('[SESSION] ▶️  Start:', item.id, '@' + item.username);
  return item;
}

/**
 * End session khi idol/BLV off
 * @param {String} username
 */
function endSession(username) {
  const { data, list } = _getList();
  const u = String(username || '').toLowerCase();
  const session = list.find(s => s.username === u && !s.endTime);
  if (!session) return null;

  session.endTime = Date.now();
  session.duration = session.endTime - session.startTime;
  // Tính payment dựa trên rate của idol/blv
  _calculatePayment(data, session);
  db.save(data);
  console.log('[SESSION] ⏸️  End:', session.id, '@' + session.username,
    '| Duration:', Math.round(session.duration/1000), 's',
    '| Payment:', session.paymentAmount, 'VND');
  return session;
}

/**
 * Update peak viewers/gifts realtime (call từ chat hoặc gift events)
 */
function updateMetrics(username, delta) {
  const { data, list } = _getList();
  const u = String(username || '').toLowerCase();
  const session = list.find(s => s.username === u && !s.endTime);
  if (!session) return null;
  if (typeof delta.viewers === 'number') {
    session.peakViewers = Math.max(session.peakViewers, delta.viewers);
  }
  if (typeof delta.gifts === 'number') session.totalGifts += delta.gifts;
  if (typeof delta.coins === 'number') session.totalCoins += delta.coins;
  db.save(data);
  return session;
}

/**
 * Tính tiền công dựa trên rate của idol/blv
 */
function _calculatePayment(data, session) {
  // Tìm rate của idol/blv
  let rate = null;
  if (session.userType === 'idol') {
    const idol = (data.idols || []).find(i => i.id === session.idolId || i.username === session.username);
    if (idol) rate = idol.paymentRate || null;
  } else if (session.userType === 'blv') {
    const blv = (data.blvs || []).find(b => b.username === session.username || b.userId === session.username);
    if (blv) rate = blv.paymentRate || null;
  }
  if (!rate) {
    // Default rate
    rate = { perHour: 50000, perMatch: 200000, useMatchRate: false };
  }
  session.paymentRate = rate;

  // Tính theo match nếu có matchId + useMatchRate
  if (session.matchId && rate.useMatchRate) {
    session.paymentAmount = rate.perMatch || 0;
    session.paymentMethod = 'match';
  } else {
    // Tính theo giờ
    const hours = session.duration / 3600000;  // ms → hours
    session.paymentAmount = Math.round(hours * (rate.perHour || 0));
    session.paymentMethod = 'hour';
  }
  return session;
}

function listByUser(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  let arr = _getList().list.filter(s => s.username === u);
  if (opts.activeOnly) arr = arr.filter(s => !s.endTime);
  if (opts.endedOnly) arr = arr.filter(s => s.endTime);
  return arr.slice(0, opts.limit || 50);
}

function listAll(opts) {
  opts = opts || {};
  let arr = _getList().list.slice();
  if (opts.userType) arr = arr.filter(s => s.userType === opts.userType);
  if (opts.username) arr = arr.filter(s => s.username === opts.username.toLowerCase());
  if (opts.paidStatus === 'paid') arr = arr.filter(s => s.paid);
  if (opts.paidStatus === 'unpaid') arr = arr.filter(s => !s.paid && s.endTime);
  // From / to date filter
  if (opts.from) arr = arr.filter(s => s.startTime >= opts.from);
  if (opts.to) arr = arr.filter(s => s.startTime <= opts.to);
  arr.sort((a, b) => b.startTime - a.startTime);
  return arr.slice(0, opts.limit || 200);
}

function findById(id) {
  return _getList().list.find(s => s.id === id) || null;
}

/**
 * Mark session as paid
 */
function markPaid(id, byAdmin) {
  const { data, list } = _getList();
  const s = list.find(x => x.id === id);
  if (!s) return null;
  s.paid = true;
  s.paidAt = Date.now();
  s.paidBy = byAdmin || 'admin';
  db.save(data);
  return s;
}

function unmarkPaid(id) {
  const { data, list } = _getList();
  const s = list.find(x => x.id === id);
  if (!s) return null;
  s.paid = false;
  delete s.paidAt;
  delete s.paidBy;
  db.save(data);
  return s;
}

/**
 * Set rate cho idol/BLV
 */
function setRate(userType, idOrUsername, rate) {
  const data = db.load();
  const arr = userType === 'blv' ? (data.blvs || []) : (data.idols || []);
  const item = arr.find(x =>
    x.id === idOrUsername ||
    x.username === String(idOrUsername).toLowerCase() ||
    (x.userId && x.userId === String(idOrUsername).toLowerCase())
  );
  if (!item) return null;
  item.paymentRate = {
    perHour:      Math.max(0, parseInt(rate.perHour, 10) || 0),
    perMatch:     Math.max(0, parseInt(rate.perMatch, 10) || 0),
    useMatchRate: !!rate.useMatchRate
  };
  db.save(data);
  return item;
}

function getRate(userType, idOrUsername) {
  const data = db.load();
  const arr = userType === 'blv' ? (data.blvs || []) : (data.idols || []);
  const item = arr.find(x =>
    x.id === idOrUsername ||
    x.username === String(idOrUsername).toLowerCase() ||
    (x.userId && x.userId === String(idOrUsername).toLowerCase())
  );
  return item ? (item.paymentRate || null) : null;
}

/**
 * Stats tổng quan
 */
function stats(username) {
  const arr = username ? listByUser(username, { endedOnly: true }) : _getList().list.filter(s => s.endTime);
  let totalDuration = 0;
  let totalEarning = 0;
  let totalSessions = arr.length;
  let unpaidAmount = 0;
  arr.forEach(s => {
    totalDuration += s.duration || 0;
    totalEarning += s.paymentAmount || 0;
    if (!s.paid) unpaidAmount += s.paymentAmount || 0;
  });
  return {
    totalSessions: totalSessions,
    totalHours: +(totalDuration / 3600000).toFixed(2),
    totalEarning: totalEarning,
    unpaidAmount: unpaidAmount,
    avgHoursPerSession: totalSessions ? +(totalDuration / 3600000 / totalSessions).toFixed(2) : 0
  };
}

module.exports = {
  startSession, endSession, updateMetrics,
  listByUser, listAll, findById,
  markPaid, unmarkPaid,
  setRate, getRate,
  stats
};

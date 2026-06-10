/**
 * Gift transaction store - lưu MỌI lần user tặng quà THẬT cho idol/BLV
 * Lưu vào db.json field giftTxs[]
 *
 * Mỗi tx: { id, fromUser, toUser (streamer username), toIdolId, giftId, giftName, giftIcon,
 *           qty, unitVnd, totalVnd, streamerCut, earnedVnd, isPremium=true,
 *           createdAt, paid (admin marked) }
 */
const db = require('./db');

function genId() { return 'gtx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function _list() {
  const d = db.load();
  if (!Array.isArray(d.giftTxs)) d.giftTxs = [];
  return { data: d, list: d.giftTxs };
}

/**
 * Tạo 1 lượt tặng quà thật
 * input: { fromUser, toUser, toIdolId, gift (object từ gifts.js), qty }
 */
function add(input) {
  const { data, list } = _list();
  const g = input.gift || {};
  const qty = Math.max(1, parseInt(input.qty, 10) || 1);
  const unit = parseInt(g.priceVnd, 10) || 0;
  const totalVnd = unit * qty;
  const cut = typeof g.streamerCut === 'number' ? g.streamerCut : 0.70;
  const earnedVnd = Math.floor(totalVnd * cut);

  const item = {
    id: genId(),
    fromUser: String(input.fromUser || '').toLowerCase(),
    toUser:   String(input.toUser   || '').toLowerCase(),
    toIdolId: input.toIdolId || null,
    giftId:   g.id   || '',
    giftName: g.name || '',
    giftIcon: g.icon || '🎁',
    tier:     g.tier || 'vip',
    qty:      qty,
    unitVnd:  unit,
    totalVnd: totalVnd,
    streamerCut: cut,
    earnedVnd: earnedVnd,
    isPremium: true,
    createdAt: Date.now(),
    paid: false           // admin sẽ markPaid sau khi rút tiền
  };
  list.unshift(item);
  if (list.length > 10000) data.giftTxs = list.slice(0, 10000);
  db.save(data);
  return item;
}

function listByStreamer(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  let arr = _list().list.filter(x => x.toUser === u);
  if (opts.from) arr = arr.filter(x => x.createdAt >= opts.from);
  if (opts.to)   arr = arr.filter(x => x.createdAt <= opts.to);
  return arr.slice(0, opts.limit || 200);
}

function listByUser(username, opts) {
  // Lịch sử user đã tặng
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  const arr = _list().list.filter(x => x.fromUser === u);
  return arr.slice(0, opts.limit || 100);
}

function listAll(opts) {
  opts = opts || {};
  let arr = _list().list.slice();
  if (opts.toUser)   arr = arr.filter(x => x.toUser === opts.toUser.toLowerCase());
  if (opts.fromUser) arr = arr.filter(x => x.fromUser === opts.fromUser.toLowerCase());
  if (opts.paid === 'paid')   arr = arr.filter(x => x.paid);
  if (opts.paid === 'unpaid') arr = arr.filter(x => !x.paid);
  return arr.slice(0, opts.limit || 500);
}

/**
 * Tổng earnings từ quà thật của 1 streamer
 * → cộng vào số dư khả dụng rút tiền
 */
function totalEarnedByStreamer(username) {
  const u = String(username || '').toLowerCase();
  return _list().list
    .filter(x => x.toUser === u)
    .reduce((acc, x) => acc + (x.earnedVnd || 0), 0);
}

function stats(username) {
  const u = username ? String(username).toLowerCase() : null;
  const all = _list().list;
  const arr = u ? all.filter(x => x.toUser === u) : all;
  return {
    totalTx:      arr.length,
    totalVndIn:   arr.reduce((a,x) => a + (x.totalVnd || 0), 0),  // tổng user trả
    totalEarned:  arr.reduce((a,x) => a + (x.earnedVnd || 0), 0), // streamer kiếm
    paidCount:    arr.filter(x => x.paid).length,
    unpaidCount:  arr.filter(x => !x.paid).length
  };
}

function markPaid(txId, byAdmin) {
  const { data, list } = _list();
  const idx = list.findIndex(x => x.id === txId);
  if (idx === -1) return null;
  list[idx].paid = true;
  list[idx].paidAt = Date.now();
  list[idx].paidBy = byAdmin || 'admin';
  db.save(data);
  return list[idx];
}

/**
 * Top spender (donor) - dùng cho leaderboard
 */
function topDonors(streamerUsername, limit) {
  const u = String(streamerUsername || '').toLowerCase();
  const map = {};
  _list().list.filter(x => x.toUser === u).forEach(x => {
    if (!map[x.fromUser]) map[x.fromUser] = { user: x.fromUser, totalVnd: 0, count: 0 };
    map[x.fromUser].totalVnd += x.totalVnd || 0;
    map[x.fromUser].count++;
  });
  return Object.values(map)
    .sort((a, b) => b.totalVnd - a.totalVnd)
    .slice(0, limit || 10);
}

module.exports = {
  add, listByStreamer, listByUser, listAll,
  totalEarnedByStreamer, stats, markPaid, topDonors
};

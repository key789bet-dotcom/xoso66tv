/**
 * Deposit store - yêu cầu nạp tiền của user (ngân hàng / USDT)
 * Lưu vào db.json field deposits[]
 *
 * Status flow:  pending → credited (admin duyệt → cộng VND)
 *                       → rejected
 *                       → cancelled (user huỷ)
 */
const db = require('./db');

function genId() {
  // Mã ngắn để user nhập vào nội dung chuyển khoản
  return 'NAP' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
}

function _list() {
  const d = db.load();
  if (!Array.isArray(d.deposits)) d.deposits = [];
  return { data: d, list: d.deposits };
}

/**
 * Tạo yêu cầu nạp
 * input: { username, method, amountVnd, usdtAmount, usdtNetwork, proofImage, note, ip }
 */
function add(input) {
  const { data, list } = _list();
  const method = (input.method === 'usdt') ? 'usdt' : 'bank';
  const code = genId();

  const item = {
    id: code,
    username: String(input.username || '').toLowerCase(),
    method: method,
    // BANK
    amountVnd:   method === 'bank' ? parseInt(input.amountVnd, 10) || 0 : (parseInt(input.amountVnd, 10) || 0),
    // USDT
    usdtAmount:  method === 'usdt' ? (parseFloat(input.usdtAmount) || 0) : 0,
    usdtNetwork: method === 'usdt' ? String(input.usdtNetwork || 'TRC20').slice(0, 10) : '',
    usdtTxHash:  method === 'usdt' ? String(input.usdtTxHash || '').slice(0, 100) : '',
    // Common
    proofImage:  String(input.proofImage || '').slice(0, 500),
    note:        String(input.note || '').slice(0, 300),
    status:      'pending',           // pending | credited | rejected | cancelled
    createdAt:   Date.now(),
    creditedAt:  null,
    creditedBy:  null,
    creditedVnd: 0,                    // VND thực tế cộng vào (admin có thể chỉnh)
    rejectReason: null,
    ip: input.ip || ''
  };
  list.unshift(item);
  if (list.length > 5000) data.deposits = list.slice(0, 5000);
  db.save(data);
  return item;
}

function findById(id) {
  return _list().list.find(d => d.id === id) || null;
}

function listByUser(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  let arr = _list().list.filter(d => d.username === u);
  if (opts.status) arr = arr.filter(d => d.status === opts.status);
  arr.sort((a, b) => b.createdAt - a.createdAt);
  return arr.slice(0, opts.limit || 30);
}

function listAll(opts) {
  opts = opts || {};
  let arr = _list().list.slice();
  if (opts.status)   arr = arr.filter(d => d.status === opts.status);
  if (opts.method)   arr = arr.filter(d => d.method === opts.method);
  if (opts.username) arr = arr.filter(d => d.username === opts.username.toLowerCase());
  arr.sort((a, b) => b.createdAt - a.createdAt);
  return arr.slice(0, opts.limit || 200);
}

/**
 * Admin duyệt + cộng VND vào ví user
 * creditedVnd: số VND thực tế admin cộng (có thể khác request nếu USDT đổi tỉ giá)
 */
function credit(id, creditedVnd, byAdmin) {
  const { data, list } = _list();
  const idx = list.findIndex(d => d.id === id);
  if (idx === -1) return null;
  if (list[idx].status !== 'pending') return null;

  const dep = list[idx];
  const vnd = Math.max(0, parseInt(creditedVnd, 10) || 0);

  // Cộng VND vào user
  const userIdx = (data.users || []).findIndex(u => (u.username || '').toLowerCase() === dep.username);
  if (userIdx === -1) return null;
  const oldVnd = parseInt(data.users[userIdx].vnd || 0, 10);
  data.users[userIdx].vnd = oldVnd + vnd;

  dep.status = 'credited';
  dep.creditedAt = Date.now();
  dep.creditedBy = byAdmin || 'admin';
  dep.creditedVnd = vnd;
  dep.rejectReason = null;

  db.save(data);
  return { deposit: dep, newBalance: data.users[userIdx].vnd };
}

function reject(id, reason, byAdmin) {
  const { data, list } = _list();
  const idx = list.findIndex(d => d.id === id);
  if (idx === -1) return null;
  if (list[idx].status !== 'pending') return null;
  list[idx].status = 'rejected';
  list[idx].creditedAt = Date.now();
  list[idx].creditedBy = byAdmin || 'admin';
  list[idx].rejectReason = String(reason || '').slice(0, 300);
  db.save(data);
  return list[idx];
}

function cancel(id, byUsername) {
  const { data, list } = _list();
  const idx = list.findIndex(d => d.id === id);
  if (idx === -1) return null;
  if (list[idx].status !== 'pending') return null;
  const u = String(byUsername || '').toLowerCase();
  if (list[idx].username !== u) return null;
  list[idx].status = 'cancelled';
  db.save(data);
  return true;
}

function stats() {
  const list = _list().list;
  const sumBy = (s) => list.filter(d => d.status === s).reduce((a, x) => a + (x.creditedVnd || x.amountVnd || 0), 0);
  return {
    total:      list.length,
    pending:    list.filter(d => d.status === 'pending').length,
    credited:   list.filter(d => d.status === 'credited').length,
    rejected:   list.filter(d => d.status === 'rejected').length,
    cancelled:  list.filter(d => d.status === 'cancelled').length,
    pendingVnd:  list.filter(d => d.status === 'pending').reduce((a, x) => a + (x.amountVnd || 0), 0),
    creditedVnd: sumBy('credited')
  };
}

module.exports = { add, findById, listByUser, listAll, credit, reject, cancel, stats };

/**
 * Withdraw store - quản lý yêu cầu rút tiền của idol/BLV
 * Lưu vào db.json field withdrawals[]
 *
 * Status flow:
 *   pending → approved → paid
 *               ↘ rejected
 */
const db = require('./db');

function genId() { return 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function _getList() {
  const d = db.load();
  if (!Array.isArray(d.withdrawals)) d.withdrawals = [];
  return { data: d, list: d.withdrawals };
}

/**
 * Tạo yêu cầu rút tiền
 * input: {
 *   username, userType,
 *   amount (VND), method ('bank'|'usdt'),
 *   bankName, bankAccount, bankHolder,
 *   usdtNetwork, usdtAddress,
 *   note
 * }
 */
function add(input) {
  const { data, list } = _getList();
  const method = (input.method === 'usdt') ? 'usdt' : 'bank';
  const item = {
    id: genId(),
    username: String(input.username || '').toLowerCase(),
    userType: input.userType || 'user',
    amount: parseInt(input.amount, 10) || 0,
    method: method,
    // Bank
    bankName:    method === 'bank' ? String(input.bankName || '').slice(0, 60)    : '',
    bankAccount: method === 'bank' ? String(input.bankAccount || '').slice(0, 30) : '',
    bankHolder:  method === 'bank' ? String(input.bankHolder || '').slice(0, 80)  : '',
    // USDT
    usdtNetwork: method === 'usdt' ? String(input.usdtNetwork || 'TRC20').slice(0, 10) : '',
    usdtAddress: method === 'usdt' ? String(input.usdtAddress || '').slice(0, 100)    : '',
    // Meta
    note: String(input.note || '').slice(0, 200),
    status: 'pending',                // pending | approved | paid | rejected | cancelled
    createdAt: Date.now(),
    reviewedAt: null,
    reviewedBy: null,
    paidAt: null,
    paidTxId: null,                   // mã giao dịch / hash USDT
    rejectReason: null,
    ip: input.ip || ''
  };
  list.unshift(item);
  if (list.length > 2000) data.withdrawals = list.slice(0, 2000);
  db.save(data);
  return item;
}

function findById(id) {
  return _getList().list.find(w => w.id === id) || null;
}

function listByUser(username, opts) {
  opts = opts || {};
  const u = String(username || '').toLowerCase();
  let arr = _getList().list.filter(w => w.username === u);
  if (opts.status) arr = arr.filter(w => w.status === opts.status);
  arr.sort((a, b) => b.createdAt - a.createdAt);
  return arr.slice(0, opts.limit || 50);
}

function listAll(opts) {
  opts = opts || {};
  let arr = _getList().list.slice();
  if (opts.status)   arr = arr.filter(w => w.status === opts.status);
  if (opts.method)   arr = arr.filter(w => w.method === opts.method);
  if (opts.username) arr = arr.filter(w => w.username === opts.username.toLowerCase());
  arr.sort((a, b) => b.createdAt - a.createdAt);
  return arr.slice(0, opts.limit || 200);
}

function approve(id, byAdmin) {
  const { data, list } = _getList();
  const idx = list.findIndex(w => w.id === id);
  if (idx === -1) return null;
  if (list[idx].status !== 'pending') return null;
  list[idx].status = 'approved';
  list[idx].reviewedAt = Date.now();
  list[idx].reviewedBy = byAdmin || 'admin';
  list[idx].rejectReason = null;
  db.save(data);
  return list[idx];
}

function markPaid(id, byAdmin, txId) {
  const { data, list } = _getList();
  const idx = list.findIndex(w => w.id === id);
  if (idx === -1) return null;
  if (!['pending', 'approved'].includes(list[idx].status)) return null;
  list[idx].status = 'paid';
  list[idx].paidAt = Date.now();
  list[idx].reviewedBy = list[idx].reviewedBy || byAdmin || 'admin';
  list[idx].reviewedAt = list[idx].reviewedAt || Date.now();
  list[idx].paidTxId = String(txId || '').slice(0, 120);
  db.save(data);
  return list[idx];
}

function reject(id, reason, byAdmin) {
  const { data, list } = _getList();
  const idx = list.findIndex(w => w.id === id);
  if (idx === -1) return null;
  if (!['pending', 'approved'].includes(list[idx].status)) return null;
  list[idx].status = 'rejected';
  list[idx].reviewedAt = Date.now();
  list[idx].reviewedBy = byAdmin || 'admin';
  list[idx].rejectReason = String(reason || '').slice(0, 300);
  db.save(data);
  return list[idx];
}

function cancel(id, byUsername) {
  const { data, list } = _getList();
  const idx = list.findIndex(w => w.id === id);
  if (idx === -1) return null;
  if (list[idx].status !== 'pending') return null;
  const u = String(byUsername || '').toLowerCase();
  if (list[idx].username !== u) return null;
  list[idx].status = 'cancelled';
  db.save(data);
  return true;
}

function stats() {
  const list = _getList().list;
  const sumBy = (s) => list.filter(w => w.status === s).reduce((acc, w) => acc + (w.amount || 0), 0);
  return {
    total: list.length,
    pending:   list.filter(w => w.status === 'pending').length,
    approved:  list.filter(w => w.status === 'approved').length,
    paid:      list.filter(w => w.status === 'paid').length,
    rejected:  list.filter(w => w.status === 'rejected').length,
    cancelled: list.filter(w => w.status === 'cancelled').length,
    pendingAmount:  sumBy('pending'),
    approvedAmount: sumBy('approved'),
    paidAmount:     sumBy('paid')
  };
}

/**
 * Tổng đã rút (paid) của 1 user → để check balance
 */
function totalPaidByUser(username) {
  const u = String(username || '').toLowerCase();
  return _getList().list
    .filter(w => w.username === u && w.status === 'paid')
    .reduce((acc, w) => acc + (w.amount || 0), 0);
}

/**
 * Tổng đang giữ (pending + approved) của 1 user → hold balance
 */
function totalPendingByUser(username) {
  const u = String(username || '').toLowerCase();
  return _getList().list
    .filter(w => w.username === u && ['pending', 'approved'].includes(w.status))
    .reduce((acc, w) => acc + (w.amount || 0), 0);
}

module.exports = {
  add, findById, listByUser, listAll,
  approve, markPaid, reject, cancel,
  stats, totalPaidByUser, totalPendingByUser
};

/**
 * Cấu hình kênh nhận tiền của hệ thống (admin set).
 * Lưu trong db.json field paymentConfig{}
 */
const db = require('./db');

const DEFAULT = {
  // Ngân hàng
  bank: {
    bankName:    'Vietcombank',
    bankCode:    'VCB',
    accountNo:   '',                    // STK
    accountName: '',                    // chủ TK
    branch:      '',
    qrTemplate:  'compact2'             // VietQR template
  },
  // USDT
  usdt: {
    network: 'TRC20',
    address: '',
    rateVnd: 26000                       // 1 USDT = X VND (admin chỉnh khi tỉ giá đổi)
  },
  // Khuyến mãi
  bonus: {
    firstDepositPct: 0,                  // % bonus cho lần nạp đầu (0 = tắt)
    minDepositVnd:   50000               // tối thiểu mỗi lần nạp
  },
  // Hiển thị
  enabled: { bank: true, usdt: true }
};

function load() {
  const d = db.load();
  if (!d.paymentConfig) d.paymentConfig = JSON.parse(JSON.stringify(DEFAULT));
  // Merge default cho field thiếu (forward-compat)
  return Object.assign({}, DEFAULT, d.paymentConfig, {
    bank:    Object.assign({}, DEFAULT.bank,    d.paymentConfig.bank || {}),
    usdt:    Object.assign({}, DEFAULT.usdt,    d.paymentConfig.usdt || {}),
    bonus:   Object.assign({}, DEFAULT.bonus,   d.paymentConfig.bonus || {}),
    enabled: Object.assign({}, DEFAULT.enabled, d.paymentConfig.enabled || {})
  });
}

function save(cfg) {
  const d = db.load();
  d.paymentConfig = {
    bank:    Object.assign({}, DEFAULT.bank,    cfg.bank || {}),
    usdt:    Object.assign({}, DEFAULT.usdt,    cfg.usdt || {}),
    bonus:   Object.assign({}, DEFAULT.bonus,   cfg.bonus || {}),
    enabled: Object.assign({}, DEFAULT.enabled, cfg.enabled || {})
  };
  db.save(d);
  return d.paymentConfig;
}

/**
 * Sinh URL QR VietQR cho chuyển khoản nhanh
 * https://img.vietqr.io/image/<bank>-<account>-<template>.png?amount=&addInfo=
 */
function vietQrUrl(amount, addInfo) {
  const c = load().bank;
  if (!c.accountNo || !c.bankCode) return '';
  const tpl = c.qrTemplate || 'compact2';
  const u = 'https://img.vietqr.io/image/' + encodeURIComponent(c.bankCode) +
            '-' + encodeURIComponent(c.accountNo) + '-' + tpl + '.png' +
            '?amount=' + encodeURIComponent(amount || '') +
            '&addInfo=' + encodeURIComponent(addInfo || '') +
            '&accountName=' + encodeURIComponent(c.accountName || '');
  return u;
}

module.exports = { load, save, vietQrUrl, DEFAULT };

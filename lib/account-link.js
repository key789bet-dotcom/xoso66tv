/**
 * Account link - liên kết xoso66tv user với xoso66 account
 * Lưu mapping trong data/account-links.json
 */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const db     = require('./db');
const mailer   = require('./mailer');
const telegram = require('./telegram');

const FILE = path.join(__dirname, '..', 'data', 'account-links.json');
// Pending verification codes (in-memory, TTL 10 phút)
const PENDING = new Map();

function loadLinks(){
  try { if (!fs.existsSync(FILE)) return []; return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]'); }
  catch(e){ return []; }
}
function saveLinks(list){
  try { fs.mkdirSync(path.dirname(FILE), { recursive:true }); fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); return true; }
  catch(e){ console.error('links save:', e.message); return false; }
}

function getLinkByX66tv(username){
  return loadLinks().find(function(l){ return (l.x66tvUsername||'').toLowerCase() === (username||'').toLowerCase(); });
}
function getLinkByXoso66(username){
  return loadLinks().find(function(l){ return (l.xoso66Username||'').toLowerCase() === (username||'').toLowerCase(); });
}

// Sinh code 6 số
function genCode(){ return String(Math.floor(100000 + Math.random()*900000)); }

// Bước 1: tạo verification request
function requestLink(x66tvUsername, xoso66Username){
  if (!x66tvUsername || !xoso66Username) return { ok:false, message:'Thiếu username' };
  if (xoso66Username.length < 3 || xoso66Username.length > 30) return { ok:false, message:'Username xoso66 không hợp lệ' };

  // Check trùng
  var existing = getLinkByXoso66(xoso66Username);
  if (existing && existing.x66tvUsername !== x66tvUsername) {
    return { ok:false, message:'Tài khoản xoso66 này đã được liên kết với user khác' };
  }
  var existingMy = getLinkByX66tv(x66tvUsername);
  if (existingMy && existingMy.verified) {
    return { ok:false, message:'Bạn đã có liên kết. Vui lòng hủy liên kết cũ trước.' };
  }

  var code = genCode();
  var key  = x66tvUsername.toLowerCase() + ':' + xoso66Username.toLowerCase();
  PENDING.set(key, { code: code, expires: Date.now() + 10*60*1000, x66tvUsername: x66tvUsername, xoso66Username: xoso66Username });

  // Tim user de gui code
  var data = db.load();
  var user = data.users.find(function(u){ return (u.username||'').toLowerCase() === x66tvUsername.toLowerCase(); });
  var channels = [];
  var demoCode = null;

  if (user) {
    // 1. TELEGRAM (uu tien nhat - bao mat cao)
    if (user.telegramChatId && telegram.isReady()) {
      try {
        telegram.sendOtp(user.telegramChatId, code, 'lien ket xoso66');
        channels.push('telegram');
      } catch(e){ console.error('TG send:', e.message); }
    }
    // 2. EMAIL
    if (user.email && mailer.isReady()) {
      try {
        mailer.sendOtp(user.email, code, 'lien ket xoso66');
        channels.push('email');
      } catch(e){ console.error('Mail send:', e.message); }
    }
  }

  // DEMO mode: neu khong gui duoc qua channel nao, hien luon
  if (channels.length === 0) demoCode = code;

  return {
    ok: true,
    expiresIn: 600,
    channels: channels,           // ['telegram', 'email']
    demoMode: channels.length === 0,
    code: demoCode,               // chi tra ve neu khong co channel
    hint: channels.length
      ? 'Mã xác thực đã gửi qua ' + channels.join(' và ') + '. Kiểm tra trong vài giây.'
      : 'Demo: mã hiện ngay (chưa cấu hình email/Telegram). Production sẽ gửi qua kênh thật.'
  };
}

// Bước 2: confirm với code
function confirmLink(x66tvUsername, xoso66Username, code){
  var key = x66tvUsername.toLowerCase() + ':' + xoso66Username.toLowerCase();
  var p = PENDING.get(key);
  if (!p) return { ok:false, message:'Không tìm thấy yêu cầu. Vui lòng tạo mới.' };
  if (Date.now() > p.expires) { PENDING.delete(key); return { ok:false, message:'Mã đã hết hạn. Tạo lại nhé.' }; }
  if (String(code).trim() !== p.code) return { ok:false, message:'Mã xác thực không đúng' };

  // Save link
  var links = loadLinks();
  var i = links.findIndex(function(l){ return (l.x66tvUsername||'').toLowerCase() === x66tvUsername.toLowerCase(); });
  var entry = {
    x66tvUsername: x66tvUsername,
    xoso66Username: xoso66Username,
    linkedAt: Date.now(),
    verified: true,
    totalReceived: 0,
    lastSyncAt: null
  };
  if (i >= 0) links[i] = entry; else links.push(entry);
  saveLinks(links);
  PENDING.delete(key);
  return { ok:true, message:'Đã liên kết thành công!', link: entry };
}

function unlink(x66tvUsername){
  var links = loadLinks();
  var n = links.length;
  links = links.filter(function(l){ return (l.x66tvUsername||'').toLowerCase() !== x66tvUsername.toLowerCase(); });
  saveLinks(links);
  return { ok: n > links.length };
}

// Update stats khi nhận deposit
function recordDeposit(xoso66Username, amount){
  var links = loadLinks();
  var i = links.findIndex(function(l){ return (l.xoso66Username||'').toLowerCase() === (xoso66Username||'').toLowerCase(); });
  if (i < 0) return null;
  links[i].totalReceived = (links[i].totalReceived || 0) + amount;
  links[i].lastSyncAt = Date.now();
  saveLinks(links);
  return links[i];
}

module.exports = { loadLinks, saveLinks, getLinkByX66tv, getLinkByXoso66, requestLink, confirmLink, unlink, recordDeposit };

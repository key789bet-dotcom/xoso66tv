/**
 * Partner sync: nhận webhook từ xoso66 khi user nạp tiền,
 * tự động cộng X COIN cho tài khoản tương ứng bên xoso66tv.com
 */
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const db     = require('./db');
const links  = require('./account-link');

const CFG_FILE = path.join(__dirname, '..', 'data', 'partner-config.json');
const LOG_FILE = path.join(__dirname, '..', 'data', 'partner-log.json');

// Default config
var DEFAULT_CFG = {
  // Webhook secret để verify request thật từ xoso66 (HMAC SHA256)
  webhookSecret: 'CHANGE_ME_xoso66_to_x66tv_secret',
  // Tỉ lệ chuyển đổi: 1000 VND nạp → bao nhiêu X COIN
  vndPerCoin: 1000,                  // 1 X COIN = 1.000 VND nạp
  coinPerVndK: 1,                    // 1.000 VND nạp = 1 X COIN
  // Bonus khuyến mãi nạp (theo bậc)
  bonusTiers: [
    { fromVnd: 100000,  bonusCoin: 50  },    // nạp ≥ 100K → +50 xu bonus
    { fromVnd: 500000,  bonusCoin: 300 },    // nạp ≥ 500K → +300 xu bonus
    { fromVnd: 1000000, bonusCoin: 1000 },   // nạp ≥ 1tr  → +1000 xu bonus
    { fromVnd: 5000000, bonusCoin: 8000 }    // nạp ≥ 5tr  → +8000 xu bonus
  ],
  // URL webhook để config bên xoso66 (read-only hiển thị)
  myWebhookUrl: '/api/partner/xoso66/deposit',
  // Tự sync tài khoản: nếu username chưa có bên xoso66tv → tạo mới?
  autoCreateUser: true,
  // Bật/tắt
  enabled: true
};

function loadConfig(){
  try {
    if (!fs.existsSync(CFG_FILE)) { saveConfig(DEFAULT_CFG); return DEFAULT_CFG; }
    return Object.assign({}, DEFAULT_CFG, JSON.parse(fs.readFileSync(CFG_FILE, 'utf8') || '{}'));
  } catch(e){ console.error('partner cfg load:', e.message); return DEFAULT_CFG; }
}
function saveConfig(cfg){
  try { fs.mkdirSync(path.dirname(CFG_FILE), { recursive:true }); fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2)); return true; }
  catch(e){ console.error('partner cfg save:', e.message); return false; }
}

function loadLog(){
  try { if (!fs.existsSync(LOG_FILE)) return []; return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8') || '[]'); }
  catch(e){ return []; }
}
function appendLog(entry){
  try {
    var log = loadLog();
    log.unshift(Object.assign({ t: Date.now() }, entry));
    fs.writeFileSync(LOG_FILE, JSON.stringify(log.slice(0, 500), null, 2));
  } catch(e){ console.error('partner log:', e.message); }
}

// Tính X COIN từ VND nạp
function calcCoins(vndAmount){
  var cfg = loadConfig();
  var base = Math.floor(vndAmount / cfg.vndPerCoin) * cfg.coinPerVndK;
  // Áp dụng bonus bậc cao nhất đạt được
  var bonus = 0;
  (cfg.bonusTiers || []).sort(function(a,b){ return a.fromVnd - b.fromVnd; }).forEach(function(t){
    if (vndAmount >= t.fromVnd) bonus = t.bonusCoin;
  });
  return { base: base, bonus: bonus, total: base + bonus };
}

// Verify HMAC signature
function verifySignature(body, signatureHeader){
  var cfg = loadConfig();
  if (!cfg.webhookSecret || cfg.webhookSecret === 'CHANGE_ME_xoso66_to_x66tv_secret') {
    // Cho phép qua nếu chưa setup (DEV mode)
    return { ok: true, devMode: true };
  }
  if (!signatureHeader) return { ok: false, reason: 'missing signature' };
  var expected = crypto.createHmac('sha256', cfg.webhookSecret).update(typeof body === 'string' ? body : JSON.stringify(body)).digest('hex');
  if (signatureHeader !== expected) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

// Xử lý event nạp tiền: cộng X COIN cho user
function processDeposit(payload){
  var cfg = loadConfig();
  if (!cfg.enabled) return { ok: false, reason: 'partner sync disabled' };
  if (!payload || !payload.username || !payload.amount) return { ok: false, reason: 'invalid payload' };

  var data = db.load();
  // 1. Tim qua mapping xoso66 -> xoso66tv (uu tien)
  var x66tvName = null;
  var linkRec = links.getLinkByXoso66(payload.username);
  if (linkRec) x66tvName = linkRec.x66tvUsername;
  // 2. Fallback: match truc tiep username (same on both sides)
  var user = data.users.find(function(u){
    var un = (u.username||'').toLowerCase();
    return un === (x66tvName||'').toLowerCase() || un === String(payload.username).toLowerCase();
  });
  if (!user) {
    if (!cfg.autoCreateUser) return { ok: false, reason: 'user not found' };
    user = {
      id: 'u' + Date.now().toString(36),
      username: payload.username,
      fullname: payload.fullname || payload.username,
      phone: payload.phone || '',
      email: payload.email || '',
      vip: 1, balance: 0, status:'active', coin: 0,
      joinedAt: Date.now()
    };
    data.users.push(user);
  }

  var c = calcCoins(parseInt(payload.amount, 10) || 0);
  user.coin = (user.coin || 0) + c.total;
  user.lastDeposit = { vnd: payload.amount, at: Date.now(), txId: payload.txId };
  // Cập nhật VIP theo tổng nạp tích lũy
  user.totalDeposited = (user.totalDeposited || 0) + parseInt(payload.amount, 10);
  if      (user.totalDeposited >= 100000000) user.vip = 5;
  else if (user.totalDeposited >= 50000000)  user.vip = 4;
  else if (user.totalDeposited >= 10000000)  user.vip = 3;
  else if (user.totalDeposited >= 5000000)   user.vip = 2;

  db.save(data);
  // Record vao link stats
  try { links.recordDeposit(payload.username, parseInt(payload.amount,10)||0); } catch(e){}
  appendLog({
    type: 'deposit',
    username: payload.username,
    vnd: payload.amount,
    coinBase: c.base, coinBonus: c.bonus, coinTotal: c.total,
    txId: payload.txId,
    newCoinBalance: user.coin,
    newVip: user.vip,
    ok: true
  });

  return { ok: true, username: user.username, coinAdded: c.total, base: c.base, bonus: c.bonus, newBalance: user.coin, newVip: user.vip };
}

module.exports = { loadConfig, saveConfig, loadLog, appendLog, calcCoins, verifySignature, processDeposit };

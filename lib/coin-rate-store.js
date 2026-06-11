/**
 * Coin rate store - Idol set giá X COIN/phút cho phòng live của mình
 * Lưu vào idol.coinPerMin (field trên idol record trong db.json)
 *
 * Khi viewer xem phòng:
 *  - Mỗi 60s → trừ coinPerMin từ X COIN của viewer
 *  - Hết X COIN → kick + hiển thị modal nạp
 */
const db = require('./db');

function getRate(idolId) {
  try {
    const d = db.load();
    const idol = (d.idols || []).find(i => i.id === idolId);
    return idol ? Math.max(0, parseInt(idol.coinPerMin || 0, 10)) : 0;
  } catch(e) { return 0; }
}

function setRate(idolId, rate, byUsername) {
  const d = db.load();
  const idx = (d.idols || []).findIndex(i => i.id === idolId);
  if (idx === -1) return null;

  // Permission: chỉ idol đó hoặc admin
  if (byUsername) {
    const idol = d.idols[idx];
    const owner = String(idol.userId || idol.username || '').toLowerCase();
    if (owner !== String(byUsername).toLowerCase()) {
      // Check admin role
      const user = (d.users || []).find(u => (u.username || '').toLowerCase() === byUsername.toLowerCase());
      if (!user || user.role !== 'admin') return false;
    }
  }
  const r = Math.max(0, Math.min(1000, parseInt(rate, 10) || 0));
  d.idols[idx].coinPerMin = r;
  db.save(d);
  return r;
}

/**
 * Trừ X COIN của user (mỗi tick từ viewer)
 * Trả về { ok, newBalance, kicked }
 */
function chargeViewer(username, idolId) {
  const rate = getRate(idolId);
  if (rate <= 0) return { ok:true, charged:0, newBalance:0, free:true };

  const d = db.load();
  const uIdx = (d.users || []).findIndex(u => (u.username || '').toLowerCase() === String(username).toLowerCase());
  if (uIdx === -1) return { ok:false, error:'User không tồn tại' };

  const bal = parseInt(d.users[uIdx].coin || 0, 10);
  if (bal < rate) {
    return { ok:false, kicked:true, needCoin: rate, currentBalance: bal, error:'Hết X COIN' };
  }
  d.users[uIdx].coin = bal - rate;

  // Cộng vào "earnedCoin" cho idol (info only - không quy đổi VND)
  const iIdx = (d.idols || []).findIndex(i => i.id === idolId);
  if (iIdx !== -1) {
    d.idols[iIdx].earnedCoin = (parseInt(d.idols[iIdx].earnedCoin || 0, 10) || 0) + rate;
  }
  db.save(d);
  return { ok:true, charged: rate, newBalance: d.users[uIdx].coin };
}

module.exports = { getRate, setRate, chargeViewer };

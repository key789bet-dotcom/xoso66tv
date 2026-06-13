/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ NHIỆM VỤ DAILY STORE — Mục 31                                 ║
 * ║                                                                ║
 * ║ 5 nhiệm vụ reset 00:00 (giờ VN) mỗi ngày:                     ║
 * ║   👀 Xem 2 phòng live          → +30 X COIN                   ║
 * ║   💬 Gửi 5 tin nhắn chat       → +20 X COIN                   ║
 * ║   🎁 Tặng 1 món quà            → +50 X COIN                   ║
 * ║   🎰 Chơi 1 lượt mini game     → +25 X COIN                   ║
 * ║   🎡 Quay vòng quay may mắn    → +15 X COIN                   ║
 * ║                                                                ║
 * ║ Data structure:                                                ║
 * ║   db.missions[userId][YYYY-MM-DD] = { progress:{}, claimed:{} }║
 * ║                                                                ║
 * ║ Auto-cleanup: xoá history > 7 ngày để DB không bloat.         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const db = require('./db');

const MISSIONS = [
  { id: 'watch_2_rooms',  name: 'Xem 2 phòng live',        target: 2, reward: 30, icon: '👀', category: 'view'  },
  { id: 'send_chat_5',    name: 'Gửi 5 tin nhắn chat',     target: 5, reward: 20, icon: '💬', category: 'chat'  },
  { id: 'send_gift_1',    name: 'Tặng 1 món quà bất kỳ',   target: 1, reward: 50, icon: '🎁', category: 'gift'  },
  { id: 'play_game_1',    name: 'Chơi 1 lượt mini game',   target: 1, reward: 25, icon: '🎰', category: 'game'  },
  { id: 'spin_wheel_1',   name: 'Quay vòng quay may mắn',  target: 1, reward: 15, icon: '🎡', category: 'spin'  }
];

function _todayKey() {
  // VN timezone (UTC+7)
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function getStatus(userId) {
  if (!userId) return { ok: false, error: 'Cần đăng nhập' };
  const data = db.load();
  if (!data.missions) data.missions = {};
  if (!data.missions[userId]) data.missions[userId] = {};
  const today = _todayKey();
  if (!data.missions[userId][today]) data.missions[userId][today] = { progress: {}, claimed: {} };

  const u = data.missions[userId][today];

  const list = MISSIONS.map(function(m) {
    const progress = Math.min(u.progress[m.id] || 0, m.target);
    const completed = progress >= m.target;
    const claimed = !!u.claimed[m.id];
    return {
      id: m.id,
      name: m.name,
      icon: m.icon,
      target: m.target,
      reward: m.reward,
      category: m.category,
      progress,
      progressPct: Math.round((progress / m.target) * 100),
      completed,
      claimed,
      canClaim: completed && !claimed
    };
  });

  const totalReward = list.reduce(function(s, m){ return s + (m.claimed ? m.reward : 0); }, 0);
  const canClaimCount = list.filter(function(m){ return m.canClaim; }).length;

  return {
    ok: true,
    missions: list,
    totalReward,
    canClaimCount,
    completedCount: list.filter(function(m){ return m.completed; }).length
  };
}

function track(userId, missionId, amount) {
  if (!userId) return false;
  amount = amount || 1;
  const m = MISSIONS.find(function(x){ return x.id === missionId; });
  if (!m) return false;
  const data = db.load();
  if (!data.missions) data.missions = {};
  if (!data.missions[userId]) data.missions[userId] = {};
  const today = _todayKey();
  if (!data.missions[userId][today]) data.missions[userId][today] = { progress: {}, claimed: {} };
  const u = data.missions[userId][today];
  const prev = u.progress[missionId] || 0;
  const next = Math.min(prev + amount, m.target);
  if (next !== prev) {
    u.progress[missionId] = next;
    db.save(data);
  }
  return next;
}

function claim(userId, missionId) {
  if (!userId) return { ok: false, error: 'Cần đăng nhập' };
  const m = MISSIONS.find(function(x){ return x.id === missionId; });
  if (!m) return { ok: false, error: 'Nhiệm vụ không tồn tại' };

  const data = db.load();
  if (!data.missions || !data.missions[userId]) return { ok: false, error: 'Chưa có tiến độ nhiệm vụ' };
  const today = _todayKey();
  if (!data.missions[userId][today]) return { ok: false, error: 'Chưa có tiến độ hôm nay' };
  const u = data.missions[userId][today];

  if (u.claimed[missionId]) return { ok: false, error: 'Bạn đã nhận thưởng nhiệm vụ này rồi' };
  if ((u.progress[missionId] || 0) < m.target) {
    return { ok: false, error: 'Chưa hoàn thành nhiệm vụ' };
  }

  u.claimed[missionId] = Date.now();

  // Cộng X COIN
  if (!data.users) data.users = [];
  const user = data.users.find(function(x){
    return (x.username || '').toLowerCase() === userId.toLowerCase();
  });
  let newCoin = null;
  if (user) {
    user.coin = (user.coin || 0) + m.reward;
    newCoin = user.coin;
  }

  db.save(data);

  return {
    ok: true,
    reward: m.reward,
    newCoin,
    message: 'Hoàn thành "' + m.name + '" — Nhận +' + m.reward + ' X COIN!'
  };
}

// Auto-cleanup: xoá data > 7 ngày để DB không bloat
function cleanup() {
  const data = db.load();
  if (!data.missions) return;
  const cutoff = Date.now() - 7 * 86400000;
  let cleaned = 0;
  Object.keys(data.missions).forEach(function(userId){
    Object.keys(data.missions[userId] || {}).forEach(function(date){
      const ts = new Date(date + 'T00:00:00Z').getTime();
      if (ts < cutoff) {
        delete data.missions[userId][date];
        cleaned++;
      }
    });
    if (Object.keys(data.missions[userId]).length === 0) {
      delete data.missions[userId];
    }
  });
  if (cleaned > 0) {
    db.save(data);
    console.log('[MISSION] cleaned ' + cleaned + ' old entries');
  }
}

module.exports = { getStatus, track, claim, cleanup, MISSIONS };

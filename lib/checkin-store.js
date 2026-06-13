/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ ĐIỂM DANH STORE — Mục 31                                      ║
 * ║                                                                ║
 * ║ Daily check-in with 7-day streak bonus.                       ║
 * ║   Day 1 of streak: +10 X COIN                                 ║
 * ║   Day 2:            +20                                        ║
 * ║   Day 3:            +30                                        ║
 * ║   Day 4:            +50                                        ║
 * ║   Day 5:            +80                                        ║
 * ║   Day 6:            +120                                       ║
 * ║   Day 7+:           +200 (cap, mỗi ngày tiếp theo cũng 200)   ║
 * ║                                                                ║
 * ║ Skip 1 ngày → streak reset về Day 1.                          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const db = require('./db');

const REWARDS = [10, 20, 30, 50, 80, 120, 200];

function _todayKey() {
  // Use VN timezone (UTC+7) for daily reset at midnight Vietnam time
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function _yesterdayKey() {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000 - 86400000);
  return d.toISOString().slice(0, 10);
}

function _rewardForDay(streakDay) {
  // streakDay = 1..N (1-indexed). Cap at REWARDS.length.
  const idx = Math.min(streakDay - 1, REWARDS.length - 1);
  return REWARDS[Math.max(0, idx)];
}

function getStatus(userId) {
  if (!userId) return { ok: false, error: 'Cần đăng nhập' };
  const data = db.load();
  if (!data.checkins) data.checkins = {};
  const c = data.checkins[userId] || { lastDate: null, streak: 0, totalDays: 0, history: [] };

  const today = _todayKey();
  const yesterday = _yesterdayKey();

  const claimedToday = c.lastDate === today;
  const continuingStreak = c.lastDate === today || c.lastDate === yesterday;
  const displayStreak = continuingStreak ? c.streak : 0;
  const nextDayInStreak = claimedToday ? displayStreak : (displayStreak + 1);
  const todayReward = _rewardForDay(nextDayInStreak);

  // Build 7-day grid (showing rewards for day 1..7 with current position highlighted)
  const grid = [];
  for (let i = 1; i <= 7; i++) {
    const claimed = continuingStreak && i <= displayStreak;
    const isToday = !claimedToday && i === nextDayInStreak;
    grid.push({ day: i, reward: REWARDS[i - 1], claimed, isToday });
  }

  return {
    ok: true,
    claimedToday,
    streak: displayStreak,
    nextDayInStreak,
    todayReward,
    totalDays: c.totalDays || 0,
    grid,
    history: (c.history || []).slice(-7).reverse()
  };
}

function claim(userId) {
  if (!userId) return { ok: false, error: 'Cần đăng nhập' };
  const data = db.load();
  if (!data.checkins) data.checkins = {};
  if (!data.users) data.users = [];

  let c = data.checkins[userId];
  if (!c) c = { lastDate: null, streak: 0, totalDays: 0, history: [] };

  const today = _todayKey();
  const yesterday = _yesterdayKey();

  if (c.lastDate === today) {
    return { ok: false, error: 'Bạn đã điểm danh hôm nay rồi. Quay lại ngày mai!' };
  }

  // Update streak: if last was yesterday → continue, else reset
  if (c.lastDate === yesterday) {
    c.streak = (c.streak || 0) + 1;
  } else {
    c.streak = 1;
  }

  c.lastDate = today;
  c.totalDays = (c.totalDays || 0) + 1;
  c.history = c.history || [];

  const reward = _rewardForDay(c.streak);
  c.history.push({ date: today, reward, streak: c.streak });
  if (c.history.length > 30) c.history = c.history.slice(-30);

  data.checkins[userId] = c;

  // Cộng X COIN
  const user = data.users.find(function(u){
    return (u.username || '').toLowerCase() === userId.toLowerCase();
  });
  let newCoin = null;
  if (user) {
    user.coin = (user.coin || 0) + reward;
    newCoin = user.coin;
  }

  db.save(data);

  return {
    ok: true,
    reward,
    streak: c.streak,
    totalDays: c.totalDays,
    newCoin,
    message: 'Điểm danh thành công! +' + reward + ' X COIN' +
             (c.streak === 7 ? ' 🎉 Đạt tuần liên tiếp!' : '')
  };
}

module.exports = { getStatus, claim, REWARDS, _rewardForDay };

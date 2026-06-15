/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🎯 Predict Store — Hệ thống dự đoán tỉ số                         ║
 * ║                                                                    ║
 * ║ Lưu lượt dự đoán + tính điểm + leaderboard tuần/tháng             ║
 * ║                                                                    ║
 * ║ Cách tính điểm:                                                   ║
 * ║   - Đúng chính xác tỉ số: 100 điểm + 100 X COIN                  ║
 * ║   - Đúng kết quả (W/D/L) + chênh lệch ≤ 1: 30 điểm + 30 X COIN   ║
 * ║   - Đúng kết quả: 10 điểm + 10 X COIN                            ║
 * ║   - Sai: 0 điểm                                                   ║
 * ╚══════════════════════════════════════════════════════════════════*/
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'predictions.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return { predictions: [], results: {} };
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('[PREDICT] load fail:', e.message);
    return { predictions: [], results: {} };
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('[PREDICT] save fail:', e.message);
    return false;
  }
}

/**
 * User submit dự đoán: { username, matchId, home, away, homeScore, awayScore, league, matchTime }
 */
function submitPrediction(input) {
  if (!input.username) throw new Error('Cần đăng nhập');
  if (!input.matchId) throw new Error('Thiếu matchId');
  if (typeof input.homeScore !== 'number' || typeof input.awayScore !== 'number') {
    throw new Error('Tỉ số phải là số');
  }
  if (input.homeScore < 0 || input.homeScore > 20 || input.awayScore < 0 || input.awayScore > 20) {
    throw new Error('Tỉ số 0-20');
  }
  // Match phải chưa bắt đầu (matchTime > now)
  if (input.matchTime && input.matchTime < Date.now()) {
    throw new Error('Trận đã bắt đầu, không thể dự đoán');
  }

  const data = load();

  // Check trùng: 1 user chỉ dự đoán 1 lần/trận
  const existIdx = data.predictions.findIndex(p =>
    p.username === input.username && p.matchId === input.matchId
  );

  const item = {
    id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username: input.username,
    matchId: input.matchId,
    home: input.home || '',
    away: input.away || '',
    league: input.league || '',
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    matchTime: input.matchTime || null,
    submittedAt: Date.now(),
    settled: false,
    points: 0,
    reward: 0  // X COIN reward
  };

  if (existIdx >= 0) {
    // Cho phép update nếu trận chưa bắt đầu + chưa settled
    if (data.predictions[existIdx].settled) {
      throw new Error('Dự đoán này đã được tính điểm, không sửa được');
    }
    item.id = data.predictions[existIdx].id;  // giữ id cũ
    item.submittedAt = data.predictions[existIdx].submittedAt;
    data.predictions[existIdx] = item;
  } else {
    data.predictions.push(item);
  }

  save(data);
  return item;
}

/**
 * Admin settle match: nhập kết quả thật → tính điểm cho all predictions
 */
function settleMatch(matchId, actualHome, actualScore) {
  const data = load();

  if (typeof actualHome !== 'number' || typeof actualScore !== 'number') {
    throw new Error('Tỉ số phải là số');
  }
  data.results[matchId] = {
    home: actualHome,
    away: actualScore,
    settledAt: Date.now()
  };

  const unsettled = data.predictions.filter(p => p.matchId === matchId && !p.settled);
  let totalRewarded = 0;
  unsettled.forEach(p => {
    const { points, reward } = calcReward(p, actualHome, actualScore);
    p.points = points;
    p.reward = reward;
    p.settled = true;
    totalRewarded += reward;
  });

  save(data);
  return {
    matchId,
    actualScore: actualHome + '-' + actualScore,
    predictionsSettled: unsettled.length,
    totalRewarded
  };
}

/**
 * Tính điểm + reward cho 1 prediction so với actual score
 */
function calcReward(pred, actualHome, actualAway) {
  // 1. Đúng chính xác tỉ số
  if (pred.homeScore === actualHome && pred.awayScore === actualAway) {
    return { points: 100, reward: 100 };
  }
  // 2. Đúng kết quả (W/D/L) + chênh lệch tổng ≤ 1
  const predResult = pred.homeScore > pred.awayScore ? 'H' : (pred.homeScore < pred.awayScore ? 'A' : 'D');
  const actualResult = actualHome > actualAway ? 'H' : (actualHome < actualAway ? 'A' : 'D');
  if (predResult === actualResult) {
    const diff = Math.abs((pred.homeScore - pred.awayScore) - (actualHome - actualAway));
    if (diff <= 1) return { points: 30, reward: 30 };
    return { points: 10, reward: 10 };
  }
  return { points: 0, reward: 0 };
}

/**
 * Leaderboard: top N user theo points trong khoảng thời gian
 * period: 'all' | 'week' | 'month'
 */
function leaderboard(period, limit) {
  period = period || 'week';
  limit = limit || 100;

  const data = load();
  const now = Date.now();
  let cutoff = 0;
  if (period === 'week') cutoff = now - 7 * 24 * 3600 * 1000;
  else if (period === 'month') cutoff = now - 30 * 24 * 3600 * 1000;

  const settled = data.predictions.filter(p => p.settled && p.submittedAt >= cutoff);
  const scores = {};
  settled.forEach(p => {
    if (!scores[p.username]) {
      scores[p.username] = { username: p.username, total: 0, correct: 0, exact: 0, count: 0, reward: 0 };
    }
    scores[p.username].total += p.points;
    scores[p.username].count++;
    scores[p.username].reward += p.reward;
    if (p.points >= 100) scores[p.username].exact++;
    if (p.points >= 30) scores[p.username].correct++;
  });

  return Object.values(scores)
    .map(s => Object.assign({}, s, {
      accuracy: s.count > 0 ? Math.round((s.correct / s.count) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/**
 * Lấy prediction của 1 user cho 1 match (để hiển thị "Bạn đã dự đoán X-Y")
 */
function getUserPrediction(username, matchId) {
  if (!username || !matchId) return null;
  const data = load();
  return data.predictions.find(p => p.username === username && p.matchId === matchId) || null;
}

/**
 * Tổng predictions của 1 trận
 */
function getMatchPredictions(matchId) {
  const data = load();
  return data.predictions.filter(p => p.matchId === matchId);
}

/**
 * Stats global
 */
function stats() {
  const data = load();
  const settled = data.predictions.filter(p => p.settled);
  return {
    total: data.predictions.length,
    settled: settled.length,
    pending: data.predictions.length - settled.length,
    totalRewarded: settled.reduce((s, p) => s + p.reward, 0),
    exactPredictions: settled.filter(p => p.points >= 100).length,
    uniqueUsers: new Set(data.predictions.map(p => p.username)).size
  };
}

module.exports = {
  submitPrediction,
  settleMatch,
  leaderboard,
  getUserPrediction,
  getMatchPredictions,
  calcReward,
  stats,
  load
};

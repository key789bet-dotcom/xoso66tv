/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🎯 Predict Store — Dự đoán Tài Xỉu & Kèo Chấp                    ║
 * ║                                                                    ║
 * ║ User dự đoán 2 thị trường cả trận:                                ║
 * ║   1. Tài/Xỉu (Over/Under): tổng bàn vs ouLine                    ║
 * ║   2. Kèo Chấp (Asian Handicap): home/away vs ahLine             ║
 * ║                                                                    ║
 * ║ Default lines (95% trận VN dùng):                                 ║
 * ║   ouLine = 2.5  (Tài nếu tổng > 2.5, Xỉu nếu < 2.5)             ║
 * ║   ahLine = 0.5  (Home chấp 0.5: thắng 1+ bàn = home win AH)     ║
 * ║                                                                    ║
 * ║ Reward:                                                            ║
 * ║   - Đúng 1 kèo: 30 X COIN                                        ║
 * ║   - Đúng cả 2 kèo: 100 X COIN                                    ║
 * ╚══════════════════════════════════════════════════════════════════*/
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'predictions.json');

// Default lines (có thể override per-match từ admin/odds API)
const DEFAULT_OU_LINE = 2.5;
const DEFAULT_AH_LINE = 0.5;  // dương = đội NHÀ chấp (bị trừ điểm)

function load() {
  try {
    if (!fs.existsSync(FILE)) return { predictions: [], results: {}, lines: {} };
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { predictions: d.predictions || [], results: d.results || {}, lines: d.lines || {} };
  } catch (e) {
    console.error('[PREDICT] load fail:', e.message);
    return { predictions: [], results: {}, lines: {} };
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
 * Get O/U & AH line cho match (đã set bởi admin hoặc default)
 */
function getLines(matchId) {
  const data = load();
  return data.lines[matchId] || { ouLine: DEFAULT_OU_LINE, ahLine: DEFAULT_AH_LINE };
}

/**
 * Admin set line riêng cho 1 match (có thể đến từ Odds API sau này)
 */
function setLines(matchId, ouLine, ahLine) {
  const data = load();
  data.lines[matchId] = {
    ouLine: typeof ouLine === 'number' ? ouLine : DEFAULT_OU_LINE,
    ahLine: typeof ahLine === 'number' ? ahLine : DEFAULT_AH_LINE,
    setAt: Date.now()
  };
  save(data);
  return data.lines[matchId];
}

/**
 * User submit prediction
 * input: { username, matchId, home, away, league, matchTime, pickOU, pickAH }
 *   pickOU: 'tai' | 'xiu' | null (skip)
 *   pickAH: 'home' | 'away' | null (skip)
 * BẮT BUỘC ít nhất 1 trong 2 pick
 */
// Stake limits — chống abuse, giữ kinh tế X COIN cân bằng
const STAKE_MIN = 10;
const STAKE_MAX = 1000;
// Odds locks — lưu odds tại thời điểm submit để settle đúng (odds API có thể đổi)

function submitPrediction(input) {
  if (!input.username) throw new Error('Cần đăng nhập');
  if (!input.matchId) throw new Error('Thiếu matchId');

  const pickOU = ['tai','xiu'].indexOf(input.pickOU) >= 0 ? input.pickOU : null;
  const pickAH = ['home','away'].indexOf(input.pickAH) >= 0 ? input.pickAH : null;
  if (!pickOU && !pickAH) throw new Error('Chọn ít nhất 1 kèo (Tài/Xỉu hoặc Chấp Home/Away)');

  if (input.matchTime && input.matchTime < Date.now()) {
    throw new Error('Trận đã bắt đầu, không thể dự đoán');
  }

  // Stake validation (mặc định 50 X COIN nếu không truyền)
  let stake = parseInt(input.stake, 10);
  if (!stake || isNaN(stake)) stake = 50;
  if (stake < STAKE_MIN) throw new Error('Cược tối thiểu ' + STAKE_MIN + ' X COIN');
  if (stake > STAKE_MAX) throw new Error('Cược tối đa ' + STAKE_MAX + ' X COIN/lần');

  // Lock odds tại thời điểm submit (để settle đúng dù odds đổi sau)
  const oddsOU = parseFloat(input.oddsOU) || null;
  const oddsAH = parseFloat(input.oddsAH) || null;

  const data = load();
  const lines = data.lines[input.matchId] || { ouLine: DEFAULT_OU_LINE, ahLine: DEFAULT_AH_LINE };

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
    pickOU: pickOU,
    pickAH: pickAH,
    ouLine: lines.ouLine,
    ahLine: lines.ahLine,
    stake: stake,            // 🆕 Số X COIN đã cược
    oddsOUAtSubmit: oddsOU,  // 🆕 Tỉ lệ Tài/Xỉu lúc submit
    oddsAHAtSubmit: oddsAH,  // 🆕 Tỉ lệ Kèo chấp lúc submit
    matchTime: input.matchTime || null,
    submittedAt: Date.now(),
    settled: false,
    points: 0,
    reward: 0,
    correctOU: null,
    correctAH: null
  };

  if (existIdx >= 0) {
    if (data.predictions[existIdx].settled) {
      throw new Error('Dự đoán đã được tính điểm, không sửa được');
    }
    item.id = data.predictions[existIdx].id;
    item.submittedAt = data.predictions[existIdx].submittedAt;
    data.predictions[existIdx] = item;
  } else {
    data.predictions.push(item);
  }

  save(data);
  return item;
}

/**
 * Tính kết quả O/U cho 1 trận
 * Return 'tai' | 'xiu' | 'push'
 */
function evalOU(actualHome, actualAway, ouLine) {
  const total = actualHome + actualAway;
  if (total > ouLine) return 'tai';
  if (total < ouLine) return 'xiu';
  return 'push';  // chỉ xảy ra khi line nguyên (vd 2.0, 3.0)
}

/**
 * Tính kết quả AH cho 1 trận
 * ahLine dương: đội nhà chấp (bị trừ điểm)
 * Return 'home' | 'away' | 'push'
 */
function evalAH(actualHome, actualAway, ahLine) {
  const adjustedHome = actualHome - ahLine;
  if (adjustedHome > actualAway) return 'home';
  if (adjustedHome < actualAway) return 'away';
  return 'push';
}

/**
 * Admin settle match — tính điểm cho all predictions
 */
function settleMatch(matchId, actualHome, actualAway) {
  if (typeof actualHome !== 'number' || typeof actualAway !== 'number') {
    throw new Error('Tỉ số phải là số');
  }
  const data = load();
  data.results[matchId] = {
    home: actualHome,
    away: actualAway,
    settledAt: Date.now()
  };

  const unsettled = data.predictions.filter(p => p.matchId === matchId && !p.settled);
  let totalRewarded = 0;
  unsettled.forEach(p => {
    let correctOU = null, correctAH = null;
    let points = 0, reward = 0;
    let correctCount = 0;

    // Stake split: nếu chọn cả 2 kèo → chia đôi stake cho mỗi bên
    // Nếu chọn 1 kèo → toàn bộ stake cho kèo đó
    const stake = p.stake || 50;
    const bothPicks = (p.pickOU && p.pickAH);
    const stakePerPick = bothPicks ? Math.floor(stake / 2) : stake;

    if (p.pickOU) {
      const actualOU = evalOU(actualHome, actualAway, p.ouLine);
      correctOU = actualOU === p.pickOU;
      if (correctOU) {
        correctCount++;
        // Reward = stake × odds (odds lock tại submit, fallback 1.85 nếu null)
        const odds = p.oddsOUAtSubmit || 1.85;
        reward += Math.round(stakePerPick * odds);
        points += 50;
      }
      if (actualOU === 'push') {
        correctOU = null;
        reward += stakePerPick;  // refund stake khi push
      }
    }
    if (p.pickAH) {
      const actualAH = evalAH(actualHome, actualAway, p.ahLine);
      correctAH = actualAH === p.pickAH;
      if (correctAH) {
        correctCount++;
        const odds = p.oddsAHAtSubmit || 1.90;
        reward += Math.round(stakePerPick * odds);
        points += 50;
      }
      if (actualAH === 'push') {
        correctAH = null;
        reward += stakePerPick;
      }
    }

    // Bonus đặc biệt nếu đúng cả 2 kèo (parlay): +10% combined
    if (correctCount === 2) {
      reward = Math.round(reward * 1.1);
      points += 50;  // bonus điểm
    }

    p.correctOU = correctOU;
    p.correctAH = correctAH;
    p.points = points;
    p.reward = reward;
    p.netProfit = reward - stake;  // 🆕 lãi/lỗ thực
    p.settled = true;
    totalRewarded += reward;
  });

  save(data);
  return {
    matchId,
    actualScore: actualHome + '-' + actualAway,
    predictionsSettled: unsettled.length,
    totalRewarded
  };
}

/**
 * Leaderboard
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

function getUserPrediction(username, matchId) {
  if (!username || !matchId) return null;
  const data = load();
  return data.predictions.find(p => p.username === username && p.matchId === matchId) || null;
}

function getMatchPredictions(matchId) {
  const data = load();
  return data.predictions.filter(p => p.matchId === matchId);
}

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
  getLines,
  setLines,
  evalOU,
  evalAH,
  stats,
  load,
  DEFAULT_OU_LINE,
  DEFAULT_AH_LINE,
  STAKE_MIN,
  STAKE_MAX
};

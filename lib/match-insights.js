/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 📊 Match Insights — H2H + Form + Standings + Smart Pick         ║
 * ║                                                                    ║
 * ║ Endpoints thethaoviet.vip:                                        ║
 * ║   GET /api/p/fixtures/{id}/detail  → full match info             ║
 * ║   GET /api/p/teams/{teamId}/last-fixtures  → form 5 trận gần     ║
 * ║   GET /api/p/teams/h2h?team1={a}&team2={b}  → đầu đối đầu        ║
 * ║                                                                    ║
 * ║ Cache: 30 phút (data ít thay đổi)                                ║
 * ╚══════════════════════════════════════════════════════════════════*/

const https = require('https');
const { URL } = require('url');

const DETAIL = 'https://api.thethaoviet.vip/api/p';
const TIMEOUT_MS = 6000;
const TTL_MS = 30 * 60 * 1000;

const cache = new Map();

function _fetchJson(url) {
  return new Promise(function(resolve) {
    try {
      const req = https.get(url, {
        timeout: TIMEOUT_MS,
        headers: { 'Accept': 'application/json', 'User-Agent': 'xoso66tv/1.0' }
      }, function(res) {
        let chunks = '';
        res.on('data', c => chunks += c);
        res.on('end', function() {
          try { resolve({ ok: res.statusCode === 200, data: JSON.parse(chunks) }); }
          catch { resolve({ ok: false }); }
        });
      });
      req.on('error', () => resolve({ ok: false }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    } catch { resolve({ ok: false }); }
  });
}

async function _cached(key, fetcher) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < TTL_MS) return hit.v;
  const v = await fetcher();
  cache.set(key, { t: now, v });
  return v;
}

/**
 * Lấy form 5 trận gần nhất của 1 đội — return ['W','W','D','L','W']
 */
async function getTeamForm(teamId) {
  if (!teamId) return null;
  return _cached('form:' + teamId, async function() {
    // Endpoint khả thi: /api/p/teams/{id}/last-fixtures hoặc /api/p/fixtures?team={id}&last=5
    const candidates = [
      DETAIL + '/teams/' + teamId + '/last-fixtures?limit=5',
      DETAIL + '/teams/' + teamId + '/last?limit=5',
      DETAIL + '/fixtures?team=' + teamId + '&last=5',
    ];
    for (const url of candidates) {
      const r = await _fetchJson(url);
      if (!r.ok || !r.data) continue;
      const arr = r.data.data || r.data.fixtures || (Array.isArray(r.data) ? r.data : null);
      if (!Array.isArray(arr) || !arr.length) continue;
      const form = [];
      for (const m of arr.slice(0, 5)) {
        const fx = m.fixture || m;
        const isHome = String(fx.home_team_id) === String(teamId) || (fx.home_team && String(fx.home_team.id) === String(teamId));
        const gH = fx.goals_home != null ? fx.goals_home : (fx.score_fulltime_home != null ? fx.score_fulltime_home : null);
        const gA = fx.goals_away != null ? fx.goals_away : (fx.score_fulltime_away != null ? fx.score_fulltime_away : null);
        if (gH == null || gA == null) continue;
        if (gH === gA) form.push('D');
        else if ((isHome && gH > gA) || (!isHome && gA > gH)) form.push('W');
        else form.push('L');
      }
      if (form.length) return form;
    }
    return null;
  });
}

/**
 * Lấy 5 trận đầu đối đầu gần nhất
 * return [{ date, home, away, score, winner: 'home'|'away'|'draw' }]
 */
async function getH2H(teamAId, teamBId) {
  if (!teamAId || !teamBId) return null;
  const key = 'h2h:' + [teamAId, teamBId].sort().join(':');
  return _cached(key, async function() {
    const candidates = [
      DETAIL + '/teams/h2h?team1=' + teamAId + '&team2=' + teamBId + '&limit=5',
      DETAIL + '/h2h?team1=' + teamAId + '&team2=' + teamBId + '&limit=5',
      DETAIL + '/fixtures/headtohead?h2h=' + teamAId + '-' + teamBId + '&last=5',
    ];
    for (const url of candidates) {
      const r = await _fetchJson(url);
      if (!r.ok || !r.data) continue;
      const arr = r.data.data || r.data.fixtures || (Array.isArray(r.data) ? r.data : null);
      if (!Array.isArray(arr) || !arr.length) continue;
      const out = [];
      for (const m of arr.slice(0, 5)) {
        const fx = m.fixture || m;
        const gH = fx.goals_home != null ? fx.goals_home : (fx.score_fulltime_home != null ? fx.score_fulltime_home : null);
        const gA = fx.goals_away != null ? fx.goals_away : (fx.score_fulltime_away != null ? fx.score_fulltime_away : null);
        if (gH == null || gA == null) continue;
        const winner = gH === gA ? 'draw' : (gH > gA ? 'home' : 'away');
        out.push({
          date: (fx.date || '').slice(0, 10),
          home: (fx.home_team && fx.home_team.name) || '',
          away: (fx.away_team && fx.away_team.name) || '',
          score: gH + '-' + gA,
          winner: winner
        });
      }
      if (out.length) return out;
    }
    return null;
  });
}

/**
 * Tính fair probability từ odds 1X2 (loại bỏ margin bookmaker)
 * Input: { home: 1.80, draw: 2.80, away: 5.00 }
 * Output: { home: 0.52, draw: 0.33, away: 0.15 } (tổng = 1)
 */
function fairProbabilityFrom1X2(x12) {
  if (!x12 || !x12.home || !x12.draw || !x12.away) return null;
  const ph = 1 / x12.home;
  const pd = 1 / x12.draw;
  const pa = 1 / x12.away;
  const total = ph + pd + pa;  // > 1 vì bookmaker margin
  return {
    home: ph / total,
    draw: pd / total,
    away: pa / total,
    margin: (total - 1) * 100  // % margin
  };
}

/**
 * Smart pick recommendation từ form + odds + h2h
 * Trả về { ah: 'home'|'away', ou: 'tai'|'xiu', confidence: 'low'|'mid'|'high', reason: '...' }
 */
function smartPick(odds, formHome, formAway, h2h) {
  if (!odds) return null;
  const out = { ah: null, ou: null, confidence: 'low', reasons: [] };

  // === AH pick ===
  if (odds.ah) {
    // Pick side có odds cao hơn (= "underdog value") nếu form chênh không quá lớn
    // Hoặc pick favorite nếu form cũng tốt hơn
    const homeWinRate = (formHome || []).filter(f => f === 'W').length / Math.max(1, (formHome || []).length);
    const awayWinRate = (formAway || []).filter(f => f === 'W').length / Math.max(1, (formAway || []).length);
    if (odds.ah.line < -0.5 && homeWinRate < 0.6) {
      // Chấp đậm mà form đội nhà không quá tốt → pick away (underdog)
      out.ah = 'away';
      out.reasons.push('Đội nhà chấp đậm nhưng form không nổi trội → khách có cửa');
    } else if (odds.ah.line < 0 && homeWinRate >= 0.6) {
      out.ah = 'home';
      out.reasons.push('Đội nhà phong độ tốt (' + Math.round(homeWinRate * 100) + '%) + chấp nhẹ');
    } else if (odds.ah.line > 0 && awayWinRate >= 0.6) {
      out.ah = 'away';
      out.reasons.push('Đội khách form tốt (' + Math.round(awayWinRate * 100) + '%) lại được chấp');
    } else if (odds.ah.line === 0) {
      out.ah = homeWinRate > awayWinRate ? 'home' : 'away';
      out.reasons.push('Kèo cân → chọn đội phong độ tốt hơn');
    } else {
      out.ah = odds.ah.homeOdds < odds.ah.awayOdds ? 'home' : 'away';
      out.reasons.push('Theo bookmaker (odds thấp hơn = cửa tin cậy)');
    }
  }

  // === OU pick ===
  if (odds.ou) {
    // Tính trung bình bàn thắng H2H
    let avgGoals = null;
    if (h2h && h2h.length) {
      const totals = h2h.map(m => {
        const [a, b] = m.score.split('-').map(Number);
        return (isNaN(a) || isNaN(b)) ? null : (a + b);
      }).filter(x => x != null);
      if (totals.length) avgGoals = totals.reduce((s, x) => s + x, 0) / totals.length;
    }
    if (avgGoals != null) {
      out.ou = avgGoals > odds.ou.line ? 'tai' : 'xiu';
      out.reasons.push('5 trận đầu đối đầu TB ' + avgGoals.toFixed(1) + ' bàn (mốc ' + odds.ou.line + ')');
    } else {
      // Không có h2h → theo odds (odds thấp hơn = bookmaker dự đoán)
      out.ou = odds.ou.taiOdds < odds.ou.xiuOdds ? 'tai' : 'xiu';
      out.reasons.push('Theo odds bookmaker');
    }
  }

  // Confidence dựa số "reasons" có data
  if (out.reasons.length >= 2 && (formHome || []).length >= 3 && (formAway || []).length >= 3) {
    out.confidence = 'high';
  } else if (out.reasons.length >= 1) {
    out.confidence = 'mid';
  }

  return out;
}

/**
 * Get full insights cho 1 match (gọi tất cả endpoints)
 */
async function getInsights(homeTeamId, awayTeamId, odds) {
  const [formHome, formAway, h2h] = await Promise.all([
    getTeamForm(homeTeamId).catch(() => null),
    getTeamForm(awayTeamId).catch(() => null),
    getH2H(homeTeamId, awayTeamId).catch(() => null),
  ]);
  const prob = fairProbabilityFrom1X2(odds && odds.x12);
  const pick = smartPick(odds, formHome, formAway, h2h);
  return {
    formHome, formAway, h2h, prob, pick,
    fetchedAt: Date.now()
  };
}

module.exports = {
  getTeamForm,
  getH2H,
  fairProbabilityFrom1X2,
  smartPick,
  getInsights
};

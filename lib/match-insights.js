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
const BASE_FREE = 'https://api.thethaoviet.vip/api'; // lineups/statistics/events/h2h endpoints (KHÔNG có /p/)
const TIMEOUT_MS = 6000;
const TTL_MS = 30 * 60 * 1000;
const LIVE_TTL_MS = 60 * 1000; // stats/events/lineup live → 60s cache

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

async function _cached(key, fetcher, ttl) {
  const hit = cache.get(key);
  const now = Date.now();
  const useTtl = ttl || TTL_MS;
  if (hit && now - hit.t < useTtl) return hit.v;
  const v = await fetcher();
  cache.set(key, { t: now, v });
  return v;
}

// ===== Fetch endpoint thethaoviet "free" (lineups/statistics/events/h2h) =====
// Shape: { success: true, data: [...] }
async function _fetchFree(path) {
  const r = await _fetchJson(BASE_FREE + path);
  if (!r.ok || !r.data) return null;
  if (r.data.success === false) return null;
  return Array.isArray(r.data.data) ? r.data.data : (r.data.data || null);
}

async function getLineupsThethao(fixtureId) {
  if (!fixtureId) return null;
  return _cached('lu:' + fixtureId, () => _fetchFree('/fixtures/' + fixtureId + '/lineups'), LIVE_TTL_MS);
}
async function getStatisticsThethao(fixtureId) {
  if (!fixtureId) return null;
  return _cached('st:' + fixtureId, () => _fetchFree('/fixtures/' + fixtureId + '/statistics'), LIVE_TTL_MS);
}
async function getEventsThethao(fixtureId) {
  if (!fixtureId) return null;
  return _cached('ev:' + fixtureId, () => _fetchFree('/fixtures/' + fixtureId + '/events'), LIVE_TTL_MS);
}
async function getH2HThethao(fixtureId) {
  if (!fixtureId) return null;
  return _cached('h2hfix:' + fixtureId, () => _fetchFree('/fixtures/' + fixtureId + '/h2h'), TTL_MS);
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
 * Get match summary (yellow/red cards + corners) từ /api/p/fixtures/:id/detail
 * API thethaoviet trả field `summary` ở root data: { homeYellow, homeRed, awayYellow, awayRed, homeCorners, awayCorners }
 * Cache 60s (data live thay đổi trong trận).
 */
async function getMatchSummary(fixtureId) {
  if (!fixtureId) return null;
  return _cached('summary:' + fixtureId, async function() {
    const r = await _fetchJson(DETAIL + '/fixtures/' + fixtureId + '/detail');
    if (r.ok && r.data && r.data.data && r.data.data.summary) {
      const s = r.data.data.summary;
      return {
        cards: {
          home: { yellow: s.homeYellow || 0, red: s.homeRed || 0 },
          away: { yellow: s.awayYellow || 0, red: s.awayRed || 0 }
        },
        corners: { home: s.homeCorners || 0, away: s.awayCorners || 0 }
      };
    }
    return null;
  });
}

// 🚀 API-Football (lineup + stats + events đầy đủ)
let _apiFB = null;
try { _apiFB = require('./api-football'); } catch (e) { /* optional */ }

/**
 * Parse stats từ API-Football response → format chuẩn của ta
 * API trả: [{ team:{id,name}, statistics:[{type:'Ball Possession', value:'45%'}, ...] }]
 */
function _parseStats(rawStats, homeId, awayId) {
  if (!rawStats || rawStats.length === 0) return null;
  function findTeam(tid) { return rawStats.find(t => t.team && t.team.id === tid); }
  function pickVal(team, types) {
    if (!team || !team.statistics) return 0;
    for (const t of types) {
      const s = team.statistics.find(x => x.type === t);
      if (s != null && s.value != null) return s.value;
    }
    return 0;
  }
  function num(v) { if (v == null) return 0; const s = String(v).replace('%',''); const n = parseInt(s,10); return isNaN(n) ? 0 : n; }
  const hT = findTeam(homeId), aT = findTeam(awayId);
  return {
    possession: { home: num(pickVal(hT, ['Ball Possession'])), away: num(pickVal(aT, ['Ball Possession'])) },
    shots:      { home: num(pickVal(hT, ['Total Shots','Shots Total'])),     away: num(pickVal(aT, ['Total Shots','Shots Total'])) },
    shotsOn:    { home: num(pickVal(hT, ['Shots on Goal'])), away: num(pickVal(aT, ['Shots on Goal'])) },
    shotsOff:   { home: num(pickVal(hT, ['Shots off Goal'])), away: num(pickVal(aT, ['Shots off Goal'])) },
    corners:    { home: num(pickVal(hT, ['Corner Kicks'])),   away: num(pickVal(aT, ['Corner Kicks'])) },
    fouls:      { home: num(pickVal(hT, ['Fouls'])),          away: num(pickVal(aT, ['Fouls'])) },
    cards: {
      home: { yellow: num(pickVal(hT, ['Yellow Cards'])), red: num(pickVal(hT, ['Red Cards'])) },
      away: { yellow: num(pickVal(aT, ['Yellow Cards'])), red: num(pickVal(aT, ['Red Cards'])) }
    },
    passes:     { home: num(pickVal(hT, ['Total passes','Passes %'])), away: num(pickVal(aT, ['Total passes','Passes %'])) },
    saves:      { home: num(pickVal(hT, ['Goalkeeper Saves'])),        away: num(pickVal(aT, ['Goalkeeper Saves'])) }
  };
}

/**
 * Parse lineup từ API-Football → format chuẩn
 * API trả: [{ team:{id}, formation:'4-3-3', startXI:[{player:{name,number,pos}}], substitutes:[...], coach:{name} }]
 */
function _parseLineup(rawLineups, homeId, awayId) {
  if (!rawLineups || rawLineups.length === 0) return null;
  function mapTeam(tid) {
    const t = rawLineups.find(x => x.team && x.team.id === tid);
    if (!t) return null;
    return {
      formation: t.formation || '',
      coach: (t.coach && t.coach.name) || '',
      startXI: (t.startXI || []).map(p => ({
        name: (p.player && p.player.name) || '',
        number: (p.player && p.player.number) || 0,
        pos: (p.player && p.player.pos) || ''
      })),
      substitutes: (t.substitutes || []).map(p => ({
        name: (p.player && p.player.name) || '',
        number: (p.player && p.player.number) || 0,
        pos: (p.player && p.player.pos) || ''
      }))
    };
  }
  return { home: mapTeam(homeId), away: mapTeam(awayId) };
}

/**
 * Parse events từ API-Football → format compact
 * API trả: [{ time:{elapsed,extra}, team:{id}, player:{name}, assist:{name}, type:'Goal'/'Card'/'subst', detail:'Normal Goal'/'Yellow Card'/'Substitution 1' }]
 */
function _parseEvents(rawEvents, homeId) {
  if (!rawEvents || rawEvents.length === 0) return [];
  return rawEvents.map(ev => {
    const minute = (ev.time && ev.time.elapsed) || 0;
    const teamId = ev.team && ev.team.id;
    const teamSide = teamId === homeId ? 'home' : 'away';
    let type = 'other';
    if (ev.type === 'Goal') type = 'goal';
    else if (ev.type === 'Card') type = (ev.detail && ev.detail.toLowerCase().includes('red')) ? 'red' : 'yellow';
    else if (ev.type === 'subst') type = 'sub';
    else if (ev.type === 'Var') type = 'var';
    return {
      minute,
      type,
      team: teamSide,
      player: (ev.player && ev.player.name) || '',
      assist: (ev.assist && ev.assist.name) || '',
      detail: ev.detail || ''
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// Parsers cho schema THETHAOVIET (qua endpoint /api/fixtures/:id/*)
// Khác api-football vì: 1 array players + is_starter (thay vì startXI/substitutes)
// ════════════════════════════════════════════════════════════════════

/**
 * Lineup thethaoviet shape:
 * [{team_id, formation, coach_name, coach_photo,
 *   players:[{player_name, number, pos:'G/D/M/F', grid:'1:1', is_starter, rating}]}]
 */
function _parseLineupThethao(rawLineups, homeId, awayId) {
  if (!Array.isArray(rawLineups) || rawLineups.length === 0) return null;
  function mapTeam(tid) {
    const t = rawLineups.find(x => Number(x.team_id) === Number(tid));
    if (!t) return null;
    const all = Array.isArray(t.players) ? t.players : [];
    const start = all.filter(p => p.is_starter === true || p.is_starter === 1);
    const subs  = all.filter(p => !(p.is_starter === true || p.is_starter === 1));
    return {
      formation: t.formation || '',
      coach: t.coach_name || '',
      coachPhoto: t.coach_photo || '',
      startXI: start.map(p => ({
        name:   p.player_name || '',
        number: Number(p.number) || 0,
        pos:    p.pos || '',
        grid:   p.grid || '',
        rating: p.rating ? parseFloat(p.rating) : null
      })),
      substitutes: subs.map(p => ({
        name:   p.player_name || '',
        number: Number(p.number) || 0,
        pos:    p.pos || '',
        rating: p.rating ? parseFloat(p.rating) : null
      }))
    };
  }
  const home = mapTeam(homeId);
  const away = mapTeam(awayId);
  if (!home && !away) return null;
  return { home, away };
}

/**
 * Stats thethaoviet — chấp nhận 2 shape:
 *  A. api-sports.io standard: [{team:{id}, statistics:[{type, value}]}]
 *  B. thethaoviet flatten:   [{team_id, ball_possession, total_shots, ...}]
 */
function _parseStatsThethao(rawStats, homeId, awayId) {
  if (!Array.isArray(rawStats) || rawStats.length === 0) return null;
  // Shape A
  if (rawStats[0] && rawStats[0].statistics && Array.isArray(rawStats[0].statistics)) {
    return _parseStats(rawStats, homeId, awayId);
  }
  // Shape B (flatten)
  function n(v) { if (v == null) return 0; const s = String(v).replace('%',''); const x = parseInt(s,10); return isNaN(x) ? 0 : x; }
  function pick(o, keys) { if (!o) return null; for (const k of keys) if (o[k] != null) return o[k]; return null; }
  function find(tid) { return rawStats.find(x => Number(x.team_id) === Number(tid)); }
  const h = find(homeId), a = find(awayId);
  if (!h && !a) return null;
  return {
    possession: { home: n(pick(h, ['ball_possession','possession','possession_percent'])), away: n(pick(a, ['ball_possession','possession','possession_percent'])) },
    shots:      { home: n(pick(h, ['total_shots','shots_total','shots'])),                 away: n(pick(a, ['total_shots','shots_total','shots'])) },
    shotsOn:    { home: n(pick(h, ['shots_on_goal','shots_on_target','shots_on'])),        away: n(pick(a, ['shots_on_goal','shots_on_target','shots_on'])) },
    shotsOff:   { home: n(pick(h, ['shots_off_goal','shots_off_target','shots_off'])),     away: n(pick(a, ['shots_off_goal','shots_off_target','shots_off'])) },
    corners:    { home: n(pick(h, ['corner_kicks','corners'])),                            away: n(pick(a, ['corner_kicks','corners'])) },
    fouls:      { home: n(pick(h, ['fouls'])),                                             away: n(pick(a, ['fouls'])) },
    offsides:   { home: n(pick(h, ['offsides'])),                                          away: n(pick(a, ['offsides'])) },
    cards: {
      home: { yellow: n(pick(h, ['yellow_cards','cards_yellow'])), red: n(pick(h, ['red_cards','cards_red'])) },
      away: { yellow: n(pick(a, ['yellow_cards','cards_yellow'])), red: n(pick(a, ['red_cards','cards_red'])) }
    },
    passes:     { home: n(pick(h, ['total_passes','passes_total'])), away: n(pick(a, ['total_passes','passes_total'])) },
    saves:      { home: n(pick(h, ['goalkeeper_saves','saves'])),    away: n(pick(a, ['goalkeeper_saves','saves'])) }
  };
}

/**
 * Events thethaoviet — chấp nhận 2 shape:
 *  A. api-sports.io standard: [{time:{elapsed}, team:{id}, player:{name}, type, detail}]
 *  B. thethaoviet flatten:   [{minute, team_id, player_name, type, detail}]
 */
function _parseEventsThethao(rawEvents, homeId) {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) return [];
  // Shape A
  if (rawEvents[0] && rawEvents[0].time && rawEvents[0].team) {
    return _parseEvents(rawEvents, homeId);
  }
  // Shape B
  return rawEvents.map(ev => {
    const minute = Number(ev.minute || ev.elapsed || ev.time || 0);
    const teamId = Number(ev.team_id);
    const teamSide = teamId === Number(homeId) ? 'home' : 'away';
    const rawType = String(ev.type || '').toLowerCase();
    const rawDetail = String(ev.detail || '').toLowerCase();
    let type = 'other';
    if (rawType.includes('goal') || rawDetail.includes('goal')) type = 'goal';
    else if (rawType.includes('card') || rawDetail.includes('card')) type = rawDetail.includes('red') ? 'red' : 'yellow';
    else if (rawType.includes('sub')) type = 'sub';
    else if (rawType.includes('var')) type = 'var';
    return {
      minute,
      type,
      team: teamSide,
      player: ev.player_name || (ev.player && ev.player.name) || '',
      assist: ev.assist_name || (ev.assist && ev.assist.name) || '',
      detail: ev.detail || ''
    };
  });
}

/**
 * Parse h2h thethaoviet shape:
 * [{id, date, league_name, league_logo, home_team:{id,name,logo}, away_team:{id,name,logo},
 *   goals_home, goals_away, halftime_home, halftime_away}]
 */
function _parseH2HThethao(rawH2H, focusTeamAId) {
  if (!Array.isArray(rawH2H) || rawH2H.length === 0) return null;
  return rawH2H.slice(0, 10).map(m => {
    const gH = m.goals_home, gA = m.goals_away;
    if (gH == null || gA == null) return null;
    const winner = gH === gA ? 'draw' : (gH > gA ? 'home' : 'away');
    return {
      date: (m.date || '').slice(0, 10),
      league: m.league_name || '',
      leagueLogo: m.league_logo || '',
      home: (m.home_team && m.home_team.name) || '',
      homeLogo: (m.home_team && m.home_team.logo) || '',
      away: (m.away_team && m.away_team.name) || '',
      awayLogo: (m.away_team && m.away_team.logo) || '',
      score: gH + '-' + gA,
      halftime: (m.halftime_home != null && m.halftime_away != null) ? (m.halftime_home + '-' + m.halftime_away) : '',
      winner
    };
  }).filter(Boolean);
}

/**
 * Get full insights cho 1 match (gọi tất cả endpoints)
 * Ưu tiên data thật từ thethaoviet, fallback API-Football (nếu admin có set key)
 */
async function getInsights(homeTeamId, awayTeamId, odds, fixtureId) {
  const apiFBEnabled = _apiFB && _apiFB.isEnabled();
  const [
    formHome, formAway, h2hOld, summary,
    ttLineups, ttStats, ttEvents, ttH2H,
    fbStats, fbLineups, fbEvents
  ] = await Promise.all([
    getTeamForm(homeTeamId).catch(() => null),
    getTeamForm(awayTeamId).catch(() => null),
    getH2H(homeTeamId, awayTeamId).catch(() => null),
    getMatchSummary(fixtureId).catch(() => null),
    // 🆕 Thethaoviet free endpoints
    getLineupsThethao(fixtureId).catch(() => null),
    getStatisticsThethao(fixtureId).catch(() => null),
    getEventsThethao(fixtureId).catch(() => null),
    getH2HThethao(fixtureId).catch(() => null),
    // API-Football (fallback nếu có key)
    apiFBEnabled ? _apiFB.getStatistics(fixtureId).catch(() => null) : Promise.resolve(null),
    apiFBEnabled ? _apiFB.getLineups(fixtureId).catch(() => null)    : Promise.resolve(null),
    apiFBEnabled ? _apiFB.getEvents(fixtureId).catch(() => null)     : Promise.resolve(null),
  ]);
  const prob = fairProbabilityFrom1X2(odds && odds.x12);

  // ===== H2H: ưu tiên thethaoviet (data đầy đủ logo+league), fallback /teams/h2h cũ =====
  const h2hParsed = _parseH2HThethao(ttH2H, homeTeamId);
  const h2h = h2hParsed || h2hOld;

  const pick = smartPick(odds, formHome, formAway, h2h);

  // ===== Stats: ưu tiên thethaoviet, fallback API-Football, cuối cùng summary cards =====
  const ttStatsParsed = _parseStatsThethao(ttStats, homeTeamId, awayTeamId);
  const fbStatsParsed = _parseStats(fbStats, homeTeamId, awayTeamId);
  const stats = ttStatsParsed || fbStatsParsed || (summary ? { cards: summary.cards, corners: summary.corners } : null);

  // ===== Lineup: ưu tiên thethaoviet (schema mới) =====
  const ttLineupParsed = _parseLineupThethao(ttLineups, homeTeamId, awayTeamId);
  const fbLineupParsed = _parseLineup(fbLineups, homeTeamId, awayTeamId);
  const lineup = ttLineupParsed || fbLineupParsed;

  // ===== Events: ưu tiên thethaoviet, fallback API-Football =====
  const ttEventsParsed = _parseEventsThethao(ttEvents, homeTeamId);
  const fbEventsParsed = _parseEvents(fbEvents, homeTeamId);
  const events = (ttEventsParsed && ttEventsParsed.length) ? ttEventsParsed : fbEventsParsed;

  return {
    formHome, formAway, h2h, stats, lineup, events, prob, pick,
    sourceThethao: !!(ttLineupParsed || ttStatsParsed || (ttEventsParsed && ttEventsParsed.length) || h2hParsed),
    sourceApiFootball: apiFBEnabled && !!(fbStatsParsed || fbLineupParsed || (fbEventsParsed && fbEventsParsed.length > 0)),
    fetchedAt: Date.now()
  };
}

module.exports = {
  getTeamForm,
  getH2H,
  getMatchSummary,
  getLineupsThethao,
  getStatisticsThethao,
  getEventsThethao,
  getH2HThethao,
  fairProbabilityFrom1X2,
  smartPick,
  getInsights
};

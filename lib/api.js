/**
 * Adapter API - thethaoviet.vip BetsAPI (theo chuẩn diendanbongda)
 *
 * Endpoints CHÍNH (base /api):
 *   GET /api/fixtures?date=YYYY-MM-DD        → ALL fixtures (live+upcoming+finished) trong ngày
 *   GET /api/fixtures?league=X&season=Y      → fixtures 1 giải theo mùa
 *   GET /api/standings?league=X&season=Y     → bảng xếp hạng
 *   GET /api/teams/:id                       → team info
 *   GET /api/odds/live?bet=1                 → odds 1x2 cho live fixtures
 *
 * Endpoint DETAIL (base /api/p):
 *   GET /api/p/fixtures/:id/detail           → chi tiết 1 fixture
 *
 * Response format: { success: true, data: [...] }
 *
 * Strategy: cache /fixtures?date= 5 phút, filter từ cache cho live/upcoming/finished
 */

const BASE         = process.env.API_BASE         || 'https://api.thethaoviet.vip/api';
const DETAIL_BASE  = process.env.API_DETAIL_BASE  || 'https://api.thethaoviet.vip/api/p';

// Categories cho sidebar
const CATEGORIES = {
  hot:          { name: 'Hot',         icon: '🔥', sport: null,         color: '#e74c3c' },
  'bong-da':    { name: 'Bóng đá',     icon: '⚽', sport: 'Soccer',     color: '#27ae60' },
  'bong-ro':    { name: 'Bóng rổ',     icon: '🏀', sport: 'Basketball', color: '#e67e22' },
  'tennis':     { name: 'Tennis',      icon: '🎾', sport: 'Tennis',     color: '#2ecc71' },
  'bong-chuyen':{ name: 'Bóng chuyền', icon: '🏐', sport: 'Volleyball', color: '#3498db' },
  'bong-ban':   { name: 'Bóng bàn',    icon: '🏓', sport: 'Table Tennis', color: '#9b59b6' },
  'esports':    { name: 'Esports',     icon: '🎮', sport: 'eSports',    color: '#1abc9c' },
  'casino':     { name: 'Casino',      icon: '🎰', sport: null,         color: '#f39c12', partnerOnly: true },
  'idol':       { name: 'Idol Live',   icon: '👑', sport: null,         color: '#e91e63', partnerOnly: true },
};

// Featured leagues cho BXH (BetsAPI league IDs)
const FEATURED_LEAGUES = {
  'ngoai-hang-anh':   { id: 39,  name: 'Ngoại Hạng Anh',    season: 2026 },
  'la-liga':          { id: 140, name: 'La Liga',           season: 2026 },
  'serie-a':          { id: 135, name: 'Serie A',           season: 2026 },
  'bundesliga':       { id: 78,  name: 'Bundesliga',        season: 2026 },
  'ligue-1':          { id: 61,  name: 'Ligue 1',           season: 2026 },
  'champions-league': { id: 2,   name: 'Champions League',  season: 2026 },
  'europa-league':    { id: 3,   name: 'Europa League',     season: 2026 },
  'v-league':         { id: 297, name: 'V-League',          season: 2026 },
};

// Việt hóa tên giải (như diendanbongda)
const LEAGUE_NAME_VI = {
  'premier league':       'Ngoại Hạng Anh',
  'la liga':              'La Liga (TBN)',
  'serie a':              'Serie A (Ý)',
  'bundesliga':           'Bundesliga (Đức)',
  'ligue 1':              'Ligue 1 (Pháp)',
  'eredivisie':           'Eredivisie (Hà Lan)',
  'primeira liga':        'Primeira Liga (BĐN)',
  'champions league':     'UEFA Champions League',
  'europa league':        'UEFA Europa League',
  'conference league':    'UEFA Conference League',
  'fa cup':               'FA Cup (Anh)',
  'efl cup':              'EFL Cup (Anh)',
  'world cup':            'World Cup',
  'euro championship':    'EURO',
  'copa america':         'Copa America',
  'afc champions league': 'AFC Champions League',
  'v.league 1':           'V-League 1 (VN)',
  'v.league 2':           'V-League 2 (VN)',
  'cup':                  'Cúp Quốc Gia',
  'j1 league':            'J1 League (Nhật)',
  'k league 1':           'K League 1 (Hàn)',
  'mls':                  'MLS (Mỹ)',
};
function leagueNameToVi(en) {
  if (!en) return '';
  const k = String(en).trim().toLowerCase();
  return LEAGUE_NAME_VI[k] || en;
}

// ===== Cache 2-layer (5 phút TTL + 1h stale fallback) =====
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 60 * 60 * 1000;

async function fetchJSON(url) {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.t < TTL_MS) return hit.v;
  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Xoso66TV/1.0' }
    });
    if (!r.ok) {
      console.warn('[api]', r.status, url);
      if (hit && now - hit.t < STALE_TTL_MS) return hit.v;
      return null;
    }
    const j = await r.json();
    const v = (j && j.success) ? (j.data || []) : (j || null);
    cache.set(url, { t: now, v });
    return v;
  } catch (e) {
    console.warn('[api] fetch err:', e.message);
    if (hit && now - hit.t < STALE_TTL_MS) return hit.v;
    return null;
  }
}

// ===== Helpers =====
function fmtDate(d) {
  d = d || new Date();
  return d.toISOString().slice(0, 10);
}
function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Map status_short → trạng thái nội bộ
function mapStatus(short) {
  const s = String(short || '').toUpperCase();
  if (['1H','2H','HT','ET','P','LIVE','BT','INT'].includes(s)) return 'live';
  if (['FT','AET','PEN','AWD','WO'].includes(s)) return 'finished';
  if (['CANC','ABD','SUSP','PST'].includes(s)) return 'cancelled';
  return 'upcoming';
}

// Đoán môn từ league (BetsAPI chủ yếu football)
function guessSport(league) {
  if (!league) return 'Soccer';
  const n = String(league.name || '').toLowerCase();
  if (n.includes('nba') || n.includes('basketball')) return 'Basketball';
  if (n.includes('atp') || n.includes('wta') || n.includes('tennis')) return 'Tennis';
  if (n.includes('volleyball')) return 'Volleyball';
  if (n.includes('esport') || n.includes('lol') || n.includes('valorant')) return 'eSports';
  return 'Soccer';
}

// Normalize 1 fixture → shape nội bộ
function normFixture(f) {
  if (!f) return null;
  const home = f.home_team || {};
  const away = f.away_team || {};
  const league = f.league || {};
  const ts = f.timestamp ? f.timestamp * 1000 : (f.date ? new Date(f.date).getTime() : null);
  const hasScore = (f.goals_home !== null && f.goals_home !== undefined);
  const status = mapStatus(f.status_short);
  return {
    id:        f.id,
    sport:     guessSport(league),
    league:    leagueNameToVi(league.name || ''),
    leagueRaw: league.name || '',
    leagueId:  league.id || f.league_id,
    leagueLogo: league.logo || '',
    leagueFlag: league.flag || '',
    country:   league.country || '',
    season:    f.season,
    round:     f.round,
    home:      home.name || '',
    away:      away.name || '',
    homeBadge: home.logo || '',
    awayBadge: away.logo || '',
    homeId:    home.id || f.home_team_id,
    awayId:    away.id || f.away_team_id,
    score:     hasScore ? [Number(f.goals_home), Number(f.goals_away)] : null,
    halftime:  (f.score_halftime_home !== null && f.score_halftime_home !== undefined)
               ? [Number(f.score_halftime_home), Number(f.score_halftime_away)] : null,
    date:      f.date ? f.date.slice(0, 10) : '',
    time:      ts ? new Date(ts).toISOString().slice(11, 16) : '',
    matchTs:   ts,
    venue:     [f.venue_name, f.venue_city].filter(Boolean).join(', '),
    referee:   f.referee || null,
    status:    status,
    statusText: f.status_long || f.status_short || '',
    elapsed:   f.status_elapsed || null,
    poster:    home.logo && away.logo ? home.logo : (league.logo || ''),
    video:     '',
    summary:   f.summary || {},
    slug:      slug(home.name) + '-vs-' + slug(away.name) + '-' + f.id,
  };
}

// ===== Public API =====

// Helper: unwrap { fixtures: [...] } hoặc array trực tiếp
function unwrapFixtures(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.fixtures)) return data.fixtures;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

// Tất cả fixtures theo ngày (live + upcoming + finished cùng response)
async function getEventsByDay(date, sport) {
  date = date || fmtDate();
  const data = await fetchJSON(BASE + '/fixtures?date=' + encodeURIComponent(date));
  const list = unwrapFixtures(data);
  let all = list.map(normFixture).filter(Boolean);
  if (sport) all = all.filter(m => m.sport === sport);
  return all;
}

// Gộp N ngày
async function getEventsRange(sport, daysFrom, daysTo) {
  daysFrom = (daysFrom !== undefined) ? daysFrom : -1;
  daysTo   = (daysTo !== undefined)   ? daysTo   : 1;
  const dates = [];
  for (let i = daysFrom; i <= daysTo; i++) dates.push(offsetDate(i));
  const lists = await Promise.all(dates.map(d => getEventsByDay(d, sport)));
  return lists.flat();
}

// Tất cả môn hôm nay
async function getAllSportsToday() {
  return getEventsByDay(fmtDate());
}

// Trận LIVE - filter từ today's fixtures (tránh tốn endpoint riêng)
async function getLiveStreams(sport) {
  const all = await getEventsByDay(fmtDate(), sport);
  return all.filter(m => m.status === 'live');
}

// Trận sắp tới (hôm nay + 2 ngày)
async function getUpcomingStreams(sport, limit) {
  limit = limit || 20;
  const all = await getEventsRange(sport, 0, 2);
  return all
    .filter(m => m.status === 'upcoming')
    .sort((a, b) => (a.matchTs || 0) - (b.matchTs || 0))
    .slice(0, limit);
}

// Trận đã kết thúc (2 ngày trước → hôm nay)
async function getFinishedStreams(sport, limit) {
  limit = limit || 20;
  const all = await getEventsRange(sport, -2, 0);
  return all
    .filter(m => m.status === 'finished')
    .sort((a, b) => (b.matchTs || 0) - (a.matchTs || 0))
    .slice(0, limit);
}

// Chi tiết 1 fixture - DÙNG BASE KHÁC (/api/p/)
async function getEvent(id) {
  if (!id) return null;
  const data = await fetchJSON(DETAIL_BASE + '/fixtures/' + encodeURIComponent(id) + '/detail');
  // Detail có thể là object, array, hoặc { fixture: {...} }
  let fixture = null;
  if (Array.isArray(data) && data[0]) fixture = data[0];
  else if (data && data.fixture) fixture = data.fixture;
  else if (data && data.id) fixture = data;
  if (fixture) return normFixture(fixture);
  // Fallback: tìm trong 3 ngày
  const range = await getEventsRange(null, -1, 1);
  return range.find(m => String(m.id) === String(id)) || null;
}

// BXH 1 giải
async function getStandings(leagueKey) {
  const lg = FEATURED_LEAGUES[leagueKey];
  if (!lg) return null;
  let raw = await fetchJSON(BASE + '/standings?league=' + lg.id + '&season=' + lg.season);
  // Fallback season trước nếu trống
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    raw = await fetchJSON(BASE + '/standings?league=' + lg.id + '&season=' + (lg.season - 1));
  }
  // Có thể là array, hoặc { standings: [...] }, hoặc { data: [...] }
  const rows = Array.isArray(raw) ? raw :
               (raw && Array.isArray(raw.standings) ? raw.standings :
               (raw && Array.isArray(raw.data) ? raw.data :
               (raw && Array.isArray(raw.rows) ? raw.rows : [])));
  return {
    league: lg,
    rows: rows.map(r => ({
      pos:   Number(r.rank || r.position || 0),
      team:  (r.team && r.team.name) || r.team_name || '',
      badge: (r.team && r.team.logo) || r.team_logo || '',
      p:     Number((r.all && r.all.played) || r.played || 0),
      w:     Number((r.all && r.all.win)    || r.win    || 0),
      d:     Number((r.all && r.all.draw)   || r.draw   || 0),
      l:     Number((r.all && r.all.lose)   || r.lose   || 0),
      gf:    Number((r.all && r.all.goals && r.all.goals.for)     || r.goals_for     || 0),
      ga:    Number((r.all && r.all.goals && r.all.goals.against) || r.goals_against || 0),
      gd:    Number(r.goalsDiff || r.goals_diff || 0),
      pts:   Number(r.points || 0),
      form:  r.form || '',
    }))
  };
}

// Fixtures của 1 giải theo mùa
async function getLeagueFixtures(leagueKey) {
  const lg = FEATURED_LEAGUES[leagueKey];
  if (!lg) return [];
  let raw = await fetchJSON(BASE + '/fixtures?league=' + lg.id + '&season=' + lg.season);
  if (!raw) raw = await fetchJSON(BASE + '/fixtures?league=' + lg.id + '&season=' + (lg.season - 1));
  return unwrapFixtures(raw).map(normFixture).filter(Boolean);
}

// Đếm số trận theo category (badge sidebar)
async function getCategoryCounts() {
  const counts = {};
  const all = await getEventsByDay(fmtDate());
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    if (cat.partnerOnly) { counts[key] = Math.floor(Math.random() * 30) + 10; return; }
    if (!cat.sport) { counts[key] = 0; return; }
    counts[key] = all.filter(m => m.sport === cat.sport && (m.status === 'live' || m.status === 'upcoming')).length;
  });
  counts.hot = Object.entries(counts)
    .filter(([k]) => k !== 'hot' && k !== 'casino' && k !== 'idol')
    .reduce((a, [,v]) => a + v, 0);
  return counts;
}

module.exports = {
  CATEGORIES, FEATURED_LEAGUES, LEAGUE_NAME_VI, leagueNameToVi,
  getEventsByDay, getEventsRange, getAllSportsToday,
  getLiveStreams, getUpcomingStreams, getFinishedStreams,
  getEvent, getStandings, getLeagueFixtures, getCategoryCounts,
};

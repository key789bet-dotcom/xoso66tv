/**
 * Adapter API - dùng api.thethaoviet.vip (Vietnamese sports API)
 * Endpoints:
 *   GET /api/p/fixtures/live                  → trận đang LIVE
 *   GET /api/p/fixtures?date=YYYY-MM-DD       → trận theo ngày
 *   GET /api/p/fixtures/:id/detail            → chi tiết 1 trận
 *   GET /api/p/standings/:leagueId            → bảng xếp hạng
 *
 * Response shape (chuẩn hóa về cùng format cũ để views không cần sửa):
 *   { id, sport, league, leagueId, home, away, homeBadge, awayBadge,
 *     score, date, time, matchTs, venue, status, statusText, poster, video, slug }
 */

const BASE = process.env.API_BASE || 'https://api.thethaoviet.vip/api/p';

// Category mapping (giữ nguyên để views cũ không break)
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

// Featured leagues (cho BXH) - dùng league_id của API mới
const FEATURED_LEAGUES = {
  'ngoai-hang-anh':   { id: 39,  name: 'Ngoại Hạng Anh',  season: 2026 },
  'la-liga':          { id: 140, name: 'La Liga',         season: 2026 },
  'serie-a':          { id: 135, name: 'Serie A',         season: 2026 },
  'bundesliga':       { id: 78,  name: 'Bundesliga',      season: 2026 },
  'ligue-1':          { id: 61,  name: 'Ligue 1',         season: 2026 },
  'champions-league': { id: 2,   name: 'Champions League',season: 2026 },
  'v-league':         { id: 340, name: 'V-League',        season: 2026 },
};

// ===== Cache (60s TTL) =====
const cache = new Map();
const TTL_MS = 60 * 1000;

async function fetchJSON(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Xoso66TV/1.0',
        'Accept': 'application/json'
      }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = await r.json();
    cache.set(url, { t: Date.now(), v });
    return v;
  } catch (e) {
    console.error('[API]', url, e.message);
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

// Map status từ api-sports.io → status nội bộ
// LIVE: 1H,2H,HT,ET,P,LIVE / FINISHED: FT,AET,PEN / UPCOMING: NS,TBD,PST
function mapStatus(short) {
  const s = String(short || '').toUpperCase();
  if (['1H','2H','HT','ET','P','LIVE','BT'].includes(s)) return 'live';
  if (['FT','AET','PEN','AWD','WO'].includes(s)) return 'finished';
  if (['CANC','ABD','SUSP','PST'].includes(s)) return 'cancelled';
  return 'upcoming'; // NS, TBD
}

// Đoán môn từ league name/country (API mới chỉ có football)
function guessSport(league) {
  if (!league) return 'Soccer';
  const n = String(league.name || '').toLowerCase();
  if (n.includes('nba') || n.includes('basketball')) return 'Basketball';
  if (n.includes('atp') || n.includes('wta') || n.includes('tennis')) return 'Tennis';
  if (n.includes('volleyball')) return 'Volleyball';
  if (n.includes('esport') || n.includes('lol') || n.includes('valorant')) return 'eSports';
  return 'Soccer'; // mặc định
}

// Normalize 1 fixture từ API → shape nội bộ
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
    league:    league.name || '',
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
    halftime:  (f.score_halftime_home !== null) ? [Number(f.score_halftime_home), Number(f.score_halftime_away)] : null,
    date:      f.date ? f.date.slice(0,10) : '',
    time:      ts ? new Date(ts).toISOString().slice(11,16) : '',
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

// Lấy tất cả fixtures theo ngày (date YYYY-MM-DD, sport ignored cho API mới)
async function getEventsByDay(date, sport) {
  date = date || fmtDate();
  const data = await fetchJSON(BASE + '/fixtures?date=' + encodeURIComponent(date));
  const list = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
  return list.map(normFixture).filter(Boolean);
}

// Gộp N ngày liên tiếp
async function getEventsRange(sport, daysFrom, daysTo) {
  daysFrom = (daysFrom !== undefined) ? daysFrom : -1;
  daysTo   = (daysTo !== undefined)   ? daysTo   : 1;
  const dates = [];
  for (let i = daysFrom; i <= daysTo; i++) dates.push(offsetDate(i));
  const lists = await Promise.all(dates.map(d => getEventsByDay(d)));
  return lists.flat();
}

// Tất cả môn hôm nay (API mới chủ yếu football, nhưng giữ signature)
async function getAllSportsToday() {
  return getEventsByDay(fmtDate());
}

// Trận đang LIVE
async function getLiveStreams(sport) {
  const data = await fetchJSON(BASE + '/fixtures/live');
  const list = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
  let all = list.map(normFixture).filter(Boolean);
  if (sport) all = all.filter(m => m.sport === sport);
  return all;
}

// Trận sắp tới (hôm nay + 2 ngày tới)
async function getUpcomingStreams(sport, limit) {
  limit = limit || 20;
  const all = await getEventsRange(null, 0, 2);
  let filtered = all.filter(m => m.status === 'upcoming');
  if (sport) filtered = filtered.filter(m => m.sport === sport);
  return filtered
    .sort((a, b) => (a.matchTs || 0) - (b.matchTs || 0))
    .slice(0, limit);
}

// Trận đã kết thúc (2 ngày trước → hôm nay)
async function getFinishedStreams(sport, limit) {
  limit = limit || 20;
  const all = await getEventsRange(null, -2, 0);
  let filtered = all.filter(m => m.status === 'finished');
  if (sport) filtered = filtered.filter(m => m.sport === sport);
  return filtered
    .sort((a, b) => (b.matchTs || 0) - (a.matchTs || 0))
    .slice(0, limit);
}

// Chi tiết 1 fixture
async function getEvent(id) {
  if (!id) return null;
  const data = await fetchJSON(BASE + '/fixtures/' + encodeURIComponent(id) + '/detail');
  // Response có thể là { success, data: {...} } hoặc fixture trực tiếp
  const f = (data && data.data) ? data.data : data;
  return normFixture(f);
}

// BXH 1 giải
async function getStandings(leagueKey) {
  const lg = FEATURED_LEAGUES[leagueKey];
  if (!lg) return null;
  const data = await fetchJSON(BASE + '/standings/' + lg.id + '?season=' + lg.season);
  const rows = (data && data.data && data.data.standings) ? data.data.standings :
               (data && data.standings) ? data.standings :
               (data && data.data) ? data.data : [];
  return {
    league: lg,
    rows: rows.map(r => ({
      pos:   Number(r.rank || r.position || r.pos || 0),
      team:  r.team_name || (r.team && r.team.name) || '',
      badge: r.team_logo || (r.team && r.team.logo) || '',
      p:     Number(r.played || (r.all && r.all.played) || 0),
      w:     Number(r.win    || (r.all && r.all.win)    || 0),
      d:     Number(r.draw   || (r.all && r.all.draw)   || 0),
      l:     Number(r.lose   || (r.all && r.all.lose)   || 0),
      gf:    Number(r.goals_for     || (r.all && r.all.goals && r.all.goals.for)     || 0),
      ga:    Number(r.goals_against || (r.all && r.all.goals && r.all.goals.against) || 0),
      gd:    Number(r.goals_diff || (r.goalsDiff) || 0),
      pts:   Number(r.points || r.pts || 0),
      form:  r.form || '',
    }))
  };
}

// Đếm số trận theo category (cho badge sidebar)
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
  CATEGORIES, FEATURED_LEAGUES,
  getEventsByDay, getEventsRange, getAllSportsToday,
  getLiveStreams, getUpcomingStreams, getFinishedStreams,
  getEvent, getStandings, getCategoryCounts,
};

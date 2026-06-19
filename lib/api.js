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

// Fallback logo league khi API thethaoviet không trả - y chang diendanbongda
const { getLeagueLogo: _leagueLogoFallback } = require('./league-logos');

// Categories cho sidebar
const CATEGORIES = {
  hot:          { name: 'Hot',         icon: '🔥', sport: null,         color: '#e74c3c',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" class="w-full h-full"><path d="M12 2.5c1.5 3.5 6 5 6 10a6 6 0 1 1-12 0c0-2.5 1.5-4 3-5 0 2.5 1 3.5 2 3.5 0-3 .5-5.5 1-8.5z" fill="currentColor" fill-opacity="0.18"/><path d="M9 15.5a3 3 0 0 0 6 0c0-1.5-1-2.5-1.5-4-.7 1.2-1.5 1.5-2 1.5-1 0-1.5-1-1-3-1 .5-1.5 2-1.5 5.5z" fill="currentColor" fill-opacity="0.35"/></svg>' },
  'bong-da':    { name: 'Bóng đá',     icon: '⚽', sport: 'Soccer',     color: '#27ae60',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" class="w-full h-full"><circle cx="12" cy="12" r="9.5"/><path d="M12 7l4 3-1.5 4.7h-5L8 10z" fill="currentColor" fill-opacity="0.2"/><path d="M12 2.5v4.5M15.5 10l5-1.5M14.5 14.5l3.5 3M9.5 14.5l-3.5 3M8 10l-5-1.5"/></svg>' },
  'bong-ro':    { name: 'Bóng rổ',     icon: '🏀', sport: 'Basketball', color: '#e67e22',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" class="w-full h-full"><circle cx="12" cy="12" r="9.5" fill="currentColor" fill-opacity="0.15"/><path d="M2.5 12h19M12 2.5v19M5 5.5c2 2 2.5 4 2.5 6.5s-.5 4.5-2.5 6.5M19 5.5c-2 2-2.5 4-2.5 6.5s.5 4.5 2.5 6.5"/></svg>' },
  'tennis':     { name: 'Tennis',      icon: '🎾', sport: 'Tennis',     color: '#2ecc71',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" class="w-full h-full"><ellipse cx="8.5" cy="8.5" rx="5.5" ry="5.5" fill="currentColor" fill-opacity="0.15"/><path d="M5.5 5.5l6 6M11 5.5v6M5.5 8.5h6"/><path d="M13 13l7 7M19.5 20.5l1.5-1.5"/></svg>' },
  'bong-chuyen':{ name: 'Bóng chuyền', icon: '🏐', sport: 'Volleyball', color: '#3498db',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" class="w-full h-full"><circle cx="12" cy="12" r="9.5" fill="currentColor" fill-opacity="0.15"/><path d="M12 2.5C8.5 6 7 9 7 12M12 2.5c3.5 3.5 5 6.5 5 9.5M2.5 12c3.5 0 7 1 10 4.5M21.5 12c-3.5 0-7 1-10 4.5M7 12c-1.5 2.5-3.5 4.5-4.5 5"/></svg>' },
  'bong-ban':   { name: 'Bóng bàn',    icon: '🏓', sport: 'Table Tennis', color: '#9b59b6',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" class="w-full h-full"><ellipse cx="10" cy="10" rx="6" ry="7" fill="currentColor" fill-opacity="0.2" transform="rotate(-30 10 10)"/><path d="M14 14l6 6M19.5 20.5l1-1" /><circle cx="6.5" cy="17.5" r="1.5" fill="currentColor"/></svg>' },
  'esports':    { name: 'Esports',     icon: '🎮', sport: 'eSports',    color: '#1abc9c',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" class="w-full h-full"><path d="M5.5 8h13a3.5 3.5 0 0 1 3.5 3.5v.5a4 4 0 0 1-7.2 2.4l-1-1.4h-3.6l-1 1.4A4 4 0 0 1 2 12v-.5A3.5 3.5 0 0 1 5.5 8z" fill="currentColor" fill-opacity="0.18"/><line x1="7" y1="11.5" x2="7" y2="13.5" stroke-linecap="round"/><line x1="6" y1="12.5" x2="8" y2="12.5" stroke-linecap="round"/><circle cx="16.5" cy="11.5" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/></svg>' },
  'casino':     { name: 'Casino',      icon: '🎰', sport: null,         color: '#f39c12', partnerOnly: true,
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" class="w-full h-full"><rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fill-opacity="0.15"/><rect x="5" y="7" width="4" height="6" rx="0.5"/><rect x="10" y="7" width="4" height="6" rx="0.5"/><rect x="15" y="7" width="4" height="6" rx="0.5"/><circle cx="7" cy="10" r="0.8" fill="currentColor"/><circle cx="12" cy="10" r="0.8" fill="currentColor"/><circle cx="17" cy="10" r="0.8" fill="currentColor"/><path d="M7 16h10" stroke-linecap="round"/></svg>' },
  'idol':       { name: 'Idol Live',   icon: '👑', sport: null,         color: '#e91e63', partnerOnly: true,
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" class="w-full h-full"><path d="M3 7.5l4 4 4-7.5 4 7.5 4-4-1.5 10.5H4.5z" fill="currentColor" fill-opacity="0.2"/><circle cx="3" cy="7.5" r="1.2" fill="currentColor"/><circle cx="12" cy="4" r="1.2" fill="currentColor"/><circle cx="21" cy="7.5" r="1.2" fill="currentColor"/><line x1="4.5" y1="20.5" x2="19.5" y2="20.5"/></svg>' },
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
// Generic league names có ở nhiều quốc gia → cần dùng country để phân biệt
// VD: "Premier League" có Anh + Bhutan + Ethiopia + Lebanon, "Cup" có khắp nơi
const GENERIC_NAMES = new Set([
  'premier league', 'super league', 'first division', 'second division',
  'cup', 'super cup', 'league cup', 'national cup', 'fa cup',
  'championship', 'national league', 'pro league'
]);

function leagueNameToVi(en, country) {
  if (!en) return '';
  const k = String(en).trim().toLowerCase();
  const c = String(country || '').trim();
  const cLower = c.toLowerCase();

  // Generic name + country khác England/Vietnam → KHÔNG dịch, append country để rõ
  // VD: "Premier League" + Bhutan → "Premier League Bhutan"
  if (GENERIC_NAMES.has(k)) {
    // Premier League chỉ = "Ngoại Hạng Anh" nếu country=England
    if (k === 'premier league' && cLower !== 'england' && c) {
      return en + ' (' + c + ')';
    }
    // Cup/Super Cup chỉ = "Cúp Quốc Gia VN" nếu country=Vietnam
    if (k === 'cup' && cLower !== 'vietnam' && c) {
      return en + ' (' + c + ')';
    }
    // Các giải generic khác → append country
    if (c && cLower !== 'england' && cLower !== 'vietnam') {
      return en + ' (' + c + ')';
    }
  }
  return LEAGUE_NAME_VI[k] || en;
}

// ═══ Cache 3-layer (Redis L1 → in-memory L2 → stale fallback) ═══
// L1 Redis (shared giữa PM2 workers, TTL 5 phút)
// L2 in-memory Map (per-worker, instant cho hot path - dùng khi Redis down)
// L3 stale fallback (1h, dùng khi API upstream down)
const _redis = require('./redis');
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;
const TTL_SEC = TTL_MS / 1000;
const STALE_TTL_MS = 60 * 60 * 1000;
const REDIS_PREFIX = 'apicache:';

async function fetchJSON(url) {
  const now = Date.now();

  // ✓ L1: Redis (shared cross-worker) — chỉ check nếu Redis ready
  if (_redis.isReady()) {
    try {
      const r1 = await _redis.get(REDIS_PREFIX + url);
      if (r1 != null) {
        // Refresh in-memory cache để các call sau lấy L2 instant
        cache.set(url, { t: now, v: r1 });
        return r1;
      }
    } catch (_) { /* fall through */ }
  }

  // ✓ L2: In-memory (fast path khi Redis chưa migrate hoặc hit local)
  const hit = cache.get(url);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  // ✓ Fetch upstream
  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Xoso66TV/1.0' }
    });
    if (!r.ok) {
      console.warn('[api]', r.status, url);
      // Stale fallback nếu API upstream lỗi
      if (hit && now - hit.t < STALE_TTL_MS) return hit.v;
      return null;
    }
    const j = await r.json();
    const v = (j && j.success) ? (j.data || []) : (j || null);
    // Lưu cả L1 (Redis async, fire-and-forget) lẫn L2
    cache.set(url, { t: now, v });
    if (_redis.isReady()) {
      _redis.set(REDIS_PREFIX + url, v, TTL_SEC).catch(()=>{});
    }
    return v;
  } catch (e) {
    console.warn('[api] fetch err:', e.message);
    if (hit && now - hit.t < STALE_TTL_MS) return hit.v;
    return null;
  }
}

// ===== Helpers =====
// fmtDate: format theo timezone VN (+7) để khớp với time render trong card
function fmtDate(d) {
  d = d || new Date();
  // Cộng 7h để khi slice ra YYYY-MM-DD đúng theo lịch VN
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
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
    league:    leagueNameToVi(league.name || '', league.country),
    leagueRaw: league.name || '',
    leagueId:  league.id || f.league_id,
    leagueLogo: league.logo || _leagueLogoFallback(league.name || ''),
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
    date:      ts ? (function(){ var d=new Date(ts+7*3600*1000); return d.toISOString().slice(0,10); })() : (f.date ? f.date.slice(0, 10) : ''),
    time:      ts ? (function(){ var d=new Date(ts+7*3600*1000); return d.toISOString().slice(11, 16); })() : '',
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
// limit: undefined/null → default 500; truyền 0 hoặc Infinity → lấy TẤT CẢ (no slice)
async function getUpcomingStreams(sport, limit) {
  if (limit === undefined || limit === null) limit = 500;
  const all = await getEventsRange(sport, 0, 2);
  // Loại bỏ trận đã qua hơn 3h dù API vẫn báo status "NS" (API outdated)
  const cutoff = Date.now() - 3 * 3600 * 1000;
  const filtered = all
    .filter(m => m.status === 'upcoming' && (!m.matchTs || m.matchTs > cutoff))
    .sort((a, b) => (a.matchTs || 0) - (b.matchTs || 0));
  return (limit === 0 || limit === Infinity) ? filtered : filtered.slice(0, limit);
}

// Trận đã kết thúc (2 ngày trước → hôm nay)
// limit: undefined/null → default 500; truyền 0 hoặc Infinity → lấy TẤT CẢ
async function getFinishedStreams(sport, limit) {
  if (limit === undefined || limit === null) limit = 500;
  const all = await getEventsRange(sport, -2, 0);
  const filtered = all
    .filter(m => m.status === 'finished')
    .sort((a, b) => (b.matchTs || 0) - (a.matchTs || 0));
  return (limit === 0 || limit === Infinity) ? filtered : filtered.slice(0, limit);
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

// News stub - thethaoviet.vip không có endpoint news → trả mock data hoặc empty
// (để không crash route /tin-tuc)
async function getNews(limit) {
  limit = limit || 18;
  // TODO: integrate news API thực, tạm thời trả empty
  return [];
}

module.exports = {
  CATEGORIES, FEATURED_LEAGUES, LEAGUE_NAME_VI, leagueNameToVi,
  getEventsByDay, getEventsRange, getAllSportsToday,
  getLiveStreams, getUpcomingStreams, getFinishedStreams,
  getEvent, getStandings, getLeagueFixtures, getCategoryCounts,
  getNews,
};

/**
 * Adapter API đa môn thể thao - dữ liệu thật từ TheSportsDB (miễn phí).
 * Mỗi route được cache 60s.
 */

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';

// Các category trong sidebar -> filter sport
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

// Các giải bóng đá được nhấn mạnh trong header phần "Hot leagues"
const FEATURED_LEAGUES = {
  'ngoai-hang-anh':   { id: 4328, name: 'Ngoại Hạng Anh',   season: '2025-2026' },
  'la-liga':          { id: 4335, name: 'La Liga',           season: '2025-2026' },
  'serie-a':          { id: 4332, name: 'Serie A',           season: '2025-2026' },
  'bundesliga':       { id: 4331, name: 'Bundesliga',        season: '2025-2026' },
  'ligue-1':          { id: 4334, name: 'Ligue 1',           season: '2025-2026' },
  'champions-league': { id: 4480, name: 'Champions League',  season: '2025-2026' },
  'nba':              { id: 4387, name: 'NBA',               season: '2025-2026' },
  'wta':              { id: 4464, name: 'WTA Tour',          season: '2026' },
};

// ===== Cache =====
const cache = new Map();
const TTL_MS = 60 * 1000;

async function fetchJSON(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Xoso66TV/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const v = await r.json();
    cache.set(url, { t: Date.now(), v });
    return v;
  } catch (e) {
    console.error('[API]', url, e.message);
    return null;
  }
}

// ===== Helpers =====
function fmtDate(d = new Date()) { return d.toISOString().slice(0, 10); }
function offsetDate(days) { const d = new Date(); d.setDate(d.getDate() + days); return fmtDate(d); }

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normEvent(ev) {
  if (!ev) return null;
  const hs = ev.intHomeScore, as = ev.intAwayScore;
  const status = ev.strStatus || '';
  const ts = ev.strTimestamp ? new Date(ev.strTimestamp).getTime() : null;
  const hasScore = (hs !== null && hs !== undefined && hs !== '');
  const isLive = /1H|2H|HT|Live|In Play|Q1|Q2|Q3|Q4/i.test(status) ||
                 (ts && Date.now() >= ts && Date.now() - ts < 2.5 * 3600 * 1000 && !/FT|Finished/i.test(status));
  const isFinished = /FT|Match Finished|Finished|AET|PEN/i.test(status) || (hasScore && !isLive);
  return {
    id:       ev.idEvent,
    sport:    ev.strSport,
    league:   ev.strLeague,
    leagueId: ev.idLeague,
    season:   ev.strSeason,
    round:    ev.intRound,
    home:     ev.strHomeTeam,
    away:     ev.strAwayTeam,
    homeBadge: ev.strHomeTeamBadge || '',
    awayBadge: ev.strAwayTeamBadge || '',
    score:    hasScore ? [Number(hs), Number(as)] : null,
    date:     ev.dateEvent,
    time:     ev.strTime ? ev.strTime.slice(0, 5) : '',
    matchTs:  ts,
    venue:    ev.strVenue,
    status:   isLive ? 'live' : isFinished ? 'finished' : 'upcoming',
    statusText: status,
    poster:   ev.strThumb || ev.strPoster || '',
    video:    ev.strVideo || '',
    slug:     `${slug(ev.strHomeTeam)}-vs-${slug(ev.strAwayTeam)}-${ev.idEvent}`,
  };
}

// ===== Public API =====

// Lấy tất cả event theo môn trong N ngày (mặc định hôm nay)
async function getEventsByDay(date = fmtDate(), sport = 'Soccer') {
  const data = await fetchJSON(`${BASE}/eventsday.php?d=${date}&s=${encodeURIComponent(sport)}`);
  return (data?.events || []).map(normEvent).filter(Boolean);
}

// Gộp N ngày liên tiếp cho 1 môn
async function getEventsRange(sport = 'Soccer', daysFrom = -1, daysTo = 1) {
  const dates = [];
  for (let i = daysFrom; i <= daysTo; i++) dates.push(offsetDate(i));
  const lists = await Promise.all(dates.map(d => getEventsByDay(d, sport)));
  return lists.flat();
}

// Lấy tất cả môn (cho trang chủ - mix)
async function getAllSportsToday() {
  const sports = ['Soccer','Basketball','Tennis','Volleyball','eSports'];
  const lists = await Promise.all(sports.map(s => getEventsByDay(fmtDate(), s)));
  return lists.flat();
}

// Trận live - cho banner "đang phát sóng"
async function getLiveStreams(sport = null) {
  let all;
  if (sport) {
    all = await getEventsRange(sport, 0, 0);
  } else {
    all = await getAllSportsToday();
  }
  return all.filter(m => m.status === 'live');
}

// Trận sắp tới - cho phần "lịch phát sóng"
async function getUpcomingStreams(sport = null, limit = 20) {
  let all;
  if (sport) {
    all = await getEventsRange(sport, 0, 2);
  } else {
    const sports = ['Soccer','Basketball','Tennis'];
    const lists = await Promise.all(sports.map(s => getEventsRange(s, 0, 1)));
    all = lists.flat();
  }
  return all
    .filter(m => m.status === 'upcoming')
    .sort((a, b) => (a.matchTs || 0) - (b.matchTs || 0))
    .slice(0, limit);
}

// Trận đã kết thúc - cho phần "video nổi bật"
async function getFinishedStreams(sport = null, limit = 20) {
  let all;
  if (sport) {
    all = await getEventsRange(sport, -2, 0);
  } else {
    const sports = ['Soccer','Basketball','Tennis'];
    const lists = await Promise.all(sports.map(s => getEventsRange(s, -2, 0)));
    all = lists.flat();
  }
  return all
    .filter(m => m.status === 'finished')
    .sort((a, b) => (b.matchTs || 0) - (a.matchTs || 0))
    .slice(0, limit);
}

// BXH 1 giải
async function getStandings(leagueKey) {
  const lg = FEATURED_LEAGUES[leagueKey];
  if (!lg) return null;
  const data = await fetchJSON(`${BASE}/lookuptable.php?l=${lg.id}&s=${lg.season}`);
  return {
    league: lg,
    rows: (data?.table || []).map(r => ({
      pos: Number(r.intRank), team: r.strTeam, badge: r.strBadge,
      p: Number(r.intPlayed), w: Number(r.intWin), d: Number(r.intDraw), l: Number(r.intLoss),
      gf: Number(r.intGoalsFor), ga: Number(r.intGoalsAgainst), gd: Number(r.intGoalDifference),
      pts: Number(r.intPoints), form: r.strForm || '',
    })),
  };
}

// Chi tiết 1 event
async function getEvent(id) {
  const data = await fetchJSON(`${BASE}/lookupevent.php?id=${id}`);
  return data?.events ? normEvent(data.events[0]) : null;
}

// Đếm số trận live theo từng category cho badge sidebar
async function getCategoryCounts() {
  const counts = {};
  const promises = Object.entries(CATEGORIES).map(async ([key, cat]) => {
    if (cat.partnerOnly) { counts[key] = Math.floor(Math.random()*30) + 10; return; }
    if (!cat.sport) { counts[key] = 0; return; }
    const list = await getEventsByDay(fmtDate(), cat.sport);
    counts[key] = list.filter(m => m.status === 'live' || m.status === 'upcoming').length;
  });
  await Promise.all(promises);
  // Hot = sum of all live
  counts.hot = Object.entries(counts).filter(([k]) => k !== 'hot' && k !== 'casino' && k !== 'idol')
                                     .reduce((a, [,v]) => a + v, 0);
  return counts;
}

// Tin tức (TheSportsDB free không có news → tạo từ event past + headline tự sinh)
async function getNews(limit = 12) {
  const past = await getFinishedStreams(null, limit);
  return past.map(m => ({
    ...m,
    headline: m.score
      ? (m.score[0] > m.score[1] ? `${m.home} thắng ${m.score[0]}-${m.score[1]} trước ${m.away}` :
         m.score[1] > m.score[0] ? `${m.away} ngược dòng ${m.score[1]}-${m.score[0]} trên sân ${m.home}` :
         `${m.home} hòa kịch tính ${m.score[0]}-${m.score[1]} với ${m.away}`)
      : `${m.home} đối đầu ${m.away} tại ${m.league}`,
    excerpt: m.venue
      ? `Trận đấu diễn ra tại ${m.venue} thuộc khuôn khổ ${m.league}.`
      : `Trận đấu thuộc khuôn khổ ${m.league}.`,
  }));
}

module.exports = {
  CATEGORIES,
  FEATURED_LEAGUES,
  getEventsByDay,
  getEventsRange,
  getAllSportsToday,
  getLiveStreams,
  getUpcomingStreams,
  getFinishedStreams,
  getStandings,
  getEvent,
  getCategoryCounts,
  getNews,
};
